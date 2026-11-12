import { beforeEach, describe, expect, it } from 'vitest';
import { GestureEngine, type HandCallbacks, type PointerState } from '../src/hands/engine';
import { OneEuro } from '../src/hands/oneEuro';
import { pose, shift } from './helpers';

const FRAME = 33;
function recorder() {
  const ev = { rotate: [] as Array<[number, number]>, zoom: [] as number[], click: [] as Array<[number, number]>, spin: 0, step: [] as number[], recenter: 0, pointer: [] as Array<PointerState | null>, label: '' };
  const cb: HandCallbacks = {
    rotate: (dx, dy) => ev.rotate.push([dx, dy]),
    zoom: (f) => ev.zoom.push(f),
    pointer: (p) => ev.pointer.push(p),
    click: (x, y) => ev.click.push([x, y]),
    toggleSpin: () => { ev.spin++; },
    step: (d) => ev.step.push(d),
    recenter: () => { ev.recenter++; },
    gesture: (l) => { ev.label = l; },
  };
  return { ev, cb };
}

describe('gesture engine', () => {
  let rec: ReturnType<typeof recorder>;
  let eng: GestureEngine;
  let now = 1000;
  beforeEach(() => { rec = recorder(); eng = new GestureEngine(rec.cb); now = 1000; });
  const feed = (hands: ReturnType<typeof pose.open>[], frames: number) => {
    for (let i = 0; i < frames; i++) { eng.update(hands, 1, now); now += FRAME; }
  };

  it('rotates when an open hand moves; moving to the user\'s right rotates right', () => {
    feed([pose.open()], 6);
    for (let i = 0; i < 15; i++) { eng.update([shift(pose.open(), -0.004 * i)], 1, now); now += FRAME; }
    const dx = rec.ev.rotate.reduce((s, r) => s + r[0], 0);
    expect(rec.ev.rotate.length).toBeGreaterThan(3);
    expect(dx).toBeGreaterThan(0); // hand moved toward raw -x = user's right = positive screen dx
  });

  it('does not rotate on tiny jitter (dead zone)', () => {
    feed([pose.open()], 6);
    for (let i = 0; i < 20; i++) { eng.update([shift(pose.open(), (i % 2 ? 1 : -1) * 0.0004)], 1, now); now += FRAME; }
    expect(rec.ev.rotate.length).toBe(0);
  });

  it('fires a click on a quick pinch and not a grab', () => {
    feed([pose.point()], 8);
    feed([pose.pinch()], 6); // ~200ms
    feed([pose.point()], 8);
    expect(rec.ev.click.length).toBe(1);
    expect(rec.ev.rotate.length).toBe(0);
  });

  it('a held pinch that moves grabs (rotates) and does not click', () => {
    feed([pose.point()], 8);
    feed([pose.pinch()], 4);
    for (let i = 0; i < 20; i++) { eng.update([shift(pose.pinch(), -0.006 * i)], 1, now); now += FRAME; }
    feed([pose.point()], 8);
    expect(rec.ev.rotate.length).toBeGreaterThan(5);
    expect(rec.ev.click.length).toBe(0);
  });

  it('toggles spin once when a fist is held, and re-arms after release', () => {
    feed([pose.fist()], 30);
    expect(rec.ev.spin).toBe(1);
    feed([pose.open()], 10);
    feed([pose.fist()], 30);
    expect(rec.ev.spin).toBe(2);
  });

  it('does not toggle spin for a brief fist', () => {
    feed([pose.fist()], 8);
    feed([pose.open()], 10);
    expect(rec.ev.spin).toBe(0);
  });

  it('detects a fast swipe to the user\'s right as next (+1)', () => {
    feed([pose.open()], 6);
    for (let i = 0; i < 9; i++) { eng.update([shift(pose.open(), -0.05 * i)], 1, now); now += FRAME; }
    expect(rec.ev.step).toEqual([1]);
  });

  it('detects a fast swipe to the user\'s left as previous (-1)', () => {
    feed([shift(pose.open(), -0.2)], 6);
    for (let i = 0; i < 9; i++) { eng.update([shift(pose.open(), -0.2 + 0.05 * i)], 1, now); now += FRAME; }
    expect(rec.ev.step).toEqual([-1]);
  });

  it('a slow movement is a rotation, never a swipe', () => {
    feed([pose.open()], 6);
    for (let i = 0; i < 40; i++) { eng.update([shift(pose.open(), -0.004 * i)], 1, now); now += FRAME; }
    expect(rec.ev.step.length).toBe(0);
  });

  it('two pinched hands spreading apart zoom in (factor < 1), coming together zoom out', () => {
    const two = (gap: number) => [pose.pinch({ cx: 0.5 - gap, right: true }), pose.pinch({ cx: 0.5 + gap, right: false })];
    for (let i = 0; i < 6; i++) { eng.update(two(0.1), 1, now); now += FRAME; }
    for (let i = 0; i < 12; i++) { eng.update(two(0.1 + 0.015 * i), 1, now); now += FRAME; }
    expect(rec.ev.zoom.length).toBeGreaterThan(3);
    expect(rec.ev.zoom.every((f) => f < 1)).toBe(true);
    rec.ev.zoom.length = 0;
    for (let i = 0; i < 12; i++) { eng.update(two(0.28 - 0.015 * i), 1, now); now += FRAME; }
    expect(rec.ev.zoom.some((f) => f > 1)).toBe(true);
  });

  it('recenters after both open palms face the camera for 0.6 s', () => {
    const palms = [pose.open({ cx: 0.3, right: true, facing: true }), pose.open({ cx: 0.7, right: false, facing: true })];
    feed(palms, 25);
    expect(rec.ev.recenter).toBe(1);
  });

  it('does not recenter when the backs of the hands face the camera', () => {
    const backs = [pose.open({ cx: 0.3, right: true, facing: false }), pose.open({ cx: 0.7, right: false, facing: false })];
    feed(backs, 40);
    expect(rec.ev.recenter).toBe(0);
  });

  it('shows the pointer while pointing and hides it when the hand leaves', () => {
    feed([pose.point()], 10);
    expect(rec.ev.pointer[rec.ev.pointer.length - 1]).not.toBeNull();
    eng.update([], 1, now);
    expect(rec.ev.pointer[rec.ev.pointer.length - 1]).toBeNull();
  });

  it('mirrors the pointer: hand on the raw-left of the image points to the screen right', () => {
    feed([pose.point({ cx: 0.2 })], 12);
    const p = rec.ev.pointer[rec.ev.pointer.length - 1]!;
    expect(p.x).toBeGreaterThan(0.3);
  });
});

describe('One Euro filter', () => {
  it('reduces jitter on a still signal but follows fast motion', () => {
    const f = new OneEuro();
    let maxDev = 0;
    for (let i = 0; i < 100; i++) {
      const y = f.filter(0.5 + (i % 2 ? 0.01 : -0.01), i / 30);
      if (i > 20) maxDev = Math.max(maxDev, Math.abs(y - 0.5));
    }
    expect(maxDev).toBeLessThan(0.006);
    const g = new OneEuro();
    let last = 0;
    for (let i = 0; i < 20; i++) last = g.filter(i * 0.05, i / 30);
    expect(last).toBeGreaterThan(0.85); // target 0.95
  });
});
