/**
 * Syncs a single musician to the Ghost PostgreSQL database.
 * Called after every PUT/POST to /api/musicians so the DB stays in sync with the JSON file.
 */
import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL environment variable is required');
const CONNECTION_STRING = process.env.DATABASE_URL;

// Reuse a single connection pool across calls
let pool = null;
function getPool() {
  if (!pool) pool = new Pool({ connectionString: CONNECTION_STRING, max: 3 });
  return pool;
}

function toPoint(coords) {
  if (coords && coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
    return `SRID=4326;POINT(${coords[0]} ${coords[1]})`;
  }
  return null;
}

/**
 * Upserts a musician and all related rows (albums, spent_time_places,
 * secondary_instruments, relationships) inside a single transaction.
 *
 * @param {object} m - Musician object matching the Musician TypeScript type
 */
export async function upsertMusician(m) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // 1. Upsert core musician row
    await client.query(
      `INSERT INTO musicians
         (id, name, image, image_source, birth_date, birth_place, birth_coords,
          death_date, death_place, death_coords, instrument, blues_style,
          youtube_link, description, active_from, incomplete, source, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
       ON CONFLICT (id) DO UPDATE SET
         name         = EXCLUDED.name,
         image        = EXCLUDED.image,
         image_source = EXCLUDED.image_source,
         birth_date   = EXCLUDED.birth_date,
         birth_place  = EXCLUDED.birth_place,
         birth_coords = EXCLUDED.birth_coords,
         death_date   = EXCLUDED.death_date,
         death_place  = EXCLUDED.death_place,
         death_coords = EXCLUDED.death_coords,
         instrument   = EXCLUDED.instrument,
         blues_style  = EXCLUDED.blues_style,
         youtube_link = EXCLUDED.youtube_link,
         description  = EXCLUDED.description,
         active_from  = EXCLUDED.active_from,
         incomplete   = EXCLUDED.incomplete,
         source       = EXCLUDED.source,
         updated_at   = now()`,
      [
        m.id,
        m.name,
        m.image || null,
        m.image_source || null,
        m.birthDate || null,
        m.birthPlace || null,
        toPoint(m.birthCoords),
        m.deathDate || null,
        m.deathPlace || null,
        toPoint(m.deathCoords),
        m.instrument || null,
        m.bluesStyle || null,
        m.youtubeLink || null,
        m.description || null,
        m.activeFrom || null,
        m.incomplete || false,
        m.source || null,
      ]
    );

    // 2. Albums — delete + re-insert to handle reorders and removals
    await client.query('DELETE FROM albums WHERE musician_id = $1', [m.id]);
    for (let i = 0; i < (m.albums || []).length; i++) {
      const album = m.albums[i];
      await client.query(
        'INSERT INTO albums (musician_id, name, youtube_link, sort_order) VALUES ($1,$2,$3,$4)',
        [m.id, album.name, album.youtubeLink || null, i]
      );
    }

    // 3. Spent time places — delete + re-insert
    await client.query('DELETE FROM spent_time_places WHERE musician_id = $1', [m.id]);
    for (let i = 0; i < (m.spentTimePlaces || []).length; i++) {
      const p = m.spentTimePlaces[i];
      await client.query(
        'INSERT INTO spent_time_places (musician_id, place, coords, sort_order) VALUES ($1,$2,$3,$4)',
        [m.id, p.place || null, toPoint(p.coords), i]
      );
    }

    // 4. Secondary instruments — delete + re-insert
    await client.query('DELETE FROM secondary_instruments WHERE musician_id = $1', [m.id]);
    for (const inst of m.secondaryInstruments || []) {
      await client.query(
        'INSERT INTO secondary_instruments (musician_id, instrument) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [m.id, inst]
      );
    }

    // 5. Relationships — delete only this musician's rows, then re-insert
    await client.query(
      'DELETE FROM musician_relationships WHERE from_musician_id = $1',
      [m.id]
    );

    // Ensure all referenced musicians exist as placeholder rows to satisfy the FK
    const referencedIds = [
      ...(m.influences || []),
      ...(m.influencedBy || []),
      ...(m.playedWith || []),
    ];
    for (const refId of referencedIds) {
      await client.query(
        `INSERT INTO musicians (id, name, incomplete)
         VALUES ($1, $2, TRUE)
         ON CONFLICT (id) DO NOTHING`,
        [refId, refId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')]
      );
    }

    for (const id of m.influences || []) {
      await client.query(
        'INSERT INTO musician_relationships (from_musician_id, to_musician_id, relationship_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [m.id, id, 'influences']
      );
    }
    for (const id of m.influencedBy || []) {
      await client.query(
        'INSERT INTO musician_relationships (from_musician_id, to_musician_id, relationship_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [m.id, id, 'influenced_by']
      );
    }
    for (const id of m.playedWith || []) {
      await client.query(
        'INSERT INTO musician_relationships (from_musician_id, to_musician_id, relationship_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [m.id, id, 'played_with']
      );
    }

    await client.query('COMMIT');
    console.log(`[db-sync] ✅ Synced to DB: ${m.name}`);
  } catch (err) {
    await client.query('ROLLBACK');
    // Log but don't throw — a DB failure should not break the JSON file save
    console.error(`[db-sync] ❌ Failed to sync ${m.name}:`, err.message);
  } finally {
    client.release();
  }
}
