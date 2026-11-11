import * as THREE from 'three';
import { filesFromDrop, filesFromInput, loadDemo, loadFromFiles, loadLocal, type Loaded } from './data/loader';
import { HandController } from './hands/controller';
import type { HandCallbacks, PointerState } from './hands/engine';
import { makeResolver, type Resolver } from './parser/core';
import type { GraphNode } from './parser/types';
import { STATE_DIM, STATE_HI, STATE_NORMAL, type SceneGraph } from './scene/graphObjects';
import { assignHemispheres, LayoutRunner } from './scene/layout';
import { computeOrbLayout, createOrbDecor, type OrbDecor } from './scene/orb';
import { Stage } from './scene/stage';
import { createLanding } from './ui/landing';
import { renderNote } from './ui/markdown';
import { createPanel, type NoteLinkRef } from './ui/panel';
import { createSidebar } from './ui/sidebar';

const iso = (t: number) => (t ? new Date(t).toISOString().slice(0, 10) : '—');

export class App {
  private stage: Stage;
  private layout: LayoutRunner;
  private root = document.getElementById('app')!;
  private sidebar!: ReturnType<typeof createSidebar>;
  private panel!: ReturnType<typeof createPanel>;
  private landing!: ReturnType<typeof createLanding>;
  private tooltip!: HTMLElement;
  private pointerEl!: HTMLElement;
  private toastEl!: HTMLElement;
  private hands: HandController | null = null;

  private data: Loaded | null = null;
  private nodes: GraphNode[] = [];
  private idx = new Map<string, number>();
  private out: number[][] = [];
  private inn: number[][] = [];
  private nbrs: number[][] = [];
  private resolver!: Resolver;
  private folderColor = new Map<string, string>();
  private lowerContent: string[] | null = null;

  private hiddenFolders = new Set<string>();
  private activeTags = new Set<string>();
  private hideOrphans = false;
  private hideGhosts = false;
  private brain = false;
  private orb = true;
  private decor: OrbDecor | null = null;
  private tween: ((dt: number) => void) | null = null;
  private holo = true;
  private hovered = -1;
  private hoverFromHand = false;
  private selected = -1;
  private anchor = -1;
  private stepCursor = -1;
  private matches: Set<number> | null = null;
  private firstFit = true;
  private mouse = { x: -1, y: -1, over: false };
  private toastTimer = 0;

  constructor() {
    this.stage = new Stage(document.getElementById('stage-wrap')!);
    this.layout = new LayoutRunner((pos, done, tick) => this.onLayout(pos, done, tick));
    this.buildUi();
    this.bindStage();
    this.bindKeys();
    this.bindDrop();
    this.stage.frameCbs.push(() => this.onFrame());
    this.stage.frameCbs.push((dt) => this.decor?.update(dt));
  }

  // ------------------------------------------------------------------------------------------ UI
  private buildUi() {
    const r = this.root;
    this.sidebar = createSidebar(r, {
      onSearch: (q) => this.search(q),
      onPickResult: (i) => { this.select(i); },
      onToggleFolder: (f) => { this.hiddenFolders.has(f) ? this.hiddenFolders.delete(f) : this.hiddenFolders.add(f); this.refreshFilters(); },
      onToggleTag: (t) => { this.activeTags.has(t) ? this.activeTags.delete(t) : this.activeTags.add(t); this.refreshFilters(); },
      onFlag: (name, v) => {
        if (name === 'orphans') { this.hideOrphans = v; this.refreshFilters(); }
        else if (name === 'ghosts') { this.hideGhosts = v; this.refreshFilters(); }
        else if (name === 'holo') this.setHolo(v);
        else if (name === 'orb') this.setOrb(v);
        else this.setBrain(v);
      },
      onHands: () => void this.toggleHands(),
      onRecenter: () => this.stage.recenter(),
    });
    this.panel = createPanel(r, {
      onNavigate: (i) => this.select(i, { keepAnchor: true }),
      onWiki: (id) => { const i = this.idx.get(id); if (i !== undefined) this.select(i); },
      onHref: (href) => {
        const res = this.resolver.resolve(href, this.selected >= 0 ? this.nodes[this.selected].path : undefined);
        const i = res?.id ? this.idx.get(res.id) : undefined;
        if (i !== undefined) this.select(i);
      },
      onTag: (t) => { this.activeTags.add(t); this.refreshFilters(); },
      onClose: () => this.deselect(),
    });
    this.tooltip = document.createElement('div');
    this.tooltip.id = 'tooltip';
    this.tooltip.className = 'glass';
    this.pointerEl = document.createElement('div');
    this.pointerEl.id = 'pointer';
    this.toastEl = document.createElement('div');
    this.toastEl.id = 'toast';
    this.toastEl.className = 'glass';
    r.append(this.tooltip, this.pointerEl, this.toastEl);
    this.landing = createLanding(r, {
      onDemo: () => void this.run(() => loadDemo()),
      onFiles: (list) => this.openFileList(list),
    });
    this.root.classList.add('is-landing');
    if (typeof __REPO_URL__ === 'string' && __REPO_URL__) this.landing.setRepoUrl(__REPO_URL__);
    else document.getElementById('l-gh')?.remove();
  }

  /** Loads a vault from an <input webkitdirectory> selection. */
  openFileList(list: FileList) {
    const { files, vaultName } = filesFromInput(list);
    return this.run(() => loadFromFiles(files, vaultName, (d, t) => this.landing.setBusy(`Reading notes… ${d}/${t}`)));
  }

  private bindDrop() {
    const overlay = document.createElement('div');
    overlay.id = 'drop';
    overlay.textContent = 'DROP YOUR VAULT FOLDER';
    this.root.appendChild(overlay);
    let depth = 0;
    window.addEventListener('dragenter', (e) => { e.preventDefault(); depth++; overlay.classList.add('on'); });
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; overlay.classList.remove('on'); } });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault(); depth = 0; overlay.classList.remove('on');
      if (!e.dataTransfer) return;
      // must start reading synchronously: DataTransfer items are only valid during the event
      const p = filesFromDrop(e.dataTransfer);
      void this.run(async () => {
        const dropped = await p;
        if (!dropped) throw new Error('Please drop a folder (your vault), not a file.');
        return loadFromFiles(dropped.files, dropped.vaultName, (d, t) => this.landing.setBusy(`Reading notes… ${d}/${t}`));
      });
    });
  }

  private toast(msg: string, ms = 2600) {
    this.toastEl.textContent = msg;
    this.toastEl.style.display = 'block';
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.style.display = 'none'), ms);
  }

  // --------------------------------------------------------------------------------------- startup
  async start() {
    const q = new URLSearchParams(location.search);
    if (q.has('demo')) return this.run(() => loadDemo());
    if (import.meta.env.DEV) {
      const local = await loadLocal();
      if (local) return this.run(async () => local);
    }
    this.landing.show();
  }

  private async run(loader: () => Promise<Loaded>) {
    try {
      this.landing.setBusy('Loading…');
      const data = await loader();
      this.load(data);
      this.root.classList.remove('is-landing');
      this.landing.hide();
    } catch (e) {
      console.error(e);
      this.root.classList.add('is-landing');
      this.landing.show();
      this.landing.error((e as Error).message || 'Could not load this vault.');
    }
  }

  // ------------------------------------------------------------------------------------------ data
  private load(data: Loaded) {
    this.data = data;
    this.nodes = data.graph.nodes;
    const n = this.nodes.length;
    this.idx = new Map(this.nodes.map((nd, i) => [nd.id, i]));
    this.out = Array.from({ length: n }, () => []);
    this.inn = Array.from({ length: n }, () => []);
    const ls: number[] = [], lt: number[] = [];
    for (const l of data.graph.links) {
      const s = this.idx.get(l.source), t = this.idx.get(l.target);
      if (s === undefined || t === undefined) continue;
      ls.push(s); lt.push(t);
      this.out[s].push(t); this.inn[t].push(s);
    }
    this.nbrs = this.nodes.map((_, i) => [...new Set([...this.out[i], ...this.inn[i]])]);
    this.resolver = makeResolver(this.nodes.filter((x) => !x.ghost).map((x) => x.path));
    this.lowerContent = null;

    // colours: one hue per root folder (golden-angle spacing), biggest folders first
    const counts = new Map<string, number>();
    for (const nd of this.nodes) if (!nd.ghost) counts.set(nd.folder, (counts.get(nd.folder) ?? 0) + 1);
    const folders = [...counts].sort((a, b) => b[1] - a[1]).map(([f]) => f);
    this.folderColor.clear();
    const tmp = new THREE.Color();
    const lin = new Map<string, THREE.Color>();
    folders.forEach((f, i) => {
      tmp.setHSL(((i * 137.508 + 190) % 360) / 360, 0.85, 0.6);
      lin.set(f, tmp.clone());
      this.folderColor.set(f, '#' + tmp.getHexString());
    });
    const ghostCol = new THREE.Color(0x9fb4c8);
    const colors = new Float32Array(n * 3);
    const radius = new Float32Array(n);
    const ghost = new Uint8Array(n);
    this.nodes.forEach((nd, i) => {
      const c = nd.ghost ? ghostCol : lin.get(nd.folder)!;
      colors.set([c.r, c.g, c.b], i * 3);
      radius[i] = 1.15 + Math.min(Math.sqrt(nd.degree), 14) * 0.5;
      ghost[i] = nd.ghost ? 1 : 0;
    });
    const sg: SceneGraph = { n, radius, colors, ghost, linkS: Int32Array.from(ls), linkT: Int32Array.from(lt) };

    this.hiddenFolders.clear(); this.activeTags.clear(); this.matches = null;
    this.selected = this.anchor = this.hovered = -1;
    this.panel.hide(); this.sidebar.clearSearch(); this.sidebar.setResults(null);
    this.stage.setGraph(sg);
    this.stage.setHologram(this.holo);
    this.firstFit = true;
    this.refreshFilters();
    this.applyMode(true);

    const tagCount = new Map<string, number>();
    for (const nd of this.nodes) for (const t of nd.tags) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
    this.tagList = [...tagCount].sort((a, b) => b[1] - a[1]).slice(0, 16);
    this.renderTags();
    if (data.graph.vaultName) document.title = `${data.graph.vaultName} — Vault 3D`;
  }
  private tagList: Array<[string, number]> = [];

  private renderTags() {
    this.sidebar.setTags(this.tagList.map(([tag, count]) => ({ tag, count, on: this.activeTags.has(tag) })));
  }

  private runLayout(useCurrent: boolean) {
    const n = this.nodes.length;
    const links = this.data!.graph.links;
    const edges: number[] = [];
    for (const l of links) { const s = this.idx.get(l.source), t = this.idx.get(l.target); if (s !== undefined && t !== undefined) edges.push(s, t); }
    const side = assignHemispheres(this.nodes.map((nd) => nd.id), this.nodes.map((nd) => nd.ghost));
    const init = useCurrent && this.stage.graph ? this.stage.graph.positions.slice() : undefined;
    this.sidebar.setStatus('◌ laying out…');
    this.layout.run({ n, edges: Int32Array.from(edges), side, brain: this.brain, init });
  }

  private onLayout(pos: Float32Array, done: boolean, tick: number) {
    if (this.orb) return; // a late message from a cancelled run
    this.stage.setPositions(pos, this.firstFit);
    this.firstFit = false;
    this.sidebar.setStatus(done ? '' : `◌ laying out… ${tick}`);
    if (done) this.stage.recenter();
  }

  // --------------------------------------------------------------------------- filters / highlight
  private visibleMask(): Uint8Array {
    const mask = new Uint8Array(this.nodes.length);
    const tagsOn = this.activeTags.size > 0;
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      let ok = true;
      if (nd.ghost && (this.hideGhosts || tagsOn)) ok = false;
      else if (!nd.ghost && this.hiddenFolders.has(nd.folder)) ok = false;
      else if (tagsOn && !nd.ghost && !nd.tags.some((t) => this.activeTags.has(t))) ok = false;
      else if (this.hideOrphans && nd.degree === 0) ok = false;
      mask[i] = ok ? 1 : 0;
    }
    return mask;
  }

  private refreshFilters() {
    const g = this.stage.graph;
    if (!g) return;
    const mask = this.visibleMask();
    g.setVisible(mask);
    this.applyStates();
    const counts = new Map<string, number>();
    for (const nd of this.nodes) if (!nd.ghost) counts.set(nd.folder, (counts.get(nd.folder) ?? 0) + 1);
    this.sidebar.setFolders([...counts].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count, color: this.folderColor.get(name)!, off: this.hiddenFolders.has(name) })));
    this.renderTags();
    let notes = 0, orph = 0;
    this.nodes.forEach((nd, i) => { if (mask[i] && !nd.ghost) { notes++; if (nd.degree === 0) orph++; } });
    this.sidebar.setStats({ notes, links: this.data!.graph.links.length, orphans: orph });
  }

  private applyStates() {
    const g = this.stage.graph;
    if (!g) return;
    const st = new Float32Array(this.nodes.length).fill(STATE_NORMAL);
    const focus = this.hovered >= 0 ? this.hovered : this.selected;
    if (focus >= 0) {
      st.fill(STATE_DIM);
      st[focus] = STATE_HI;
      for (const j of this.nbrs[focus]) st[j] = STATE_HI;
    } else if (this.matches) {
      st.fill(STATE_DIM);
      for (const j of this.matches) st[j] = STATE_HI;
    }
    g.setNodeState(st);
  }

  private search(q: string) {
    q = q.trim().toLowerCase();
    if (!q) { this.matches = null; this.sidebar.setResults(null); this.applyStates(); return; }
    if (!this.lowerContent) {
      const c = this.data!.content;
      this.lowerContent = this.nodes.map((nd) => (c[nd.id] ?? '').toLowerCase());
    }
    const title: number[] = [], body: number[] = [];
    this.nodes.forEach((nd, i) => {
      if (this.stage.graph && !this.stage.graph.isVisible(i)) return;
      if (nd.title.toLowerCase().includes(q)) title.push(i);
      else if (this.lowerContent![i].includes(q)) body.push(i);
    });
    const byDeg = (a: number, b: number) => this.nodes[b].degree - this.nodes[a].degree;
    title.sort(byDeg); body.sort(byDeg);
    this.matches = new Set([...title, ...body]);
    this.sidebar.setResults([...title, ...body].slice(0, 40).map((i) => ({ i, title: this.nodes[i].title, folder: this.nodes[i].folder })));
    this.applyStates();
  }

  // ----------------------------------------------------------------------------------- selection
  select(i: number, opts: { keepAnchor?: boolean } = {}) {
    if (i < 0 || i >= this.nodes.length) return;
    this.selected = i;
    if (!opts.keepAnchor) { this.anchor = i; this.stepCursor = -1; }
    this.stage.flyToNode(i);
    this.showPanel(i);
    this.applyStates();
  }

  deselect() {
    this.selected = this.anchor = -1;
    this.panel.hide();
    this.applyStates();
  }

  private ref(i: number): NoteLinkRef { return { idx: i, title: this.nodes[i].title, ghost: this.nodes[i].ghost }; }

  private showPanel(i: number) {
    const nd = this.nodes[i];
    const md = this.data!.content[nd.id];
    const byTitle = (a: number, b: number) => this.nodes[a].title.localeCompare(this.nodes[b].title);
    const g = this.data!.graph;
    this.panel.show({
      title: nd.title, folder: nd.ghost ? '(not created yet)' : nd.path.includes('/') ? nd.path.slice(0, nd.path.lastIndexOf('/')) : '(vault root)',
      tags: nd.tags, words: nd.words, created: iso(nd.createdAt), updated: iso(nd.updatedAt),
      out: [...new Set(this.out[i])].sort(byTitle).map((j) => this.ref(j)),
      inn: [...new Set(this.inn[i])].sort(byTitle).map((j) => this.ref(j)),
      html: md === undefined ? '<p style="color:var(--muted)">(no content loaded)</p>' : renderNote(md, nd.path, this.resolver),
      ghost: nd.ghost,
      openUrl: g.openable && !nd.ghost ? `obsidian://open?vault=${encodeURIComponent(g.vaultName)}&file=${encodeURIComponent(nd.path)}` : null,
    });
  }

  /** Previous / next linked note of the note you originally selected (hand swipe, arrow keys). */
  step(dir: 1 | -1) {
    if (this.anchor < 0) return;
    const list = [...this.nbrs[this.anchor]].sort((a, b) => this.nodes[a].title.localeCompare(this.nodes[b].title));
    if (!list.length) return;
    this.stepCursor = (this.stepCursor + dir + list.length) % list.length;
    this.select(list[this.stepCursor], { keepAnchor: true });
    this.toast(`${dir > 0 ? '→' : '←'} ${this.nodes[list[this.stepCursor]].title}`, 1400);
  }

  // ------------------------------------------------------------------------------------- toggles
  private setHolo(v: boolean) { this.holo = v; this.stage.setHologram(v); this.sidebar.setFlag('holo', v); }

  private setBrain(v: boolean) {
    this.brain = v;
    if (v) this.orb = false;
    this.sidebar.setFlag('brain', this.brain);
    this.sidebar.setFlag('orb', this.orb);
    this.applyMode();
    this.toast(v ? 'Brain shape: two hemispheres' : this.orb ? 'Orb mode' : 'Free-form layout');
  }

  private setOrb(v: boolean) {
    this.orb = v;
    if (v) this.brain = false;
    this.sidebar.setFlag('orb', this.orb);
    this.sidebar.setFlag('brain', this.brain);
    this.applyMode();
    this.toast(v ? 'Orb: height = time, wedge = folder' : 'Free-form layout');
  }

  /** Lays the notes out according to the current mode (orb, brain or free). */
  private applyMode(initial = false) {
    const g = this.stage.graph;
    if (!g || !this.data) return;
    this.layout.cancel();
    this.cancelTween();
    if (this.orb) {
      const { positions, R } = computeOrbLayout(this.nodes);
      const dated = this.nodes.filter((n) => !n.ghost && n.updatedAt > 0).map((n) => n.updatedAt);
      const year = (t: number) => String(new Date(t).getUTCFullYear());
      const top = dated.length ? year(Math.max(...dated)) : 'NOW';
      const bottom = dated.length ? year(Math.min(...dated)) : 'THEN';
      this.clearDecor();
      this.decor = createOrbDecor(R, top, bottom);
      this.stage.setDecor(this.decor.group);
      g.setSizeScale(0.5);
      g.setGlowScale(0.45, 0.65);
      this.stage.framePad = 1.95;
      this.tweenTo(positions, initial ? 0 : 1400);
    } else {
      this.clearDecor();
      this.stage.framePad = 1;
      g.setGlowScale(1, 1);
      g.setSizeScale(this.brain ? 0.6 : 1);
      this.runLayout(!initial);
    }
  }

  private clearDecor() {
    if (!this.decor) return;
    this.stage.setDecor(null);
    this.decor.dispose();
    this.decor = null;
  }

  private cancelTween() {
    const cb = this.tween;
    if (!cb) return;
    this.tween = null;
    setTimeout(() => { const i = this.stage.frameCbs.indexOf(cb); if (i >= 0) this.stage.frameCbs.splice(i, 1); }, 0);
  }

  /** Smoothly moves every node to the target positions. */
  private tweenTo(target: Float32Array, ms: number) {
    const g = this.stage.graph!;
    const first = this.firstFit;
    this.firstFit = false;
    if (ms <= 0 || first) { this.stage.setPositions(target, true); this.sidebar.setStatus(''); return; }
    const from = g.positions.slice();
    const cur = new Float32Array(target.length);
    let t = 0;
    const cb = (dt: number) => {
      if (this.tween !== cb) return;
      t += dt * 1000;
      const k = Math.min(t / ms, 1);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      for (let i = 0; i < cur.length; i++) cur[i] = from[i] + (target[i] - from[i]) * e;
      this.stage.setPositions(cur, false);
      if (k >= 1) { this.cancelTween(); this.stage.recenter(); }
    };
    this.tween = cb;
    this.stage.frameCbs.push(cb);
    this.sidebar.setStatus('');
  }

  async toggleHands() {
    if (!this.hands) this.hands = new HandController(this.handCallbacks());
    const h = this.hands;
    h.onClose = () => { this.sidebar.setHandsOn(false); this.clearHandPointer(); };
    if (h.active) { h.stop(); this.sidebar.setHandsOn(false); this.clearHandPointer(); return; }
    this.sidebar.setHandsOn(true);
    try { await h.start(); this.toast('Hands mode on — open hand to rotate, pinch to click', 3200); }
    catch (e) { console.warn(e); this.sidebar.setHandsOn(false); }
  }

  private handCallbacks(): HandCallbacks {
    return {
      rotate: (dx, dy) => this.stage.orbitBy(dx * 3.4, dy * 2.4),
      zoom: (f) => this.stage.zoomBy(f),
      pointer: (p) => this.onHandPointer(p),
      click: (x, y) => {
        const i = this.stage.pickNdc(x, y);
        this.wave((x + 1) / 2 * innerWidth, (1 - y) / 2 * innerHeight);
        if (i >= 0) this.select(i);
      },
      toggleSpin: () => { this.stage.paused = !this.stage.paused; this.toast(this.stage.paused ? '✊ Rotation frozen' : '✊ Rotation resumed'); },
      step: (d) => this.step(d),
      recenter: () => { this.stage.recenter(); this.toast('🙌 Recentered'); },
      gesture: () => {},
    };
  }

  private onHandPointer(p: PointerState | null) {
    if (!p) { this.clearHandPointer(); return; }
    const sx = (p.x + 1) / 2 * innerWidth, sy = (1 - p.y) / 2 * innerHeight;
    const el = this.pointerEl;
    el.style.display = 'block';
    el.style.left = sx + 'px'; el.style.top = sy + 'px';
    el.style.setProperty('--p', String(p.pinch));
    el.classList.toggle('down', p.down);
    this.hoverFromHand = true;
    this.setHover(this.stage.pickNdc(p.x, p.y), sx, sy);
  }

  private clearHandPointer() {
    this.pointerEl.style.display = 'none';
    if (this.hoverFromHand) { this.hoverFromHand = false; this.setHover(-1, 0, 0); }
  }

  private wave(x: number, y: number) {
    const w = document.createElement('div');
    w.className = 'wave';
    w.style.left = x + 'px'; w.style.top = y + 'px';
    document.body.appendChild(w);
    setTimeout(() => w.remove(), 650);
  }

  // ------------------------------------------------------------------------------- input (mouse)
  private setHover(i: number, sx: number, sy: number) {
    if (i !== this.hovered) {
      this.hovered = i;
      this.applyStates();
    }
    const t = this.tooltip;
    if (i < 0) { t.style.display = 'none'; return; }
    const nd = this.nodes[i];
    t.style.display = 'block';
    t.style.left = sx + 'px'; t.style.top = sy + 'px';
    t.innerHTML = `${nd.ghost ? '◌ ' : ''}${nd.title.replace(/[&<>]/g, '')}<small>${nd.ghost ? 'not created yet' : nd.folder} · ${nd.degree} links</small>`;
  }

  private bindStage() {
    const el = this.stage.renderer.domElement;
    let down: { x: number; y: number } | null = null;
    el.addEventListener('pointermove', (e) => { this.mouse = { x: e.clientX, y: e.clientY, over: true }; });
    el.addEventListener('pointerleave', () => { this.mouse.over = false; });
    el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    el.addEventListener('pointerup', (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 5) return;
      const i = this.stage.pickClient(e.clientX, e.clientY);
      if (i >= 0) this.select(i); else if (this.selected >= 0) this.deselect();
    });
  }

  private onFrame() {
    this.sidebar.setFps(this.stage.fps);
    if (!this.hoverFromHand && this.data) {
      if (this.mouse.over) {
        const i = this.stage.pickClient(this.mouse.x, this.mouse.y);
        this.setHover(i, this.mouse.x, this.mouse.y);
        this.stage.renderer.domElement.style.cursor = i >= 0 ? 'pointer' : 'grab';
      } else if (this.hovered >= 0) this.setHover(-1, 0, 0);
    }
  }

  private bindKeys() {
    window.addEventListener('keydown', (e) => {
      const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
      if (e.key === 'Escape') {
        if (typing) (e.target as HTMLElement).blur();
        else if (this.panel.isOpen) this.deselect();
        else if (this.matches) { this.sidebar.clearSearch(); this.search(''); }
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      switch (e.key) {
        case '/': e.preventDefault(); this.sidebar.search.focus(); break;
        case 'r': case 'R': this.stage.recenter(); break;
        case ' ': e.preventDefault(); this.stage.paused = !this.stage.paused; this.toast(this.stage.paused ? 'Rotation paused' : 'Rotation resumed', 1200); break;
        case 'o': case 'O': this.setOrb(!this.orb); break;
        case 'b': case 'B': this.setBrain(!this.brain); break;
        case 'g': case 'G': this.setHolo(!this.holo); break;
        case 'h': case 'H': void this.toggleHands(); break;
        case 'ArrowRight': this.step(1); break;
        case 'ArrowLeft': this.step(-1); break;
        case 'm': case 'M': this.sidebar.toggleCollapsed(); break;
      }
    });
  }
}
