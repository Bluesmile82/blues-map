export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

// Single source of truth for style names — must match bluesStyle values in musicians.json exactly.
// Any style here that doesn't appear in the data will be invisible in the legend.
export const CANONICAL_STYLES = [
  'Delta Blues',
  'Hill Country Blues',
  'Country Blues',
  'Boogie Woogie',
  'Classic Blues',
  'Vaudeville Blues',
  'Texas Blues',
  'Swamp Blues',
  'New Orleans Blues',
  'Memphis Blues',
  'Kansas City Blues',
  'Chicago Blues',
  'Urban Blues',
  'Rythm and Blues',
  'Detroit Blues',
  'Soul Blues',
  'West Coast Blues',
  'Jump Blues',
  'Georgia Blues',
  'Piedmont Blues',
  'Jazz',
  'British Blues',
  'Gospel',
] as const;

export type BluesStyle = typeof CANONICAL_STYLES[number];

export const STYLE_COLORS: Record<string, RGB> = {
  'Delta Blues':       [200, 135,  42],
  'Hill Country Blues':[130, 200,  90],
  'Country Blues':     [101, 163,  13],
  'Boogie Woogie':     [ 26, 188, 156],
  'Classic Blues':     [212, 175,  55],
  'Vaudeville Blues':  [180, 140,  80],
  'Texas Blues':       [232,  69,  69],
  'Swamp Blues':       [ 80, 160,  90],
  'New Orleans Blues': [220, 110,  50],
  'Memphis Blues':     [200,  70, 120],
  'Kansas City Blues': [120,  90, 210],
  'Chicago Blues':     [ 74, 144, 217],
  'Urban Blues':       [140,  80, 185],
  'Rythm and Blues':   [ 46, 204, 113],
  'Detroit Blues':     [155, 155, 155],
  'Soul Blues':        [233,  30,  99],
  'West Coast Blues':  [ 52, 152, 219],
  'Jump Blues':        [241, 196,  15],
  'Georgia Blues':     [210, 140,  50],
  'Piedmont Blues':    [142,  68, 173],
  'Jazz':              [ 26, 188, 156],
  'British Blues':     [ 90, 130, 200],
  'Gospel':            [231,  76,  60],
};

export function getStyleColor(style: string, alpha?: number): RGB | RGBA {
  const key = Object.keys(STYLE_COLORS).find((k) => style.includes(k));
  const rgb: RGB = key ? STYLE_COLORS[key] : [150, 150, 150];
  return alpha !== undefined ? [...rgb, alpha] as RGBA : rgb;
}

export const STYLE_HEX: Record<string, string> = Object.fromEntries(
  Object.entries(STYLE_COLORS).map(([k, [r, g, b]]) => [
    k,
    `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`,
  ])
);

export function getStyleHex(style: string): string {
  const key = Object.keys(STYLE_HEX).find((k) => style.includes(k));
  return key ? STYLE_HEX[key] : '#969696';
}
