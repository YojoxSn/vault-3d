/**
 * Pure gesture recognition on MediaPipe hand landmarks (21 points).
 * Coordinates are expected to be isotropic (x already multiplied by the video aspect ratio).
 */
export interface LM { x: number; y: number; z: number }
export type Hand = LM[];
export type Pose = 'open' | 'fist' | 'point' | 'pinch' | 'none';

export const WRIST = 0, THUMB_TIP = 4, INDEX_MCP = 5, INDEX_TIP = 8, MIDDLE_MCP = 9, PINKY_MCP = 17;
const FINGERS = [
  { mcp: 5, pip: 6, tip: 8 },
  { mcp: 9, pip: 10, tip: 12 },
  { mcp: 13, pip: 14, tip: 16 },
  { mcp: 17, pip: 18, tip: 20 },
] as const;

export const PINCH_ENTER = 0.3;
export const PINCH_EXIT = 0.46;

/**
 * Set to true if palm/back are inverted on your camera setup. The sign of the palm normal depends on
 * how the video is mirrored; if "two open palms" fires when you show the backs of your hands, flip it.
 */
export const PALM_FLIP = false;

export const dist = (a: LM, b: LM) => Math.hypot(a.x - b.x, a.y - b.y);
export const handScale = (h: Hand) => Math.max(dist(h[WRIST], h[MIDDLE_MCP]), 1e-4);

export function fingersExtended(h: Hand): boolean[] {
  return FINGERS.map((f) => dist(h[WRIST], h[f.tip]) > dist(h[WRIST], h[f.pip]) * 1.12);
}

export const pinchRatio = (h: Hand) => dist(h[THUMB_TIP], h[INDEX_TIP]) / handScale(h);

export function palmCenter(h: Hand): LM {
  const ids = [0, 5, 9, 13, 17];
  return { x: ids.reduce((s, i) => s + h[i].x, 0) / 5, y: ids.reduce((s, i) => s + h[i].y, 0) / 5, z: 0 };
}

export interface Classification {
  pose: Pose;
  ratio: number;
  ext: boolean[];
}

/**
 * Classifies one hand. `wasPinching` adds hysteresis so the pinch does not flicker around the threshold.
 */
export function classify(h: Hand, wasPinching = false): Classification {
  const ext = fingersExtended(h);
  const ratio = pinchRatio(h);
  const count = ext.filter(Boolean).length;
  let pose: Pose;
  if (count === 0) {
    // all four fingers curled: a fist, unless thumb and index really touch (relaxed pinch)
    pose = ratio < (wasPinching ? 0.3 : 0.17) ? 'pinch' : 'fist';
  } else if (ratio < (wasPinching ? PINCH_EXIT : PINCH_ENTER)) {
    pose = 'pinch';
  } else if (ext[0] && count === 1) {
    pose = 'point';
  } else if (count >= 3) {
    pose = 'open';
  } else {
    pose = 'none';
  }
  return { pose, ratio, ext };
}

/** Normal-Z sign of the palm in raw (non-mirrored) image coordinates. */
export function palmNormalZ(h: Hand): number {
  const ax = h[INDEX_MCP].x - h[WRIST].x, ay = h[INDEX_MCP].y - h[WRIST].y;
  const bx = h[PINKY_MCP].x - h[WRIST].x, by = h[PINKY_MCP].y - h[WRIST].y;
  return ax * by - ay * bx;
}

/**
 * Is the palm turned toward the camera? `isPhysicalRight` tells which hand it is; the engine infers it from
 * the hand's position in the (non-mirrored) image instead of trusting the handedness label.
 */
export function palmFacesCamera(h: Hand, isPhysicalRight: boolean): boolean {
  const nz = palmNormalZ(h);
  const facing = isPhysicalRight ? nz < 0 : nz > 0;
  return PALM_FLIP ? !facing : facing;
}
