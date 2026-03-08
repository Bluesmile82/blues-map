import fs from 'fs';

const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf-8'));

const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';

const DELAY_MS = 500; // Slower to avoid rate limiting

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

async function searchWikidataEntity(name) {
  const url = `${WIKIDATA_API}?action=wbsearchentities&search=${encodeURIComponent(name + ' blues')}&language=en&format=json&origin=*`;
  
  try {
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    return data.search?.[0];
  } catch (error) {
    console.warn(`  Wikidata search failed for ${name}:`, error.message);
    return null;
  }
}

async function getWikidataEntity(entityId) {
  const url = `${WIKIDATA_API}?action=wbgetentities&ids=${entityId}&format=json&origin=*`;
  
  try {
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    return data.entities?.[entityId];
  } catch (error) {
    console.warn(`  Wikidata entity fetch failed:`, error.message);
    return null;
  }
}

function parseWikidataDate(claim) {
  if (!claim?.mainsnak?.datavalue?.value) return null;
  
  const time = claim.mainsnak.datavalue.value.time;
  const precision = claim.mainsnak.datavalue.value.precision;
  
  const match = time.match(/\+(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    if (precision === 9) return `${match[1]}-01-01`;
    if (precision === 10) return `${match[1]}-${match[2]}-01`;
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return null;
}

function parseCoordinates(claim) {
  if (!claim?.mainsnak?.datavalue?.value) return null;
  
  try {
    const coords = claim.mainsnak.datavalue.value;
    return [coords.longitude, coords.latitude];
  } catch {
    return null;
  }
}

async function getPlaceName(claim) {
  if (!claim?.[0]?.mainsnak?.datavalue?.value?.id) return null;
  
  const placeId = claim[0].mainsnak.datavalue.value.id;
  const placeEntity = await getWikidataEntity(placeId);
  
  if (placeEntity?.labels?.en?.value) {
    return placeEntity.labels.en.value;
  }
  
  return null;
}

async function getPlaceCoordinates(claim) {
  if (!claim?.[0]?.mainsnak?.datavalue?.value?.id) return null;
  
  const placeId = claim[0].mainsnak.datavalue.value.id;
  const placeEntity = await getWikidataEntity(placeId);
  
  if (placeEntity?.claims?.P625?.[0]) {
    return parseCoordinates(placeEntity.claims.P625[0]);
  }
  
  return null;
}

async function getWikipediaImage(name, wikidataId = null) {
  if (wikidataId) {
    const entity = await getWikidataEntity(wikidataId);
    
    if (entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value) {
      const imageName = entity.claims.P18[0].mainsnak.datavalue.value;
      return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(imageName)}?width=500`;
    }
  }
  
  const url = `${WIKIPEDIA_API}?action=query&titles=${encodeURIComponent(name)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
  
  try {
    const response = await fetchWithTimeout(url);
    const data = await response.json();
    const pages = data.query?.pages;
    const pageId = Object.keys(pages || {})[0];
    
    if (pages?.[pageId]?.thumbnail?.source) {
      return pages[pageId].thumbnail.source;
    }
  } catch (e) {
    // Silently fail
  }
  
  return '';
}

function extractStrings(claim) {
  if (!claim) return [];
  
  return claim
    .filter(c => c.mainsnak?.datavalue?.value?.id)
    .map(c => c.mainsnak.datavalue.value.id);
}

async function getInstrumentNames(instrumentIds) {
  const names = [];
  for (const id of instrumentIds) {
    const entity = await getWikidataEntity(id);
    if (entity?.labels?.en?.value) {
      names.push(entity.labels.en.value);
    }
    await delay(100);
  }
  return names;
}

async function getGenreNames(genreIds) {
  const names = [];
  for (const id of genreIds) {
    const entity = await getWikidataEntity(id);
    if (entity?.labels?.en?.value) {
      names.push(entity.labels.en.value);
    }
    await delay(100);
  }
  return names;
}

async function getAlbums(wikidataId) {
  const entity = await getWikidataEntity(wikidataId);
  
  if (!entity?.claims?.P658) return [];
  
  const albums = [];
  for (const albumClaim of entity.claims.P658.slice(0, 10)) {
    const albumId = albumClaim.mainsnak?.datavalue?.value?.id;
    if (albumId) {
      const albumEntity = await getWikidataEntity(albumId);
      if (albumEntity?.labels?.en?.value) {
        albums.push({
          name: albumEntity.labels.en.value,
          year: '',
          youtubeLink: ''
        });
      }
      await delay(100);
    }
  }
  
  return albums;
}

async function enrichMusician(musician, index) {
  const alreadyEnriched = 
    musician.birthDate && 
    musician.birthDate !== '' && 
    musician.birthDate !== '1900-01-01' &&
    musician.birthCoords[0] !== 0;
  
  if (alreadyEnriched) {
    if (index % 50 === 0) console.log(`[${index + 1}/${musicians.length}] Skipping ${musician.name} - already enriched`);
    return musician;
  }
  
  console.log(`[${index + 1}/${musicians.length}] Enriching ${musician.name}...`);
  
  try {
    // Add "blues" to search for better results
    const searchResult = await searchWikidataEntity(musician.name);
    
    if (!searchResult) {
      console.log(`  ✗ No Wikidata entity found`);
      await delay(DELAY_MS);
      return musician;
    }
    
    const wikidataId = searchResult.id;
    console.log(`  ✓ Found: ${wikidataId} - ${searchResult.description || ''}`);
    
    // Check if it's actually a musician
    const desc = (searchResult.description || '').toLowerCase();
    if (desc && ['footballer', 'politician', 'rugby', 'cricket', 'baseball'].some(word => desc.includes(word))) {
      console.log(`  ⚠ Warning: Entity doesn't seem to be a musician, skipping`);
      await delay(DELAY_MS);
      return musician;
    }
    
    const entity = await getWikidataEntity(wikidataId);
    if (!entity) {
      console.log(`  ✗ Could not fetch entity details`);
      await delay(DELAY_MS);
      return musician;
    }
    
    const claims = entity.claims || {};
    
    // Birth date
    if (claims.P569?.[0] && (!musician.birthDate || musician.birthDate === '')) {
      musician.birthDate = parseWikidataDate(claims.P569[0]);
      if (musician.birthDate) console.log(`  ✓ Birth date: ${musician.birthDate}`);
    }
    
    // Birth place
    if (claims.P19 && (!musician.birthPlace || musician.birthPlace === '')) {
      musician.birthPlace = await getPlaceName(claims.P19);
      if (musician.birthPlace) console.log(`  ✓ Birth place: ${musician.birthPlace}`);
      
      if (musician.birthCoords[0] === 0) {
        musician.birthCoords = await getPlaceCoordinates(claims.P19) || musician.birthCoords;
        if (musician.birthCoords[0] !== 0) console.log(`  ✓ Birth coords: [${musician.birthCoords[0]}, ${musician.birthCoords[1]}]`);
      }
    }
    
    // Death date
    if (claims.P570?.[0] && (!musician.deathDate || musician.deathDate === '')) {
      const deathDate = parseWikidataDate(claims.P570[0]);
      if (deathDate) {
        musician.deathDate = deathDate;
        console.log(`  ✓ Death date: ${musician.deathDate}`);
      }
    }
    
    // Death place
    if (claims.P20) {
      musician.deathPlace = await getPlaceName(claims.P20) || musician.deathPlace;
      if (!musician.deathCoords || (musician.deathCoords[0] === 0 && musician.deathCoords[1] === 0)) {
        musician.deathCoords = await getPlaceCoordinates(claims.P20) || musician.deathCoords;
      }
    }
    
    // Instrument
    if (claims.P1303 && (!musician.instrument || musician.instrument === '')) {
      const instrumentIds = extractStrings(claims.P1303);
      const instruments = await getInstrumentNames(instrumentIds);
      if (instruments.length > 0) {
        musician.instrument = instruments.join(', ');
        console.log(`  ✓ Instrument: ${musician.instrument}`);
      }
    }
    
    // Genre/Style
    if (claims.P136 && (!musician.bluesStyle || musician.bluesStyle === '')) {
      const genreIds = extractStrings(claims.P136);
      const genres = await getGenreNames(genreIds);
      if (genres.length > 0) {
        musician.bluesStyle = genres.join(', ');
        console.log(`  ✓ Style: ${musician.bluesStyle}`);
      }
    }
    
    // Active from
    if (claims.P2031?.[0] && musician.activeFrom === '1900') {
      const activeFrom = parseWikidataDate(claims.P2031[0]);
      if (activeFrom) {
        const year = activeFrom.split('-')[0];
        musician.activeFrom = year;
        console.log(`  ✓ Active from: ${musician.activeFrom}`);
      }
    }
    
    // Description
    if (entity.descriptions?.en && (!musician.description || musician.description === '')) {
      musician.description = entity.descriptions.en.value;
    }
    
    // Image
    if (!musician.image || musician.image === '') {
      musician.image = await getWikipediaImage(musician.name, wikidataId);
      if (musician.image) console.log(`  ✓ Image found`);
    }
    
    // Albums
    if (musician.albums.length === 0) {
      const albums = await getAlbums(wikidataId);
      if (albums.length > 0) {
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

async function processMusicians() {
  console.log(`🎸 Starting enrichment of ${musicians.length} blues musicians\n`);
  console.log(`⚠ NOTE: API rate limits mean not all musicians will be enriched in one run`);
  console.log(`💡 You can re-run this script multiple times to continue enrichment\n`);
  
  const startTime = Date.now();
  
  for (let i = 0; i < musicians.length; i++) {
    musicians[i] = await enrichMusician(musicians[i], i);
    
    if ((i + 1) % 10 === 0) {
      fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const remaining = Math.round(elapsed / (i + 1) * (musicians.length - i - 1));
      console.log(`\n💾 Progress saved (${i + 1}/${musicians.length}) - ${elapsed}s elapsed, ~${remaining}s remaining\n`);
    }
  }
  
  fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
  
  const totalTime = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n✅ Done! Processed ${musicians.length} musicians in ${totalTime}s`);
  console.log(`📄 Updated musicians.json`);
  console.log(`\n💡 Run again later to enrich more musicians: npm run enrich`);
}

processMusicians().catch(console.error);