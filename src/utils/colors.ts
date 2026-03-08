export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export const STYLE_COLORS: Record<string, RGB> = {
  'Delta Blues': [200, 135, 42],
  'Boogie Woogie': [26, 188, 156],
  'Chicago Blues': [74, 144, 217],
  'Texas Blues': [232, 69, 69],
  'Classic Blues': [212, 175, 55],
  'Hill Country Blues': [155, 255, 155],
  'Detroit Blues': [155, 155, 155],
  'Electric Blues': [155, 89, 182],
  'Memphis Blues': [230, 126, 34],
  'Soul Blues': [233, 30, 99],
  'Rythm and Blues': [46, 204, 113],
  'Country Blues': [101, 163, 13],
  'Mississippi Blues': [168, 100, 60],
  'Vaudeville Blues': [180, 140, 80],
  'West Coast Blues': [52, 152, 219],
  'Jump Blues': [241, 196, 15],
  'Piedmont Blues': [142, 68, 173],
  'Jazz': [26, 188, 156],
  'British Blues': [52, 152, 219],
  'Gospel': [231, 76, 60],
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
