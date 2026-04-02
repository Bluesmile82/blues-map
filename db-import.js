import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

const CONNECTION_STRING = process.env.DATABASE_URL ||
  'postgresql://tsdbadmin:nghoutq5n90sd2qs@c04pgd6ggy.kwvblendjh.tsdb.cloud.timescale.com:36363/tsdb';

const musiciansPath = path.resolve('src/data/musicians.json');

async function importMusicians() {
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();
  console.log('Connected to database');

  const musicians = JSON.parse(fs.readFileSync(musiciansPath, 'utf-8'));
  console.log(`Importing ${musicians.length} musicians...`);

  await client.query('BEGIN');
  await client.query('TRUNCATE musician_relationships, secondary_instruments, albums, spent_time_places, musicians CASCADE');

  const musicianMap = new Map(musicians.map((m) => [m.id, m]));
  const referencedIds = new Set();
  for (const m of musicians) {
    for (const id of m.influences || []) referencedIds.add(id);
    for (const id of m.influencedBy || []) referencedIds.add(id);
    for (const id of m.playedWith || []) referencedIds.add(id);
  }
  const missingIds = [...referencedIds].filter((id) => !musicianMap.has(id));
  if (missingIds.length > 0) {
    console.log(`Found ${missingIds.length} referenced musicians not in data, inserting placeholders...`);
    for (const id of missingIds) {
      await client.query(
        'INSERT INTO musicians (id, name, incomplete) VALUES ($1, $2, TRUE)',
        [id, id.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')]
      );
    }
  }

  const BATCH_SIZE = 100;

  for (let i = 0; i < musicians.length; i += BATCH_SIZE) {
    const batch = musicians.slice(i, i + BATCH_SIZE);
    const musicianValues = [];
    const mParams = [];

    for (const m of batch) {
      const idx = musicianValues.length;
      musicianValues.push(idx + 1);
      mParams.push(m.id, m.name, m.image || null, m.image_source && m.image_source !== '' ? m.image_source : null,
        m.birthDate || null, m.birthPlace || null,
        (m.birthCoords && m.birthCoords.length === 2 && !isNaN(m.birthCoords[0])) ? `SRID=4326;POINT(${m.birthCoords[0]} ${m.birthCoords[1]})` : null,
        m.deathDate || null, m.deathPlace || null,
        (m.deathCoords && m.deathCoords.length === 2 && !isNaN(m.deathCoords[0])) ? `SRID=4326;POINT(${m.deathCoords[0]} ${m.deathCoords[1]})` : null,
        m.instrument || null, m.bluesStyle || null, m.youtubeLink || null,
        m.description || null, m.activeFrom || null, m.incomplete || false, m.source || null);
    }

    const placeholders = batch.map((_, bi) => {
      const base = bi * 17 + 1;
      return `($${base},$${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9},$${base+10},$${base+11},$${base+12},$${base+13},$${base+14},$${base+15},$${base+16})`;
    }).join(',');

    await client.query(
      `INSERT INTO musicians (id, name, image, image_source, birth_date, birth_place, birth_coords, death_date, death_place, death_coords, instrument, blues_style, youtube_link, description, active_from, incomplete, source)
       VALUES ${placeholders}`,
      mParams
    );
  }

  const albumRows = [];
  let aOrder = 0;
  for (const m of musicians) {
    for (const album of m.albums || []) {
      albumRows.push([m.id, album.name, album.youtubeLink || null, aOrder++]);
    }
  }
  for (let i = 0; i < albumRows.length; i += BATCH_SIZE) {
    const batch = albumRows.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, bi) => {
      const base = bi * 4 + 1;
      return `($${base},$${base+1},$${base+2},$${base+3})`;
    }).join(',');
    await client.query(
      `INSERT INTO albums (musician_id, name, youtube_link, sort_order) VALUES ${placeholders}`,
      batch.flat()
    );
  }

  const placeRows = [];
  let pOrder = 0;
  for (const m of musicians) {
    for (const place of m.spentTimePlaces || []) {
      placeRows.push([
        m.id, place.place || null,
        (place.coords && place.coords.length === 2 && !isNaN(place.coords[0])) ? `SRID=4326;POINT(${place.coords[0]} ${place.coords[1]})` : null,
        pOrder++
      ]);
    }
  }
  for (let i = 0; i < placeRows.length; i += BATCH_SIZE) {
    const batch = placeRows.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, bi) => {
      const base = bi * 4 + 1;
      return `($${base},$${base+1},$${base+2},$${base+3})`;
    }).join(',');
    await client.query(
      `INSERT INTO spent_time_places (musician_id, place, coords, sort_order) VALUES ${placeholders}`,
      batch.flat()
    );
  }

  const instRows = [];
  for (const m of musicians) {
    for (const inst of m.secondaryInstruments || []) {
      instRows.push([m.id, inst]);
    }
  }
  for (let i = 0; i < instRows.length; i += BATCH_SIZE) {
    const batch = instRows.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, bi) => {
      const base = bi * 2 + 1;
      return `($${base},$${base+1})`;
    }).join(',');
    await client.query(
      `INSERT INTO secondary_instruments (musician_id, instrument) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      batch.flat()
    );
  }

  const relRows = [];
  for (const m of musicians) {
    for (const id of m.influences || []) relRows.push([m.id, id, 'influences']);
    for (const id of m.influencedBy || []) relRows.push([m.id, id, 'influenced_by']);
    for (const id of m.playedWith || []) relRows.push([m.id, id, 'played_with']);
  }
  for (let i = 0; i < relRows.length; i += BATCH_SIZE) {
    const batch = relRows.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map((_, bi) => {
      const base = bi * 3 + 1;
      return `($${base},$${base+1},$${base+2})`;
    }).join(',');
    await client.query(
      `INSERT INTO musician_relationships (from_musician_id, to_musician_id, relationship_type) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      batch.flat()
    );
  }

  await client.query('COMMIT');

  const result = await client.query(
    `SELECT 
      (SELECT COUNT(*) FROM musicians) as musicians,
      (SELECT COUNT(*) FROM albums) as albums,
      (SELECT COUNT(*) FROM secondary_instruments) as instruments,
      (SELECT COUNT(*) FROM spent_time_places) as places,
      (SELECT COUNT(*) FROM musician_relationships) as relationships`
  );
  const r = result.rows[0];
  console.log(`Import complete:
  Musicians:       ${r.musicians}
  Albums:          ${r.albums}
  Instruments:     ${r.instruments}
  Spent Time Places: ${r.places}
  Relationships:   ${r.relationships}`);

  await client.end();
}

importMusicians().catch((err) => {
  console.error('Import failed:', err);
  process.exit(1);
});
