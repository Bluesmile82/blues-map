import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL environment variable is required');
const CONNECTION_STRING = process.env.DATABASE_URL;

const musiciansPath = path.resolve('src/data/musicians.json');

function parseCoords(geom) {
  if (!geom) return null;
  const str = String(geom);
  const match = str.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
  if (!match) return null;
  return [parseFloat(match[1]), parseFloat(match[2])];
}

async function exportMusicians() {
  const client = new Client({ connectionString: CONNECTION_STRING });
  try {
    await client.connect();
    console.log('Connected to database');

  const { rows: musicians } = await client.query(
    "SELECT *, ST_AsText(birth_coords) as birth_coords_text, ST_AsText(death_coords) as death_coords_text FROM musicians ORDER BY id"
  );
  console.log(`Exporting ${musicians.length} musicians...`);

  const { rows: allAlbums } = await client.query('SELECT * FROM albums ORDER BY sort_order');
  const albumsByMusician = new Map();
  for (const a of allAlbums) {
    if (!albumsByMusician.has(a.musician_id)) albumsByMusician.set(a.musician_id, []);
    albumsByMusician.get(a.musician_id).push({ name: a.name, youtubeLink: a.youtube_link });
  }

  const { rows: allPlaces } = await client.query('SELECT musician_id, place, ST_AsText(coords) as coords_text FROM spent_time_places ORDER BY sort_order');
  const placesByMusician = new Map();
  for (const p of allPlaces) {
    if (!placesByMusician.has(p.musician_id)) placesByMusician.set(p.musician_id, []);
    placesByMusician.get(p.musician_id).push({ place: p.place, coords: parseCoords(p.coords_text) });
  }

  const { rows: allInstruments } = await client.query('SELECT * FROM secondary_instruments');
  const instrumentsByMusician = new Map();
  for (const i of allInstruments) {
    if (!instrumentsByMusician.has(i.musician_id)) instrumentsByMusician.set(i.musician_id, []);
    instrumentsByMusician.get(i.musician_id).push(i.instrument);
  }

  const { rows: allRels } = await client.query('SELECT * FROM musician_relationships');
  const influences = new Map();
  const influencedBy = new Map();
  const playedWith = new Map();
  for (const r of allRels) {
    const map = r.relationship_type === 'influences' ? influences
      : r.relationship_type === 'influenced_by' ? influencedBy
      : playedWith;
    if (!map.has(r.from_musician_id)) map.set(r.from_musician_id, []);
    map.get(r.from_musician_id).push(r.to_musician_id);
  }

  const output = musicians.map((m) => ({
    id: m.id,
    name: m.name,
    image: m.image,
    image_source: m.image_source || null,
    birthDate: m.birth_date,
    birthPlace: m.birth_place,
    birthCoords: parseCoords(m.birth_coords_text),
    deathDate: m.death_date,
    deathPlace: m.death_place,
    deathCoords: parseCoords(m.death_coords_text),
    spentTimePlaces: placesByMusician.get(m.id) || [],
    instrument: m.instrument,
    bluesStyle: m.blues_style,
    youtubeLink: m.youtube_link,
    albums: albumsByMusician.get(m.id) || [],
    description: m.description,
    activeFrom: m.active_from,
    influences: influences.get(m.id) || [],
    influencedBy: influencedBy.get(m.id) || [],
    incomplete: m.incomplete,
    playedWith: playedWith.get(m.id) || [],
    source: m.source,
    secondaryInstruments: instrumentsByMusician.get(m.id) || [],
  }));

  fs.writeFileSync(musiciansPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Exported ${output.length} musicians to ${musiciansPath}`);
  } finally {
    await client.end();
  }
}

exportMusicians().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
