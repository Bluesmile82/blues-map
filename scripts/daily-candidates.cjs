#!/usr/bin/env node
// Helper for the daily "add musicians" routine.
//   node scripts/daily-candidates.cjs            → style counts + ranked missing candidates
//   node scripts/daily-candidates.cjs check "Name" [wikipediaUrl]  → duplicate check
// "Taken" = origin/main + every open PR branch, so a PR that hasn't merged yet
// still blocks its musicians from being picked again.
const { execFileSync } = require('child_process');

const sh = (cmd, ...args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 1e8, stdio: ['ignore', 'pipe', 'ignore'] });
const FILE = 'src/data/musicians.json';
const BANNED = /jazz|british|soul|rhythm and blues|blues rock|rock|funk|pop|metal|punk/i;
const COMMON = new Set(['blind', 'big', 'little', 'lil', 'slim', 'sonny', 'boy', 'willie', 'king', 'jr', 'sr', 'the', 'and', 'junior', 'reverend', 'rev', 'mama', 'papa', 'washboard', 'guitar', 'piano']);

const title = (url) => decodeURIComponent((url || '').split('/wiki/')[1] || '').replace(/_/g, ' ').toLowerCase().trim();
const tokens = (s) => s.toLowerCase().replace(/[^a-z0-9 -]/g, '').split(/[\s-]+/).filter((t) => t.length > 2 && !COMMON.has(t));

function taken() {
  try { sh('git', 'fetch', '-q', 'origin', '+refs/heads/*:refs/remotes/origin/*'); } catch {}
  let branches = [];
  try { branches = sh('gh', 'pr', 'list', '--state', 'open', '--limit', '100', '--json', 'headRefName', '-q', '.[].headRefName').split('\n').filter(Boolean); } catch {}
  const all = new Map();
  for (const ref of ['origin/main', ...branches.map((b) => `origin/${b}`)]) {
    let arr;
    try { arr = JSON.parse(sh('git', 'show', `${ref}:${FILE}`)); } catch { continue; }
    for (const m of arr) if (!all.has(m.id)) all.set(m.id, { ...m, ref });
  }
  return [...all.values()];
}

async function canonical(url) {
  const t = title(url);
  if (!t) return '';
  try {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(t)}&redirects=1&format=json`, { headers: { 'User-Agent': 'BluesMapRoutine/1.0 (educational)' } });
    const page = Object.values((await r.json()).query.pages)[0];
    return page.title.toLowerCase();
  } catch { return t; }
}

async function check(name, url) {
  const db = taken();
  const canon = await canonical(url);
  const exact = db.filter((m) => m.name.toLowerCase() === name.toLowerCase() || (canon && title(m.source) === canon));
  const want = tokens(name);
  const similar = db.filter((m) => !exact.includes(m) && tokens(m.name + ' ' + m.id).some((t) => want.includes(t)));
  for (const m of exact) console.log(`DUPLICATE  ${m.id} "${m.name}" (${m.ref}) ${m.source || ''}`);
  for (const m of similar) console.log(`REVIEW     ${m.id} "${m.name}" (${m.ref}) ${m.source || ''}`);
  console.log(exact.length ? 'RESULT: DUPLICATE — pick someone else' : similar.length ? 'RESULT: REVIEW the names above; if any is the same person, pick someone else' : 'RESULT: CLEAR');
  process.exitCode = exact.length ? 1 : 0;
}

const AWARD_PAGES = [
  'Blues Hall of Fame',
  'Blues Music Award',
  'Grammy Award for Best Traditional Blues Album',
  'Grammy Award for Best Contemporary Blues Album',
  'International Blues Challenge',
];

// Articles linked from a Wikipedia page whose short description looks like a musician.
async function linkedMusicians(page) {
  const found = [];
  let cont = {};
  do {
    const params = new URLSearchParams({ action: 'query', format: 'json', generator: 'links', titles: page, gplnamespace: 0, gpllimit: 'max', prop: 'description', redirects: 1, ...cont });
    const j = await (await fetch('https://en.wikipedia.org/w/api.php?' + params, { headers: { 'User-Agent': 'BluesMapRoutine/1.0 (educational)' } })).json();
    for (const x of Object.values(j.query?.pages || {})) if (/blues|musician|singer|guitarist|pianist|harmonica/i.test(x.description || '')) found.push(x);
    cont = j.continue || {};
    await new Promise((r) => setTimeout(r, 500));
  } while (cont.gplcontinue);
  return found;
}

async function candidates() {
  const db = taken();
  const counts = {};
  for (const m of db) counts[m.bluesStyle] = (counts[m.bluesStyle] || 0) + 1;
  console.log('Style counts (main + open PRs), fewest first:');
  for (const [s, n] of Object.entries(counts).sort((a, b) => a[1] - b[1])) console.log(`  ${String(n).padStart(4)}  ${s}${BANNED.test(s) ? '  (do not add)' : ''}`);

  // Era = decade the career started (activeFrom, else birth year + 20).
  const decade = (y) => (y ? Math.floor(y / 10) * 10 : null);
  const eraOf = (m) => decade(+(m.activeFrom || '').match(/\d{4}/)?.[0] || (+(m.birthDate || '').match(/\d{4}/)?.[0] + 20 || 0));
  const eras = {};
  for (const m of db) { const e = eraOf(m); if (e) eras[e] = (eras[e] || 0) + 1; }
  const thin = (e) => e && e >= 1920 && (eras[e] || 0) < 70; // ponytail: fixed threshold; pre-1920 has almost no recordings to add
  console.log('\nEra counts (career start decade):');
  for (const [e, n] of Object.entries(eras).sort((a, b) => a[0] - b[0])) console.log(`  ${String(n).padStart(4)}  ${e}s${thin(+e) ? '  (thin)' : ''}`);

  // Wikidata: people tagged with blues or a blues subgenre. Score = Wikipedia
  // language editions (international reach) + 10 per blues award / Grammy /
  // Hall of Fame / Heritage Fellowship, + 15 if their era is thin in the DB.
  // ponytail: plain "blues" tag is noisy (pop stars), so it only counts when the description says blues.
  const q = `SELECT ?p ?pLabel ?desc ?article ?sl (MIN(?start) AS ?from) (MIN(?born) AS ?birth)
      (GROUP_CONCAT(DISTINCT ?gLabel;separator="|") AS ?genres) (GROUP_CONCAT(DISTINCT ?aLabel;separator="|") AS ?awards) WHERE {
    ?p wdt:P31 wd:Q5; wdt:P136 ?g. ?g wdt:P279* wd:Q9759. ?p wikibase:sitelinks ?sl.
    ?article schema:about ?p; schema:isPartOf <https://en.wikipedia.org/>.
    ?g rdfs:label ?gLabel FILTER(lang(?gLabel)="en")
    OPTIONAL { ?p schema:description ?desc FILTER(lang(?desc)="en") }
    OPTIONAL { ?p wdt:P2031 ?start }
    OPTIONAL { ?p wdt:P569 ?born }
    OPTIONAL { ?p wdt:P166 ?a. ?a rdfs:label ?aLabel FILTER(lang(?aLabel)="en" && REGEX(?aLabel, "blues|grammy|handy|heritage fellowship", "i")) }
    SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
  } GROUP BY ?p ?pLabel ?desc ?article ?sl LIMIT 6000`;
  const r = await fetch('https://query.wikidata.org/sparql?query=' + encodeURIComponent(q), { headers: { Accept: 'application/sparql-results+json', 'User-Agent': 'BluesMapRoutine/1.0 (educational)' } });
  const rows = (await r.json()).results.bindings;
  const srcs = new Set(db.map((m) => title(m.source)));
  const names = new Set(db.map((m) => m.name.toLowerCase()));
  const out = rows.filter((b) => {
    const g = b.genres.value, d = b.desc?.value || '';
    if (srcs.has(title(b.article.value)) || names.has(b.pLabel.value.toLowerCase())) return false;
    if (BANNED.test(g) || BANNED.test(d) || /^Q\d+$/.test(b.pLabel.value)) return false;
    return g !== 'blues' || /blues/i.test(d);
  }).map((b) => {
    const era = decade(+b.from?.value.slice(0, 4) || (+b.birth?.value.slice(0, 4) + 20 || 0));
    return { name: b.pLabel.value, url: b.article.value, desc: b.desc?.value || '', genres: b.genres.value, sl: +b.sl.value, era, awards: b.awards.value ? b.awards.value.split('|') : [] };
  });

  // Recognition: musicians linked from Wikipedia's blues award pages. Wikidata
  // rarely records these awards, so this is the main signal for contemporary artists.
  const byUrl = new Map(out.map((c) => [title(c.url), c]));
  for (const page of AWARD_PAGES) {
    for (const x of await linkedMusicians(page)) {
      const key = x.title.toLowerCase();
      if (srcs.has(key) || names.has(key) || BANNED.test(x.description || '') || /album|song|standard|band|group|label|festival|producer|executive/i.test(x.description || '')) continue;
      if (!byUrl.has(key)) byUrl.set(key, { name: x.title, url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(x.title.replace(/ /g, '_')), desc: x.description || '', genres: '?', sl: 0, era: decade(+(x.description || '').match(/\b(1[89]\d\d|20\d\d)\b/)?.[0] + 20 || 0), awards: [] });
      byUrl.get(key).awards.push(page);
    }
  }
  const scored = [...byUrl.values()]
    .map((c) => ({ ...c, score: c.sl + 10 * c.awards.length + (thin(c.era) ? 15 : 0) }))
    .sort((a, b) => b.score - a.score);
  console.log(`\nMissing candidates (${scored.length}), best first — still run "check" on each pick:`);
  for (const c of scored.slice(0, 100)) {
    console.log(`  ${String(c.score).padStart(3)}  ${c.name} | ${c.era ? c.era + 's' : 'era ?'}${thin(c.era) ? ' (thin)' : ''} | ${c.genres} | ${c.desc} | ${c.url}`);
    if (c.awards.length) console.log(`         recognition: ${c.awards.join('; ')}`);
  }
}

const [cmd, name, url] = process.argv.slice(2);
(cmd === 'check' ? check(name, url) : candidates()).catch((e) => { console.error(e); process.exit(2); });
