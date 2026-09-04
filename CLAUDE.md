# blues-map

## Adding a musician (daily routine)

Every entry in `src/data/musicians.json` needs a `createdAt` field: the date the
entry was added, `YYYY-MM-DD`. Existing entries are backfilled to `2026-09-03`;
new ones use today's date.

`npm test` fails if any musician is missing it (`src/data/musicians.test.ts`).
The API create endpoints (`vite-plugin-musicians-api.ts`, `server/server.js`)
stamp it automatically; hand-edited JSON does not.
