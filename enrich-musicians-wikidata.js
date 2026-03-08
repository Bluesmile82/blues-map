import fs from 'fs';

// API configuration
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

// Load musicians
const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf-8'));

// Rate limiting
const DELAY_MS = 200; // Delay between requests to avoid rate limiting
let requestCount = 0;

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

// SPARQL query to get comprehensive musician data
function buildMusicianQuery(name) {
  return `
    SELECT ?item ?itemLabel ?itemDescription 
           ?birthdate ?birthplace ?birthplaceLabel ?birthplaceCoords
           ?deathdate ?deathplace ?deathplaceLabel ?deathplaceCoords
           ?image ?instrument ?instrumentLabel ?genre ?genreLabel
           ?activeStart ?album ?albumLabel WHERE {
      ?item ?label "${name.replace(/"/g, '\\"')}"@en .
      
      OPTIONAL { ?item wdt:P569 ?birthdate . }
      OPTIONAL { ?item wdt:P19 ?birthplace . 
                 ?birthplace wdt:P625 ?birthplaceCoords .
                 ?birthplace rdfs:label ?birthplaceLabel . }
      OPTIONAL { ?item wdt:P570 ?deathdate . }
      OPTIONAL { ?item wdt:P20 ?deathplace .
                 ?deathplace wdt:P625 ?deathplaceCoords .
                 ?deathplace rdfs:label ?deathplaceLabel . }
      OPTIONAL { ?item wdt:P18 ?image . }
      OPTIONAL { ?item wdt:P1303 ?instrument .
                 ?instrument rdfs:label ?instrumentLabel . }
      OPTIONAL { ?item wdt:P136 ?genre .
                 ?genre rdfs:label ?genreLabel . }
      OPTIONAL { ?item wdt:P2031 ?activeStart . }
      OPTIONAL { ?item wdt:P658 ?album .
                 ?album rdfs:label ?albumLabel . }
      
      FILTER(LANG(?birthplaceLabel) = "en" || !BOUND(?birthplaceLabel))
      FILTER(LANG(?deathplaceLabel) = "en" || !BOUND(?deathplaceLabel))
      FILTER(LANG(?instrumentLabel) = "en" || !BOUND(?instrumentLabel))
      FILTER(LANG(?genreLabel) = "en" || !BOUND(?genreLabel))
      FILTER(LANG(?albumLabel) = "en" || !BOUND(?albumLabel))
      
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 1
  `;
}

// Alternative: Search for entity first
async function searchWikidataEntity(name) {
  const url = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&origin=*`;
  
  try {
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    return data.search?.[0];
  } catch (error) {
    console.warn(`  Wikidata search failed for ${name}:`, error.message);
    return null;
  }
}

// Query SPARQL endpoint
async function queryWikidata(sparql) {
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(sparql)}&format=json`;
  
  try {
    const response = await fetchWithTimeout(url, { headers: { 'Accept': 'application/sparql-results+json' } });
    const data = await response.json();
    return data.results?.bindings?.[0];
  } catch (error) {
    console.warn('SPARQL query failed:', error.message);
    return null;
  }
}

// Parse Wikidata date
function parseWikidataDate(dateStr) {
  if (!dateStr) return null;
  
  // Wikidata dates are like "+1900-01-01T00:00:00Z"
  const match = dateStr.value.match(/\+(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

// Parse coordinates
function parseCoords(coordsStr) {
  if (!coordsStr) return null;
  
  try {
    const coords = JSON.parse(coordsStr.value);
    return [coords.longitude, coords.latitude];
  } catch {
    return null;
  }
}

// Get Wikipedia image
async function getWikipediaImage(name, wikidataId = null) {
  // First try Wikidata
  if (wikidataId) {
    const url = `${WIKIDATA_API}?action=wbgetentities&ids=${wikidataId}&format=json&origin=*`;
    try {
      const response = await fetchWithTimeout(url);
      const data = await response.json();
      const entity = data.entities?.[wikidataId];
      
      // Check for main image (P18)
      if (entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value) {
        const imageName = entity.claims.P18[0].mainsnak.datavalue.value;
        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageName)}?width=500`;
      }
    } catch (e) {
      console.warn('  Wikidata image fetch failed:', e.message);
    }
  }
  
  // Fallback to Wikipedia API
  const url = `${WIKIPEDIA_API}?action=query&titles=${encodeURIComponent(name)}&prop=pageimages|pageterms&format=json&pithumbsize=500&origin=*`;
  
  try {
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    const pages = data.query?.pages;
    const pageId = Object.keys(pages || {})[0];
    
    if (pages?.[pageId]?.thumbnail?.source) {
      return pages[pageId].thumbnail.source;
    }
  } catch (e) {
    console.warn('  Wikipedia image fetch failed:', e.message);
  }
  
  return '';
}

// Search YouTube for best video (manual approach without API key)
async function searchYouTubeVideo(name) {
  // This would require a YouTube API key
  // For now, return empty string
  return '';
}

// Get album information
async function getAlbums(wikidataId) {
  if (!wikidataId) return [];
  
  const sparql = `
    SELECT ?album ?albumLabel ?releaseDate WHERE {
      wd:${wikidataId} wdt:P658 ?album .
      OPTIONAL { ?album wdt:P577 ?releaseDate . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    LIMIT 10
  `;
  
  try {
    const response = await fetchWithTimeout(`${WIKIDATA_SPARQL}?query=${encodeURIComponent(sparql)}&format=json`);
    const data = await response.json();
    
    return (data.results?.bindings || []).map(binding => ({
      name: binding.albumLabel?.value || 'Unknown Album',
      year: binding.releaseDate?.value?.match(/\d{4}/)?.[0] || '',
      youtubeLink: ''
    }));
  } catch (e) {
    console.warn('  Album fetch failed:', e.message);
    return [];
  }
}

// Enrich a single musician
async function enrichMusician(musician, index) {
  // Skip if already has substantial data
  const hasData = musician.birthDate && 
                  musician.birthDate !== '' && 
                  musician.birthCoords[0] !== 0 &&
                  musician.image && 
                  musician.image !== '';
  
  if (hasData) {
    if (index % 10 === 0) console.log(`[${index + 1}/${musicians.length}] Skipping ${musician.name} - already enriched`);
    return musician;
  }
  
  console.log(`[${index + 1}/${musicians.length}] Enriching ${musician.name}...`);
  
  try {
    // Search for Wikidata entity
    const searchResult = await searchWikidataEntity(musician.name);
    
    if (!searchResult) {
      console.log(`  No Wikidata entity found`);
      await delay(DELAY_MS);
      return musician;
    }
    
    const wikidataId = searchResult.id;
    console.log(`  Found: ${wikidataId} - ${searchResult.description || ''}`);
    
    // Get image from Wikidata/Wikipedia
    if (!musician.image || musician.image === '') {
      musician.image = await getWikipediaImage(musician.name, wikidataId);
      if (musician.image) console.log(`  ✓ Image found`);
    }
    
    // Use SPARQL for detailed data
    const sparql = buildMusicianQuery(musician.name);
    const data = await queryWikidata(sparql);
    
    if (data) {
      // Birth info
      if (data.birthdate && (!musician.birthDate || musician.birthDate === '')) {
        musician.birthDate = parseWikidataDate(data.birthdate);
        console.log(`  ✓ Birth date: ${musician.birthDate}`);
      }
      
      if (data.birthplaceLabel && (!musician.birthPlace || musician.birthPlace === '')) {
        musician.birthPlace = data.birthplaceLabel.value;
        console.log(`  ✓ Birth place: ${musician.birthPlace}`);
      }
      
      if (data.birthplaceCoords && musician.birthCoords[0] === 0) {
        musician.birthCoords = parseCoords(data.birthplaceCoords) || musician.birthCoords;
      }
      
      // Death info
      if (data.deathdate && (!musician.deathDate || musician.deathDate === '')) {
        const deathDate = parseWikidataDate(data.deathdate);
        musician.deathDate = deathDate;
        console.log(`  ✓ Death date: ${musician.deathDate}`);
      }
      
      if (data.deathplaceLabel && (!musician.deathPlace || musician.deathPlace === '')) {
        musician.deathPlace = data.deathplaceLabel.value;
      }
      
      if (data.deathplaceCoords) {
        musician.deathCoords = parseCoords(data.deathplaceCoords) || musician.deathCoords;
      }
      
      // Instrument and style
      if (data.instrumentLabel && (!musician.instrument || musician.instrument === '')) {
        musician.instrument = data.instrumentLabel.value;
      }
      
      if (data.genreLabel && (!musician.bluesStyle || musician.bluesStyle === '')) {
        musician.bluesStyle = data.genreLabel.value;
      }
      
      // Active from
      if (data.activeStart && musician.activeFrom === '1900') {
        const year = data.activeStart.value.match(/\d{4}/)?.[0];
        if (year) {
          musician.activeFrom = year;
        }
      }
      
      // Description
      if (data.itemDescription && (!musician.description || musician.description === '')) {
        musician.description = data.itemDescription.value;
      }
      
      // Albums
      const albums = await getAlbums(wikidataId);
      if (albums.length > 0 && musician.albums.length === 0) {
        musician.albums = albums;
        console.log(`  ✓ Found ${albums.length} albums`);
      }
    }
    
    await delay(DELAY_MS);
    
  } catch (error) {
    console.error(`  ✗ Error:`, error.message);
  }
  
  return musician;
}

// Main processing function
async function processMusicians() {
  console.log(`🎸 Starting enrichment of ${musicians.length} blues musicians\n`);
  
  const startTime = Date.now();
  
  for (let i = 0; i < musicians.length; i++) {
    musicians[i] = await enrichMusician(musicians[i], i);
    
    // Save every 10 musicians
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const remaining = Math.round(elapsed / (i + 1) * (musicians.length - i - 1));
      console.log(`\n💾 Progress saved (${i + 1}/${musicians.length}) - ${elapsed}s elapsed, ~${remaining}s remaining\n`);
    }
  }
  
  // Final save
  fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
  
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n✅ Done! Processed ${musicians.length} musicians in ${totalTime}s`);
  console.log(`📄 Updated musicians.json`);
}

// Run the enrichment
processMusicians().catch(console.error);