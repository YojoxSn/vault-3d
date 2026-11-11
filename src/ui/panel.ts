export interface NoteLinkRef { idx: number; title: string; ghost: boolean }
export interface PanelNote {
  title: string; folder: string; tags: string[]; words: number; created: string; updated: string;
  out: NoteLinkRef[]; inn: NoteLinkRef[];
  html: string; ghost: boolean; openUrl: string | null;
}
export interface PanelHandlers {
  onNavigate(idx: number): void;
  onWiki(id: string): void;
  onHref(href: string): void;
  onTag(tag: string): void;
  onClose(): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function createPanel(root: HTMLElement, h: PanelHandlers) {
  const el = document.createElement('section');
  el.id = 'panel';
  el.className = 'glass';
  root.appendChild(el);
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('.close')) return h.onClose();
    const nav = t.closest<HTMLElement>('[data-nav]');
    if (nav) { e.preventDefault(); return h.onNavigate(Number(nav.dataset.nav)); }
    const wl = t.closest<HTMLElement>('a.wl');
    if (wl) { e.preventDefault(); return h.onWiki(wl.dataset.id!); }
    const tag = t.closest<HTMLElement>('[data-tag]');
    if (tag) return h.onTag(tag.dataset.tag!);
    const a = t.closest<HTMLAnchorElement>('.body a[href]');
    if (a && !/^https?:/i.test(a.getAttribute('href') ?? '')) { e.preventDefault(); h.onHref(a.getAttribute('href')!); }
  });
  const list = (items: NoteLinkRef[]) =>
    items.length ? items.map((l) => `<a data-nav="${l.idx}" title="${esc(l.title)}">${l.ghost ? '◌ ' : ''}${esc(l.title)}</a>`).join('') : '<span style="color:var(--muted)">—</span>';
  return {
    show(n: PanelNote) {
      el.innerHTML = `
        <button class="btn close" title="Close (Esc)">×</button>
        <h2>${esc(n.title)}</h2>
        <div class="meta"><span>📁 <b>${esc(n.folder)}</b></span>${n.ghost ? '' : `<span><b>${n.words}</b> words</span><span>created <b>${n.created}</b></span><span>modified <b>${n.updated}</b></span>`}</div>
        ${n.tags.length ? `<div class="tags chips">${n.tags.map((t) => `<span class="chip" data-tag="${esc(t)}">#${esc(t)}</span>`).join('')}</div>` : ''}
        <div class="links"><div><span>Outgoing · ${n.out.length}</span>${list(n.out)}</div><div><span>Incoming · ${n.inn.length}</span>${list(n.inn)}</div></div>
        ${n.openUrl ? `<div class="actions"><a class="btn primary" href="${esc(n.openUrl)}">Open in Obsidian</a></div>` : ''}
        <div class="body">${n.ghost ? '<p style="color:var(--muted)">This note is linked but does not exist yet.</p>' : n.html}</div>`;
      el.classList.add('open');
      el.scrollTop = 0;
    },
    setBody(html: string) { const b = el.querySelector('.body'); if (b) b.innerHTML = html; },
    hide() { el.classList.remove('open'); },
    get isOpen() { return el.classList.contains('open'); },
  };
}
