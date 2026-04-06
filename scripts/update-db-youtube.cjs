#!/usr/bin/env node

const { Client } = require('pg');
const fs = require('fs');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL environment variable is required');
const connectionString = process.env.DATABASE_URL;

async function main() {
  console.log('🔌 Connecting to database...');
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Connected!\n');

    // Load musicians.json
    console.log('📂 Loading musicians.json...');
    const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf8'));
    
    console.log(`\n📊 Found ${musicians.length} musicians\n`);

    let updated = 0;
    let skipped = 0;
    let errors = 0;

    for (const musician of musicians) {
      try {
        // Check if musician has a YouTube link
        if (!musician.youtubeLink) {
          skipped++;
          continue;
        }

        // Update the database
        const result = await client.query(
          'UPDATE musicians SET youtube_link = $1, updated_at = NOW() WHERE id = $2',
          [musician.youtubeLink, musician.id]
        );

        if (result.rowCount > 0) {
          updated++;
          console.log(`✅ [${updated}] ${musician.name}: ${musician.youtubeLink}`);
        } else {
          skipped++;
          console.log(`⏭️  Skipped: ${musician.name} (not in database)`);
        }
      } catch (err) {
        errors++;
        console.error(`❌ Error updating ${musician.name}: ${err.message}`);
      }
    }

    console.log(`\n\n🎉 Update complete!`);
    console.log(`✅ Updated: ${updated}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);

    // Show some sample YouTube links from the database
    console.log(`\n📺 Sample YouTube links from database:`);
    const sampleResults = await client.query(
      'SELECT name, youtube_link FROM musicians WHERE youtube_link IS NOT NULL ORDER BY RANDOM() LIMIT 5'
    );
    
    sampleResults.rows.forEach(row => {
      console.log(`  - ${row.name}: ${row.youtube_link}`);
    });

  } catch (err) {
    console.error('💥 Fatal error:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n👋 Connection closed');
  }
}

main();
