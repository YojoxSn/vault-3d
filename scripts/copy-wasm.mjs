// Copies the MediaPipe WASM runtime next to the app so hand tracking works offline.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const src = 'node_modules/@mediapipe/tasks-vision/wasm';
const dst = 'public/mediapipe/wasm';
if (existsSync(src)) {
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
  console.log('[wasm] copied MediaPipe runtime to', dst);
} else {
  console.warn('[wasm] node_modules not installed yet, skipping');
}
