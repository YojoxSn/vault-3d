import { describe, expect, it } from 'vitest';
import { buildGraph, extractInlineTags, extractLinks, splitFrontmatter } from '../src/parser/core';

const f = (path: string, content: string) => ({ path, content, mtime: 1_700_000_000_000 });

describe('parser', () => {
  it('extracts wikilinks, aliases, headings, embeds and md links; ignores code', () => {
    const l = extractLinks('[[A]] [[B|alias]] [[C#Head]] ![[D]] [t](E.md) `[[no]]`\n```\n[[nope]]\n```');
    expect(l.wiki).toEqual(['A', 'B|alias', 'C#Head', 'D']);
    expect(l.md).toEqual(['E.md']);
  });

  it('reads tags from frontmatter (inline, list, block) and body', () => {
    expect(splitFrontmatter('---\ntags: [a, b]\n---\nx').tags).toEqual(['a', 'b']);
    expect(splitFrontmatter('---\ntags: a, b\n---\nx').tags).toEqual(['a', 'b']);
    expect(splitFrontmatter('---\ntags:\n  - one\n  - two/sub\n---\nx').tags).toEqual(['one', 'two/sub']);
    expect(extractInlineTags('# Heading\nhello #idea and #a/b, not #123 nor C# nor http://x.com/#frag')).toEqual(['idea', 'a/b']);
  });

  it('resolves like Obsidian: by name, case-insensitive, with aliases and paths; unknown becomes a ghost', () => {
    const { graph } = buildGraph(
      [
        f('Home.md', '[[a note|alias]] [[Folder/Deep]] [[Missing One]] [x](Other%20Note.md) [[img.png]]'),
        f('Sub/A Note.md', 'hi'),
        f('Folder/Deep.md', 'deep'),
        f('Other Note.md', ''),
        f('.obsidian/x.md', '[[Home]]'),
      ],
      'V',
    );
    const ids = graph.nodes.map((n) => n.id).sort();
    expect(ids).toEqual(['Folder/Deep', 'Home', 'Other Note', 'Sub/A Note', 'ghost:missing one']);
    expect(graph.links.length).toBe(4);
    expect(graph.nodes.find((n) => n.ghost)!.title).toBe('Missing One');
    expect(graph.nodes.find((n) => n.id === 'Home')!.degree).toBe(4);
  });

  it('computes excerpt, words and folder', () => {
    const { graph, content } = buildGraph([f('Top/N.md', '---\ntags: [t]\n---\n# Title\nhello **world** [[X]]')], 'V');
    const n = graph.nodes[0];
    expect(n.folder).toBe('Top');
    expect(n.tags).toEqual(['t']);
    expect(n.excerpt).toBe('Title hello world X');
    expect(content['Top/N']).toContain('hello');
  });
});
