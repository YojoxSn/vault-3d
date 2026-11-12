import { describe, expect, it } from 'vitest';
import { classify, palmFacesCamera, pinchRatio } from '../src/hands/gestures';
import { makeHand, pose } from './helpers';

describe('pose classification', () => {
  it('recognises an open hand', () => expect(classify(pose.open()).pose).toBe('open'));
  it('recognises a fist', () => expect(classify(pose.fist()).pose).toBe('fist'));
  it('recognises a pointing index', () => expect(classify(pose.point()).pose).toBe('point'));
  it('recognises a pinch', () => expect(classify(pose.pinch()).pose).toBe('pinch'));
  it('does not mistake an open hand with thumb out for a pinch', () => {
    const h = makeHand({ thumb: 'out' });
    expect(pinchRatio(h)).toBeGreaterThan(0.6);
  });
  it('is mirror-independent for fists on a left hand', () => {
    expect(classify(pose.fist({ right: false })).pose).toBe('fist');
    expect(classify(pose.open({ right: false })).pose).toBe('open');
  });
  it('keeps a pinch in the hysteresis band', () => {
    const h = pose.pinch();
    // widen thumb-index gap to sit between enter (0.30) and exit (0.46)
    h[4] = { ...h[4], x: h[4].x + 0.05, y: h[4].y + 0.01 };
    const r = pinchRatio(h);
    expect(r).toBeGreaterThan(0.3);
    expect(r).toBeLessThan(0.46);
    expect(classify(h, false).pose).not.toBe('pinch');
    expect(classify(h, true).pose).toBe('pinch');
  });
  it('rejects tiny jitter as no gesture when two fingers are out', () => {
    expect(classify(makeHand({ fingers: [true, true, false, false], thumb: 'tucked' })).pose).toBe('none');
  });
});

describe('palm orientation', () => {
  it('detects palms toward the camera for both hands', () => {
    expect(palmFacesCamera(makeHand({ right: true, facing: true }), true)).toBe(true);
    expect(palmFacesCamera(makeHand({ right: false, facing: true }), false)).toBe(true);
  });
  it('detects the back of the hand', () => {
    expect(palmFacesCamera(makeHand({ right: true, facing: false }), true)).toBe(false);
    expect(palmFacesCamera(makeHand({ right: false, facing: false }), false)).toBe(false);
  });
});
