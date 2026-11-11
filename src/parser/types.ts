export interface RawFile {
  /** Path relative to the vault root, with forward slashes (e.g. "Projects/Idea.md"). */
  path: string;
  content: string;
  /** Modification time (ms since epoch). */
  mtime: number;
  /** Creation time (ms since epoch), optional. */
  ctime?: number;
}

export interface GraphNode {
  id: string;
  title: string;
  /** Path without extension, "" for ghost notes. */
  path: string;
  folder: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  words: number;
  excerpt: string;
  ghost: boolean;
  /** Number of distinct connections (in + out). */
  degree: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface GraphData {
  vaultName: string;
  /** True when the vault can be opened through obsidian:// URLs. */
  openable: boolean;
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Markdown body (frontmatter removed) of each real note, keyed by node id. */
export type ContentMap = Record<string, string>;
