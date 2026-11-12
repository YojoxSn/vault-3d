import type { LayoutRequest, LayoutResponse } from './layout.worker';

export interface LayoutInput {
  n: number;
  edges: Int32Array;
  side: Uint8Array;
  brain: boolean;
  init?: Float32Array;
}

export class LayoutRunner {
  private worker: Worker;
  constructor(private onPositions: (p: Float32Array, done: boolean, tick: number) => void) {
    this.worker = new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<LayoutResponse>) => {
      if (e.data.type === 'pos') this.onPositions(e.data.positions, e.data.done, e.data.tick);
    };
  }
  run(input: LayoutInput) {
    const msg: LayoutRequest = { type: 'run', ...input };
    this.worker.postMessage(msg);
  }
  /** Stops the current run: its late messages are dropped. */
  cancel() { this.worker.postMessage({ type: 'cancel' }); }
  dispose() { this.worker.terminate(); }
}

/** Balanced hemisphere assignment: whole (sub)folders stay on the same side. */
export function assignHemispheres(paths: string[], ghost: boolean[]): Uint8Array {
  const groups = new Map<string, number[]>();
  paths.forEach((p, i) => {
    const parts = p.split('/');
    const key = ghost[i] ? '(ghost)' : parts.length > 2 ? parts.slice(0, 2).join('/') : parts[0];
    const arr = groups.get(key);
    if (arr) arr.push(i); else groups.set(key, [i]);
  });
  const side = new Uint8Array(paths.length);
  const load = [0, 0];
  for (const [, idxs] of [...groups].sort((a, b) => b[1].length - a[1].length)) {
    const s = load[0] <= load[1] ? 0 : 1;
    load[s] += idxs.length;
    for (const i of idxs) side[i] = s;
  }
  return side;
}
