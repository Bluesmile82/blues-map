/**
 * Extract blues musicians from Wikipedia list and add skeleton entries
 * 
 * Run: node add-musicians-from-wiki.js
 * 
 * This script:
 * 1. Reads the Wikipedia "List of blues musicians" markdown
 * 2. Extracts musician names and styles from the table rows
 * 3. Adds skeleton entries to musicians.json (marked incomplete)
 * 4. Skips musicians that already exist
 */

import fs from 'fs';

const WIKI_FILE = '/Users/alvaroleal/.local/share/opencode/tool-output/tool_cceef47a0001vFtG2aaJvLIyPQ';
const MUSICIANS_FILE = './src/data/musicians.json';

// Read existing musicians
const musicians = JSON.parse(fs.readFileSync(MUSICIANS_FILE, 'utf-8'));
const existingIds = new Set(musicians.map(m => m.id));
const existingNames = new Set(musicians.map(m => m.name.toLowerCase()));

console.log(`Existing musicians: ${existingIds.size}`);

// Read Wikipedia content
const wikiContent = fs.readFileSync(WIKI_FILE, 'utf-8');

// Style mapping from Wikipedia to our canonical styles
const STYLE_MAP = {
  'country blues': 'Country Blues',
  'delta blues': 'Delta Blues',
  'chicago blues': 'Chicago Blues',
  'urban blues': 'Urban Blues',
  'piedmont blues': 'Piedmont Blues',
  'memphis blues': 'Memphis Blues',
  'texas blues': 'Texas Blues',
  'west coast blues': 'West Coast Blues',
  'electric blues': 'Chicago Blues',
  'boogie woogie': 'Boogie Woogie',
  'classic female blues': 'Classic Blues',
  'vaudeville blues': 'Vaudeville Blues',
  'st. louis blues': 'Urban Blues',
  'jug band': 'Country Blues',
  'acoustic blues': 'Country Blues',
  'gospel blues': 'Gospel',
  'jump blues': 'Jump Blues',
  'rhythm and blues': 'Rythm and Blues',
  'soul blues': 'Soul Blues',
  'swamp blues': 'Swamp Blues',
  'louisiana blues': 'New Orleans Blues',
  'new orleans blues': 'New Orleans Blues',
  'hill country blues': 'Hill Country Blues',
  'barrelhouse blues': 'Boogie Woogie',
  'british blues': 'British Blues',
  'blues rock': 'British Blues',
  'blues': 'Delta Blues',
};

function mapStyle(wikiStyle) {
  if (!wikiStyle) return 'Delta Blues';
  const lower = wikiStyle.toLowerCase();
  for (const [key, value] of Object.entries(STYLE_MAP)) {
    if (lower.includes(key)) return value;
  }
  return 'Delta Blues';
}

function createId(name) {
  return name
    .toLowerCase()
    .replace(/["']/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function createSkeleton(name, style) {
  return {
    id: createId(name),
    name: name,
    image: '',
    birthDate: '',
    birthPlace: '',
    birthCoords: [0, 0],
    deathDate: null,
    deathPlace: null,
    deathCoords: null,
    spentTimePlaces: [],
    instrument: '',
    bluesStyle: mapStyle(style),
    youtubeLink: '',
    albums: [],
    description: '',
    activeFrom: '',
    influences: [],
    influencedBy: [],
    incomplete: true
  };
}

// Extract musicians from the Wikipedia markdown
// Pattern: [Musician Name](/wiki/Musician_Page "...") followed by style link
const lines = wikiContent.split('\n');
const newMusicians = [];
let currentName = null;
let currentStyle = null;

// Match musician name links (not file links, not style links)
const namePattern = /^\[([^\]]+)\]\(\/wiki\/([^)]+)\s+"[^"]+"\)$/;
const stylePattern = /^\[([^\]]+)\]\(\/wiki\/.*blues.*\s+"[^"]+"\)$/i;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  
  // Skip file/image links
  if (line.startsWith('[![')) continue;
  if (line.includes('/wiki/File:')) continue;
  if (line.includes('/wiki/Special:')) continue;
  if (line.includes('/wiki/Help:')) continue;
  if (line.includes('/wiki/Wikipedia:')) continue;
  if (line.includes('/wiki/Talk:')) continue;
  
  const nameMatch = line.match(namePattern);
  if (nameMatch) {
    const name = nameMatch[1];
    const wikiPage = nameMatch[2];
    
    // Check if this looks like a musician name (not a style or category)
    if (wikiPage.includes('blues') && !name.includes('Blues') && !name.includes('blues')) {
      // This is likely a style link, capture it
      currentStyle = name;
    } else if (!wikiPage.includes('blues') && !wikiPage.includes('Category') && !wikiPage.includes('List_of')) {
      // This is likely a musician name
      currentName = name;
    }
  }
  
  // If we have a name and then encounter a style, create the entry
  if (currentName && line.match(stylePattern)) {
    const styleMatch = line.match(stylePattern);
    currentStyle = styleMatch[1];
    
    const id = createId(currentName);
    const nameLower = currentName.toLowerCase();
    
    if (!existingIds.has(id) && !existingNames.has(nameLower)) {
      const skeleton = createSkeleton(currentName, currentStyle);
      newMusicians.push(skeleton);
      existingIds.add(id);
      existingNames.add(nameLower);
    }
    
    currentName = null;
    currentStyle = null;
  }
}

// Also try a more direct approach - look for table-like patterns
// The Wikipedia table has: Name | Birth | Death | Origin | Style
const tableRowPattern = /\[([^\]]+)\]\(\/wiki\/[^)]+\).*?(\d{4})\*?.*?(\d{4}|\w+).*?(Country blues|Delta blues|Chicago blues|Urban blues|Piedmont blues|Memphis blues|Texas blues|West Coast blues|Electric blues|Boogie woogie|Classic female blues|Vaudeville blues|St\. Louis blues|Acoustic blues|Gospel blues|Jump blues|Rhythm and blues|Soul blues|Swamp blues|Louisiana blues|British blues|Blues rock|Blues)/i;

for (const line of lines) {
  // Look for lines that contain a musician wiki link followed by years and style
  const match = line.match(/\[([A-Z][^\]]+)\]\(\/wiki\/([^)]+)\)/);
  if (match) {
    const name = match[1];
    const wikiPage = match[2];
    
    // Skip non-musician links
    if (wikiPage.includes('blues') || 
        wikiPage.includes('Category') || 
        wikiPage.includes('List_of') ||
        wikiPage.includes('File:') ||
        wikiPage.includes('Special:') ||
        name.includes('Blues') ||
        name.length < 3) {
      continue;
    }
    
    // Look for style in nearby context
    let style = 'Delta Blues';
    const styleMatch = line.match(/(Country blues|Delta blues|Chicago blues|Urban blues|Piedmont blues|Memphis blues|Texas blues|West Coast blues|Electric blues|Boogie woogie|Classic female blues|Vaudeville blues|Acoustic blues|Gospel blues|Jump blues|Soul blues|Swamp blues|British blues|Blues rock)/i);
    if (styleMatch) {
      style = mapStyle(styleMatch[1]);
    }
    
    const id = createId(name);
    const nameLower = name.toLowerCase();
    
    if (!existingIds.has(id) && !existingNames.has(nameLower) && name.length > 2) {
      const skeleton = createSkeleton(name, style);
      newMusicians.push(skeleton);
      existingIds.add(id);
      existingNames.add(nameLower);
    }
  }
}

console.log(`Found ${newMusicians.length} new musicians to add`);

if (newMusicians.length > 0) {
  // Add new musicians to the array
  const allMusicians = [...musicians, ...newMusicians];
  
  // Write back
  fs.writeFileSync(MUSICIANS_FILE, JSON.stringify(allMusicians, null, 2));
  console.log(`Total musicians now: ${allMusicians.length}`);
  
  // List the new ones
  console.log('\nNew musicians added:');
  newMusicians.forEach(m => console.log(`  - ${m.name} (${m.bluesStyle})`));
}
