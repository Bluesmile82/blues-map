import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const IMAGES_DIR = path.resolve('public/images/musicians');
const THUMBNAIL_SIZE = 200; // px, square crop

const MUSICIANS_PATH = path.resolve('src/data/musicians.json');
const FAVORITES_PATH = path.resolve('data/favourites.json');
const BACKUPS_DIR = path.resolve('src/data/backups');
const MAX_BACKUPS = 20;
const BACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

// Load environment variables
const envPath = path.resolve('.env.development');
let EDIT_MODE = process.env.VITE_ENABLE_EDIT_MODE === 'true';
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
      const value = values.join('=');
      if (key === 'VITE_ENABLE_EDIT_MODE' && value === 'true') {
        EDIT_MODE = true;
      }
      process.env[key] = value;
    }
  });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function createBackup(label = 'auto') {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(BACKUPS_DIR, `musicians-${label}-${timestamp}.json`);
  fs.copyFileSync(MUSICIANS_PATH, dest);

  // Prune oldest backups beyond MAX_BACKUPS
  const files = fs.readdirSync(BACKUPS_DIR)
    .filter(f => f.startsWith('musicians-') && f.endsWith('.json'))
    .map(f => ({ name: f, mtime: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
    .sort((a, b) => a.mtime - b.mtime);

  while (files.length > MAX_BACKUPS) {
    fs.unlinkSync(path.join(BACKUPS_DIR, files.shift()!.name));
  }

  console.log(`[musicians-api] 📦 Backup created: ${path.basename(dest)}`);
}

export function musiciansApiPlugin(): Plugin {
  return {
    name: 'musicians-api',
    apply: 'serve', // dev only — excluded from production build

    configureServer(server: ViteDevServer) {
      // Periodic backup
      const interval = setInterval(() => {
        if (fs.existsSync(MUSICIANS_PATH)) createBackup('scheduled');
      }, BACKUP_INTERVAL_MS);
      server.httpServer?.on('close', () => clearInterval(interval));

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        if (!req.url?.startsWith('/api/musicians')) return next();

        res.setHeader('Content-Type', 'application/json');

        try {
          // Image download endpoint — must be checked before general POST /api/musicians
          if (req.method === 'POST' && req.url === '/api/musicians/download-image') {
            const { id, url } = JSON.parse(await readBody(req));
            if (!id || !url) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'id and url are required' }));
              return;
            }

            if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });

            const response = await fetch(url);
            if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
            const buffer = Buffer.from(await response.arrayBuffer());

            const destPath = path.join(IMAGES_DIR, `${id}.webp`);
            const publicPath = `/images/musicians/${id}.webp`;

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const sharpMod: any = await import('sharp');
            const sharp = sharpMod.default ?? sharpMod;
            await sharp(buffer)
              .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'cover', position: 'attention' })
              .webp({ quality: 85 })
              .toFile(destPath);

            console.log(`[musicians-api] 🖼️  Thumbnail saved: ${publicPath}`);
            res.end(JSON.stringify({ path: publicPath }));
            return;
          }

          const musicians: unknown[] = JSON.parse(fs.readFileSync(MUSICIANS_PATH, 'utf-8'));

          if (req.method === 'GET') {
            res.end(JSON.stringify(musicians));
            return;
          }

          if (req.method === 'PUT') {
            const updated = JSON.parse(await readBody(req));
            const index = musicians.findIndex((m: any) => m.id === updated.id);
            if (index === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Musician not found' }));
              return;
            }
            createBackup('pre-save');
            musicians[index] = updated;
            fs.writeFileSync(MUSICIANS_PATH, JSON.stringify(musicians, null, 2), 'utf-8');
            console.log(`[musicians-api] ✅ Updated: ${updated.name}`);
            res.end(JSON.stringify(updated));
            return;
          }

          if (req.method === 'POST') {
            const created = JSON.parse(await readBody(req));
            if (!created.id) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Musician ID is required' }));
              return;
            }
            if (musicians.some((m: any) => m.id === created.id)) {
              res.statusCode = 409;
              res.end(JSON.stringify({ error: 'Musician already exists' }));
              return;
            }
            createBackup('pre-save');
            musicians.push(created);
            fs.writeFileSync(MUSICIANS_PATH, JSON.stringify(musicians, null, 2), 'utf-8');
            console.log(`[musicians-api] ✅ Created: ${created.name}`);
            res.end(JSON.stringify(created));
            return;
          }

          next();
        } catch (err) {
          console.error('[musicians-api] Error:', err);
          res.statusCode = 500;
          res.end(JSON.stringify({ error: 'Internal server error' }));
        }
      });

      // Favorites API endpoints (dev only)
      if (EDIT_MODE) {
        let favoritesLock = Promise.resolve();

        async function getFavorites(): Promise<string[]> {
          try {
            if (!fs.existsSync(FAVORITES_PATH)) {
              return [];
            }
            const data = fs.readFileSync(FAVORITES_PATH, 'utf-8');
            const parsed = JSON.parse(data);
            return parsed.favorites || [];
          } catch (error) {
            console.error('[favorites-api] Error reading favorites:', error);
            return [];
          }
        }

        async function saveFavorites(favorites: string[]): Promise<void> {
          const dir = path.dirname(FAVORITES_PATH);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(FAVORITES_PATH, JSON.stringify({ favorites }, null, 2), 'utf-8');
        }

        function isValidMusicianId(id: unknown): id is string {
          return typeof id === 'string' && id.trim().length > 0;
        }

        server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
          if (!req.url?.startsWith('/api/favorites')) return next();

          res.setHeader('Content-Type', 'application/json');

          try {
            if (req.method === 'GET' && req.url === '/api/favorites') {
              const favorites = await getFavorites();
              res.end(JSON.stringify({ favorites }));
              return;
            }

            if (req.method === 'POST' && req.url === '/api/favorites') {
              const { musicianId } = JSON.parse(await readBody(req));
              if (!isValidMusicianId(musicianId)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid musicianId' }));
                return;
              }

              // Use lock to prevent race conditions
              const updatedFavorites = await favoritesLock.then(async () => {
                const favorites = await getFavorites();
                if (!favorites.includes(musicianId)) {
                  favorites.push(musicianId);
                  await saveFavorites(favorites);
                  console.log(`[favorites-api] ⭐ Added favorite: ${musicianId}`);
                }
                return favorites;
              });
              favoritesLock = Promise.resolve();

              res.end(JSON.stringify({ favorites: updatedFavorites }));
              return;
            }

            if (req.method === 'DELETE' && req.url.startsWith('/api/favorites/')) {
              const id = req.url.split('/')[3];
              if (!isValidMusicianId(id)) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Invalid musicianId' }));
                return;
              }

              // Use lock to prevent race conditions
              const updatedFavorites = await favoritesLock.then(async () => {
                let favorites = await getFavorites();
                const initialLength = favorites.length;
                favorites = favorites.filter(fav => fav !== id);
                if (favorites.length !== initialLength) {
                  await saveFavorites(favorites);
                  console.log(`[favorites-api] 💔 Removed favorite: ${id}`);
                }
                return favorites;
              });
              favoritesLock = Promise.resolve();

              res.end(JSON.stringify({ favorites: updatedFavorites }));
              return;
            }

            next();
          } catch (err) {
            console.error('[favorites-api] Error:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Internal server error' }));
          }
        });

        console.log('[favorites-api] ⭐ Favorites API endpoints enabled (dev mode)');
      }
    },
  };
}
