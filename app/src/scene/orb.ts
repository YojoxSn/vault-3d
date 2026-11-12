import * as THREE from 'three';
import type { GraphNode } from '../parser/types';

/** Radius of the shell for a vault of n notes. */
export const orbRadius = (n: number) => 8.5 * Math.cbrt(Math.max(n, 8));

// small deterministic string hash -> [0, 1)
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100003) / 100003;
}

/**
 * "Orb" layout: notes sit on a sphere.
 *   - height = time: the newest notes are at the north pole, the oldest at the south pole
 *   - longitude = folder: every root folder owns a wedge, as wide as it has notes
 *   - well-connected notes sink toward the core, so hubs sit near the glowing crystal
 *   - ghost notes (linked but not written yet) float on a smaller inner sphere
 * Pure function: easy to test.
 */
export function computeOrbLayout(nodes: GraphNode[]): { positions: Float32Array; R: number } {
  const n = nodes.length;
  const R = orbRadius(n);
  const positions = new Float32Array(n * 3);
  const real: number[] = [], ghosts: number[] = [];
  nodes.forEach((nd, i) => (nd.ghost ? ghosts : real).push(i));

  // time rank (0 = newest). Ties are broken by a hash so identical dates do not form stripes.
  const byDate = [...real].sort((a, b) => nodes[b].updatedAt - nodes[a].updatedAt || hash01(nodes[a].id) - hash01(nodes[b].id));
  const rank = new Map<number, number>();
  byDate.forEach((i, k) => rank.set(i, (k + 0.5) / Math.max(byDate.length, 1)));

  // folder wedges
  const counts = new Map<string, number>();
  for (const i of real) counts.set(nodes[i].folder, (counts.get(nodes[i].folder) ?? 0) + 1);
  const folders = [...counts].sort((a, b) => b[1] - a[1]);
  const wedge = new Map<string, [number, number]>();
  let a = 0;
  for (const [f, c] of folders) {
    const span = (c / Math.max(real.length, 1)) * Math.PI * 2;
    wedge.set(f, [a, a + span]);
    a += span;
  }

  let maxDeg = 1;
  for (const i of real) maxDeg = Math.max(maxDeg, nodes[i].degree);

  for (const i of real) {
    const nd = nodes[i];
    const y = 1 - 2 * rank.get(i)!; // +1 newest ... -1 oldest
    const [w0, w1] = wedge.get(nd.folder)!;
    const lon = w0 + (w1 - w0) * (0.04 + 0.92 * hash01(nd.id + '#lon'));
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const hub = Math.sqrt(nd.degree / maxDeg);
    const r = R * (1 - 0.22 * hub) * (0.97 + 0.06 * hash01(nd.id + '#r'));
    positions[i * 3] = r * ring * Math.cos(lon);
    positions[i * 3 + 1] = r * y;
    positions[i * 3 + 2] = r * ring * Math.sin(lon);
  }

  // ghosts: Fibonacci points on an inner sphere
  ghosts.forEach((i, k) => {
    const g = ghosts.length;
    const y = g === 1 ? 0 : 1 - (2 * (k + 0.5)) / g;
    const ring = Math.sqrt(1 - y * y);
    const ang = k * 2.399963229728653;
    const r = R * 0.52;
    positions[i * 3] = r * ring * Math.cos(ang);
    positions[i * 3 + 1] = r * y;
    positions[i * 3 + 2] = r * ring * Math.sin(ang);
  });
  return { positions, R };
}

function textSprite(text: string, R: number, color = '#e9e4ff'): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.font = '700 64px ui-monospace, Menlo, Consolas, monospace';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(190,170,255,0.9)'; ctx.shadowBlur = 18;
  // letter spacing
  const spaced = text.split('').join(' ');
  ctx.fillText(spaced, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.95 }));
  sp.scale.set(R * 0.5, R * 0.125, 1);
  return sp;
}

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,170,215,1)');
  g.addColorStop(0.25, 'rgba(255,110,190,0.55)');
  g.addColorStop(1, 'rgba(120,60,220,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface OrbDecor {
  group: THREE.Group;
  update(dt: number): void;
  setOpacity(o: number): void;
  dispose(): void;
}

/** The glass globe: parallels, meridians, equatorial ring and rays, a glowing crystal core, year labels. */
export function createOrbDecor(R: number, yearTop: string, yearBottom: string): OrbDecor {
  const group = new THREE.Group();
  const S = R * 1.1;
  const disposables: Array<{ dispose(): void }> = [];
  const mats: Array<THREE.Material & { opacity: number }> = [];
  const base = new Map<THREE.Material, number>();
  const lineMat = (color: number, opacity: number) => {
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    mats.push(m); base.set(m, opacity); disposables.push(m);
    return m;
  };

  // parallels + meridians
  const pts: number[] = [];
  const seg = 96;
  for (let lat = -75; lat <= 75; lat += 15) {
    if (lat === 0) continue;
    const phi = (lat * Math.PI) / 180, y = S * Math.sin(phi), rr = S * Math.cos(phi);
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      pts.push(rr * Math.cos(a0), y, rr * Math.sin(a0), rr * Math.cos(a1), y, rr * Math.sin(a1));
    }
  }
  for (let m = 0; m < 24; m++) {
    const lon = (m / 24) * Math.PI * 2;
    for (let k = 0; k < seg / 2; k++) {
      const p0 = -Math.PI / 2 + (k / (seg / 2)) * Math.PI, p1 = -Math.PI / 2 + ((k + 1) / (seg / 2)) * Math.PI;
      pts.push(S * Math.cos(p0) * Math.cos(lon), S * Math.sin(p0), S * Math.cos(p0) * Math.sin(lon),
        S * Math.cos(p1) * Math.cos(lon), S * Math.sin(p1), S * Math.cos(p1) * Math.sin(lon));
    }
  }
  const gGrid = new THREE.BufferGeometry();
  gGrid.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  disposables.push(gGrid);
  group.add(new THREE.LineSegments(gGrid, lineMat(0x8f84ff, 0.38)));

  // equatorial ring (bold, doubled for glow) and rays
  const ring: number[] = [];
  for (let k = 0; k < 256; k++) {
    const a0 = (k / 256) * Math.PI * 2, a1 = ((k + 1) / 256) * Math.PI * 2;
    ring.push(S * Math.cos(a0), 0, S * Math.sin(a0), S * Math.cos(a1), 0, S * Math.sin(a1));
  }
  const gRing = new THREE.BufferGeometry();
  gRing.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
  disposables.push(gRing);
  group.add(new THREE.LineSegments(gRing, lineMat(0xffffff, 0.85)));

  const rays: number[] = [];
  for (let k = 0; k < 220; k++) {
    const a = (k / 220) * Math.PI * 2;
    rays.push(0.16 * S * Math.cos(a), 0, 0.16 * S * Math.sin(a), S * Math.cos(a), 0, S * Math.sin(a));
  }
  const gRays = new THREE.BufferGeometry();
  gRays.setAttribute('position', new THREE.Float32BufferAttribute(rays, 3));
  disposables.push(gRays);
  group.add(new THREE.LineSegments(gRays, lineMat(0xb7a8ff, 0.26)));

  // crystal core
  const crystalGeo = new THREE.IcosahedronGeometry(R * 0.085, 0);
  const crystalMat = new THREE.MeshBasicMaterial({ color: 0xff9fcf, transparent: true, opacity: 0.95, fog: false });
  mats.push(crystalMat); base.set(crystalMat, 0.95); disposables.push(crystalGeo, crystalMat);
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(crystalGeo), lineMat(0xffffff, 0.9));
  crystal.add(edges);
  group.add(crystal);
  const glowTex = glowTexture();
  const glowMat = new THREE.SpriteMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.6 });
  mats.push(glowMat); base.set(glowMat, 0.6); disposables.push(glowTex, glowMat);
  const glow = new THREE.Sprite(glowMat);
  glow.scale.set(R * 0.4, R * 0.4, 1);
  group.add(glow);

  // year labels
  const top = textSprite(yearTop, R); top.position.set(0, S * 1.14, 0);
  const bottom = textSprite(yearBottom, R, '#b9b3e6'); bottom.position.set(0, -S * 1.14, 0); bottom.scale.multiplyScalar(0.7);
  group.add(top, bottom);
  for (const sp of [top, bottom]) { disposables.push(sp.material.map!, sp.material); mats.push(sp.material); base.set(sp.material, sp.material.opacity); }

  let t = 0, master = 1;
  const apply = () => { for (const m of mats) m.opacity = (base.get(m) ?? 1) * master; };
  return {
    group,
    update(dt) {
      t += dt;
      crystal.rotation.y += dt * 0.6;
      crystal.rotation.x = Math.sin(t * 0.5) * 0.25;
      const pulse = 1 + 0.08 * Math.sin(t * 1.8);
      glow.scale.setScalar(R * 0.4 * pulse);
    },
    setOpacity(o) { master = o; apply(); group.visible = o > 0.01; },
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
}
