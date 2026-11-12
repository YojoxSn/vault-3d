import type { InsightGroup } from '../insights';

export interface FolderItem { name: string; color: string; count: number; off: boolean }
export interface TagItem { tag: string; count: number; on: boolean }
export interface ResultItem { i: number; title: string; folder: string }

export interface SidebarHandlers {
  onSearch(q: string): void;
  onPickResult(i: number): void;
  onToggleFolder(name: string): void;
  onToggleTag(tag: string): void;
  onQuality(value: 'auto' | 'high' | 'medium' | 'low'): void;
  onFlag(name: 'orphans' | 'ghosts' | 'holo' | 'brain' | 'orb', v: boolean): void;
  onShare(): void;
  onHands(): void;
  onRecenter(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createSidebar(root: HTMLElement, h: SidebarHandlers) {
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.className = 'glass';
  hud.innerHTML = `<div class="brand">VAULT·3D</div>
    <div class="stats"><span>notes <b id="s-notes">0</b></span><span>links <b id="s-links">0</b></span><span>orphans <b id="s-orph">0</b></span><span><b id="s-fps">0</b> fps</span></div>
    <div id="status"></div>`;
  const toggle = document.createElement('button');
  toggle.id = 'side-toggle';
  toggle.className = 'btn';
  toggle.textContent = '☰ Menu';
  const side = document.createElement('aside');
  side.id = 'side';
  side.className = 'glass';
  side.innerHTML = `
    <input id="search" type="search" placeholder="Search titles & content   ( / )" autocomplete="off" spellcheck="false" />
    <div id="results"></div>
    <div class="scroll">
      <h4>Folders</h4><div id="folders"></div>
      <h4>Tags</h4><div id="tags" class="chips"></div>
      <h4>Insights</h4><div id="insights"></div>
      <h4>Display</h4>
      <label class="row"><input type="checkbox" id="f-orph"> Hide orphan notes</label>
      <label class="row"><input type="checkbox" id="f-ghost"> Hide ghost notes (wireframe)</label>
      <label class="row"><input type="checkbox" id="f-holo" checked> Hologram effect <kbd>G</kbd></label>
      <label class="row"><input type="checkbox" id="f-orb" checked> Orb mode: time × topic <kbd>O</kbd></label>
      <label class="row"><input type="checkbox" id="f-brain"> Brain shape <kbd>B</kbd></label>
      <label class="row">Quality <kbd>Q</kbd>
        <select id="f-quality"><option value="auto">Auto</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low (smoothest)</option></select>
      </label>
    </div>
    <div class="btns">
      <button class="btn" id="b-hands">✋ Hands mode <kbd>H</kbd></button>
      <button class="btn" id="b-center">⌖ Recenter <kbd>R</kbd></button>
      <button class="btn" id="b-share" title="Saves a picture of your vault (counts only, no note titles)">📸 Share card <kbd>P</kbd></button>
      <a class="btn" id="b-star" target="_blank" rel="noopener" style="display:none">⭐ Star on GitHub</a>
    </div>`;
  const hint = document.createElement('div');
  hint.id = 'hint';
  hint.innerHTML = `<kbd>/</kbd>search<kbd>R</kbd>recenter<kbd>Space</kbd>pause spin<kbd>O</kbd>orb<kbd>B</kbd>brain<kbd>H</kbd>hands<kbd>Esc</kbd>close`;
  root.append(hud, toggle, side, hint);

  const $ = <T extends HTMLElement>(id: string) => side.querySelector<T>('#' + id) ?? hud.querySelector<T>('#' + id)!;
  let lastFps = -1;
  const search = $<HTMLInputElement>('search');
  const results = $('results');
  let debounce = 0;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = window.setTimeout(() => h.onSearch(search.value), 130);
  });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = results.querySelector<HTMLElement>('.r');
      if (first) h.onPickResult(Number(first.dataset.i));
    }
  });
  results.addEventListener('click', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('.r');
    if (r) h.onPickResult(Number(r.dataset.i));
  });
  $('folders').addEventListener('click', (e) => {
    const f = (e.target as HTMLElement).closest<HTMLElement>('.folder');
    if (f) h.onToggleFolder(f.dataset.name!);
  });
  $('tags').addEventListener('click', (e) => {
    const c = (e.target as HTMLElement).closest<HTMLElement>('.chip');
    if (c) h.onToggleTag(c.dataset.tag!);
  });
  $<HTMLInputElement>('f-orph').addEventListener('change', (e) => h.onFlag('orphans', (e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('f-ghost').addEventListener('change', (e) => h.onFlag('ghosts', (e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('f-holo').addEventListener('change', (e) => h.onFlag('holo', (e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('f-brain').addEventListener('change', (e) => h.onFlag('brain', (e.target as HTMLInputElement).checked));
  $<HTMLInputElement>('f-orb').addEventListener('change', (e) => h.onFlag('orb', (e.target as HTMLInputElement).checked));
  $<HTMLSelectElement>('f-quality').addEventListener('change', (e) => h.onQuality((e.target as HTMLSelectElement).value as 'auto' | 'high' | 'medium' | 'low'));
  $('insights').addEventListener('click', (e) => {
    const r = (e.target as HTMLElement).closest<HTMLElement>('.r');
    if (r) h.onPickResult(Number(r.dataset.i));
  });
  $('b-share').addEventListener('click', h.onShare);
  $('b-hands').addEventListener('click', h.onHands);
  $('b-center').addEventListener('click', h.onRecenter);
  toggle.addEventListener('click', () => side.classList.toggle('collapsed'));

  return {
    search,
    setStats(s: { notes: number; links: number; orphans: number }) {
      $('s-notes').textContent = String(s.notes);
      $('s-links').textContent = String(s.links);
      $('s-orph').textContent = String(s.orphans);
    },
    setFps(n: number) { if (n !== lastFps) { lastFps = n; $('s-fps').textContent = String(n); } },
    setQuality(v: string) { $<HTMLSelectElement>('f-quality').value = v; },
    setStatus(t: string) { $('status').textContent = t; },
    setFolders(list: FolderItem[]) {
      $('folders').innerHTML = list
        .map((f) => `<div class="folder${f.off ? ' off' : ''}" data-name="${esc(f.name)}"><span class="dot" style="background:${f.color};color:${f.color}"></span><span class="name">${esc(f.name)}</span><span class="n">${f.count}</span></div>`)
        .join('');
    },
    setTags(list: TagItem[]) {
      $('tags').innerHTML = list.map((t) => `<span class="chip${t.on ? ' on' : ''}" data-tag="${esc(t.tag)}">#${esc(t.tag)} <small>${t.count}</small></span>`).join('');
    },
    setResults(list: ResultItem[] | null) {
      if (!list) { results.className = ''; results.innerHTML = ''; return; }
      results.className = 'has';
      results.innerHTML = list.length
        ? list.map((r) => `<div class="r" data-i="${r.i}">${esc(r.title)}<small>${esc(r.folder)}</small></div>`).join('')
        : '<div class="r" style="cursor:default;color:var(--muted)">No match</div>';
    },
    /** Shows the "Star on GitHub" link once the repository address is known (set at build time). */
    setRepoUrl(url: string) { const a = $<HTMLAnchorElement>('b-star'); a.href = url; a.style.display = 'inline-block'; },
    setInsights(groups: InsightGroup[]) {
      $('insights').innerHTML = groups
        .map((g) => `<div class="ins"><div class="ins-t" title="${esc(g.hint)}">${esc(g.title)}</div>${g.items
          .map((it) => `<div class="r" data-i="${it.i}">${esc(it.label)}<small>${esc(it.meta)}</small></div>`).join('')}</div>`)
        .join('') || '<div style="color:var(--muted)">Nothing to report.</div>';
    },
    setHandsOn(on: boolean) { $('b-hands').classList.toggle('on', on); },
    setFlag(name: 'holo' | 'brain' | 'orb', v: boolean) { $<HTMLInputElement>('f-' + name).checked = v; },
    toggleCollapsed() { side.classList.toggle('collapsed'); },
    clearSearch() { search.value = ''; },
  };
}
