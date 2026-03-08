import fs from 'fs';
import https from 'https';

// API endpoints
const WIKIDATA_ENDPOINT = 'https://www.wikidata.org/w/api.php';
const YOUTUBE_SEARCH_ENDPOINT = 'https://www.googleapis.com/youtube/v3/search';

// Load musicians
const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf-8'));

// YouTube API key - you'll need to set this
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';

// Helper function to make HTTPS requests
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Search Wikidata for a musician by name
async function searchWikidata(name) {
  const searchUrl = `${WIKIDATA_ENDPOINT}?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json`;
  const data = await httpsGet(searchUrl);
  return data.search?.[0]?.id;
}

// Get detailed data from Wikidata
async function getWikidataEntity(entityId) {
  const url = `${WIKIDATA_ENDPOINT}?action=wbgetentities&ids=${entityId}&format=json`;
  const data = await httpsGet(url);
  return data.entities?.[entityId];
}

// Extract coordinates from Wikidata claims
function extractCoordinates(claims, propertyId) {
  const claim = claims?.[propertyId]?.[0];
  if (!claim?.mainsnak?.datavalue?.value) return null;
  
  const coords = claim.mainsnak.datavalue.value;
  return [coords.longitude, coords.latitude];
}

// Extract date from Wikidata claims
function extractDate(claims, propertyId) {
  const claim = claims?.[propertyId]?.[0];
  if (!claim?.mainsnak?.datavalue?.value) return null;
  
  const time = claim.mainsnak.datavalue.value.time;
  // Wikidata dates are like "+1900-01-01T00:00:00Z"
  const match = time.match(/\+(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

// Extract place name from Wikidata claims
async function extractPlaceName(claims, propertyId) {
  const claim = claims?.[propertyId]?.[0];
  if (!claim?.mainsnak?.datavalue?.value?.id) return null;
  
  const entityId = claim.mainsnak.datavalue.value.id;
  const entity = await getWikidataEntity(entityId);
  return entity?.labels?.en?.value || null;
}

// Extract albums from Wikidata
function extractAlbums(claims) {
  const albums = [];
  const albumClaims = claims?.['P2554'] || []; // P2554 is 'recorded in' or similar
  
  // Also check for 'album' property
  const albumProp = claims?.['P658'] || [];
  
  return albums;
}

// Search YouTube for top video
async function searchYouTube(query) {
  if (!YOUTUBE_API_KEY) {
    console.warn('YouTube API key not set, skipping YouTube search');
    return '';
  }
  
  const url = `${YOUTUBE_SEARCH_ENDPOINT}?part=snippet&q=${encodeURIComponent(query + ' blues')}&type=video&maxResults=1&key=${YOUTUBE_API_KEY}`;
  
  try {
    const data = await httpsGet(url);
    if (data.items?.[0]?.id?.videoId) {
      return `https://www.youtube.com/watch?v=${data.items[0].id.videoId}`;
    }
  } catch (e) {
    console.warn('YouTube search failed:', e.message);
  }
  
  return '';
}

// Get Wikipedia image URL
async function getWikipediaImage(name) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(name)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
  
  try {
    const data = await httpsGet(searchUrl);
    const pages = data.query?.pages;
    const pageId = Object.keys(pages || {})[0];
    
    if (pages?.[pageId]?.thumbnail?.source) {
      return pages[pageId].thumbnail.source;
    }
  } catch (e) {
    console.warn('Wikipedia image search failed:', e.message);
  }
  
  return '';
}

// Enrich a single musician
async function enrichMusician(musician) {
  // Skip if already has substantial data
  if (musician.birthDate && musician.birthCoords[0] !== 0) {
    console.log(`Skipping ${musician.name} - already has data`);
    return musician;
  }
  
  console.log(`Enriching ${musician.name}...`);
  
  try {
    // Search Wikidata
    const entityId = await searchWikidata(musician.name);
    
    if (!entityId) {
      console.log(`  No Wikidata entity found for ${musician.name}`);
      return musician;
    }
    
    console.log(`  Found Wikidata entity: ${entityId}`);
    const entity = await getWikidataEntity(entityId);
    const claims = entity.claims || {};
    
    // Extract birth info
    if (!musician.birthDate || musician.birthDate === '') {
      musician.birthDate = extractDate(claims, 'P569') || musician.birthDate;
    }
    
    if (!musician.birthPlace || musician.birthPlace === '') {
      musician.birthPlace = await extractPlaceName(claims, 'P569') || musician.birthPlace;
    }
    
    if (musician.birthCoords[0] === 0 && musician.birthCoords[1] === 0) {
      musician.birthCoords = extractCoordinates(claims, 'P569') || musician.birthCoords;
    }
    
    // Extract death info
    if (!musician.deathDate || musician.deathDate === '') {
      const deathDate = extractDate(claims, 'P570');
      musician.deathDate = deathDate !== null ? deathDate : null;
    }
    
    if (!musician.deathPlace || musician.deathPlace === '') {
      musician.deathPlace = await extractPlaceName(claims, 'P570') || musician.deathPlace;
    }
    
    if (!musician.deathCoords || (musician.deathCoords[0] === 0 && musician.deathCoords[1] === 0)) {
      musician.deathCoords = extractCoordinates(claims, 'P570') || musician.deathCoords;
    }
    
    // Get Wikipedia image
    if (!musician.image || musician.image === '') {
      musician.image = await getWikipediaImage(musician.name);
    }
    
    // Get YouTube video
    if (!musician.youtubeLink || musician.youtubeLink === '') {
      musician.youtubeLink = await searchYouTube(musician.name);
    }
    
    // Extract some basic info from Wikidata
    if (entity.descriptions?.en) {
      musician.description = entity.descriptions.en.value;
    }
    
    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
    
  } catch (e) {
    console.error(`  Error enriching ${musician.name}:`, e.message);
  }
  
  return musician;
}

// Process musicians in batches
async function processMusicians() {
  console.log(`Processing ${musicians.length} musicians...`);
  
  // Process in batches of 10 to avoid overwhelming the APIs
  const batchSize = 10;
  for (let i = 0; i < musicians.length; i += batchSize) {
    const batch = musicians.slice(i, i + batchSize);
    console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(musicians.length / batchSize)}`);
    
    for (const musician of batch) {
      await enrichMusician(musician);
    }
    
    // Save progress after each batch
    fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
    console.log(`Progress saved (${i + batch.length}/${musicians.length})`);
  }
  
  console.log('\nDone! Updated musicians.json');
}

// Run the enrichment
processMusicians().catch(console.error);