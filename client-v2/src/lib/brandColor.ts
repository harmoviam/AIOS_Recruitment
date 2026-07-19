/** Extract a dominant brand color from an image file (client-side). */
export async function extractBrandColorFromLogo(file: File): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, size, size);
    bitmap.close();

    const { data } = ctx.getImageData(0, 0, size, size);
    const buckets = new Map<string, { r: number; g: number; b: number; n: number; score: number }>();

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 180) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const light = (max + min) / 510;
      // Skip near-white / near-black / gray pixels
      if (light > 0.92 || light < 0.08 || sat < 0.12) continue;

      const qr = Math.round(r / 24) * 24;
      const qg = Math.round(g / 24) * 24;
      const qb = Math.round(b / 24) * 24;
      const key = `${qr},${qg},${qb}`;
      const prev = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0, score: 0 };
      prev.r += r;
      prev.g += g;
      prev.b += b;
      prev.n += 1;
      prev.score += 0.55 + sat;
      buckets.set(key, prev);
    }

    let best: { r: number; g: number; b: number; score: number } | null = null;
    for (const bucket of buckets.values()) {
      const score = bucket.score;
      if (!best || score > best.score) {
        best = {
          r: Math.round(bucket.r / bucket.n),
          g: Math.round(bucket.g / bucket.n),
          b: Math.round(bucket.b / bucket.n),
          score,
        };
      }
    }
    if (!best) return null;
    return rgbToHex(best.r, best.g, best.b);
  } catch {
    return null;
  }
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function withAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

export function mixWithWhite(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return '#F8FAFC';
  const t = Math.min(1, Math.max(0, amount));
  const r = Math.round(rgb.r + (255 - rgb.r) * t);
  const g = Math.round(rgb.g + (255 - rgb.g) * t);
  const b = Math.round(rgb.b + (255 - rgb.b) * t);
  return rgbToHex(r, g, b);
}
