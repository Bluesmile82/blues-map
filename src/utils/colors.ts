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
  'Rythm and Blues',
  'Detroit Blues',
  'Soul Blues',
  'West Coast Blues',
  'Jump Blues',
  'Georgia Blues',
  'Piedmont Blues',
  'St. Louis Blues',
  'Jazz',
  'British Blues',
  'Gospel',
] as const;

export type BluesStyle = typeof CANONICAL_STYLES[number];

export const CANONICAL_INSTRUMENTS = [
  'Guitar',
  'Piano',
  'Harmonica',
  'Vocals',
  'Saxophone',
  'Banjo',
  'Drums',
  'Bass',
  'Organ',
  'Keyboards',
  'Fiddle',
  'Mandolin',
  'Slide guitar',
  'Accordion',
  'Clarinet',
  'Flute',
  'Violin',
  'Double bass',
  'Washboard',
  'Tambourine',
  'Trumpet',
] as const;

export const STYLE_COLORS: Record<string, RGB> = {
  'Delta Blues': [200, 135, 42],
  'Hill Country Blues': [130, 200, 90],
  'Country Blues': [101, 163, 13],
  'Boogie Woogie': [26, 188, 156],
  'Classic Blues': [180, 140, 45],
  'Vaudeville Blues': [150, 110, 60],
  'Texas Blues': [232, 69, 69],
  'Swamp Blues': [80, 160, 90],
  'New Orleans Blues': [190, 90, 40],
  'Memphis Blues': [180, 60, 100],
  'Kansas City Blues': [120, 90, 210],
  'Chicago Blues': [74, 144, 217],
  'Rythm and Blues': [46, 204, 113],
  'Detroit Blues': [155, 155, 155],
  'Soul Blues': [233, 30, 99],
  'West Coast Blues': [40, 130, 200],
  'Jump Blues': [200, 150, 20],
  'Georgia Blues': [180, 110, 40],
  'Piedmont Blues': [142, 68, 173],
  'St. Louis Blues': [185, 110, 160],
  'Jazz': [26, 188, 156],
  'British Blues': [90, 130, 200],
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

// Generate consistent color for instruments based on hash of instrument name
export function getInstrumentColor(instrument: string, alpha?: number): RGB | RGBA {
  // Simple hash function to generate a number from string
  let hash = 0;
  for (let i = 0; i < instrument.length; i++) {
    hash = instrument.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Use hash to select from a predefined palette of distinct colors
  const palettes: RGB[] = [
    [231, 76, 60],   // Red-orange
    [200, 135, 42],  // Orange-brown
    [212, 175, 55],  // Yellow-gold
    [101, 163, 13],  // Green
    [26, 188, 156],  // Teal
    [52, 152, 219],  // Blue
    [90, 130, 200],  // Medium blue
    [140, 80, 185],  // Purple
    [74, 144, 217],  // Blue
    [46, 204, 113],  // Green
    [241, 196, 15],  // Yellow
    [155, 155, 155], // Gray
  ];

  const rgb: RGB = palettes[Math.abs(hash) % palettes.length];
  return alpha !== undefined ? [...rgb, alpha] as RGBA : rgb;
}

export function getInstrumentHex(instrument: string): string {
  const [r, g, b] = getInstrumentColor(instrument) as RGB;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}
