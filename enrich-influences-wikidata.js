/**
 * Fill in `influencedBy` from Wikidata's P737 ("influenced by").
 *
 *   node enrich-influences-wikidata.js [--dry-run] [--verbose]
 *
 * Every musician whose `source` is an English Wikipedia URL is resolved to a
 * Wikidata QID, then one SPARQL query per batch asks for P737 in both
 * directions. A pair counts only when BOTH ends are on the map.
 *
 * Direction matters: `influencedBy` holds the people who influenced THIS
 * musician, the same direction as P737, so that is where a new edge goes.
 * `influences` holds the reverse — the people this musician influenced — and
 * an edge already recorded there is not added twice.
 */
import fs from 'fs';

const DATA = './src/data/musicians.json';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const SPARQL_API = 'https://query.wikidata.org/sparql';
const UA = 'BluesMapETL/1.0 (influence enrichment; educational project)';

const TITLES_PER_CALL = 50;   // MediaWiki caps anonymous title lookups at 50
const QIDS_PER_QUERY = 200;
const DELAY_MS = 1000;        // anonymous Wikipedia calls get 429s below about this
const QID_CACHE = './.wikidata-qids.json';

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url, options = {}, tries = 5) {
  for (let attempt = 1; ; attempt++) {
    let wait = DELAY_MS * 2 ** attempt;
    try {
      const res = await fetch(url, {
        ...options,
        headers: { 'User-Agent': UA, Accept: 'application/json', ...(options.headers ?? {}) },
      });
      if (res.status === 429) {
        // Both APIs throttle anonymous callers; wait as long as they ask.
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

/** en.wikipedia.org/wiki/Muddy_Waters → "Muddy Waters" */
function wikipediaTitle(source) {
  const m = /^https?:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)/.exec(source ?? '');
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : null;
}

/**
 * Wikipedia titles → QIDs, following redirects and normalisation.
 * Results are cached on disk: the lookup is the slow, rate-limited half of
 * this script, and a title's QID does not change between runs.
 */
async function resolveQids(titles) {
  const qidByTitle = new Map(
    fs.existsSync(QID_CACHE) ? Object.entries(JSON.parse(fs.readFileSync(QID_CACHE, 'utf-8'))) : []
  );
  const missing = titles.filter((t) => !qidByTitle.has(t));
  if (qidByTitle.size) console.log(`  ${qidByTitle.size} cached, ${missing.length} to look up`);
  const save = () =>
    fs.writeFileSync(QID_CACHE, JSON.stringify(Object.fromEntries(qidByTitle), null, 2) + '\n');

  for (let i = 0; i < missing.length; i += TITLES_PER_CALL) {
    const batch = missing.slice(i, i + TITLES_PER_CALL);
    const url = `${WIKIPEDIA_API}?action=query&prop=pageprops&ppprop=wikibase_item` +
      `&redirects=1&format=json&origin=*&titles=${encodeURIComponent(batch.join('|'))}`;
    const data = await fetchJSON(url);
    const q = data.query ?? {};
    // A redirected or normalised title comes back under its target's name.
    const alias = new Map();
    [...(q.normalized ?? []), ...(q.redirects ?? [])].forEach(({ from, to }) => alias.set(to, from));
    Object.values(q.pages ?? {}).forEach((page) => {
      const qid = page.pageprops?.wikibase_item;
      if (!qid) return;
      let title = page.title;
      const seen = new Set();
      // Walk back through normalisation → redirect to the title we asked for.
      while (alias.has(title) && !seen.has(title)) { seen.add(title); title = alias.get(title); }
      qidByTitle.set(title, qid);
      qidByTitle.set(page.title, qid);
    });
    save();  // a 429 mid-run then costs only the batches still outstanding
    process.stdout.write(`\r  resolved ${Math.min(i + TITLES_PER_CALL, missing.length)}/${missing.length} titles`);
    await sleep(DELAY_MS);
  }
  if (missing.length) process.stdout.write('\n');
  return qidByTitle;
}

/** All P737 pairs touching `qids`, in both directions, as [influencerQid, influencedQid]. */
async function fetchInfluencePairs(qids) {
  const pairs = [];
  for (let i = 0; i < qids.length; i += QIDS_PER_QUERY) {
    const batch = qids.slice(i, i + QIDS_PER_QUERY).map((q) => `wd:${q}`).join(' ');
    const query = `SELECT ?influenced ?influencer ?influencerLabel ?influencedLabel WHERE {
      VALUES ?ours { ${batch} }
      { ?ours wdt:P737 ?influencer . BIND(?ours AS ?influenced) }
      UNION
      { ?influenced wdt:P737 ?ours . BIND(?ours AS ?influencer) }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }`;
    const data = await fetchJSON(SPARQL_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ query, format: 'json' }),
    });
    data.results.bindings.forEach((b) => {
      const qid = (uri) => uri.value.split('/').pop();
      pairs.push({
        influencer: qid(b.influencer),
        influenced: qid(b.influenced),
        influencerLabel: b.influencerLabel?.value,
        influencedLabel: b.influencedLabel?.value,
      });
    });
    process.stdout.write(`\r  queried ${Math.min(i + QIDS_PER_QUERY, qids.length)}/${qids.length} QIDs, ${pairs.length} pairs`);
    await sleep(DELAY_MS);
  }
  process.stdout.write('\n');
  return pairs;
}

async function main() {
  const musicians = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
  const byId = new Map(musicians.map((m) => [m.id, m]));

  const titled = musicians
    .map((m) => ({ m, title: wikipediaTitle(m.source) }))
    .filter((x) => x.title);
  console.log(`${musicians.length} musicians, ${titled.length} with an English Wikipedia source`);

  console.log('Resolving Wikidata ids...');
  const qidByTitle = await resolveQids([...new Set(titled.map((x) => x.title))]);

  const idsByQid = new Map();
  let unresolved = 0;
  titled.forEach(({ m, title }) => {
    const qid = qidByTitle.get(title);
    if (!qid) { unresolved++; if (verbose) console.log(`  no QID: ${m.name} (${title})`); return; }
    idsByQid.set(qid, [...(idsByQid.get(qid) ?? []), m.id]);
  });

  // Two musicians on one Wikidata item means at least one `source` points at
  // the wrong article, and importing under it would file another musician's
  // influences against the wrong person. Skip the item and name the clash.
  const idByQid = new Map();
  const collisions = [];
  idsByQid.forEach((ids, qid) => {
    if (ids.length === 1) idByQid.set(qid, ids[0]);
    else collisions.push([qid, ids.map((id) => byId.get(id).name)]);
  });
  console.log(`  ${idByQid.size} resolved, ${unresolved} without a Wikidata item`);
  if (collisions.length) {
    console.log(`  ${collisions.length} Wikidata items claimed by more than one musician — skipped:`);
    collisions.forEach(([qid, names]) => console.log(`    ${qid}: ${names.join(', ')}`));
  }

  console.log('Querying P737...');
  const pairs = await fetchInfluencePairs([...idByQid.keys()]);

  let added = 0, offMap = 0, already = 0;
  const log = [];
  // Names Wikidata knows as influences but the map does not carry: the most
  // frequent ones are the musicians worth adding next.
  const missingNames = new Map();
  pairs.forEach(({ influencer: influencerQid, influenced: influencedQid, influencerLabel, influencedLabel }) => {
    const influencerId = idByQid.get(influencerQid);
    const influencedId = idByQid.get(influencedQid);
    if (!influencerId || !influencedId) {
      offMap++;
      const name = influencerId ? influencedLabel : influencerLabel;
      if (name) missingNames.set(name, (missingNames.get(name) ?? 0) + 1);
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

  console.log(`\n${pairs.length} P737 pairs: ${added} new, ${already} already recorded, ${offMap} with one end off the map`);
  log.forEach((l) => console.log(l));
  const shortlist = [...missingNames].sort((a, b) => b[1] - a[1]).slice(0, verbose ? 40 : 15);
  if (shortlist.length) {
    console.log(`\nNot on the map, most often cited as an influence:`);
    shortlist.forEach(([name, n]) => console.log(`  ${String(n).padStart(3)}x ${name}`));
  }

  if (dryRun) { console.log('\n--dry-run: nothing written'); return; }
  fs.writeFileSync(DATA, JSON.stringify(musicians, null, 2) + '\n');
  console.log(`\nWrote ${DATA}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
