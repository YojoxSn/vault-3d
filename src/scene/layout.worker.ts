/// <reference lib="webworker" />
// Force-directed 3D layout, running off the main thread so the UI stays at 60 fps.
import { forceCenter, forceLink, forceManyBody, forceSimulation } from 'd3-force-3d';

export interface LayoutRequest {
  type: 'run';
  n: number;
  /** Flat pairs [s0, t0, s1, t1, ...] */
  edges: Int32Array;
  /** Hemisphere (0 or 1) per node, used in brain mode. */
  side: Uint8Array;
  brain: boolean;
  /** Optional starting positions (xyz per node). */
  init?: Float32Array;
  maxTicks?: number;
}
export interface LayoutResponse {
  type: 'pos';
  positions: Float32Array;
  tick: number;
  done: boolean;
}

interface SimNode { index: number; x: number; y: number; z: number; vx: number; vy: number; vz: number }
let runId = 0;

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  if (e.data.type === 'run') void run(e.data);
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

async function run(req: LayoutRequest) {
  const id = ++runId;
  const { n, edges, side, brain } = req;
  const R = (brain ? 9 : 7.5) * Math.cbrt(Math.max(n, 8));
  const ax = R * 0.95, ay = R * 0.8, az = R * 1.2, cx = ax * 0.78;

  const nodes: SimNode[] = new Array(n);
  for (let i = 0; i < n; i++) {
    if (req.init) {
      nodes[i] = { index: i, x: req.init[i * 3], y: req.init[i * 3 + 1], z: req.init[i * 3 + 2], vx: 0, vy: 0, vz: 0 };
    } else {
      // random point in a ball
      const u = Math.random(), v = Math.random(), w = Math.random();
      const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1), rr = R * 0.7 * Math.cbrt(w);
      nodes[i] = { index: i, x: rr * Math.sin(ph) * Math.cos(th), y: rr * Math.sin(ph) * Math.sin(th), z: rr * Math.cos(ph), vx: 0, vy: 0, vz: 0 };
    }
  }
  const links = [];
  for (let k = 0; k < edges.length; k += 2) links.push({ source: edges[k], target: edges[k + 1] });

  const sim = forceSimulation(nodes, 3)
    .alphaDecay(brain ? 0.035 : 0.028)
    .velocityDecay(0.38)
    .force('link', forceLink(links).distance(brain ? 11 : 20).iterations(1))
    .force('charge', forceManyBody().strength(brain ? -9 : -26).theta(1.15).distanceMax(R * 3))
    .force('center', forceCenter(0, 0, 0))
    .stop();

  if (brain) {
    sim.force('brain', (alpha: number) => {
      for (const nd of nodes) {
        const tx = side[nd.index] ? cx : -cx;
        nd.vx += (tx - nd.x) * 0.12 * alpha;
        nd.vy -= nd.y * 0.05 * alpha;
        nd.vz -= nd.z * 0.05 * alpha;
      }
    });
  }

  const clamp = () => {
    for (const nd of nodes) {
      const c = side[nd.index] ? cx : -cx;
      const dx = (nd.x - c) / ax, dy = nd.y / ay, dz = nd.z / az;
      const r2 = dx * dx + dy * dy + dz * dz;
      if (r2 > 1) {
        const k = 0.985 / Math.sqrt(r2);
        nd.x = c + (nd.x - c) * k; nd.y *= k; nd.z *= k;
        nd.vx *= 0.5; nd.vy *= 0.5; nd.vz *= 0.5;
      }
    }
  };

  const post = (t: number, done: boolean) => {
    const out = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { out[i * 3] = nodes[i].x; out[i * 3 + 1] = nodes[i].y; out[i * 3 + 2] = nodes[i].z; }
    (self as DedicatedWorkerGlobalScope).postMessage({ type: 'pos', positions: out, tick: t, done } satisfies LayoutResponse, [out.buffer]);
  };

  const maxTicks = req.maxTicks ?? 320;
  let t = 0;
  while (t < maxTicks && sim.alpha() > sim.alphaMin()) {
    if (id !== runId) return; // superseded by a newer run
    sim.tick();
    if (brain) clamp();
    t++;
    if (t === 4 || t === 12 || t % 10 === 0) post(t, false);
    if (t % 3 === 0) await tick();
  }
  if (id === runId) post(t, true);
}
