const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const WIDTH = 1200;
const HEIGHT = 630;
const MUSICIANS = [
  "robert-johnson",
  "bb-king",
  "muddy-waters",
  "bessie-smith",
  "howlin-wolf",
  "john-lee-hooker",
  "son-house",
  "lead-belly",
  "ma-rainey",
  "blind-lemon-jefferson",
  "willie-dixon",
  "etta-james",
  "t-bone-walker",
  "lightnin-hopkins",
  "skip-james",
  "charley-patton",
];

const IMG_DIR = path.join(__dirname, "..", "public", "images", "musicians");
const OUT_PATH = path.join(__dirname, "..", "public", "og-image.png");

async function getMusicianBuffer(name) {
  const png = path.join(IMG_DIR, `${name}.png`);
  const webp = path.join(IMG_DIR, `${name}.webp`);
  const filePath = fs.existsSync(png) ? png : webp;
  if (!fs.existsSync(filePath)) return null;
  const size = 100;
  const r = 16;
  const roundedRect = Buffer.from(`<svg width="${size}" height="${size}"><rect x="0" y="0" width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`);
  return sharp(filePath)
    .resize(size, size, { fit: "cover" })
    .composite([{ input: roundedRect, blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function main() {
  const svgBg = `
  <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bluesGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="30%" style="stop-color:#001"/>
        <stop offset="100%" style="stop-color:#83a2c6"/>
      </linearGradient>
      <radialGradient id="glow" cx="50%" cy="45%" r="50%">
        <stop offset="0%" style="stop-color:#83a2c6;stop-opacity:0.12"/>
        <stop offset="100%" style="stop-color:#83a2c6;stop-opacity:0"/>
      </radialGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bluesGrad)"/>
    <ellipse cx="600" cy="280" rx="550" ry="280" fill="url(#glow)"/>
    <text x="600" y="195" text-anchor="middle" font-family="Georgia,serif" font-size="96" font-weight="bold" fill="white" opacity="0.95">Blues Map</text>
    <text x="600" y="265" text-anchor="middle" font-family="Georgia,serif" font-size="32" fill="#83a2c6" opacity="0.85">Explore the world of blues musicians</text>
    <line x1="480" y1="295" x2="720" y2="295" stroke="white" stroke-width="1.5" opacity="0.2"/>
    <text x="600" y="340" text-anchor="middle" font-family="Georgia,serif" font-size="22" fill="#a0b8d0" opacity="0.7">Discover origins · Influences · Connections</text>
    <circle cx="1165" cy="50" r="12" fill="#fff" opacity="0.15"/>
    <circle cx="1185" cy="85" r="8" fill="#fff" opacity="0.1"/>
    <circle cx="15" cy="600" r="10" fill="#fff" opacity="0.1"/>
    <circle cx="30" cy="575" r="6" fill="#fff" opacity="0.07"/>
    <circle cx="1100" cy="580" r="7" fill="#fff" opacity="0.08"/>
  </svg>`;

  const composites = [];
  const cols = 8;
  const rows = 2;
  const cellW = 100;
  const cellH = 100;
  const gap = 12;
  const totalW = cols * cellW + (cols - 1) * gap;
  const startX = (WIDTH - totalW) / 2;
  const startY = 390;

  for (let i = 0; i < Math.min(MUSICIANS.length, cols * rows); i++) {
    const buf = await getMusicianBuffer(MUSICIANS[i]);
    if (!buf) continue;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = startX + col * (cellW + gap);
    const y = startY + row * (cellH + gap);
    const ringSize = cellW + 6;
    const ring = Buffer.from(`<svg width="${ringSize}" height="${ringSize}"><rect x="0" y="0" width="${ringSize}" height="${ringSize}" rx="19" ry="19" fill="none" stroke="white" stroke-width="2" opacity="0.25"/></svg>`);
    composites.push({ input: buf, left: x, top: y });
    composites.push({ input: ring, left: x - 3, top: y - 3 });
  }

  await sharp(Buffer.from(svgBg))
    .composite(composites)
    .png()
    .toFile(OUT_PATH);

  console.log(`OG image created: ${OUT_PATH}`);

  const icon512 = `
  <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bluesGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="30%" style="stop-color:#001"/>
        <stop offset="100%" style="stop-color:#83a2c6"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx="100" fill="url(#bluesGrad)"/>
    <text x="96" y="400" font-size="480" font-family="Georgia,serif" fill="white">B</text>
    <circle cx="390" cy="130" r="24" fill="#fff" opacity="1"/>
    <circle cx="425" cy="195" r="16" fill="#fff" opacity="1"/>
  </svg>`;

  const iconPath = path.join(__dirname, "..", "public", "apple-touch-icon.png");
  await sharp(Buffer.from(icon512)).resize(512, 512).png().toFile(iconPath);
  console.log(`Apple touch icon created: ${iconPath}`);

  const faviconPath = path.join(__dirname, "..", "public", "favicon.ico");
  await sharp(Buffer.from(icon512)).resize(32, 32).png().toFile(faviconPath.replace(".ico", ".png"));
  await sharp(Buffer.from(icon512)).resize(180, 180).png().toFile(path.join(__dirname, "..", "public", "favicon-180.png"));
  console.log(`Favicon PNGs created`);
}

main().catch(console.error);
