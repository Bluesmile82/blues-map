/**
 * Fill in `influencedBy` from DBpedia's dbo:influencedBy / dbo:influenced.
 *
 *   node enrich-influences-dbpedia.js [--dry-run] [--verbose]
 *
 * DBpedia extracts its influence triples from the Influences / Influenced
 * fields that Wikipedia's musician infobox used to carry and has since
 * dropped, so it holds edges that today's article text no longer states and
 * Wikidata never picked up. No id lookup is needed: a DBpedia resource is the
 * Wikipedia title, which is already in each musician's `source`.
 *
 * Direction: `influencedBy` holds the people who influenced this musician,
 * `influences` the reverse. See INFLUENCE_ENRICHMENT.md.
 */
import fs from 'fs';

const DATA = './src/data/musicians.json';
const SPARQL_API = 'https://dbpedia.org/sparql';
const UA = 'BluesMapETL/1.0 (influence enrichment; educational project)';
const PER_QUERY = 120;
const DELAY_MS = 1000;

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, options = {}, tries = 4) {
  for (let attempt = 1; ; attempt++) {
    let wait = DELAY_MS * 2 ** attempt;
    try {
      const res = await fetch(url, {
        ...options,
        headers: { 'User-Agent': UA, Accept: 'application/sparql-results+json', ...(options.headers ?? {}) },
      });
      if (res.status === 429) {
        wait = Math.max(wait, Number(res.headers.get('retry-after') ?? 0) * 1000);
        throw new Error('HTTP 429');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (attempt >= tries) throw err;
      process.stdout.write(`\n  ${err.message}, retrying in ${Math.round(wait / 1000)}s\n`);
      await sleep(wait);
    }
  }
}

/** en.wikipedia.org/wiki/Muddy_Waters → "Muddy_Waters", the DBpedia resource name. */
function resourceName(source) {
  const m = /^https?:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)/.exec(source ?? '');
  return m ? decodeURIComponent(m[1]).replace(/ /g, '_') : null;
}

const musicians = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
const byId = new Map(musicians.map((m) => [m.id, m]));

// Two musicians on one article would file one's influences against the other,
// so such a resource is left out entirely — same rule as the Wikidata pass.
const idsByResource = new Map();
musicians.forEach((m) => {
  const r = resourceName(m.source);
  if (r) idsByResource.set(r, [...(idsByResource.get(r) ?? []), m.id]);
});
const idByResource = new Map();
const collisions = [];
idsByResource.forEach((ids, r) => {
  if (ids.length === 1) idByResource.set(r, ids[0]);
  else collisions.push(`${r}: ${ids.map((id) => byId.get(id).name).join(', ')}`);
});
console.log(`${musicians.length} musicians, ${idByResource.size} with a usable DBpedia resource`);
collisions.forEach((c) => console.log(`  shared article, skipped — ${c}`));

const uri = (name) => `<http://dbpedia.org/resource/${encodeURI(name).replace(/#/g, '%23')}>`;

const pairs = [];   // [influencerResource, influencedResource]
const resources = [...idByResource.keys()];
for (let i = 0; i < resources.length; i += PER_QUERY) {
  const values = resources.slice(i, i + PER_QUERY).map(uri).join(' ');
  const query = `SELECT DISTINCT ?influenced ?influencer WHERE {
    VALUES ?ours { ${values} }
    { ?ours dbo:influencedBy|dbp:influencedBy ?influencer . BIND(?ours AS ?influenced) }
    UNION { ?ours dbo:influenced|dbp:influences ?influenced . BIND(?ours AS ?influencer) }
    UNION { ?influenced dbo:influencedBy|dbp:influencedBy ?ours . BIND(?ours AS ?influencer) }
    UNION { ?influencer dbo:influenced|dbp:influences ?ours . BIND(?ours AS ?influenced) }
  }`;
  const data = await fetchJSON(SPARQL_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query, format: 'application/sparql-results+json' }),
  });
  data.results.bindings.forEach((b) => {
    const name = (u) => decodeURIComponent(u.value.replace('http://dbpedia.org/resource/', ''));
    pairs.push([name(b.influencer), name(b.influenced)]);
  });
  process.stdout.write(`\r  queried ${Math.min(i + PER_QUERY, resources.length)}/${resources.length}, ${pairs.length} pairs`);
  await sleep(DELAY_MS);
}
process.stdout.write('\n');

let added = 0, offMap = 0, already = 0;
const log = [];
const missingNames = new Map();
pairs.forEach(([influencerRes, influencedRes]) => {
  const influencerId = idByResource.get(influencerRes);
  const influencedId = idByResource.get(influencedRes);
  if (!influencerId || !influencedId) {
    offMap++;
    const name = (influencerId ? influencedRes : influencerRes).replace(/_/g, ' ');
    missingNames.set(name, (missingNames.get(name) ?? 0) + 1);
    return;
  }
  if (influencerId === influencedId) return;
  const target = byId.get(influencedId);
  target.influencedBy ??= [];
  const mirrored = (byId.get(influencerId).influences ?? []).includes(influencedId);
  if (target.influencedBy.includes(influencerId) || mirrored) { already++; return; }
  target.influencedBy.push(influencerId);
  added++;
  log.push(`  + ${byId.get(influencerId).name} → ${target.name}`);
});

console.log(`\n${pairs.length} DBpedia pairs: ${added} new, ${already} already recorded, ` +
  `${offMap} with one end off the map`);
log.forEach((l) => console.log(l));
const shortlist = [...missingNames].sort((a, b) => b[1] - a[1]).slice(0, verbose ? 40 : 15);
if (shortlist.length) {
  console.log('\nNot on the map, most often cited as an influence:');
  shortlist.forEach(([name, n]) => console.log(`  ${String(n).padStart(3)}x ${name}`));
}

if (dryRun) { console.log('\n--dry-run: nothing written'); process.exit(0); }
fs.writeFileSync(DATA, JSON.stringify(musicians, null, 2) + '\n');
console.log(`\nWrote ${DATA}`);
