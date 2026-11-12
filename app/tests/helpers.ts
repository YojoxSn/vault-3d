import type { Hand, LM } from '../src/hands/gestures';

export interface HandSpec {
  cx?: number; cy?: number;
  /** extended flags for index, middle, ring, pinky */
  fingers?: [boolean, boolean, boolean, boolean];
  thumb?: 'out' | 'tucked' | 'pinch';
  /** physical right hand? (default true) */
  right?: boolean;
  /** palm toward the camera? (default true) */
  facing?: boolean;
}

/** Builds a synthetic 21-point hand in raw (non-mirrored) image coordinates, fingers pointing up. */
export function makeHand(spec: HandSpec = {}): Hand {
  const { cx = 0.5, cy = 0.8, fingers = [true, true, true, true], thumb = 'out', right = true, facing = true } = spec;
  // In the raw image a right hand showing its palm has the index finger on the right (+x)
  const sgn = right === facing ? 1 : -1;
  const lm: LM[] = Array.from({ length: 21 }, () => ({ x: cx, y: cy, z: 0 }));
  const set = (i: number, x: number, y: number) => { lm[i] = { x, y, z: 0 }; };
  set(0, cx, cy);
  const offs = [0.05, 0.017, -0.017, -0.05];
  const mcpY = cy - 0.14;
  const starts = [5, 9, 13, 17];
  starts.forEach((s, f) => {
    const x = cx + sgn * offs[f];
    set(s, x, mcpY);
    if (fingers[f]) {
      set(s + 1, x, mcpY - 0.06); set(s + 2, x, mcpY - 0.1); set(s + 3, x, mcpY - 0.135);
    } else {
      set(s + 1, x, mcpY - 0.05); set(s + 2, x, mcpY - 0.01); set(s + 3, x, mcpY + 0.02);
    }
  });
  set(1, cx + sgn * 0.04, cy - 0.03);
  set(2, cx + sgn * 0.075, cy - 0.08);
  set(3, cx + sgn * 0.1, cy - 0.13);
  if (thumb === 'out') set(4, cx + sgn * 0.13, cy - 0.18);
  else if (thumb === 'tucked') set(4, cx - sgn * 0.01, cy - 0.2);
  else { // pinch: thumb tip touches the index tip
    const t = lm[8];
    set(4, t.x - sgn * 0.004, t.y + 0.004);
  }
  return lm;
}

export const pose = {
  open: (o: HandSpec = {}) => makeHand(o),
  fist: (o: HandSpec = {}) => makeHand({ fingers: [false, false, false, false], thumb: 'tucked', ...o }),
  point: (o: HandSpec = {}) => makeHand({ fingers: [true, false, false, false], thumb: 'tucked', ...o }),
  pinch: (o: HandSpec = {}) => makeHand({ fingers: [true, true, true, true], thumb: 'pinch', ...o }),
};

export const shift = (h: Hand, dx: number, dy = 0): Hand => h.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
