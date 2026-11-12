import { OneEuro2 } from './oneEuro';
import { classify, palmCenter, palmFacesCamera, type Hand, type Pose, INDEX_TIP } from './gestures';

export interface PointerState {
  /** Normalised device coordinates (-1..1), y up. */
  x: number;
  y: number;
  /** 0..1, how far the pinch ring is filled. */
  pinch: number;
  down: boolean;
}

export interface HandCallbacks {
  /** Rotation request, in fractions of the screen (dx right, dy down). */
  rotate(dx: number, dy: number): void;
  /** Camera distance multiplier (<1 zooms in). */
  zoom(factor: number): void;
  pointer(p: PointerState | null): void;
  click(ndcX: number, ndcY: number): void;
  toggleSpin(): void;
  step(dir: 1 | -1): void;
  recenter(): void;
  gesture(label: string): void;
}

export const CFG = {
  confirmMs: 80,
  fistHoldMs: 600,
  clickMaxMs: 350,
  clickMaxTravel: 0.035,
  palmsHoldMs: 600,
  swipeWindowMs: 280,
  swipeDx: 0.3,
  swipeMaxDy: 0.18,
  swipeCooldownMs: 1000,
  rotateDead: 0.0012,
  rotateGain: 1,
  marginX: 0.12,
  marginY: 0.1,
  zoomSmoothing: 0.5,
};

interface Slot {
  palm: OneEuro2;
  cursor: OneEuro2;
  pose: Pose;
  candidate: Pose;
  candSince: number;
  pinching: boolean;
  pinchSince: number;
  pinchStart: [number, number];
  pinchTravel: number;
  lastPalm: [number, number] | null;
  lastMid: [number, number] | null;
  hist: Array<{ t: number; x: number; y: number }>;
  mid: [number, number];
  curHist: Array<{ t: number; x: number; y: number }>;
  fistSince: number;
  fistFired: boolean;
}

const newSlot = (): Slot => ({
  palm: new OneEuro2(), cursor: new OneEuro2(1.8, 8),
  pose: 'none', candidate: 'none', candSince: 0,
  pinching: false, pinchSince: 0, pinchStart: [0, 0], pinchTravel: 0,
  lastPalm: null, lastMid: null, hist: [], mid: [0, 0], curHist: [], fistSince: 0, fistFired: false,
});

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Maps a normalised (non-mirrored) camera coordinate to NDC, mirrored and with margins so screen edges are reachable. */
export function toNdc(x: number, y: number): [number, number] {
  const sx = clamp01((1 - x - CFG.marginX) / (1 - 2 * CFG.marginX));
  const sy = clamp01((y - CFG.marginY) / (1 - 2 * CFG.marginY));
  return [sx * 2 - 1, 1 - sy * 2];
}

const POSE_LABEL: Record<Pose, string> = { open: 'Open hand', fist: 'Fist', point: 'Pointing', pinch: 'Pinch', none: 'Hand' };
const NO_HAND = 'No hand';

export class GestureEngine {
  private slots: Slot[] = [newSlot(), newSlot()];
  private count = 0;
  private lastSwipe = -1e9;
  private palmsSince = 0;
  private lastRecenter = -1e9;
  private prevPinchDist: number | null = null;
  private zoomDist: number | null = null;

  constructor(private cb: HandCallbacks) {}

  reset() {
    this.slots = [newSlot(), newSlot()];
    this.count = 0; this.prevPinchDist = null; this.zoomDist = null; this.palmsSince = 0;
    this.cb.pointer(null);
    this.cb.gesture(NO_HAND);
  }

  /**
   * @param hands raw MediaPipe landmarks (normalised image coordinates, NOT mirrored)
   * @param aspect video width / height, to make distances isotropic
   * @param now milliseconds
   */
  update(hands: Hand[], aspect: number, now: number) {
    // stable identity: leftmost hand in the raw image first
    const ordered = hands
      .map((h) => ({ raw: h, iso: h.map((p) => ({ x: p.x * aspect, y: p.y, z: p.z })) }))
      .sort((a, b) => a.raw[0].x - b.raw[0].x)
      .slice(0, 2);
    if (ordered.length !== this.count) {
      this.slots = [newSlot(), newSlot()];
      this.prevPinchDist = null; this.zoomDist = null; this.palmsSince = 0;
      this.count = ordered.length;
    }
    if (ordered.length === 0) { this.cb.pointer(null); this.cb.gesture(NO_HAND); return; }

    const t = now / 1000;
    const info = ordered.map((o, i) => this.track(this.slots[i], o.raw, o.iso, now, t));

    // --- two hands -----------------------------------------------------------------------------
    if (ordered.length === 2) {
      const [a, b] = info;
      if (a.pinching && b.pinching) {
        const d = Math.hypot(a.mid[0] - b.mid[0], a.mid[1] - b.mid[1]);
        this.zoomDist = this.zoomDist === null ? d : this.zoomDist + (d - this.zoomDist) * (1 - CFG.zoomSmoothing);
        if (this.prevPinchDist !== null && this.zoomDist > 0.02) {
          const f = this.prevPinchDist / this.zoomDist;
          if (Math.abs(f - 1) > 0.004) this.cb.zoom(Math.min(1.12, Math.max(0.89, f)));
        }
        this.prevPinchDist = this.zoomDist;
        this.cb.pointer(null);
        this.cb.gesture('Two-hand zoom');
        return;
      }
      this.prevPinchDist = null; this.zoomDist = null;

      const bothOpen = a.pose === 'open' && b.pose === 'open';
      // the leftmost hand in the raw image is the user's right hand
      const facing = bothOpen && palmFacesCamera(ordered[0].iso, true) && palmFacesCamera(ordered[1].iso, false);
      if (facing) {
        if (!this.palmsSince) this.palmsSince = now;
        if (now - this.palmsSince > CFG.palmsHoldMs && now - this.lastRecenter > 1500) {
          this.lastRecenter = now; this.palmsSince = 0;
          this.cb.recenter();
        }
        this.cb.gesture('Both palms: recenter');
        this.cb.pointer(null);
        return;
      }
      this.palmsSince = 0;
    }

    // --- single (primary) hand -------------------------------------------------------------------
    // with two hands, the one doing something (pinch, then point) drives; otherwise the first
    const rank = (p: Pose) => (p === 'pinch' ? 3 : p === 'point' ? 2 : p === 'open' || p === 'fist' ? 1 : 0);
    const primary = info.length === 2 && rank(info[1].pose) > rank(info[0].pose) ? info[1] : info[0];
    this.drive(primary, now);
  }

  private track(s: Slot, raw: Hand, iso: Hand, now: number, t: number) {
    const c = classify(iso, s.pinching);
    // debounce: a pose must be stable for confirmMs before it becomes active
    if (c.pose !== s.candidate) { s.candidate = c.pose; s.candSince = now; }
    if (c.pose !== s.pose && now - s.candSince >= CFG.confirmMs) s.pose = c.pose;

    const palmRaw = palmCenter(raw);
    const [px, py] = s.palm.filter(palmRaw.x, palmRaw.y, t);
    // The cursor is the index fingertip: it barely moves when the thumb closes or opens, so clicks land where you aimed.
    const tip = raw[INDEX_TIP];
    const [cx, cy] = s.cursor.filter(tip.x, tip.y, t);
    const [nx, ny] = toNdc(cx, cy);
    s.curHist.push({ t: now, x: nx, y: ny });
    while (s.curHist.length > 1 && now - s.curHist[0].t > 600) s.curHist.shift();

    const pinching = s.pose === 'pinch';
    if (pinching && !s.pinching) {
      // aim point = where the cursor was when the pinch started (before the confirmation delay)
      const start = s.curHist.find((h) => h.t >= s.candSince) ?? s.curHist[s.curHist.length - 1];
      s.pinchSince = now; s.pinchStart = [start.x, start.y]; s.pinchTravel = 0; s.lastMid = [cx, cy];
    }
    s.pinching = pinching;
    s.mid = [1 - cx, cy]; // mirrored screen space, for two-hand distance
    return { pose: s.pose, inst: c.pose, pinching, ndc: [nx, ny] as [number, number], mid: s.mid, palm: [px, py] as [number, number], ratio: c.ratio, slot: s, cx, cy };
  }

  private drive(h: ReturnType<GestureEngine['track']>, now: number) {
    const s = h.slot;
    const [nx, ny] = h.ndc;
    let label = POSE_LABEL[h.pose];

    // Pointer: visible while pointing or pinching
    if (h.pose === 'point' || h.pose === 'pinch') {
      const fill = h.pose === 'pinch' ? 1 : Math.max(0, Math.min(1, (0.9 - h.ratio) / 0.6));
      this.cb.pointer({ x: nx, y: ny, pinch: fill, down: h.pose === 'pinch' });
    } else this.cb.pointer(null);

    // Fist: freeze / resume the auto rotation (once per fist)
    if (h.pose === 'fist') {
      if (!s.fistSince) s.fistSince = now;
      if (!s.fistFired && now - s.fistSince > CFG.fistHoldMs) { s.fistFired = true; this.cb.toggleSpin(); }
      label = s.fistFired ? 'Fist: toggled' : 'Fist…';
    } else { s.fistSince = 0; s.fistFired = false; }

    // Open hand: orbit following the palm, and swipe detection
    if (h.pose === 'open') {
      const [x, y] = h.palm;
      if (s.lastPalm) {
        let dx = -(x - s.lastPalm[0]), dy = y - s.lastPalm[1]; // mirrored: moving right on screen = left in raw image
        if (Math.abs(dx) < CFG.rotateDead) dx = 0;
        if (Math.abs(dy) < CFG.rotateDead) dy = 0;
        if (dx || dy) this.cb.rotate(dx * CFG.rotateGain, dy * CFG.rotateGain);
      }
      s.lastPalm = [x, y];
      s.hist.push({ t: now, x: -x, y });
      while (s.hist.length && now - s.hist[0].t > CFG.swipeWindowMs) s.hist.shift();
      if (s.hist.length > 3 && now - this.lastSwipe > CFG.swipeCooldownMs) {
        const first = s.hist[0], last = s.hist[s.hist.length - 1];
        const dx = last.x - first.x, dy = Math.abs(last.y - first.y);
        if (Math.abs(dx) > CFG.swipeDx && dy < CFG.swipeMaxDy) {
          this.lastSwipe = now; s.hist = [];
          this.cb.step(dx > 0 ? 1 : -1);
          label = dx > 0 ? 'Swipe →' : 'Swipe ←';
        }
      }
    } else { s.lastPalm = null; s.hist = []; }

    // Pinch: quick = click, held = grab and rotate
    if (h.pose === 'pinch' && s.lastMid) {
      const dx = -(h.cx - s.lastMid[0]), dy = h.cy - s.lastMid[1];
      // while the fingers are already opening (release pending) the motion is not intentional
      if (h.inst === 'pinch') s.pinchTravel += Math.hypot(dx, dy);
      const heldLong = now - s.pinchSince > CFG.clickMaxMs;
      if (h.inst === 'pinch' && (heldLong || s.pinchTravel > CFG.clickMaxTravel)) this.cb.rotate(dx * 1.6, dy * 1.6);
      s.lastMid = [h.cx, h.cy];
      label = heldLong || s.pinchTravel > CFG.clickMaxTravel ? 'Grab' : 'Pinch';
    }
    if (!h.pinching && s.lastMid) {
      // released
      const quick = now - s.pinchSince <= CFG.clickMaxMs && s.pinchTravel <= CFG.clickMaxTravel;
      if (quick) { this.cb.click(s.pinchStart[0], s.pinchStart[1]); label = 'Click'; }
      s.lastMid = null;
    }
    this.cb.gesture(label);
  }
}
