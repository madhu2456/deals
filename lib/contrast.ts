/** WCAG 2.1 relative-luminance contrast for category chips / icons (AA 4.5:1). */

export const CONTRAST_WHITE = "#ffffff";
export const CONTRAST_DARK = "#1e1b4b";
export const MIN_CONTRAST_RATIO = 4.5;

export type ContrastPair = {
  color: typeof CONTRAST_WHITE | typeof CONTRAST_DARK;
  backgroundColor: string;
};

type Rgb = { r: number; g: number; b: number };

function srgbChannel(c: number): number {
  const s = c / 255;
  // WCAG 2.1 relative luminance (sRGB).
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * srgbChannel(r) + 0.7152 * srgbChannel(g) + 0.0722 * srgbChannel(b);
}

export function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseHexRgb(input: string): Rgb | null {
  const raw = input.trim();
  const hex = raw.startsWith("#") ? raw.slice(1) : raw;
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$|^[0-9a-fA-F]{8}$/.test(hex)) {
    return null;
  }
  const full =
    hex.length === 3
      ? hex
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : hex.slice(0, 6);
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function toHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0"))
    .join("")}`;
}

function mixRgb(from: Rgb, to: Rgb, t: number): Rgb {
  return {
    r: Math.round(from.r + (to.r - from.r) * t),
    g: Math.round(from.g + (to.g - from.g) * t),
    b: Math.round(from.b + (to.b - from.b) * t),
  };
}

const WHITE_RGB: Rgb = { r: 255, g: 255, b: 255 };
const BLACK_RGB: Rgb = { r: 0, g: 0, b: 0 };
const WHITE_LUM = 1;
const DARK_RGB = parseHexRgb(CONTRAST_DARK)!;
const DARK_LUM = relativeLuminance(DARK_RGB.r, DARK_RGB.g, DARK_RGB.b);

function ratioAgainst(bg: Rgb, textLum: number): number {
  return contrastRatio(relativeLuminance(bg.r, bg.g, bg.b), textLum);
}

/** Smallest mix toward `to` so text at `textLum` reaches AA against the result. */
function mixUntilAa(from: Rgb, to: Rgb, textLum: number): { rgb: Rgb; t: number } {
  if (ratioAgainst(from, textLum) >= MIN_CONTRAST_RATIO) {
    return { rgb: from, t: 0 };
  }
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (ratioAgainst(mixRgb(from, to, mid), textLum) >= MIN_CONTRAST_RATIO) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return { rgb: mixRgb(from, to, hi), t: hi };
}

/**
 * Text + (possibly adjusted) background that meet WCAG AA 4.5:1.
 * Picks `#fff` / `#1e1b4b` against `bg` when either already passes; otherwise
 * darkens or lightens `bg` until one does.
 */
export function contrastText(bg: string): ContrastPair {
  const rgb = parseHexRgb(bg);
  if (!rgb) {
    return { color: CONTRAST_DARK, backgroundColor: CONTRAST_WHITE };
  }

  const whiteRatio = ratioAgainst(rgb, WHITE_LUM);
  const darkRatio = ratioAgainst(rgb, DARK_LUM);

  if (whiteRatio >= MIN_CONTRAST_RATIO || darkRatio >= MIN_CONTRAST_RATIO) {
    const color =
      whiteRatio >= MIN_CONTRAST_RATIO && whiteRatio >= darkRatio
        ? CONTRAST_WHITE
        : CONTRAST_DARK;
    return { color, backgroundColor: bg };
  }

  const darker = mixUntilAa(rgb, BLACK_RGB, WHITE_LUM);
  const lighter = mixUntilAa(rgb, WHITE_RGB, DARK_LUM);
  if (darker.t <= lighter.t) {
    return { color: CONTRAST_WHITE, backgroundColor: toHex(darker.rgb) };
  }
  return { color: CONTRAST_DARK, backgroundColor: toHex(lighter.rgb) };
}

export function contrastRatioHex(foreground: string, background: string): number | null {
  const fg = parseHexRgb(foreground);
  const bg = parseHexRgb(background);
  if (!fg || !bg) return null;
  return contrastRatio(
    relativeLuminance(fg.r, fg.g, fg.b),
    relativeLuminance(bg.r, bg.g, bg.b)
  );
}
