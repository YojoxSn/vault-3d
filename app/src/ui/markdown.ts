import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { ghostId, type Resolver } from '../parser/core';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') ?? '';
    if (/^https?:/i.test(href)) {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
    }
  }
});

/** Renders a note body to sanitised HTML. Images and embedded resources are never loaded. */
export function renderNote(md: string, from: string, resolver: Resolver): string {
  const pre = md
    .replace(/!\[\[([^\]]+)\]\]/g, (_m, t: string) => `*(embed: ${esc(t.split('|')[0])})*`)
    .replace(/\[\[([^\]]+?)\]\]/g, (_m, inner: string) => {
      const [target, alias] = inner.split('|');
      const label = esc((alias ?? target.split('#')[0]).trim());
      const r = resolver.resolve(target, from);
      if (!r) return label;
      return `<a class="wl${r.id ? '' : ' ghost'}" data-id="${esc(r.id ?? ghostId(r.name))}">${label}</a>`;
    });
  const html = marked.parse(pre, { gfm: true, async: false }) as string;
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ['img', 'style', 'form', 'input', 'iframe', 'script', 'object', 'embed', 'video', 'audio', 'svg'],
    ADD_ATTR: ['data-id', 'target'],
  });
}
