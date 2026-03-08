import type { Plugin, ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const IMAGES_DIR = path.resolve('public/images/musicians');
const THUMBNAIL_SIZE = 200; // px, square crop

const MUSICIANS_PATH = path.resolve('src/data/musicians.json');
const BACKUPS_DIR = path.resolve('src/data/backups');
const MAX_BACKUPS = 20;
const BACKUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

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

      console.log('[musicians-api] 🎸 Musicians API ready (dev only)');
      console.log(`[musicians-api] 📁 ${MUSICIANS_PATH}`);
      console.log(`[musicians-api] 💾 Backups → ${BACKUPS_DIR} (every 30min + pre-save, max ${MAX_BACKUPS})`);
    },
  };
}
