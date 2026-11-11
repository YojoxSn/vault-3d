import { HandLandmarker } from '@mediapipe/tasks-vision';
import { GestureEngine, type HandCallbacks } from './engine';
import type { Hand } from './gestures';
import { HandTracker } from './tracker';

/** Floating camera window + tracking loop. All video processing stays in the browser tab. */
export class HandController {
  private win!: HTMLElement;
  private video!: HTMLVideoElement;
  private canvas!: HTMLCanvasElement;
  private label!: HTMLElement;
  private msg!: HTMLElement;
  private stream: MediaStream | null = null;
  private tracker: HandTracker | null = null;
  private engine: GestureEngine;
  private raf = 0;
  private lastVideoTime = -1;
  private running = false;
  onClose: () => void = () => {};

  constructor(cb: HandCallbacks) {
    this.engine = new GestureEngine({ ...cb, gesture: (l) => { this.label.textContent = l; cb.gesture(l); } });
    this.build();
  }

  private build() {
    const w = document.createElement('div');
    w.id = 'handwin';
    w.className = 'glass';
    w.innerHTML = `
      <div class="bar"><span>HANDS</span><span class="lab">No hand</span>
        <button data-a="min" title="Minimise">–</button><button data-a="close" title="Close">×</button></div>
      <div class="view"><video playsinline muted></video><canvas width="240" height="180"></canvas><div class="msg">Starting camera…</div></div>`;
    document.body.appendChild(w);
    this.win = w;
    this.video = w.querySelector('video')!;
    this.canvas = w.querySelector('canvas')!;
    this.label = w.querySelector('.lab')!;
    this.msg = w.querySelector('.msg')!;
    w.querySelector('[data-a=min]')!.addEventListener('click', () => w.classList.toggle('min'));
    w.querySelector('[data-a=close]')!.addEventListener('click', () => { this.stop(); this.onClose(); });
    // drag by the title bar
    const bar = w.querySelector('.bar') as HTMLElement;
    bar.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).tagName === 'BUTTON') return;
      const r = w.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      bar.setPointerCapture(e.pointerId);
      bar.style.cursor = 'grabbing';
      const move = (ev: PointerEvent) => {
        w.style.left = Math.min(innerWidth - 60, Math.max(-100, ev.clientX - ox)) + 'px';
        w.style.top = Math.min(innerHeight - 40, Math.max(0, ev.clientY - oy)) + 'px';
        w.style.right = 'auto'; w.style.bottom = 'auto';
      };
      const up = () => { bar.style.cursor = ''; bar.removeEventListener('pointermove', move); bar.removeEventListener('pointerup', up); };
      bar.addEventListener('pointermove', move); bar.addEventListener('pointerup', up);
    });
  }

  get active() { return this.running; }

  async start(): Promise<void> {
    if (this.running) return;
    this.win.style.display = 'block';
    this.msg.style.display = 'flex';
    this.msg.textContent = 'Starting camera…';
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera API (HTTPS or localhost required).');
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
    } catch (e) {
      const denied = e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
      this.msg.textContent = denied
        ? 'Camera access was denied. Allow it in your browser, or keep using the mouse and keyboard.'
        : `Camera unavailable: ${(e as Error).message}`;
      throw e;
    }
    this.video.srcObject = this.stream;
    await this.video.play();
    this.msg.textContent = 'Loading hand model…';
    try {
      this.tracker ??= await HandTracker.create();
    } catch (e) {
      this.msg.textContent = 'Could not load the hand-tracking model (needs network on first use).';
      this.stopStream();
      throw e;
    }
    this.msg.style.display = 'none';
    this.running = true;
    this.lastVideoTime = -1;
    this.loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.stopStream();
    this.engine.reset();
    this.win.style.display = 'none';
  }

  private stopStream() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private loop = () => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.loop);
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this.lastVideoTime || !this.tracker) return;
    this.lastVideoTime = v.currentTime;
    const hands = this.tracker.detect(v, performance.now());
    this.engine.update(hands, v.videoWidth / v.videoHeight, performance.now());
    this.draw(hands);
  };

  private draw(hands: Hand[]) {
    const c = this.canvas, ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    hands.forEach((h, i) => {
      const col = i === 0 ? '#00e5ff' : '#ff4dd2';
      ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 8;
      for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
        ctx.beginPath();
        ctx.moveTo(h[start].x * c.width, h[start].y * c.height);
        ctx.lineTo(h[end].x * c.width, h[end].y * c.height);
        ctx.stroke();
      }
      ctx.fillStyle = '#fff';
      for (const p of h) { ctx.beginPath(); ctx.arc(p.x * c.width, p.y * c.height, 2, 0, 7); ctx.fill(); }
    });
  }
}
