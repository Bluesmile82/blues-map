#!/usr/bin/env node

const fs = require('fs');
const https = require('https');

// Rate limiting: Nominatim requires max 1 request per second
const RATE_LIMIT_MS = 1100;
const musiciansPath = './src/data/musicians.json';

function reverseGeocode(lat, lon) {
  return new Promise((resolve, reject) => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
    
    https.get(url, {
      headers: {
        'User-Agent': 'blues-map-place-fixer/1.0' // Nominatim requires User-Agent
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (result.error) {
            resolve(null);
          } else {
            // Use display_name or fall back to formatted address parts
            let placeName = result.display_name || result.address?.city || result.address?.town || result.address?.county || result.address?.state || 'Unknown location';
            // Clean up the name - remove country codes and postal codes
            placeName = placeName
              .replace(/,\s*[A-Z]{2}\s*\d{5}/, '') // Remove US postal codes like "MS 38663"
              .replace(/,\s*United States\s*/, '') // Remove "United States"
              .replace(/,\s*USA\s*/, '')
              .trim();
            resolve(placeName);
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('🗺️  Loading musicians.json...');
  const musicians = JSON.parse(fs.readFileSync(musiciansPath, 'utf8'));
  
  // Find all spentTimePlaces with null places
  const toProcess = [];
  
  musicians.forEach(m => {
    if (m.spentTimePlaces) {
      m.spentTimePlaces.forEach((s, idx) => {
        if (s.place === null && s.coords && Array.isArray(s.coords) && s.coords.length === 2) {
          toProcess.push({
            musicianId: m.id,
            musicianName: m.name,
            spentTimeIndex: idx,
            lat: s.coords[1],
            lon: s.coords[0]
          });
        }
      });
    }
  });
  
  console.log(`\n📍 Found ${toProcess.length} spentTimePlaces with null place names`);
  console.log(`⏱️  Estimated time: ${Math.ceil(toProcess.length * RATE_LIMIT_MS / 1000)} seconds\n`);
  
  if (toProcess.length === 0) {
    console.log('✅ No null places found!');
    return;
  }
  
  // Create backup
  const backupPath = './src/data/musicians.json.backup-' + Date.now();
  fs.copyFileSync(musiciansPath, backupPath);
  console.log(`💾 Backup created: ${backupPath}\n`);
  
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;
  
  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];
    const musician = musicians.find(m => m.id === item.musicianId);
    if (!musician) continue;
    
    const spentPlace = musician.spentTimePlaces[item.spentTimeIndex];
    
    // Check if it was already filled (might happen if we resume)
    if (spentPlace.place !== null) {
      skipCount++;
      continue;
    }
    
    process.stdout.write(`\r[${i + 1}/${toProcess.length}] Geocoding ${item.musicianName}... (${item.lat}, ${item.lon})`);
    
    try {
      const placeName = await reverseGeocode(item.lat, item.lon);
      
      if (placeName) {
        spentPlace.place = placeName;
        successCount++;
        console.log(`\r✅ [${i + 1}/${toProcess.length}] ${item.musicianName}: "${placeName}"`);
      } else {
        failCount++;
        console.log(`\r❌ [${i + 1}/${toProcess.length}] ${item.musicianName}: No results found`);
      }
      
      // Save progress every 10 items
      if ((i + 1) % 10 === 0 || i === toProcess.length - 1) {
        fs.writeFileSync(musiciansPath, JSON.stringify(musicians, null, 2));
        console.log(`💾 Progress saved`);
      }
      
    } catch (error) {
      failCount++;
      console.error(`\r⚠️  [${i + 1}/${toProcess.length}] Error: ${error.message}`);
    }
    
    // Rate limiting
    if (i < toProcess.length - 1) {
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
    }
  }
  
  // Final save
  fs.writeFileSync(musiciansPath, JSON.stringify(musicians, null, 2));
  
  console.log(`\n\n🎉 Done!`);
  console.log(`✅ Success: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`⏭️  Skipped: ${skipCount}`);
  console.log(`💾 File saved: ${musiciansPath}`);
}

main().catch(console.error);
