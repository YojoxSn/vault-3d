export interface CardStats { notes: number; links: number; folders: number; span: string | null; url: string }

const fmt = (n: number) => n.toLocaleString('en-US');

/**
 * Builds a 1080×1350 (4:5) picture from a snapshot of the 3D canvas and a few numbers.
 * It deliberately contains NO note titles or folder names, only counts, so it is safe to post.
 */
export function makeShareCard(src: HTMLCanvasElement, s: CardStats): Promise<Blob> {
  const W = 1080, H = 1350;
  const ART_Y = 100, ART_H = 1000; // the picture sits between the title band and the numbers
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#02040a';
  g.fillRect(0, 0, W, H);

  // artwork: centered crop of the 3D view, same aspect as the area it fills
  const ratio = W / ART_H;
  let sw = src.width, sh = src.width / ratio;
  if (sh > src.height) { sh = src.height; sw = src.height * ratio; }
  g.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, ART_Y, W, ART_H);
  // fade the artwork into the numbers area
  const fade = g.createLinearGradient(0, ART_Y + ART_H - 220, 0, ART_Y + ART_H);
  fade.addColorStop(0, 'rgba(2,4,10,0)');
  fade.addColorStop(1, 'rgba(2,4,10,1)');
  g.fillStyle = fade;
  g.fillRect(0, ART_Y + ART_H - 220, W, 220);

  const mono = 'ui-monospace, "SF Mono", Menlo, Consolas, "DejaVu Sans Mono", monospace';
  // title band
  g.textBaseline = 'alphabetic';
  g.shadowColor = 'rgba(0,229,255,0.8)';
  g.shadowBlur = 22;
  g.fillStyle = '#00e5ff';
  g.font = `700 52px ${mono}`;
  g.fillText('VAULT·3D', 64, 70);
  g.shadowBlur = 0;
  g.fillStyle = '#cfe9f3';
  g.font = `500 28px ${mono}`;
  g.textAlign = 'right';
  g.fillText('MY SECOND BRAIN', W - 64, 68);
  g.textAlign = 'left';

  // three big numbers
  const cols: Array<[string, string]> = [[fmt(s.notes), 'notes'], [fmt(s.links), 'links'], [fmt(s.folders), 'folders']];
  cols.forEach(([n, label], i) => {
    const x = 64 + i * 330;
    g.fillStyle = '#ffffff';
    g.font = `700 76px ${mono}`;
    g.fillText(n, x, 1190);
    g.fillStyle = '#7f9bab';
    g.font = `500 28px ${mono}`;
    g.fillText(label, x, 1230);
  });
  if (s.span) {
    g.fillStyle = '#9d92ff';
    g.font = `500 32px ${mono}`;
    g.fillText(s.span, 64, 1282);
  }
  // footer
  g.fillStyle = '#00e5ff';
  g.font = `500 28px ${mono}`;
  g.fillText(s.url, 64, 1326);
  g.fillStyle = '#7f9bab';
  g.textAlign = 'right';
  g.font = `500 24px ${mono}`;
  g.fillText('100% local', W - 64, 1326);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image'))), 'image/png'));
}

/** Shares through the system sheet on phones, otherwise downloads the picture. */
export async function deliverCard(blob: Blob): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], 'my-second-brain.png', { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: 'My second brain', text: 'My Obsidian vault as a 3D hologram' }); return 'shared'; } catch { /* cancelled: fall through to a download */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'my-second-brain.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return 'downloaded';
}
