/**
 * Blues musician ETL enrichment script
 *
 * Fetches from:
 *  - Wikidata  → birth/death dates, places, coords, image (P18), albums (SPARQL)
 *  - Wikipedia → intro extract for description
 *  - YouTube   → main artist video + one video per album (no API key needed)
 *
 * Run: node enrich-musicians-v3.js
 * Safe to re-run — skips musicians that already have all key fields filled.
 * Saves progress every 5 musicians in case it is interrupted.
 */

import fs from 'fs';

const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf-8'));

const WIKIDATA_API  = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const SPARQL_API    = 'https://query.wikidata.org/sparql';

// Delay between requests to avoid rate-limiting
const DELAY_MS = 600;

// Canonical blues styles (must match colors.ts)
const CANONICAL_STYLES = [
  'Delta Blues', 'Hill Country Blues', 'Country Blues', 'Boogie Woogie',
  'Classic Blues', 'Vaudeville Blues', 'Texas Blues', 'Swamp Blues',
  'New Orleans Blues', 'Memphis Blues', 'Kansas City Blues', 'Chicago Blues',
  'Urban Blues', 'Rythm and Blues', 'Detroit Blues', 'Soul Blues',
  'West Coast Blues', 'Jump Blues', 'Georgia Blues', 'Piedmont Blues', 'Jazz', 'British Blues', 'Gospel',
];

/** Map Wikidata genre labels to our canonical style names */
function mapToCanonicalStyle(genreLabels) {
  // 1. Exact or contained match against canonical list
  for (const label of genreLabels) {
    const l = label.toLowerCase();
    const exact = CANONICAL_STYLES.find(s => s.toLowerCase() === l || l.includes(s.toLowerCase()));
    if (exact) return exact;
  }
  // 2. Keyword-based fallback for aliases (e.g. "rhythm and blues", "folk blues")
  for (const label of genreLabels) {
    const l = label.toLowerCase();
    if (l.includes('delta'))                          return 'Delta Blues';
    if (l.includes('hill country'))                   return 'Hill Country Blues';
    if (l.includes('country blues') || l.includes('folk blues') || l.includes('rural blues')) return 'Country Blues';
    if (l.includes('boogie'))                         return 'Boogie Woogie';
    if (l.includes('classic blues'))                  return 'Classic Blues';
    if (l.includes('vaudeville'))                     return 'Vaudeville Blues';
    if (l.includes('texas'))                          return 'Texas Blues';
    if (l.includes('swamp'))                          return 'Swamp Blues';
    if (l.includes('new orleans'))                    return 'New Orleans Blues';
    if (l.includes('memphis'))                        return 'Memphis Blues';
    if (l.includes('kansas city'))                    return 'Kansas City Blues';
    if (l.includes('chicago'))                        return 'Chicago Blues';
    if (l.includes('urban blues'))                    return 'Urban Blues';
    if (l.includes('rhythm and blues') || l.includes('r&b')) return 'Rythm and Blues';
    if (l.includes('detroit'))                        return 'Detroit Blues';
    if (l.includes('soul blues'))                     return 'Soul Blues';
    if (l.includes('west coast'))                     return 'West Coast Blues';
    if (l.includes('jump blues'))                     return 'Jump Blues';
    if (l.includes('georgia blues') || l.includes('atlanta blues')) return 'Georgia Blues';
    if (l.includes('piedmont'))                       return 'Piedmont Blues';
    if (l.includes('jazz'))                           return 'Jazz';
    if (l.includes('british blues'))                  return 'British Blues';
    if (l.includes('gospel'))                         return 'Gospel';
  }
  // 3. Generic "blues" → Delta as default
  for (const label of genreLabels) {
    if (label.toLowerCase().includes('blues'))        return 'Delta Blues';
  }
  return '';
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJSON(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'BluesMapETL/3.0 (educational project)',
        ...options.headers,
      },
    });
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

async function fetchText(url, options = {}, timeout = 12000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...options.headers,
      },
    });
    clearTimeout(id);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Wikidata helpers
// ---------------------------------------------------------------------------

const MUSIC_ENTITY_TERMS = ['musician', 'singer', 'guitarist', 'blues', 'pianist', 'vocalist',
  'saxophonist', 'harmonica', 'american', 'songwriter', 'guitarist', 'bassist', 'drummer',
  'musician', 'jazz', 'gospel', 'country', 'recording artist'];

async function searchWikidataEntity(name) {
  // Strategy 1: Wikipedia sitelinks — try "Name (musician)" variants first to avoid ambiguity
  const titleVariants = [
    `${name} (musician)`,
    `${name} (singer)`,
    `${name} (blues musician)`,
    `${name} (blues singer)`,
    name,  // plain name last — may match non-musician
  ];

  for (const title of titleVariants) {
    try {
      const wpUrl = `${WIKIPEDIA_API}?action=query&titles=${encodeURIComponent(title)}&prop=pageprops&ppprop=wikibase_item&format=json&origin=*&redirects=1`;
      const wpData = await fetchJSON(wpUrl);
      const pages = wpData?.query?.pages || {};
      const page = Object.values(pages)[0];
      if (page?.missing) continue;  // page doesn't exist
      const qid = page?.pageprops?.wikibase_item;
      if (qid) {
        // Validate this entity is a person/musician via its Wikidata description
        try {
          const entUrl = `${WIKIDATA_API}?action=wbgetentities&ids=${qid}&props=descriptions&languages=en&format=json&origin=*`;
          const entData = await fetchJSON(entUrl);
          const entDesc = entData?.entities?.[qid]?.descriptions?.en?.value || '';
          if (MUSIC_ENTITY_TERMS.some(t => entDesc.toLowerCase().includes(t))) {
            return { id: qid, label: name };
          }
          // If plain name matched something non-music, skip and try text search
          if (title === name) continue;
        } catch { /* accept */ }
        return { id: qid, label: name };
      }
    } catch { /* continue */ }
    await delay(150);
  }

  await delay(200);

  // Strategy 2: Wikidata text search — try exact name first, then with "blues musician"
  for (const query of [name, name + ' blues musician']) {
    try {
      const url = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(query)}&language=en&format=json&origin=*&limit=5`;
      const data = await fetchJSON(url);
      const results = data.search || [];
      const best = results.find(r =>
        MUSIC_ENTITY_TERMS.some(t => (r.description || '').toLowerCase().includes(t))
      ) || (query === name ? null : results[0]);
      if (best) return best;
    } catch { /* continue */ }
    await delay(200);
  }

  return null;
}

async function getWikidataEntity(entityId) {
  const url = `${WIKIDATA_API}?action=wbgetentities&ids=${entityId}&format=json&origin=*`;
  const data = await fetchJSON(url);
  return data.entities?.[entityId] || null;
}

function parseWikidataDate(claim) {
  const val = claim?.mainsnak?.datavalue?.value;
  if (!val) return null;
  const match = val.time?.match(/\+(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const precision = val.precision;
  if (precision <= 9)  return match[1];          // year only
  if (precision === 10) return `${match[1]}-${match[2]}-01`;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

async function resolvePlace(claim) {
  const id = claim?.[0]?.mainsnak?.datavalue?.value?.id;
  if (!id) return { name: null, coords: null };
  const entity = await getWikidataEntity(id);
  await delay(150);
  const name   = entity?.labels?.en?.value || null;
  const coords = entity?.claims?.P625?.[0]
    ? (() => {
        const v = entity.claims.P625[0].mainsnak?.datavalue?.value;
        return v ? [v.longitude, v.latitude] : null;
      })()
    : null;
  return { name, coords };
}

function extractIds(claims) {
  return (claims || [])
    .filter(c => c.mainsnak?.datavalue?.value?.id)
    .map(c => c.mainsnak.datavalue.value.id);
}

async function resolveLabel(entityId) {
  const entity = await getWikidataEntity(entityId);
  await delay(100);
  return entity?.labels?.en?.value || null;
}

// ---------------------------------------------------------------------------
// Image: Wikidata P18 → Wikipedia pageimages fallback
// ---------------------------------------------------------------------------

async function getImage(musicianName, wikidataId) {
  // 1. Try Wikidata P18 (main image — Commons only)
  if (wikidataId) {
    try {
      const entity = await getWikidataEntity(wikidataId);
      const imageName = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
      if (imageName) {
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageName)}?width=500`;
      }
    } catch { /* continue */ }
  }

  // 2. Wikipedia pageimages API (works for Commons-hosted images)
  try {
    const url = `${WIKIPEDIA_API}?action=query&titles=${encodeURIComponent(musicianName)}&prop=pageimages&pithumbsize=500&piprop=thumbnail|original&format=json&origin=*&redirects=1`;
    const data = await fetchJSON(url);
    const pages = data?.query?.pages || {};
    const page  = Object.values(pages)[0];
    // Prefer original (full size) over thumbnail
    if (page?.original?.source) return page.original.source;
    if (page?.thumbnail?.source) return page.thumbnail.source;
  } catch { /* continue */ }

  // 3. Wikipedia images list — picks the first portrait-like image on the page
  // Handles fair-use images hosted on en.wikipedia (not in Commons)
  try {
    const url = `${WIKIPEDIA_API}?action=query&titles=${encodeURIComponent(musicianName)}&prop=images&imlimit=20&format=json&origin=*&redirects=1`;
    const data = await fetchJSON(url);
    const pages = data?.query?.pages || {};
    const page  = Object.values(pages)[0];
    const images = page?.images || [];
    // Skip icons, logos, flags — pick the first likely portrait photo
    const skip = /flag|icon|logo|commons|wiki|symbol|signature|map|svg/i;
    const candidate = images.find(img => !skip.test(img.title));
    if (candidate) {
      // Resolve the actual file URL via imageinfo API
      const infoUrl = `${WIKIPEDIA_API}?action=query&titles=${encodeURIComponent(candidate.title)}&prop=imageinfo&iiprop=url&format=json&origin=*`;
      const infoData = await fetchJSON(infoUrl);
      const infoPages = infoData?.query?.pages || {};
      const infoPage = Object.values(infoPages)[0];
      const fileUrl = infoPage?.imageinfo?.[0]?.url;
      if (fileUrl) return fileUrl;
    }
  } catch { /* continue */ }

  return '';
}

// ---------------------------------------------------------------------------
// Wikipedia extract → description (first 3 sentences of intro)
// ---------------------------------------------------------------------------

const MUSIC_KEYWORDS = ['blues', 'musician', 'singer', 'guitarist', 'pianist', 'vocalist',
  'harmonica', 'jazz', 'band', 'composer', 'performer', 'recording', 'gospel', 'rhythm',
  'boogie', 'ragtime', 'saxophone', 'trumpet', 'bass', 'drums', 'music', 'artist', 'album'];

function isMusicDescription(text) {
  const l = text.toLowerCase();
  return MUSIC_KEYWORDS.some(k => l.includes(k));
}

async function fetchWikipediaExtract(title) {
  const url = `${WIKIPEDIA_API}?action=query&prop=extracts&exintro=1&explaintext=1&titles=${encodeURIComponent(title)}&format=json&origin=*&redirects=1`;
  const data = await fetchJSON(url);
  const pages = data?.query?.pages || {};
  const page  = Object.values(pages)[0];
  if (!page?.extract || page.missing) return '';
  const clean = page.extract.replace(/\[\d+\]/g, '').trim();
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [];
  return sentences.slice(0, 3).join(' ').trim();
}

async function getWikipediaDescription(musicianName) {
  try {
    // Try exact name first
    const desc = await fetchWikipediaExtract(musicianName);
    if (desc && isMusicDescription(desc)) return desc;

    // If ambiguous or wrong entity, try "Name (musician)" disambiguation page
    await delay(200);
    const descMusician = await fetchWikipediaExtract(`${musicianName} (musician)`);
    if (descMusician && isMusicDescription(descMusician)) return descMusician;

    // Try "Name (singer)" and "Name (blues musician)"
    for (const suffix of ['(singer)', '(blues musician)', '(blues singer)', '(blues guitarist)']) {
      await delay(200);
      const d = await fetchWikipediaExtract(`${musicianName} ${suffix}`);
      if (d && isMusicDescription(d)) return d;
    }

    // Return original even if not music-validated (may be a stub with sparse text)
    return desc;
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Influences from Wikipedia article text
// Scans article for sentences that mention musicians from our dataset in
// influence context ("influenced by", "inspired by", "learned from", etc.)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Blues cities lookup table — used for spentTimePlaces text mining
// ---------------------------------------------------------------------------

const BLUES_CITIES = {
  'Chicago':       [-87.6298,  41.8781],
  'Memphis':       [-90.0490,  35.1495],
  'New Orleans':   [-90.0715,  29.9511],
  'Detroit':       [-83.0458,  42.3314],
  'Houston':       [-95.3698,  29.7604],
  'Dallas':        [-96.7969,  32.7767],
  'Atlanta':       [-84.3880,  33.7490],
  'St. Louis':     [-90.1994,  38.6270],
  'Kansas City':   [-94.5786,  39.0997],
  'Los Angeles':   [-118.2437, 34.0522],
  'New York':      [-74.0060,  40.7128],
  'Birmingham':    [-86.8025,  33.5207],
  'Nashville':     [-86.7816,  36.1627],
  'Jackson':       [-90.1848,  32.2988],
  'Clarksdale':    [-90.5726,  34.2001],
  'Helena':        [-90.5882,  34.5298],
  'Vicksburg':     [-90.8773,  32.3526],
  'Greenville':    [-91.0632,  33.4076],
  'Greenwood':     [-90.1801,  33.5162],
  'Baton Rouge':   [-91.1871,  30.4515],
  'Shreveport':    [-93.7502,  32.5251],
  'Oakland':       [-122.2712, 37.8044],
  'San Francisco': [-122.4194, 37.7749],
  'Philadelphia':  [-75.1652,  39.9526],
  'Cleveland':     [-81.6944,  41.4993],
  'Cincinnati':    [-84.5120,  39.1031],
  'Indianapolis':  [-86.1581,  39.7684],
  'Pittsburgh':    [-79.9959,  40.4406],
  'Baltimore':     [-76.6122,  39.2904],
  'Richmond':      [-77.4605,  37.5407],
  'Charlotte':     [-80.8431,  35.2271],
  'Tupelo':        [-88.7037,  34.2576],
  'London':        [-0.1276,   51.5074],
  'Mississippi':   [-89.3985,  32.3547],
  'Texas':         [-99.9018,  31.9686],
};

// ---------------------------------------------------------------------------
// Shared wikitext helpers
// ---------------------------------------------------------------------------

/** Fetch raw Wikipedia wikitext for a page title (with redirect following). */
async function fetchWikitext(title) {
  const url = `${WIKIPEDIA_API}?action=query&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(title)}&format=json&origin=*&redirects=1`;
  const data = await fetchJSON(url);
  const pages = data?.query?.pages || {};
  return Object.values(pages)[0]?.revisions?.[0]?.slots?.main?.['*'] || '';
}

/** Extract a single infobox field value (handles multi-line values up to the next | or }}). */
function getInfoboxField(wikitext, fieldName) {
  const re = new RegExp(`\\|\\s*${fieldName}\\s*=\\s*([^|\\}\\n]*)`, 'i');
  const m = wikitext.match(re);
  return m ? m[1].trim() : '';
}

/** Extract musician IDs from a text fragment containing [[Wiki links]] or plain names. */
function extractMusicianIds(text, allMusicians) {
  // Collect all [[Link|Display]] and [[Link]] targets
  const links = [...text.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g)].map(m => m[1].trim());
  // Also split on commas/semicolons for plain-text lists
  const plainParts = text.replace(/\[\[[^\]]+\]\]/g, '').split(/[,;]/).map(s => s.trim()).filter(s => s.length > 3);
  const candidates = [...links, ...plainParts];

  const matched = new Set();
  for (const cand of candidates) {
    const found = allMusicians.find(m =>
      m.name.toLowerCase() === cand.toLowerCase() ||
      (cand.split(' ').pop().length > 4 &&
        m.name.split(' ').pop().toLowerCase() === cand.split(' ').pop().toLowerCase())
    );
    if (found) matched.add(found.id);
  }
  return [...matched];
}

/** Strip wikitext markup to plain text (preserves content, removes formatting). */
function wikitextToPlain(wikitext) {
  return wikitext
    .replace(/\[\[([^\]|#]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/'{2,}/g, '')
    .replace(/=+[^=]+=+/g, '')
    .replace(/\[\d+\]/g, '');
}

// ---------------------------------------------------------------------------
// Influences: infobox parsing + expanded sentence-based text mining
// ---------------------------------------------------------------------------

/**
 * Parse `influences` from a Wikipedia article's wikitext.
 * Strategy 1: infobox `influences` / `influenced_by` fields (structured)
 * Strategy 2: expanded sentence-level patterns with 120-char window
 */
function parseInfluencesFromWikitext(wikitext, musicianName, allMusicians) {
  const matched = new Set();

  // ── Strategy 1: infobox structured fields ──────────────────────────────
  const infoboxInfluences = getInfoboxField(wikitext, 'influences');
  const infoboxInfluencedBy = getInfoboxField(wikitext, 'influenced_by');
  for (const field of [infoboxInfluences, infoboxInfluencedBy]) {
    if (field) {
      extractMusicianIds(field, allMusicians).forEach(id => matched.add(id));
    }
  }

  // ── Strategy 2: sentence-level text mining ─────────────────────────────
  const plain = wikitextToPlain(wikitext);
  const sentences = plain.match(/[^.!?\n]{10,}[.!?]/g) || [];

  const incomingPattern = /(?:influenced|inspired|taught|mentored)\s+by\s+|(?:learn(?:ed)?|grew up)\s+(?:listening\s+)?(?:to|from)\s+|under\s+(?:the\s+)?(?:influence|tutelage|wing)\s+of\s+|(?:modeled?|patterned?)\s+(?:his|her|their)?\s*(?:style|sound|playing)?\s*(?:after|on|from)\s+|(?:drew|drawing)\s+(?:heavily\s+)?(?:from|on|inspiration\s+from)\s+|(?:owed?|owes?)\s+(?:a\s+)?(?:great\s+)?debt\s+to\s+|(?:idolized?|admired?|studied)\s+/i;
  const outgoingPattern = new RegExp(`${musicianName.split(' ')[0]}[^.]{0,60}(?:influenc|inspir)`, 'i');

  for (const sentence of sentences) {
    if (!incomingPattern.test(sentence)) continue;
    if (outgoingPattern.test(sentence)) continue;

    const phraseMatch = incomingPattern.exec(sentence);
    // Widen window to 120 chars to catch longer name lists
    const afterPhrase = phraseMatch
      ? sentence.slice(phraseMatch.index + phraseMatch[0].length, phraseMatch.index + phraseMatch[0].length + 120)
      : '';
    if (/^[^.]{0,35}\s+that\b/i.test(afterPhrase)) continue;

    for (const m of allMusicians) {
      if (m.name === musicianName || m.name.split(' ').every(w => musicianName.includes(w))) continue;
      const lastName = m.name.split(' ').pop();
      if (
        afterPhrase.includes(m.name) ||
        (lastName.length > 4 && afterPhrase.includes(lastName))
      ) {
        matched.add(m.id);
      }
    }
  }

  // Remove self-reference
  const selfId = allMusicians.find(m => m.name === musicianName)?.id;
  if (selfId) matched.delete(selfId);

  return [...matched];
}

/**
 * Parse `influencedBy` (outgoing) from wikitext.
 * Strategy 1: infobox `influenced` field (people this musician influenced)
 * Strategy 2: sentence-level outgoing patterns
 * Strategy 3: "cited/credited X" patterns
 */
function parseInfluencedByFromWikitext(wikitext, musician, allMusicians) {
  const matched = new Set();

  // ── Strategy 1: infobox `influenced` field ────────────────────────────
  const infoboxInfluenced = getInfoboxField(wikitext, 'influenced');
  if (infoboxInfluenced) {
    extractMusicianIds(infoboxInfluenced, allMusicians)
      .filter(id => id !== musician.id)
      .forEach(id => matched.add(id));
  }

  // ── Strategy 2 & 3: sentence-level mining ─────────────────────────────
  const plain = wikitextToPlain(wikitext);
  const sentences = plain.replace(/=+[^=]+=+/g, '').match(/[^.!?\n]{10,}[.!?]/g) || [];
  const firstName = musician.name.split(' ')[0];

  const outgoingPattern = new RegExp(
    `${firstName}[^.]{0,60}(?:influenc|inspir)|(?:influenc|inspir)[^.]{0,40}${firstName}`, 'i'
  );
  const citedPattern = new RegExp(
    `(?:cited|credited|named|acknowledged)\\s+[^.]{0,40}${firstName}|${firstName}[^.]{0,40}(?:cited|credited|named)\\s+as`, 'gi'
  );

  const checkNames = (sentence) => {
    for (const m of allMusicians) {
      if (m.id === musician.id || m.name.split(' ').every(w => musician.name.includes(w))) continue;
      if (sentence.includes(m.name)) matched.add(m.id);
    }
  };

  for (const sentence of sentences) {
    if (outgoingPattern.test(sentence) && !/(?:influenced|inspired|taught|mentored)\s+by\s+/i.test(sentence)) {
      checkNames(sentence);
    }
    if (citedPattern.test(sentence)) {
      citedPattern.lastIndex = 0;
      checkNames(sentence);
    }
  }

  return [...matched];
}

async function getInfluencesFromWikipedia(musicianName, allMusicians) {
  try {
    const content = await fetchWikitext(musicianName);
    if (!content) return [];
    return parseInfluencesFromWikitext(content, musicianName, allMusicians);
  } catch {
    return [];
  }
}

async function getInfluencedByFromWikipedia(musician, allMusicians, cachedContent) {
  try {
    const content = cachedContent || await fetchWikitext(musician.name);
    if (!content) return [];
    return parseInfluencedByFromWikitext(content, musician, allMusicians);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// spentTimePlaces: Wikipedia text mining for location mentions
// ---------------------------------------------------------------------------

/**
 * Extract places a musician lived/worked from Wikipedia wikitext.
 * Uses infobox fields + movement/location sentence patterns matched
 * against BLUES_CITIES. Excludes birth place to avoid duplicates.
 */
function parseSpentTimePlacesFromWikitext(wikitext, birthPlace) {
  const found = new Map(); // city name → coords

  const addCity = (text) => {
    for (const [city, coords] of Object.entries(BLUES_CITIES)) {
      if (text.includes(city) && city !== birthPlace) {
        found.set(city, coords);
      }
    }
  };

  // ── Infobox fields: origin, hometown, home_town, location ──────────────
  for (const field of ['origin', 'hometown', 'home_town', 'location', 'birth_place']) {
    const val = getInfoboxField(wikitext, field);
    if (val) addCity(val);
  }

  // ── Sentence-level location patterns ───────────────────────────────────
  const plain = wikitextToPlain(wikitext);
  const locationPattern = /(?:moved?|relocat\w+|migrat\w+|settled?|based?|lived?|resid\w+|perform\w+|record\w+|play\w+)\s+(?:in|to|at)\s+([A-Z][a-zA-Z .]{2,30})/g;

  let m;
  while ((m = locationPattern.exec(plain)) !== null) {
    addCity(m[1]);
  }

  // ── Also scan for city names in any sentence about career/early life ───
  const careerSentences = plain.match(/[^.!?\n]{15,}(?:career|recorded|performed|played|worked|toured|moved|Chicago|Memphis|New Orleans|Detroit|St\. Louis|Kansas City|Houston|Dallas|Atlanta)[^.!?\n]*/gi) || [];
  for (const sentence of careerSentences) {
    addCity(sentence);
  }

  return [...found.entries()].map(([name, coords]) => ({ name, coords }));
}

async function getSpentTimePlacesFromWikipedia(musicianName, birthPlace) {
  try {
    const content = await fetchWikitext(musicianName);
    if (!content) return [];
    return parseSpentTimePlacesFromWikitext(content, birthPlace || '');
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Optional-fields second pass — runs over ALL musicians (not just incomplete)
// Fills influences, influencedBy, spentTimePlaces without touching core fields
// ---------------------------------------------------------------------------

async function enrichOptionalFields(musician, allMusicians, index, total) {
  const needsInfluences   = musician.influences?.length === 0;
  const needsSpentTime    = musician.spentTimePlaces?.length === 0;
  if (!needsInfluences && !needsSpentTime) return false;

  // Fetch wikitext once, reuse for all three optional fields
  let content = '';
  try {
    content = await fetchWikitext(musician.name);
    await delay(400);
  } catch { return false; }
  if (!content) return false;

  let changed = false;

  if (needsInfluences) {
    const inf = parseInfluencesFromWikitext(content, musician.name, allMusicians);
    if (inf.length) {
      musician.influences = inf;
      console.log(`  [${index+1}/${total}] ${musician.name}: influences → ${inf.join(', ')}`);
      changed = true;
    }
  }

  if (needsSpentTime) {
    const places = parseSpentTimePlacesFromWikitext(content, musician.birthPlace || '');
    if (places.length) {
      musician.spentTimePlaces = places;
      console.log(`  [${index+1}/${total}] ${musician.name}: spentTime → ${places.map(p=>p.name).join(', ')}`);
      changed = true;
    }
  }

  return changed;
}

// ---------------------------------------------------------------------------
// YouTube search — no API key, parses ytInitialData JSON embedded in HTML
// Filters out non-embeddable videos via oEmbed (returns 401 if embed disabled)
// ---------------------------------------------------------------------------

async function isEmbeddable(videoId) {
  try {
    const r = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { headers: { 'User-Agent': 'BluesMapETL/3.0 (educational project)' } }
    );
    return r.status === 200;
  } catch {
    return false;
  }
}

async function searchYouTube(query, maxResults = 1) {
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&hl=en`;
    const html = await fetchText(url);

    const ids = [...html.matchAll(/(?:watch\?v=|"videoId"\s*:\s*")([A-Za-z0-9_-]{11})/g)]
      .map(m => m[1]);
    const unique = [...new Set(ids)];

    // Check embeddability for candidates until we have enough
    const embeddable = [];
    for (const id of unique.slice(0, 10)) {
      if (await isEmbeddable(id)) {
        embeddable.push(`https://www.youtube.com/watch?v=${id}`);
        if (embeddable.length >= maxResults) break;
      }
      await delay(300);
    }
    return embeddable;
  } catch (err) {
    console.warn(`    ⚠ YouTube search failed for "${query}":`, err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// MusicBrainz person records — birth date, birth area, area coords
// ---------------------------------------------------------------------------

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const MB_HEADERS = { 'User-Agent': 'BluesMapETL/3.0 (educational project)' };

/**
 * Fetch MusicBrainz artist record for a musician.
 * Returns the best matching Person-type artist, or null.
 * Uses Wikidata P434 MBID if available; otherwise text search filtered to Person type.
 */
async function getPersonFromMusicBrainz(name, mbid) {
  try {
    if (mbid) {
      const url = `${MUSICBRAINZ_API}/artist/${mbid}?inc=url-rels&fmt=json`;
      const data = await fetchJSON(url, { headers: MB_HEADERS });
      await delay(1100); // MB rate limit: 1 req/sec
      return data?.id ? data : null;
    }

    // Text search — prefer Person type, score ≥ 85, name close match
    const url = `${MUSICBRAINZ_API}/artist?query=${encodeURIComponent(name)}&type=person&fmt=json&limit=5`;
    const data = await fetchJSON(url, { headers: MB_HEADERS });
    await delay(1100);
    const artists = data?.artists || [];
    return artists.find(a =>
      a.type === 'Person' &&
      (a.score >= 85 || a.name.toLowerCase() === name.toLowerCase())
    ) || null;
  } catch (err) {
    console.warn(`    ⚠ MusicBrainz person lookup failed for "${name}":`, err.message);
    return null;
  }
}

/**
 * Given a MusicBrainz area MBID, resolve its geographic coordinates.
 * MusicBrainz areas link to Wikidata via url-rels; we fetch coords from there.
 */
async function getCoordsFromMusicBrainzArea(areaMbid) {
  try {
    const url = `${MUSICBRAINZ_API}/area/${areaMbid}?inc=url-rels&fmt=json`;
    const data = await fetchJSON(url, { headers: MB_HEADERS });
    await delay(1100);

    // Find Wikidata relation
    const wdRel = (data?.relations || []).find(r => r.url?.resource?.includes('wikidata.org'));
    if (!wdRel) return null;

    const qid = wdRel.url.resource.split('/').pop();
    if (!qid || !qid.startsWith('Q')) return null;

    const entity = await getWikidataEntity(qid);
    await delay(200);
    const v = entity?.claims?.P625?.[0]?.mainsnak?.datavalue?.value;
    return v ? [v.longitude, v.latitude] : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Wikimedia Commons image search — portrait photos not in Wikipedia infobox
// ---------------------------------------------------------------------------

async function getImageFromWikimediaCommons(musicianName) {
  try {
    // Search Commons for files tagged with the musician's name
    const searchUrl = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(musicianName + ' blues musician')}&srnamespace=6&format=json&origin=*&srlimit=10`;
    const data = await fetchJSON(searchUrl);
    const hits = data?.query?.search || [];

    const skip = /flag|icon|logo|map|svg|symbol|cover|album|signature|sheet/i;
    const portrait = /portrait|photo|photograph|image|picture/i;

    // Try portrait-tagged results first, then any non-skipped result
    const candidates = [
      ...hits.filter(h => portrait.test(h.title) && !skip.test(h.title)),
      ...hits.filter(h => !skip.test(h.title) && !portrait.test(h.title)),
    ];

    for (const hit of candidates.slice(0, 5)) {
      const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(hit.title)}&prop=imageinfo&iiprop=url|mime&format=json&origin=*`;
      const infoData = await fetchJSON(infoUrl);
      const infoPages = infoData?.query?.pages || {};
      const infoPage = Object.values(infoPages)[0];
      const info = infoPage?.imageinfo?.[0];
      if (info?.url && info.mime?.startsWith('image/')) {
        return info.url;
      }
      await delay(200);
    }
    return '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Albums via MusicBrainz (fallback when Wikidata SPARQL returns nothing)
// ---------------------------------------------------------------------------

async function getAlbumsFromMusicBrainz(musicianName, mbid) {
  try {
    // If no MBID provided, search by artist name
    if (!mbid) {
      const searchUrl = `${MUSICBRAINZ_API}/artist?query=${encodeURIComponent(musicianName)}&fmt=json&limit=1`;
      const data = await fetchJSON(searchUrl, {
        headers: { 'User-Agent': 'BluesMapETL/3.0 (educational project)' }
      });
      mbid = data?.artists?.[0]?.id;
      if (!mbid) return [];
      await delay(1000); // MusicBrainz rate limit: 1 req/sec
    }

    const url = `${MUSICBRAINZ_API}/release-group?artist=${mbid}&type=album|compilation|ep&fmt=json&limit=10`;
    const data = await fetchJSON(url, {
      headers: { 'User-Agent': 'BluesMapETL/3.0 (educational project)' }
    });

    return (data?.['release-groups'] || [])
      .map(rg => ({
        name: rg.title,
        year: rg['first-release-date']?.slice(0, 4) || '',
      }))
      .filter(a => a.name)
      .sort((a, b) => (a.year || '9999').localeCompare(b.year || '9999'));
  } catch (err) {
    console.warn('    ⚠ MusicBrainz album query failed:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Albums via Wikidata SPARQL
// ---------------------------------------------------------------------------

async function getAlbumsFromWikidata(wikidataId) {
  // Query for studio, live, compilation albums and EPs where this artist is the performer
  const sparql = `
    SELECT DISTINCT ?album ?albumLabel ?year WHERE {
      ?album wdt:P175 wd:${wikidataId} .
      ?album wdt:P31 ?type .
      FILTER(?type IN (wd:Q208569, wd:Q209939, wd:Q56816161, wd:Q13442814, wd:Q169930, wd:Q170596)) .
      OPTIONAL {
        ?album wdt:P577 ?pubDate .
        BIND(YEAR(?pubDate) AS ?year)
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    }
    ORDER BY ?year
    LIMIT 10
  `;

  try {
    const url = `${SPARQL_API}?query=${encodeURIComponent(sparql)}&format=json`;
    const data = await fetchJSON(url, {
      headers: { 'Accept': 'application/sparql-results+json' }
    });

    return (data?.results?.bindings || []).map(b => ({
      name: b.albumLabel?.value || '',
      year: b.year?.value || '',
    })).filter(a => a.name && !a.name.startsWith('Q'));  // filter out unlabeled items
  } catch (err) {
    console.warn('    ⚠ SPARQL album query failed:', err.message);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Main enrichment logic per musician
// ---------------------------------------------------------------------------

function needsEnrichment(m) {
  return (
    m.incomplete === true ||
    !m.image || m.image === '' ||
    !m.youtubeLink || m.youtubeLink === '' ||
    !m.description || m.description === '' ||
    !m.birthDate || m.birthDate === '' ||
    !m.birthCoords || m.birthCoords[0] === 0 ||
    !m.bluesStyle || m.bluesStyle === ''
    // activeFrom excluded: derived from birthDate when Wikidata P2031 unavailable
  );
}

async function enrichMusician(musician, index, total) {
  // Ensure all required fields exist — handles stub entries with only id/name
  musician.image        ??= '';
  musician.birthDate    ??= '';
  musician.birthPlace   ??= '';
  musician.birthCoords  ??= [0, 0];
  musician.deathDate    ??= null;
  musician.deathPlace   ??= null;
  musician.deathCoords  ??= null;
  musician.spentTimePlaces ??= [];
  musician.instrument   ??= '';
  musician.bluesStyle   ??= '';
  musician.youtubeLink  ??= '';
  musician.albums       ??= [];
  musician.description  ??= '';
  musician.activeFrom   ??= '';
  musician.influences   ??= [];
  musician.influencedBy ??= [];
  musician.incomplete   ??= true;

  if (!needsEnrichment(musician)) {
    console.log(`[${index + 1}/${total}] ✓ Skip ${musician.name} (complete)`);
    return musician;
  }

  console.log(`\n[${index + 1}/${total}] Enriching: ${musician.name}`);

  let wikidataId = null;
  let musicbrainzId = null; // Wikidata P434 — shared between albums and person lookup

  // ── Step 1: Find Wikidata entity ──────────────────────────────────────────
  try {
    const result = await searchWikidataEntity(musician.name);
    if (result) {
      wikidataId = result.id;
      console.log(`  ✓ Wikidata: ${wikidataId} — ${result.description || '?'}`);
    } else {
      console.log(`  ✗ No Wikidata entity found`);
    }
  } catch (err) {
    console.warn(`  ✗ Wikidata search error:`, err.message);
  }

  if (wikidataId) {
    try {
      const entity = await getWikidataEntity(wikidataId);
      const claims = entity?.claims || {};

      // Extract MusicBrainz ID (P434) for reuse in albums + person lookup
      musicbrainzId = claims.P434?.[0]?.mainsnak?.datavalue?.value || null;

      // Birth date
      if ((!musician.birthDate || musician.birthDate === '') && claims.P569?.[0]) {
        musician.birthDate = parseWikidataDate(claims.P569[0]) || musician.birthDate;
        if (musician.birthDate) console.log(`  ✓ Born: ${musician.birthDate}`);
      }

      // Birth place + coords
      if ((!musician.birthPlace || musician.birthPlace === '' || musician.birthCoords[0] === 0) && claims.P19) {
        const { name, coords } = await resolvePlace(claims.P19);
        if (name  && !musician.birthPlace)      musician.birthPlace  = name;
        if (coords && musician.birthCoords[0] === 0) musician.birthCoords = coords;
        if (name) console.log(`  ✓ Birth place: ${musician.birthPlace}`);
      }

      // Death date
      if (!musician.deathDate && claims.P570?.[0]) {
        musician.deathDate = parseWikidataDate(claims.P570[0]) || null;
        if (musician.deathDate) console.log(`  ✓ Died: ${musician.deathDate}`);
      }

      // Death place + coords
      if (!musician.deathPlace && claims.P20) {
        const { name, coords } = await resolvePlace(claims.P20);
        if (name)   musician.deathPlace  = name;
        if (coords) musician.deathCoords = coords;
        if (name)   console.log(`  ✓ Death place: ${musician.deathPlace}`);
      }

      // Instrument
      if ((!musician.instrument || musician.instrument === '') && claims.P1303) {
        const ids  = extractIds(claims.P1303).slice(0, 4);
        const names = [];
        for (const id of ids) {
          const label = await resolveLabel(id);
          if (label) names.push(label);
        }
        if (names.length) {
          // Capitalise each instrument
          musician.instrument = names.map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(', ');
          console.log(`  ✓ Instrument: ${musician.instrument}`);
        }
      }

      // Blues style (P136 genre)
      if (!musician.bluesStyle || musician.bluesStyle === '') {
        const genreIds = extractIds(claims.P136).slice(0, 6);
        const genreLabels = [];
        for (const id of genreIds) {
          const label = await resolveLabel(id);
          if (label) genreLabels.push(label);
          await delay(100);
        }
        const style = mapToCanonicalStyle(genreLabels);
        if (style) {
          musician.bluesStyle = style;
          console.log(`  ✓ Style: ${style} (from: ${genreLabels.join(', ')})`);
        } else if (genreLabels.length) {
          console.log(`  ⚠ Unmapped genres: ${genreLabels.join(', ')}`);
        }
      }

      // Active from (P2031 — work period start)
      if ((!musician.activeFrom || musician.activeFrom === '') && claims.P2031?.[0]) {
        const year = parseWikidataDate(claims.P2031[0]);
        if (year) {
          musician.activeFrom = year;
          console.log(`  ✓ Active from: ${year} (Wikidata P2031)`);
        }
      }

      // Influences — try Wikidata P737 first, fall back to Wikipedia text mining
      if (musician.influences.length === 0) {
        let matched = [];

        // 1. Wikidata P737 (influenced by)
        if (claims.P737) {
          const infIds = extractIds(claims.P737).slice(0, 8);
          for (const id of infIds) {
            const label = await resolveLabel(id);
            await delay(100);
            if (!label) continue;
            const found = musicians.find(m =>
              m.id !== musician.id && (
                m.name.toLowerCase() === label.toLowerCase() ||
                (label.split(' ').pop().length > 4 &&
                  m.name.toLowerCase().includes(label.split(' ').pop().toLowerCase()))
              )
            );
            if (found) matched.push(found.id);
          }
        }

        // 2. Wikipedia text mining — find sentences with influence context
        //    that mention musicians from our dataset
        if (matched.length === 0) {
          matched = await getInfluencesFromWikipedia(musician.name, musicians);
          await delay(DELAY_MS);
        }

        if (matched.length) {
          musician.influences = [...new Set(matched)];
          console.log(`  ✓ Influences: ${musician.influences.join(', ')}`);
        }
      }

      // influencedBy — Wikipedia text mining for outgoing influence
      // (computeInfluencedBy at the end handles graph reversal, this adds
      //  cases where the article explicitly names who this musician influenced)
      if (musician.influencedBy.length === 0) {
        const wikiInfluencedBy = await getInfluencedByFromWikipedia(musician, musicians, null);
        await delay(DELAY_MS);
        if (wikiInfluencedBy.length) {
          musician.influencedBy = [...new Set(wikiInfluencedBy)];
          console.log(`  ✓ Influenced by (outgoing): ${musician.influencedBy.join(', ')}`);
        }
      }

      // Spent time places (P937 — work location)
      if (musician.spentTimePlaces.length === 0 && claims.P937) {
        const places = [];
        for (const claim of claims.P937.slice(0, 6)) {
          const { name, coords } = await resolvePlace([claim]);
          await delay(150);
          if (name) {
            places.push({ name, coords: coords || [0, 0] });
          }
        }
        if (places.length) {
          musician.spentTimePlaces = places;
          console.log(`  ✓ Spent time: ${places.map(p => p.name).join(', ')} (Wikidata)`);
        }
      }

      // Spent time places fallback — Wikipedia text mining
      if (musician.spentTimePlaces.length === 0) {
        const places = await getSpentTimePlacesFromWikipedia(musician.name, musician.birthPlace);
        await delay(DELAY_MS);
        if (places.length) {
          musician.spentTimePlaces = places;
          console.log(`  ✓ Spent time: ${places.map(p => p.name).join(', ')} (Wikipedia)`);
        }
      }

      // Image
      if (!musician.image || musician.image === '') {
        musician.image = await getImage(musician.name, wikidataId);
        if (musician.image) console.log(`  ✓ Image found`);
        else console.log(`  ⚠ No image found`);
      }

      // Albums (only if empty) — try Wikidata SPARQL first, then MusicBrainz
      if (musician.albums.length === 0) {
        let rawAlbums = await getAlbumsFromWikidata(wikidataId);
        await delay(300);

        if (rawAlbums.length === 0) {
          console.log(`  ℹ No Wikidata albums, trying MusicBrainz...`);
          rawAlbums = await getAlbumsFromMusicBrainz(musician.name, musicbrainzId);
          await delay(1000); // MusicBrainz rate limit
        }

        if (rawAlbums.length > 0) {
          console.log(`  ✓ Found ${rawAlbums.length} albums, searching YouTube...`);
          const enrichedAlbums = [];
          for (const album of rawAlbums.slice(0, 6)) {
            const label = album.year ? `${album.name} (${album.year})` : album.name;
            const ytLinks = await searchYouTube(`"${album.name}" ${musician.name} full album`);
            await delay(DELAY_MS);
            enrichedAlbums.push({
              name: label,
              youtubeLink: ytLinks[0] || '',
            });
          }
          musician.albums = enrichedAlbums;
        }
      }

    } catch (err) {
      console.warn(`  ✗ Wikidata entity error:`, err.message);
    }
  }

  // ── Step 1b: MusicBrainz person record — fills gaps Wikidata couldn't ────
  // Covers: birth date, birth place + coords, image fallback
  const needsMbPerson =
    !musician.birthDate ||
    musician.birthCoords[0] === 0 ||
    !musician.image;

  if (needsMbPerson) {
    try {
      const mbPerson = await getPersonFromMusicBrainz(musician.name, musicbrainzId);

      if (mbPerson) {
        // Birth date
        if ((!musician.birthDate || musician.birthDate === '') && mbPerson['begin-date']) {
          musician.birthDate = mbPerson['begin-date'];
          console.log(`  ✓ Born: ${musician.birthDate} (MusicBrainz)`);
        }

        // Birth place name
        if ((!musician.birthPlace || musician.birthPlace === '') && mbPerson['begin-area']?.name) {
          musician.birthPlace = mbPerson['begin-area'].name;
          console.log(`  ✓ Birth place: ${musician.birthPlace} (MusicBrainz)`);
        }

        // Birth coords from the area entity
        if (musician.birthCoords[0] === 0 && mbPerson['begin-area']?.id) {
          const coords = await getCoordsFromMusicBrainzArea(mbPerson['begin-area'].id);
          if (coords) {
            musician.birthCoords = coords;
            console.log(`  ✓ Birth coords: ${coords} (MusicBrainz area)`);
          }
        }
      }
    } catch (err) {
      console.warn(`  ⚠ MusicBrainz person lookup error:`, err.message);
    }
  }

  // ── Image fallback: Wikimedia Commons search ──────────────────────────────
  if (!musician.image || musician.image === '') {
    try {
      musician.image = await getImageFromWikimediaCommons(musician.name);
      if (musician.image) console.log(`  ✓ Image found (Wikimedia Commons)`);
      await delay(300);
    } catch { /* keep empty */ }
  }

  // ── Derive activeFrom if still missing ───────────────────────────────────
  // Prefer: P2031 (done above) → first album year → birth year + 20
  if (!musician.activeFrom || musician.activeFrom === '') {
    const albumYears = (musician.albums || [])
      .map(a => a.name?.match(/\((\d{4})\)/)?.[1])
      .filter(Boolean)
      .sort();
    if (albumYears[0]) {
      musician.activeFrom = albumYears[0];
      console.log(`  ✓ Active from: ${musician.activeFrom} (first album year)`);
    } else if (musician.birthDate) {
      const birthYear = parseInt(musician.birthDate.slice(0, 4));
      if (!isNaN(birthYear)) {
        musician.activeFrom = String(birthYear + 20);
        console.log(`  ✓ Active from: ${musician.activeFrom} (derived from birth year)`);
      }
    }
  }

  // ── Step 2: Wikipedia description ─────────────────────────────────────────
  if (!musician.description || musician.description === '') {
    try {
      musician.description = await getWikipediaDescription(musician.name);
      if (musician.description) console.log(`  ✓ Description: ${musician.description.slice(0, 60)}…`);
      await delay(DELAY_MS);
    } catch (err) {
      console.warn(`  ✗ Wikipedia extract error:`, err.message);
    }
  }

  // ── Step 3: YouTube main artist link ─────────────────────────────────────
  // Also replace existing links that are non-embeddable (oEmbed returns 401)
  if (musician.youtubeLink) {
    const id = musician.youtubeLink.split('v=')[1];
    if (id && !(await isEmbeddable(id))) {
      console.log(`  ⚠ Current YouTube link is non-embeddable, replacing...`);
      musician.youtubeLink = '';
    }
    await delay(300);
  }

  if (!musician.youtubeLink || musician.youtubeLink === '') {
    const query = `${musician.name} blues ${musician.bluesStyle || ''} performance`;
    const links = await searchYouTube(query.trim());
    if (links[0]) {
      musician.youtubeLink = links[0];
      console.log(`  ✓ YouTube: ${musician.youtubeLink}`);
    } else {
      console.log(`  ⚠ No YouTube link found`);
    }
    await delay(DELAY_MS);
  }

  // ── Step 4: YouTube links for existing albums without links ───────────────
  const albumsMissingYt = (musician.albums || []).filter(a => !a.youtubeLink || a.youtubeLink === '');
  if (albumsMissingYt.length > 0) {
    console.log(`  Searching YouTube for ${albumsMissingYt.length} album(s)...`);
    for (const album of albumsMissingYt) {
      const query = `${musician.name} "${album.name.replace(/ \(\d{4}\)$/, '')}"`;
      const links = await searchYouTube(query);
      if (links[0]) {
        album.youtubeLink = links[0];
        console.log(`    ✓ ${album.name} → ${links[0]}`);
      }
      await delay(DELAY_MS);
    }
  }

  // Mark complete if all key fields are now filled
  // (activeFrom is always derivable from birthDate, so not required here)
  if (
    musician.image && musician.youtubeLink && musician.description &&
    musician.birthDate && musician.birthCoords?.[0] !== 0 &&
    musician.bluesStyle
  ) {
    musician.incomplete = false;
  }

  return musician;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

/** Compute influencedBy as the reverse of all influences links in the dataset */
function computeInfluencedBy(musicians) {
  // Clear existing influencedBy so we rebuild from scratch
  musicians.forEach(m => { m.influencedBy = []; });

  musicians.forEach(m => {
    (m.influences || []).forEach(infId => {
      const target = musicians.find(t => t.id === infId);
      if (target && !target.influencedBy.includes(m.id)) {
        target.influencedBy.push(m.id);
      }
    });
  });

  const count = musicians.filter(m => m.influencedBy.length > 0).length;
  console.log(`\n🔗 influencedBy computed: ${count} musicians have at least one entry\n`);
}

async function main() {
  const toProcess = musicians.filter(needsEnrichment);
  console.log(`🎸 Blues musician enrichment`);
  console.log(`   Total: ${musicians.length} | Needs work: ${toProcess.length}\n`);

  const startTime = Date.now();

  for (let i = 0; i < musicians.length; i++) {
    musicians[i] = await enrichMusician(musicians[i], i, musicians.length);

    // Save progress every 5 musicians
    if ((i + 1) % 5 === 0) {
      fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
      const elapsed  = Math.round((Date.now() - startTime) / 1000);
      const perItem  = elapsed / (i + 1);
      const remaining = Math.round(perItem * (musicians.length - i - 1));
      console.log(`\n💾 Saved (${i + 1}/${musicians.length}) — ${elapsed}s elapsed, ~${remaining}s left\n`);
    }
  }

  // ── Second pass: optional fields (influences + spentTimePlaces) for ALL musicians ──
  // This covers "complete" musicians that were skipped in the main loop.
  const needsOptional = musicians.filter(m =>
    m.influences?.length === 0 || m.spentTimePlaces?.length === 0
  );
  console.log(`\n🔎 Optional-fields pass: ${needsOptional.length} musicians need influences/spentTime\n`);
  let optChanged = 0;
  for (let i = 0; i < needsOptional.length; i++) {
    const m = needsOptional[i];
    const changed = await enrichOptionalFields(m, musicians, i, needsOptional.length);
    if (changed) optChanged++;
    await delay(400);

    if ((i + 1) % 10 === 0) {
      fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
      console.log(`  💾 Saved optional pass (${i + 1}/${needsOptional.length})`);
    }
  }
  console.log(`\n✓ Optional pass done — updated ${optChanged} musicians\n`);

  // Rebuild influencedBy from all influences links
  computeInfluencedBy(musicians);

  // Scan all "complete" musicians for non-embeddable YouTube links and fix them
  console.log('\n🔍 Checking YouTube embeddability for all musicians...');
  let fixed = 0;
  for (const m of musicians) {
    if (!m.youtubeLink) continue;
    const id = m.youtubeLink.split('v=')[1];
    if (!id) continue;
    if (!(await isEmbeddable(id))) {
      console.log(`  ⚠ ${m.name}: non-embeddable, searching replacement...`);
      const query = `${m.name} blues ${m.bluesStyle || ''} performance`;
      const links = await searchYouTube(query.trim());
      if (links[0]) {
        m.youtubeLink = links[0];
        console.log(`    ✓ Replaced → ${links[0]}`);
        fixed++;
      } else {
        m.youtubeLink = '';
      }
      await delay(DELAY_MS);
    } else {
      await delay(150);
    }
  }
  if (fixed > 0) console.log(`  Fixed ${fixed} non-embeddable links`);

  fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`✅ Done in ${totalTime}s — ${musicians.length} musicians processed`);
}

main().catch(console.error);
