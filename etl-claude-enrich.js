/**
 * ETL: Blues Musician Enrichment via Claude API + Wikidata
 *
 * Fills in missing data for incomplete musicians and adds real YouTube links
 * to albums for all musicians.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-ant-... node etl-claude-enrich.js
 *   ANTHROPIC_API_KEY=sk-ant-... node etl-claude-enrich.js --musician alberta-hunter
 *   ANTHROPIC_API_KEY=sk-ant-... node etl-claude-enrich.js --all
 *
 * Options:
 *   --musician <id>   Process a single musician by ID
 *   --all             Process all musicians (including complete ones with missing album links)
 *   --dry-run         Print what would change without saving
 */

import fs from 'fs';

// ─── Config ─────────────────────────────────────────────────────────────────

const API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = 'claude-sonnet-4-6';
const DATA_PATH = './src/data/musicians.json';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const DELAY_MS = 800;

const args = process.argv.slice(2);
const targetId = args.includes('--musician') ? args[args.indexOf('--musician') + 1] : null;
const processAll = args.includes('--all');
const dryRun = args.includes('--dry-run');

if (!API_KEY) {
  console.error('\nError: ANTHROPIC_API_KEY environment variable is required.');
  console.error('Usage: ANTHROPIC_API_KEY=sk-ant-... node etl-claude-enrich.js\n');
  process.exit(1);
}

// ─── Data ────────────────────────────────────────────────────────────────────

const musicians = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
const allIds = musicians.map(m => m.id);

function save() {
  if (!dryRun) {
    fs.writeFileSync(DATA_PATH, JSON.stringify(musicians, null, 2));
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return await res.json();
  } catch (e) {
    clearTimeout(timeout);
    return null;
  }
}

function needsEnrichment(m) {
  if (m.incomplete) return true;
  if (!m.youtubeLink) return true;
  if (m.albums.some(a => !a.youtubeLink)) return true;
  if (!m.influences || m.influences.length === 0) return true;
  return false;
}

function isNowComplete(m) {
  return !!(
    m.birthDate &&
    m.birthPlace &&
    m.birthCoords?.[0] !== 0 &&
    m.description && m.description.length > 60 &&
    m.image &&
    m.instrument &&
    m.bluesStyle &&
    m.youtubeLink &&
    m.albums.length > 0 &&
    m.albums.every(a => a.youtubeLink)
  );
}

function extractYouTubeId(text) {
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1];
  }
  return null;
}

function buildYouTubeUrl(id) {
  return id ? `https://www.youtube.com/watch?v=${id}` : '';
}

// ─── Wikidata ─────────────────────────────────────────────────────────────────

async function wikidataSearch(name) {
  const url = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(name + ' blues')}&language=en&format=json&origin=*`;
  const data = await fetchJson(url);
  const result = data?.search?.[0];
  if (!result) return null;
  const desc = (result.description || '').toLowerCase();
  const bad = ['footballer', 'politician', 'rugby', 'baseball', 'cricket', 'actor', 'director'];
  if (bad.some(w => desc.includes(w))) return null;
  return result.id;
}

async function wikidataEntity(id) {
  const url = `${WIKIDATA_API}?action=wbgetentities&ids=${id}&format=json&origin=*`;
  const data = await fetchJson(url);
  return data?.entities?.[id] || null;
}

function parseDate(claim) {
  if (!claim?.mainsnak?.datavalue?.value) return null;
  const { time, precision } = claim.mainsnak.datavalue.value;
  const m = time.match(/\+(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  if (precision === 9) return `${m[1]}-01-01`;
  if (precision === 10) return `${m[1]}-${m[2]}-01`;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseCoords(claim) {
  const v = claim?.mainsnak?.datavalue?.value;
  if (!v) return null;
  return [v.longitude, v.latitude];
}

async function placeInfo(claim) {
  const id = claim?.[0]?.mainsnak?.datavalue?.value?.id;
  if (!id) return { name: null, coords: null };
  const e = await wikidataEntity(id);
  const name = e?.labels?.en?.value || null;
  const coords = e?.claims?.P625?.[0] ? parseCoords(e.claims.P625[0]) : null;
  return { name, coords };
}

async function wikidataImage(wikidataId) {
  const e = await wikidataEntity(wikidataId);
  const imageName = e?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (imageName) {
    return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageName)}?width=500`;
  }
  return null;
}

async function wikipediaImage(name) {
  const url = `${WIKIPEDIA_API}?action=query&titles=${encodeURIComponent(name)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
  const data = await fetchJson(url);
  const pages = data?.query?.pages;
  const pageId = Object.keys(pages || {})[0];
  return pages?.[pageId]?.thumbnail?.source || null;
}

// ─── Claude API ───────────────────────────────────────────────────────────────

async function callClaude(messages, useWebSearch = true) {
  const tools = useWebSearch
    ? [{ type: 'web_search_20250305', name: 'web_search' }]
    : [];

  let msgs = [...messages];

  // Agentic loop to handle tool_use stop reasons
  for (let i = 0; i < 8; i++) {
    const body = {
      model: MODEL,
      max_tokens: 4096,
      tools,
      messages: msgs,
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'web-search-2025-03-05',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Claude API ${res.status}: ${err}`);
    }

    const data = await res.json();

    if (data.stop_reason === 'end_turn') {
      const text = data.content?.find(b => b.type === 'text')?.text || '';
      return text;
    }

    if (data.stop_reason === 'tool_use') {
      // Push assistant turn and empty tool results so Claude continues
      msgs.push({ role: 'assistant', content: data.content });
      const toolResults = data.content
        .filter(b => b.type === 'tool_use')
        .map(b => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: [],
        }));
      msgs.push({ role: 'user', content: toolResults });
      continue;
    }

    // max_tokens or other stop
    const text = data.content?.find(b => b.type === 'text')?.text || '';
    return text;
  }

  return '';
}

function parseJsonFromResponse(text) {
  // Try to extract JSON from markdown code block or raw JSON
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch { /* fall through */ }
  }
  // Try raw JSON (find first { to last })
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
  }
  return null;
}

// ─── Claude Enrichment ────────────────────────────────────────────────────────

async function claudeEnrich(musician) {
  const albumsMissingLinks = musician.albums
    .filter(a => !a.youtubeLink)
    .map(a => a.name);

  const prompt = `You are enriching a blues music genealogy database entry for "${musician.name}".

Current data:
${JSON.stringify(musician, null, 2)}

All musician IDs available in the database (use ONLY these for influences/influencedBy):
${allIds.join(', ')}

Your tasks:
1. Search YouTube for "${musician.name} blues" and provide a real YouTube video URL for the musician (best live performance or music video).
${albumsMissingLinks.length > 0 ? `2. For each of these albums, search YouTube and find a real upload URL:
${albumsMissingLinks.map(a => `   - "${a}"`).join('\n')}` : ''}
3. Based on your knowledge of blues history, provide:
   - influences: which musicians in the database influenced ${musician.name}? (use IDs from the list above)
   - influencedBy: which musicians in the database were influenced BY ${musician.name}? (use IDs from the list above)
   - spentTimePlaces: major cities/regions where ${musician.name} lived or regularly performed, with GPS coordinates as [longitude, latitude]
   - description: a rich 2–3 sentence description of ${musician.name}'s contribution to blues music
   - instrument: their primary instruments (e.g. "Guitar, Vocals")
   - bluesStyle: their blues sub-genres (e.g. "Chicago Blues, Delta Blues")

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "youtubeLink": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
  "albums": [
    { "name": "<album name>", "youtubeLink": "https://www.youtube.com/watch?v=XXXXXXXXXXX" }
  ],
  "influences": ["musician-id-1", "musician-id-2"],
  "influencedBy": ["musician-id-1"],
  "spentTimePlaces": [
    { "place": "Chicago, Illinois", "coords": [-87.6298, 41.8781] }
  ],
  "description": "...",
  "instrument": "Guitar, Vocals",
  "bluesStyle": "Delta Blues, Chicago Blues"
}

Rules:
- Only include YouTube links you actually found by searching (not made up). Use "" for ones you couldn't find.
- Only use musician IDs from the provided list for influences/influencedBy.
- The "albums" array must include ALL albums (both those with and without YouTube links).
- The current albums are: ${JSON.stringify(musician.albums.map(a => ({ name: a.name, youtubeLink: a.youtubeLink || '' })))}`;

  console.log(`  [Claude] Searching YouTube + enriching metadata...`);

  const text = await callClaude([{ role: 'user', content: prompt }], true);

  if (!text) {
    console.log(`  [Claude] Empty response`);
    return null;
  }

  const result = parseJsonFromResponse(text);
  if (!result) {
    console.log(`  [Claude] Could not parse JSON from response`);
    console.log(`  Response preview: ${text.slice(0, 200)}`);
    return null;
  }

  return result;
}

// ─── Apply enrichment ─────────────────────────────────────────────────────────

function applyClaudeResult(musician, result) {
  if (!result) return;

  // YouTube main link
  if (result.youtubeLink && extractYouTubeId(result.youtubeLink) && !musician.youtubeLink) {
    musician.youtubeLink = result.youtubeLink;
    console.log(`  ✓ youtubeLink: ${result.youtubeLink}`);
  }

  // Album YouTube links
  if (Array.isArray(result.albums)) {
    for (const enrichedAlbum of result.albums) {
      const existing = musician.albums.find(a => a.name === enrichedAlbum.name);
      if (existing && enrichedAlbum.youtubeLink && !existing.youtubeLink) {
        if (extractYouTubeId(enrichedAlbum.youtubeLink)) {
          existing.youtubeLink = enrichedAlbum.youtubeLink;
          console.log(`  ✓ album link: "${enrichedAlbum.name}"`);
        }
      }
    }
  }

  // Influences (validate IDs)
  if (Array.isArray(result.influences) && result.influences.length > 0) {
    const valid = result.influences.filter(id => allIds.includes(id) && id !== musician.id);
    if (valid.length > 0) {
      musician.influences = [...new Set([...musician.influences, ...valid])];
      console.log(`  ✓ influences: ${valid.join(', ')}`);
    }
  }

  // InfluencedBy (validate IDs)
  if (Array.isArray(result.influencedBy) && result.influencedBy.length > 0) {
    const valid = result.influencedBy.filter(id => allIds.includes(id) && id !== musician.id);
    if (valid.length > 0) {
      musician.influencedBy = [...new Set([...musician.influencedBy, ...valid])];
      console.log(`  ✓ influencedBy: ${valid.join(', ')}`);
    }
  }

  // SpentTimePlaces
  if (Array.isArray(result.spentTimePlaces) && result.spentTimePlaces.length > 0 && musician.spentTimePlaces.length === 0) {
    const valid = result.spentTimePlaces.filter(p =>
      p.place && Array.isArray(p.coords) && p.coords.length === 2 &&
      !isNaN(p.coords[0]) && !isNaN(p.coords[1])
    );
    if (valid.length > 0) {
      musician.spentTimePlaces = valid;
      console.log(`  ✓ spentTimePlaces: ${valid.map(p => p.place).join(', ')}`);
    }
  }

  // Description
  if (result.description && result.description.length > 60 &&
      (!musician.description || musician.description.length < 60)) {
    musician.description = result.description;
    console.log(`  ✓ description updated`);
  }

  // Instrument
  if (result.instrument && (!musician.instrument || musician.instrument === 'voice')) {
    musician.instrument = result.instrument;
    console.log(`  ✓ instrument: ${result.instrument}`);
  }

  // BluesStyle
  if (result.bluesStyle && (!musician.bluesStyle || musician.bluesStyle === 'blues')) {
    musician.bluesStyle = result.bluesStyle;
    console.log(`  ✓ bluesStyle: ${result.bluesStyle}`);
  }
}

async function wikidataEnrich(musician) {
  const wikidataId = await wikidataSearch(musician.name);
  if (!wikidataId) {
    console.log(`  [Wikidata] No entity found`);
    return;
  }
  console.log(`  [Wikidata] ${wikidataId}`);

  const entity = await wikidataEntity(wikidataId);
  if (!entity) return;

  const claims = entity.claims || {};

  // Birth date
  if (claims.P569?.[0] && !musician.birthDate) {
    musician.birthDate = parseDate(claims.P569[0]);
    if (musician.birthDate) console.log(`  ✓ birthDate: ${musician.birthDate}`);
  }

  // Birth place + coords
  if (claims.P19) {
    const { name, coords } = await placeInfo(claims.P19);
    if (name && !musician.birthPlace) {
      musician.birthPlace = name;
      console.log(`  ✓ birthPlace: ${name}`);
    }
    if (coords && (!musician.birthCoords || musician.birthCoords[0] === 0)) {
      musician.birthCoords = coords;
      console.log(`  ✓ birthCoords: [${coords}]`);
    }
    await delay(300);
  }

  // Death date
  if (claims.P570?.[0] && !musician.deathDate) {
    musician.deathDate = parseDate(claims.P570[0]);
    if (musician.deathDate) console.log(`  ✓ deathDate: ${musician.deathDate}`);
  }

  // Death place + coords
  if (claims.P20) {
    const { name, coords } = await placeInfo(claims.P20);
    if (name && !musician.deathPlace) {
      musician.deathPlace = name;
    }
    if (coords && !musician.deathCoords) {
      musician.deathCoords = coords;
    }
    await delay(300);
  }

  // Image
  if (!musician.image) {
    const img = await wikidataImage(wikidataId) || await wikipediaImage(musician.name);
    if (img) {
      musician.image = img;
      console.log(`  ✓ image found`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function processMusician(musician, index, total) {
  console.log(`\n[${ index + 1 }/${ total }] ${musician.name} (${musician.id})`);

  // Step 1: Wikidata enrichment (factual data)
  await wikidataEnrich(musician);
  await delay(DELAY_MS);

  // Step 2: Claude enrichment (YouTube links + knowledge-based fields)
  const claudeResult = await claudeEnrich(musician);
  applyClaudeResult(musician, claudeResult);

  // Step 3: Determine completeness
  if (isNowComplete(musician)) {
    musician.incomplete = false;
    console.log(`  ✅ Marked complete!`);
  } else {
    const missing = [];
    if (!musician.birthDate) missing.push('birthDate');
    if (!musician.birthPlace) missing.push('birthPlace');
    if (!musician.birthCoords || musician.birthCoords[0] === 0) missing.push('birthCoords');
    if (!musician.description || musician.description.length < 60) missing.push('description');
    if (!musician.image) missing.push('image');
    if (!musician.youtubeLink) missing.push('youtubeLink');
    if (musician.albums.length === 0) missing.push('albums');
    if (musician.albums.some(a => !a.youtubeLink)) missing.push('album YouTubeLinks');
    if (missing.length > 0) {
      console.log(`  ⚠ Still missing: ${missing.join(', ')}`);
    }
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('   Blues Musician ETL — Claude + Wikidata');
  console.log('═══════════════════════════════════════════════');
  console.log(`Model: ${MODEL}`);
  console.log(`Dry run: ${dryRun}`);

  // Backup the original file
  if (!dryRun) {
    const backup = DATA_PATH.replace('.json', `.backup-${Date.now()}.json`);
    fs.copyFileSync(DATA_PATH, backup);
    console.log(`Backup saved: ${backup}`);
  }

  let targets;
  if (targetId) {
    targets = musicians.filter(m => m.id === targetId);
    if (targets.length === 0) {
      console.error(`\nMusician "${targetId}" not found.`);
      console.log(`Available IDs:\n${allIds.join('\n')}`);
      process.exit(1);
    }
  } else if (processAll) {
    targets = musicians.filter(needsEnrichment);
  } else {
    // Default: incomplete musicians only
    targets = musicians.filter(m => m.incomplete);
  }

  console.log(`\nProcessing ${targets.length} musician(s)...\n`);

  for (let i = 0; i < targets.length; i++) {
    const musician = targets[i];
    const idx = musicians.indexOf(musician);

    try {
      await processMusician(musician, i, targets.length);
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
    }

    // Save progress after each musician
    save();
    musicians[idx] = musician;

    if (i < targets.length - 1) {
      await delay(DELAY_MS);
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  const incomplete = musicians.filter(m => m.incomplete).length;
  const withoutYT = musicians.filter(m => !m.youtubeLink).length;
  const albumsMissing = musicians.reduce((n, m) => n + m.albums.filter(a => !a.youtubeLink).length, 0);
  console.log(`Incomplete musicians: ${incomplete}`);
  console.log(`Without main YouTube link: ${withoutYT}`);
  console.log(`Albums missing YouTube links: ${albumsMissing}`);
  console.log('═══════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
