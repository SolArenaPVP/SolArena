import { FONT } from './config';

export interface TextOpts {
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  outline?: string;
  shadow?: string;
  thick?: number;
}

/** Pixel-font text with a hard outline and drop shadow, drawn on the UI layer. */
export function text(g: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string | CanvasGradient, o: TextOpts = {}) {
  g.font = `${size}px ${FONT}`;
  g.textAlign = o.align ?? 'center';
  g.textBaseline = o.baseline ?? 'middle';
  const k = o.thick ?? Math.max(1, Math.round(size / 10));
  if (o.shadow) {
    g.fillStyle = o.shadow;
    g.fillText(s, x + k + 1, y + k + 1);
  }
  if (o.outline) {
    g.fillStyle = o.outline;
    for (let dx = -k; dx <= k; dx++) {
      for (let dy = -k; dy <= k; dy++) if (dx || dy) g.fillText(s, x + dx, y + dy);
    }
  }
  g.fillStyle = color;
  g.fillText(s, x, y);
}

export function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, border: string, fill = 'rgba(10,7,26,0.86)') {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
  g.strokeStyle = border;
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  g.fillStyle = border;
  g.fillRect(x, y, 6, 2);
  g.fillRect(x, y, 2, 6);
  g.fillRect(x + w - 6, y + h - 2, 6, 2);
  g.fillRect(x + w - 2, y + h - 6, 2, 6);
}

/** Art with a colored frame. Flip mirrors it so portraits face the center; never flip cards, they carry text. */
export function framed(g: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, color: string, flip = false) {
  g.fillStyle = '#0a0716';
  g.fillRect(x - 2, y - 2, w + 4, h + 4);
  g.save();
  if (flip) {
    g.translate(x + w, y);
    g.scale(-1, 1);
    g.drawImage(img, 0, 0, w, h);
  } else g.drawImage(img, x, y, w, h);
  g.restore();
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
}

/** Greedy word wrap for the pixel font (every glyph is size px wide). */
export function wrap(s: string, size: number, maxWidth: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / size));
  const lines: string[] = [];
  let line = '';
  for (const word of s.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}
