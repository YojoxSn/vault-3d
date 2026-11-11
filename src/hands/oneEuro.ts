/** One Euro filter (Casiez et al., CHI 2012): smooth when slow, responsive when fast. */
class LowPass {
  private y: number | null = null;
  filter(x: number, alpha: number) {
    this.y = this.y === null ? x : alpha * x + (1 - alpha) * this.y;
    return this.y;
  }
  last() { return this.y; }
  reset() { this.y = null; }
}

const alphaFor = (cutoff: number, dt: number) => {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
};

export class OneEuro {
  private xf = new LowPass();
  private dxf = new LowPass();
  private lastT: number | null = null;
  private lastRaw: number | null = null;
  constructor(public minCutoff = 1.4, public beta = 6, public dCutoff = 1) {}
  /** t in seconds */
  filter(x: number, t: number): number {
    if (this.lastT === null || this.lastRaw === null) {
      this.lastT = t; this.lastRaw = x;
      return this.xf.filter(x, 1);
    }
    const dt = Math.max(t - this.lastT, 1e-3);
    const dx = (x - this.lastRaw) / dt;
    const edx = this.dxf.filter(dx, alphaFor(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);
    this.lastT = t; this.lastRaw = x;
    return this.xf.filter(x, alphaFor(cutoff, dt));
  }
  reset() { this.xf.reset(); this.dxf.reset(); this.lastT = null; this.lastRaw = null; }
}

export class OneEuro2 {
  private fx: OneEuro; private fy: OneEuro;
  constructor(minCutoff = 1.4, beta = 6) { this.fx = new OneEuro(minCutoff, beta); this.fy = new OneEuro(minCutoff, beta); }
  filter(x: number, y: number, t: number): [number, number] { return [this.fx.filter(x, t), this.fy.filter(y, t)]; }
  reset() { this.fx.reset(); this.fy.reset(); }
}
