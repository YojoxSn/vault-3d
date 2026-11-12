import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { Hand } from './gestures';

const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm';
const CDN_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

async function exists(url: string, minBytes = 0): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD' });
    if (!r.ok) return false;
    if ((r.headers.get('content-type') ?? '').includes('text/html')) return false; // SPA fallback
    return Number(r.headers.get('content-length') ?? minBytes) >= minBytes;
  } catch { return false; }
}

export class HandTracker {
  private lastTs = -1;
  private constructor(private lm: HandLandmarker) {}

  /** Everything runs in the browser. WASM and model are local when present, otherwise fetched from official CDNs. */
  static async create(): Promise<HandTracker> {
    const wasmBase = (await exists('./mediapipe/wasm/vision_wasm_internal.wasm')) ? './mediapipe/wasm' : CDN_WASM;
    const modelPath = (await exists('./models/hand_landmarker.task', 1_000_000)) ? './models/hand_landmarker.task' : CDN_MODEL;
    const fileset = await FilesetResolver.forVisionTasks(wasmBase);
    const make = (delegate: 'GPU' | 'CPU') =>
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: modelPath, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.55,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    try { return new HandTracker(await make('GPU')); } catch { return new HandTracker(await make('CPU')); }
  }

  detect(video: HTMLVideoElement, now: number): Hand[] {
    const ts = Math.max(now, this.lastTs + 1);
    this.lastTs = ts;
    const res = this.lm.detectForVideo(video, ts);
    return res.landmarks.map((l) => l.map((p) => ({ x: p.x, y: p.y, z: p.z })));
  }

  close() { this.lm.close(); }
}
