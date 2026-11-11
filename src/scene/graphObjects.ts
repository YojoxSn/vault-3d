import * as THREE from 'three';
import { lineFrag, lineVert, nodeFrag, nodeVert, particleFrag, particleVert } from './shaders';

export interface SceneGraph {
  n: number;
  /** Radius per node. */
  radius: Float32Array;
  /** rgb (0..1, sRGB) per node */
  colors: Float32Array;
  ghost: Uint8Array;
  linkS: Int32Array;
  linkT: Int32Array;
}

export const STATE_DIM = 0.16;
export const STATE_NORMAL = 1;
export const STATE_HI = 1.7;

const MAX_PARTICLES = 9000;

export interface SharedUniforms {
  uTime: { value: number };
  uFog: { value: number };
  uPulse: { value: number };
  uPixelRatio: { value: number };
}

/** Owns every GPU object of the graph: spheres, ghost wireframes, links and flowing particles. */
export class GraphObjects {
  readonly group = new THREE.Group();
  readonly positions: Float32Array;
  private visible: Uint8Array;
  private nodeState: Float32Array;
  private solidIdx: number[] = [];
  private ghostIdx: number[] = [];
  private solid!: THREE.InstancedMesh;
  private ghostMesh!: THREE.InstancedMesh;
  private lines!: THREE.LineSegments;
  private points!: THREE.Points;
  private particleLink!: Int32Array;
  private linkState: Float32Array;
  private sizeScale = 1;
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpS = new THREE.Vector3();
  private tmpP = new THREE.Vector3();
  private disposables: { dispose(): void }[] = [];

  constructor(private sg: SceneGraph, private shared: SharedUniforms) {
    const { n } = sg;
    this.positions = new Float32Array(n * 3);
    this.visible = new Uint8Array(n).fill(1);
    this.nodeState = new Float32Array(n).fill(STATE_NORMAL);
    this.linkState = new Float32Array(sg.linkS.length).fill(1);
    for (let i = 0; i < n; i++) (sg.ghost[i] ? this.ghostIdx : this.solidIdx).push(i);
    this.buildNodes();
    this.buildLinks();
    this.buildParticles();
  }

  private makeNodeMesh(indices: number[], ghost: boolean) {
    const geo = new THREE.IcosahedronGeometry(1, this.sg.n > 1800 ? 1 : 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: nodeVert,
      fragmentShader: nodeFrag,
      wireframe: ghost,
      transparent: ghost,
      uniforms: {
        uTime: this.shared.uTime, uFog: this.shared.uFog, uPulse: this.shared.uPulse,
        uGhost: { value: ghost ? 1 : 0 },
      },
    });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(indices.length, 1));
    mesh.count = indices.length;
    mesh.frustumCulled = false;
    const col = new Float32Array(indices.length * 3);
    const phase = new Float32Array(indices.length);
    const state = new Float32Array(indices.length).fill(STATE_NORMAL);
    indices.forEach((ni, k) => {
      const c = new THREE.Color(this.sg.colors[ni * 3], this.sg.colors[ni * 3 + 1], this.sg.colors[ni * 3 + 2]);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      phase[k] = Math.random() * Math.PI * 2;
    });
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(col, 3));
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    const st = new THREE.InstancedBufferAttribute(state, 1);
    st.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aState', st);
    this.disposables.push(geo, mat);
    this.group.add(mesh);
    return mesh;
  }

  private buildNodes() {
    this.solid = this.makeNodeMesh(this.solidIdx, false);
    this.ghostMesh = this.makeNodeMesh(this.ghostIdx, true);
  }

  private buildLinks() {
    const m = this.sg.linkS.length;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 6), 3).setUsage(THREE.DynamicDrawUsage));
    const col = new Float32Array(m * 6);
    for (let k = 0; k < m; k++) {
      for (let e = 0; e < 2; e++) {
        const ni = e === 0 ? this.sg.linkS[k] : this.sg.linkT[k];
        const c = new THREE.Color(this.sg.colors[ni * 3], this.sg.colors[ni * 3 + 1], this.sg.colors[ni * 3 + 2]);
        col[k * 6 + e * 3] = c.r; col[k * 6 + e * 3 + 1] = c.g; col[k * 6 + e * 3 + 2] = c.b;
      }
    }
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aState', new THREE.BufferAttribute(new Float32Array(m * 2).fill(1), 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: lineVert,
      fragmentShader: lineFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uFog: this.shared.uFog, uAlpha: { value: Math.min(0.42, Math.max(0.07, 0.05 + 28 / Math.max(m, 1))) } },
    });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.disposables.push(geo, mat);
    this.group.add(this.lines);
  }

  private buildParticles() {
    const m = this.sg.linkS.length;
    const count = m === 0 ? 0 : Math.min(MAX_PARTICLES, Math.max(m, Math.min(m * 4, MAX_PARTICLES)));
    this.particleLink = new Int32Array(count);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aFrom', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aTo', new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const col = new Float32Array(count * 3);
    const speed = new Float32Array(count);
    const off = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // when links > MAX_PARTICLES, pick a random subset
      const k = m <= MAX_PARTICLES ? i % m : Math.floor(Math.random() * m);
      this.particleLink[i] = k;
      const c = new THREE.Color(this.sg.colors[this.sg.linkS[k] * 3], this.sg.colors[this.sg.linkS[k] * 3 + 1], this.sg.colors[this.sg.linkS[k] * 3 + 2]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      speed[i] = 0.07 + Math.random() * 0.09;
      off[i] = Math.random();
    }
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    geo.setAttribute('aOffset', new THREE.BufferAttribute(off, 1));
    geo.setAttribute('aState', new THREE.BufferAttribute(new Float32Array(count).fill(1), 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: this.shared.uTime, uFog: this.shared.uFog, uPixelRatio: this.shared.uPixelRatio,
        uSize: { value: 4 },
      },
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.disposables.push(geo, mat);
    this.group.add(this.points);
  }

  /** Writes new node positions into every buffer. */
  setPositions(pos: Float32Array) {
    this.positions.set(pos);
    this.refreshMatrices();
    const lp = this.lines.geometry.getAttribute('position') as THREE.BufferAttribute;
    const { linkS, linkT } = this.sg;
    for (let k = 0; k < linkS.length; k++) {
      const s = linkS[k] * 3, t = linkT[k] * 3;
      lp.array[k * 6] = pos[s]; lp.array[k * 6 + 1] = pos[s + 1]; lp.array[k * 6 + 2] = pos[s + 2];
      lp.array[k * 6 + 3] = pos[t]; lp.array[k * 6 + 4] = pos[t + 1]; lp.array[k * 6 + 5] = pos[t + 2];
    }
    lp.needsUpdate = true;
    const from = this.points.geometry.getAttribute('aFrom') as THREE.BufferAttribute;
    const to = this.points.geometry.getAttribute('aTo') as THREE.BufferAttribute;
    for (let i = 0; i < this.particleLink.length; i++) {
      const k = this.particleLink[i];
      const s = linkS[k] * 3, t = linkT[k] * 3;
      from.array[i * 3] = pos[s]; from.array[i * 3 + 1] = pos[s + 1]; from.array[i * 3 + 2] = pos[s + 2];
      to.array[i * 3] = pos[t]; to.array[i * 3 + 1] = pos[t + 1]; to.array[i * 3 + 2] = pos[t + 2];
    }
    from.needsUpdate = true;
    to.needsUpdate = true;
  }

  private refreshMatrices() {
    const write = (mesh: THREE.InstancedMesh, idxs: number[]) => {
      for (let k = 0; k < idxs.length; k++) {
        const i = idxs[k];
        const s = this.visible[i] ? this.sg.radius[i] * this.sizeScale : 0;
        this.tmpP.set(this.positions[i * 3], this.positions[i * 3 + 1], this.positions[i * 3 + 2]);
        this.tmpS.set(s, s, s);
        this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
        mesh.setMatrixAt(k, this.tmpM);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    write(this.solid, this.solidIdx);
    write(this.ghostMesh, this.ghostIdx);
  }

  setVisible(mask: Uint8Array) {
    this.visible = mask;
    this.refreshMatrices();
    this.refreshStates();
  }

  setSizeScale(k: number) { this.sizeScale = k; this.refreshMatrices(); }

  isVisible(i: number) { return this.visible[i] === 1; }

  /** state: brightness factor per node (see STATE_*). */
  setNodeState(state: Float32Array) {
    this.nodeState = state;
    this.refreshStates();
  }

  private refreshStates() {
    const apply = (mesh: THREE.InstancedMesh, idxs: number[]) => {
      const a = mesh.geometry.getAttribute('aState') as THREE.InstancedBufferAttribute;
      for (let k = 0; k < idxs.length; k++) a.array[k] = this.nodeState[idxs[k]];
      a.needsUpdate = true;
    };
    apply(this.solid, this.solidIdx);
    apply(this.ghostMesh, this.ghostIdx);

    const { linkS, linkT } = this.sg;
    const la = this.lines.geometry.getAttribute('aState') as THREE.BufferAttribute;
    for (let k = 0; k < linkS.length; k++) {
      const s = linkS[k], t = linkT[k];
      const v = this.visible[s] && this.visible[t] ? Math.min(this.nodeState[s], this.nodeState[t]) : 0;
      this.linkState[k] = v;
      la.array[k * 2] = v; la.array[k * 2 + 1] = v;
    }
    la.needsUpdate = true;
    const pa = this.points.geometry.getAttribute('aState') as THREE.BufferAttribute;
    for (let i = 0; i < this.particleLink.length; i++) pa.array[i] = this.linkState[this.particleLink[i]];
    pa.needsUpdate = true;
  }

  /** Ray/sphere picking over visible nodes. Padded so tiny or distant nodes stay easy to hit. */
  pick(origin: THREE.Vector3, dir: THREE.Vector3): number {
    let best = -1, bestT = Infinity;
    const p = this.positions;
    for (let i = 0; i < this.sg.n; i++) {
      if (!this.visible[i]) continue;
      const cx = p[i * 3] - origin.x, cy = p[i * 3 + 1] - origin.y, cz = p[i * 3 + 2] - origin.z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t <= 0) continue;
      const d2 = cx * cx + cy * cy + cz * cz - t * t;
      const r = Math.max(this.sg.radius[i] * this.sizeScale * 1.35, t * 0.013);
      if (d2 <= r * r && t < bestT) { bestT = t; best = i; }
    }
    return best;
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.group.clear();
  }
}
