import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GraphObjects, type SceneGraph, type SharedUniforms } from './graphObjects';
import { HologramShader } from './shaders';

export type Quality = 'high' | 'medium' | 'low';
const LEVELS: Quality[] = ['high', 'medium', 'low'];

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.5, 20000);
  readonly controls: OrbitControls;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private holo: ShaderPass;
  private shared: SharedUniforms = {
    uTime: { value: 0 }, uFog: { value: 0.004 }, uPulse: { value: 1 }, uPixelRatio: { value: 1 },
  };
  private objects: GraphObjects | null = null;
  private stars: THREE.Points;
  private decor: THREE.Object3D | null = null;
  private clock = new THREE.Clock();
  private fly: null | { t: number; dur: number; fromT: THREE.Vector3; toT: THREE.Vector3; fromP: THREE.Vector3; toP: THREE.Vector3 } = null;
  private lastInteract = performance.now();
  private raycaster = new THREE.Raycaster();
  private center = new THREE.Vector3();
  radius = 100;
  /** Extra room around the nodes when framing the view (the orb globe is larger than its notes). */
  framePad = 1;
  paused = false;
  frameCbs: Array<(dt: number) => void> = [];
  fps = 0;
  quality: Quality = 'high';
  /** When true the stage lowers the quality by itself if the frame rate stays low. */
  autoQuality = true;
  onAutoQuality: (q: Quality) => void = () => {};
  private snapReq: Array<(c: HTMLCanvasElement) => void> = [];
  private qualityLockUntil = 0;
  private slowSamples = 0;
  private frames = 0;
  private fpsT = performance.now();

  constructor(private canvasParent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', alpha: false });
    this.renderer.setClearColor(0x02040a, 1);
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pr);
    this.shared.uPixelRatio.value = pr;
    canvasParent.appendChild(this.renderer.domElement);
    this.renderer.domElement.id = 'stage';

    this.scene.fog = new THREE.FogExp2(0x02040a, 0.0004);
    this.camera.position.set(0, 40, 260);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.8;
    this.controls.autoRotateSpeed = 0.45;
    this.controls.addEventListener('start', () => this.touch());

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.55, 0.22);
    this.composer.addPass(this.bloom);
    this.holo = new ShaderPass(HologramShader as never);
    this.composer.addPass(this.holo);
    this.composer.addPass(new OutputPass());

    this.stars = this.makeStars();
    this.scene.add(this.stars);

    new ResizeObserver(() => this.resize()).observe(canvasParent);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  private makeStars() {
    const n = 2600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 1800 + Math.random() * 5000;
      const th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th); pos[i * 3 + 2] = r * Math.cos(ph);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0x9db8ff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.65, depthWrite: false, fog: false });
    return new THREE.Points(g, m);
  }

  private resize() {
    const w = this.canvasParent.clientWidth || window.innerWidth;
    const h = this.canvasParent.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    // medium: the glow is computed at half resolution (it is blurry anyway), a large saving on slow GPUs
    if (this.quality === 'medium') { const pr = this.renderer.getPixelRatio(); this.bloom.setSize(Math.floor((w * pr) / 2), Math.floor((h * pr) / 2)); }
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    (this.holo.uniforms as Record<string, { value: unknown }>).uRes.value = [w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio()];
  }

  private touch() { this.lastInteract = performance.now(); }

  setGraph(sg: SceneGraph) {
    if (this.objects) { this.scene.remove(this.objects.group); this.objects.dispose(); }
    this.objects = new GraphObjects(sg, this.shared);
    this.objects.setParticleDensity(this.quality === 'low' ? 0.4 : this.quality === 'medium' ? 0.7 : 1);
    this.scene.add(this.objects.group);
    this.qualityLockUntil = performance.now() + 5000; // shader compilation and first layout are slow
  }

  get graph() { return this.objects; }

  /** Adds decoration (e.g. the orb globe) to the scene. Pass null to clear. */
  setDecor(g: THREE.Object3D | null) {
    if (this.decor) this.scene.remove(this.decor);
    this.decor = g;
    if (g) this.scene.add(g);
  }

  /** high: full resolution + bloom + hologram pass. medium: normal resolution, half-resolution glow. low: 1x, no bloom, no hologram pass, fewer particles. */
  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    const pr = q === 'high' ? Math.min(dpr, 2) : 1;
    this.renderer.setPixelRatio(pr);
    this.shared.uPixelRatio.value = pr;
    this.bloom.enabled = q !== 'low';
    this.holo.enabled = q !== 'low';
    this.objects?.setParticleDensity(q === 'low' ? 0.4 : q === 'medium' ? 0.7 : 1);
    document.body.classList.toggle('low-fx', q === 'low');
    this.resize();
    this.qualityLockUntil = performance.now() + 4000;
    this.slowSamples = 0;
  }

  /** Copies the next rendered frame into a canvas (the WebGL buffer is only readable right after a render). */
  snapshot(): Promise<HTMLCanvasElement> {
    return new Promise((resolve) => this.snapReq.push(resolve));
  }

  /** Snapshot of the whole scene framed like the default view, then the camera goes back where it was. */
  async snapshotFramed(): Promise<HTMLCanvasElement> {
    const pos = this.camera.position.clone(), target = this.controls.target.clone();
    this.fly = null;
    this.recenter(true);
    const shot = await this.snapshot();
    this.camera.position.copy(pos);
    this.controls.target.copy(target);
    this.controls.update();
    return shot;
  }

  setHologram(on: boolean) {
    (this.holo.uniforms as Record<string, { value: unknown }>).uHolo.value = on ? 1 : 0;
    this.bloom.strength = on ? 0.6 : 0.5;
  }

  setPositions(pos: Float32Array, fit: boolean) {
    if (!this.objects) return;
    this.objects.setPositions(pos);
    // bounding sphere
    const n = pos.length / 3;
    const c = new THREE.Vector3();
    for (let i = 0; i < n; i++) c.add(new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    c.divideScalar(Math.max(n, 1));
    let r = 1;
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 3] - c.x, dy = pos[i * 3 + 1] - c.y, dz = pos[i * 3 + 2] - c.z;
      r = Math.max(r, Math.sqrt(dx * dx + dy * dy + dz * dz));
    }
    this.center.copy(c);
    this.radius = r;
    this.shared.uFog.value = 0.42 / Math.max(r, 40);
    if (fit) this.recenter(true);
  }

  recenter(instant = false) {
    const fovR = (this.camera.fov * Math.PI) / 180;
    const aspect = this.camera.aspect;
    const distV = (this.radius * this.framePad) / Math.sin(fovR / 2);
    const dist = Math.max(distV, distV / Math.min(aspect, 1)) * 0.62;
    const dir = this.camera.position.clone().sub(this.controls.target);
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.25, 1);
    dir.normalize();
    this.flyTo(this.center, dist, instant ? 0 : 1.1, dir);
  }

  flyTo(point: THREE.Vector3, dist: number, dur = 1.2, dir?: THREE.Vector3) {
    const d = (dir ?? this.camera.position.clone().sub(this.controls.target)).clone().normalize();
    const toP = point.clone().addScaledVector(d, dist);
    if (dur <= 0) {
      this.controls.target.copy(point);
      this.camera.position.copy(toP);
      this.controls.update();
      return;
    }
    this.fly = { t: 0, dur, fromT: this.controls.target.clone(), toT: point.clone(), fromP: this.camera.position.clone(), toP };
    this.touch();
  }

  flyToNode(i: number) {
    if (!this.objects) return;
    const p = this.objects.positions;
    const dist = Math.max(this.radius * 0.62, 55);
    this.flyTo(new THREE.Vector3(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]), dist, 1.2);
  }

  nodeWorld(i: number, out = new THREE.Vector3()) {
    const p = this.objects!.positions;
    return out.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
  }

  /** Screen position (CSS px, relative to the canvas) of a node, or null if behind the camera. */
  nodeScreen(i: number): { x: number; y: number } | null {
    const v = this.nodeWorld(i).project(this.camera);
    if (v.z > 1) return null;
    const el = this.renderer.domElement;
    return { x: ((v.x + 1) / 2) * el.clientWidth, y: ((1 - v.y) / 2) * el.clientHeight };
  }

  pickNdc(x: number, y: number): number {
    if (!this.objects) return -1;
    this.raycaster.setFromCamera(new THREE.Vector2(x, y), this.camera);
    return this.objects.pick(this.raycaster.ray.origin, this.raycaster.ray.direction);
  }

  pickClient(cx: number, cy: number): number {
    const r = this.renderer.domElement.getBoundingClientRect();
    return this.pickNdc(((cx - r.left) / r.width) * 2 - 1, -(((cy - r.top) / r.height) * 2 - 1));
  }

  orbitBy(dAz: number, dPol: number) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const sph = new THREE.Spherical().setFromVector3(off);
    sph.theta -= dAz;
    sph.phi = Math.min(Math.PI - 0.06, Math.max(0.06, sph.phi - dPol));
    off.setFromSpherical(sph);
    this.camera.position.copy(this.controls.target).add(off);
    this.camera.lookAt(this.controls.target);
    this.touch();
  }

  zoomBy(factor: number) {
    const off = this.camera.position.clone().sub(this.controls.target);
    const len = Math.min(this.radius * 6, Math.max(8, off.length() * factor));
    off.setLength(len);
    this.camera.position.copy(this.controls.target).add(off);
    this.touch();
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    this.shared.uTime.value += dt;
    (this.holo.uniforms as Record<string, { value: unknown }>).uTime.value = this.shared.uTime.value;

    if (this.fly) {
      const f = this.fly;
      f.t += dt;
      const k = ease(Math.min(f.t / f.dur, 1));
      this.controls.target.lerpVectors(f.fromT, f.toT, k);
      this.camera.position.lerpVectors(f.fromP, f.toP, k);
      if (f.t >= f.dur) this.fly = null;
    }
    const idle = performance.now() - this.lastInteract > 2500;
    this.controls.autoRotate = idle && !this.paused && !this.fly;
    this.controls.update();
    this.stars.rotation.y += dt * 0.004;

    for (const cb of this.frameCbs) cb(dt);
    this.composer.render();
    if (this.snapReq.length) {
      const src = this.renderer.domElement;
      const copy = document.createElement('canvas');
      copy.width = src.width; copy.height = src.height;
      copy.getContext('2d')!.drawImage(src, 0, 0);
      for (const r of this.snapReq.splice(0)) r(copy);
    }

    this.frames++;
    const now = performance.now();
    if (now - this.fpsT > 500) {
      const span = now - this.fpsT;
      this.fps = Math.round((this.frames * 1000) / span);
      this.frames = 0; this.fpsT = now;
      // ignore the sample taken right after the tab was hidden, and the first seconds after a load or a change
      const valid = span < 1500 && now > this.qualityLockUntil && !document.hidden;
      this.slowSamples = valid && this.fps < 24 ? this.slowSamples + 1 : 0;
      if (this.autoQuality && this.slowSamples >= 4) {
        const next = LEVELS[LEVELS.indexOf(this.quality) + 1];
        this.slowSamples = 0;
        if (next) { this.setQuality(next); this.onAutoQuality(next); }
      }
    }
  }

  dispose() { this.renderer.setAnimationLoop(null); this.renderer.dispose(); }
}
