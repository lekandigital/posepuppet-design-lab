/* ============================================================
   THEME ENGINE
   Every accent / surface colour in the CSS and on the canvases resolves to one
   of these tokens, so swapping a palette is a single applyThemeVars() call plus
   a stage retint. Ported verbatim from the original single-file mockup.
   ============================================================ */

export type RGB = [number, number, number];

export interface Theme {
  accentRgb: string;
  accentDark: string;
  accent: string;
  accentLight: string;
  accent2Rgb: string;
  accent2: string;
  accent2Light: string;
  accent3Rgb: string;
  accent3: string;
  tint1: string;
  tint2: string;
  tint3: string;
  tintB: string;
  page1: string;
  page2: string;
  white: string;
  stageBg: string;
  ink: string;
  inkStrong: string;
  muted: string;
  /* raw hues + canvas shadows, so the dark variant can be derived later */
  accentArr: RGB;
  accent2Arr: RGB;
  accent3Arr: RGB;
  glow: number;
  contact: string;
  figShadow: string;
}

export interface ThemeEntry {
  name: string;
  theme: Theme;
}

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

const mix = (c: RGB, t: RGB, k: number): RGB =>
  [
    Math.round(c[0] + (t[0] - c[0]) * k),
    Math.round(c[1] + (t[1] - c[1]) * k),
    Math.round(c[2] + (t[2] - c[2]) * k),
  ];
const toHex = (a: RGB): string =>
  "#" + a.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, "0")).join("");
const toRgb = (a: RGB): string => a[0] + ", " + a[1] + ", " + a[2];

// Build a theme from up to three accent hues. rgb2/rgb3 default to the primary,
// so a single-hue call yields the clean mono palette; passing distinct hues
// yields a multi-colour palette (secondary + tertiary accents).
function theme(rgb: RGB, rgb2?: RGB | null, rgb3?: RGB | null, over?: Partial<Theme>): Theme {
  const a2 = rgb2 || rgb;
  const a3 = rgb3 || rgb;
  return Object.assign(
    {
      accentRgb: toRgb(rgb),
      accentDark: toRgb(mix(rgb, BLACK, 0.32)),
      accent: toHex(rgb),
      accentLight: toHex(mix(rgb, WHITE, 0.3)),
      accent2Rgb: toRgb(a2),
      accent2: toHex(a2),
      accent2Light: toHex(mix(a2, WHITE, 0.3)),
      accent3Rgb: toRgb(a3),
      accent3: toHex(a3),
      tint1: toHex(mix(rgb, WHITE, 0.88)),
      tint2: toHex(mix(rgb, WHITE, 0.955)),
      tint3: toHex(mix(rgb, WHITE, 0.91)),
      tintB: toHex(mix(a2, WHITE, 0.84)), // light wash of the secondary
      page1: "#fbfbfb",
      page2: toHex(mix(rgb, WHITE, 0.955)),
      white: "#ffffff",
      stageBg: "#ffffff",
      ink: "#111111",
      inkStrong: "#111111",
      muted: "rgba(0, 0, 0, 0.5)",
      accentArr: rgb,
      accent2Arr: a2,
      accent3Arr: a3,
      glow: 1, // stage-animation intensity (lifted in dark)
      contact: "rgba(20, 22, 35, 0.22)", // model contact pool on the floor
      figShadow: "rgba(20, 22, 35, 0.16)", // model drop shadow
    } as Theme,
    over,
  );
}

// Perceived luminance, 0..255.
const lum = (c: RGB): number => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];

// Lift an accent that's too dark to read on a dark surface (e.g. the black
// palette) toward white. Bright accents pass through unchanged.
function liftForDark(c: RGB): RGB {
  const L = lum(c);
  return L < 90 ? mix(c, WHITE, 0.78 * (1 - L / 90)) : c;
}

// Derive a dark variant from a built (light) theme: surfaces become near-black
// tinted toward the (legibility-lifted) accent, text flips, accents stay visible.
export function toDark(t: Theme): Theme {
  const D: RGB = [16, 17, 24]; // base near-black
  const a = liftForDark(t.accentArr);
  const a2 = liftForDark(t.accent2Arr);
  const a3 = liftForDark(t.accent3Arr);
  const s = (k: number) => toHex(mix(D, a, k)); // tint toward the lifted accent
  return Object.assign({}, t, {
    accentRgb: toRgb(a),
    accentDark: toRgb(mix(a, BLACK, 0.32)),
    accent: toHex(a),
    accentLight: toHex(mix(a, WHITE, 0.3)),
    accent2Rgb: toRgb(a2),
    accent2: toHex(a2),
    accent2Light: toHex(mix(a2, WHITE, 0.3)),
    accent3Rgb: toRgb(a3),
    accent3: toHex(a3),
    page1: s(0.05),
    page2: s(0.1),
    white: s(0.14),
    stageBg: s(0.06),
    tint1: s(0.24),
    tint2: s(0.12),
    tint3: s(0.2),
    tintB: toHex(mix(D, a2, 0.34)),
    ink: "#f3f5fb",
    inkStrong: "#ffffff",
    muted: "rgba(255, 255, 255, 0.55)",
    glow: 2.6,
    contact: "rgba(0, 0, 0, 0.55)",
    figShadow: "rgba(0, 0, 0, 0.45)",
  } as Partial<Theme>);
}

// Mono helpers (one hue): the editorial neutral and the tinted-paper palettes.
const neutral = (rgb: RGB) => theme(rgb);
const palette = (rgb: RGB, over: Partial<Theme>) => theme(rgb, null, null, over);

// The curated palette ring. The theme button cycles through these in order.
export const THEMES: ThemeEntry[] = [
  // ---- 1. Clean mono accents, swept around the colour wheel ----
  { name: "cobalt", theme: neutral([19, 66, 255]) },
  { name: "indigo", theme: neutral([99, 102, 241]) },
  { name: "violet", theme: neutral([139, 92, 246]) },
  { name: "purple", theme: neutral([168, 85, 247]) },
  { name: "fuchsia", theme: neutral([217, 70, 239]) },
  { name: "bubblegum", theme: neutral([255, 93, 143]) },
  { name: "rose", theme: neutral([244, 63, 94]) },
  { name: "red", theme: neutral([239, 68, 68]) },
  { name: "orange", theme: neutral([249, 115, 22]) },
  { name: "amber", theme: neutral([245, 158, 11]) },
  { name: "lime", theme: neutral([132, 204, 22]) },
  { name: "green", theme: neutral([34, 197, 94]) },
  { name: "emerald", theme: neutral([16, 185, 129]) },
  { name: "teal", theme: neutral([20, 184, 166]) },
  { name: "cyan", theme: neutral([6, 182, 212]) },
  { name: "sky", theme: neutral([104, 189, 245]) },
  { name: "blue", theme: neutral([59, 130, 246]) },

  // ---- 2. Warm tinted-paper palettes (the whole page takes on the hue) ----
  {
    name: "sunset clay",
    theme: palette([226, 100, 60], {
      page1: "#fdf6f0", page2: "#f7e7da", stageBg: "#fff7f1", white: "#fffaf5",
      tint1: "#f4d6c3", tint2: "#fceadf", tint3: "#f7e0d0",
      ink: "#3a2118", inkStrong: "#2a1812", muted: "rgba(58, 33, 24, 0.55)",
    }),
  },
  {
    name: "desert sand",
    theme: palette([197, 121, 38], {
      page1: "#faf6ee", page2: "#f1e8d6", stageBg: "#faf5ea", white: "#fffdf7",
      tint1: "#ecdcc0", tint2: "#f6eede", tint3: "#f0e4cc",
      ink: "#36291a", inkStrong: "#271c10", muted: "rgba(54, 41, 26, 0.55)",
    }),
  },
  {
    name: "honey gold",
    theme: palette([203, 148, 20], {
      page1: "#fdf8ec", page2: "#f5ebcf", stageBg: "#fdf7e8", white: "#fffdf4",
      tint1: "#efddb0", tint2: "#f9f0d6", tint3: "#f4e7c4",
      ink: "#382c10", inkStrong: "#2a2009", muted: "rgba(56, 44, 16, 0.55)",
    }),
  },
  {
    name: "matcha",
    theme: palette([101, 143, 28], {
      page1: "#f7f8ee", page2: "#ecf0d8", stageBg: "#f8faef", white: "#fdfdf6",
      tint1: "#dbe6b6", tint2: "#f0f4dd", tint3: "#e6edc9",
      ink: "#2b3115", inkStrong: "#1f240e", muted: "rgba(43, 49, 21, 0.55)",
    }),
  },
  {
    name: "plum wine",
    theme: palette([150, 34, 68], {
      page1: "#fbf2f4", page2: "#f3e0e5", stageBg: "#fcf1f4", white: "#fffafb",
      tint1: "#ecccd5", tint2: "#f8e4e9", tint3: "#f2d6dd",
      ink: "#34151e", inkStrong: "#260e15", muted: "rgba(52, 21, 30, 0.55)",
    }),
  },

  // ---- 3. Neutrals, to close the ring on calm ground ----
  { name: "slate", theme: neutral([100, 116, 139]) },
  { name: "stone", theme: neutral([120, 113, 108]) },
  { name: "black", theme: neutral([0, 0, 0]) },
];

// Push a theme's tokens onto the document's CSS custom properties.
export function applyThemeVars(t: Theme): void {
  const s = document.documentElement.style;
  const set: Record<string, string> = {
    "--accent-rgb": t.accentRgb, "--accent-dark": t.accentDark,
    "--accent": t.accent, "--accent-light": t.accentLight,
    "--accent-2-rgb": t.accent2Rgb, "--accent-2": t.accent2, "--accent-2-light": t.accent2Light,
    "--accent-3-rgb": t.accent3Rgb, "--accent-3": t.accent3,
    "--tint-1": t.tint1, "--tint-2": t.tint2, "--tint-3": t.tint3,
    "--page-1": t.page1, "--page-2": t.page2, "--white": t.white,
    "--ink": t.ink, "--ink-strong": t.inkStrong, "--muted": t.muted,
  };
  for (const k in set) s.setProperty(k, set[k]);
}
