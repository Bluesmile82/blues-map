/**
 * Mine `influencedBy` out of the full Wikipedia article of each musician.
 *
 *   node mine-influences-from-wikipedia.js [--dry-run] [--verbose] [--limit N]
 *
 * The one-paragraph `description` in musicians.json is about 350 characters;
 * the article behind it averages nearly 7,000, and most of what it says about
 * who taught whom lives in that difference. Same cue matching as
 * mine-influences-from-descriptions.js (shared in influence-cues.js), with
 * extra guards, because full articles talk about people other than their
 * subject — mothers, sidemen, later imitators — and a cue sentence about
 * somebody else would otherwise be filed against the musician.
 *
 * Whole-article extracts cannot be batched: the API answers "exlimit was too
 * large for a whole article extracts request, lowered to 1". So it is one
 * request per musician, cached in .wikipedia-extracts.json (gitignored).
 */
import fs from 'fs';
import { classify, norm } from './influence-cues.js';

const DATA = './src/data/musicians.json';
const CACHE = './.wikipedia-extracts.json';
const REVIEW = './influence-candidates-wikipedia.md';
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php';
const UA = 'BluesMapETL/1.0 (influence enrichment; educational project)';
const DELAY_MS = 1200;
const MIN_NAME = 9;

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');
const limitArg = process.argv.indexOf('--limit');
const limit = limitArg === -1 ? Infinity : Number(process.argv[limitArg + 1]);

// A sentence whose subject is somebody else entirely. "Eddie's mother was a
// self-taught pianist in the style of Professor Longhair" is about his mother.
const THIRD_PARTY = /\b(mother|father|brother|sister|son|daughter|wife|husband|uncle|aunt|cousin|grandfather|grandmother|nephew|niece|widow)\b/i;
// Claims the article itself does not stand behind.
const HEDGE = /\b(may (well )?have|might have|is rumou?red|was rumou?red|allegedly|purportedly)\b/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** When this musician's career starts, for the chronology guard. */
function startYear(m) {
  for (const f of ['activeFrom', 'birthDate']) {
    const y = Number(String(m?.[f] ?? '').slice(0, 4));
    if (y) return f === 'birthDate' ? y + 18 : y;
  }
  return null;
}

function wikipediaTitle(source) {
  const m = /^https?:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)/.exec(source ?? '');
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : null;
}

/** The article's prose: headings dropped, back matter cut off. */
function prose(extract) {
  const cut = extract.search(/\n==+ ?(References|External links|Further reading|Bibliography|Discography|Sources|Notes|Awards|See also)\b/i);
  return (cut === -1 ? extract : extract.slice(0, cut))
    .split('\n')
    .filter((line) => !/^\s*=+.*=+\s*$/.test(line))
    .join('\n');
}

async function fetchExtract(title) {
  const url = `${WIKIPEDIA_API}?action=query&prop=extracts&explaintext=1&redirects=1&format=json` +
    `&titles=${encodeURIComponent(title)}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    const body = await res.text();
    // Over the rate limit the API answers with plain text, not JSON.
    if (res.ok && body.startsWith('{')) {
      const page = Object.values(JSON.parse(body).query?.pages ?? {})[0];
      return page?.extract ?? '';
    }
    if (attempt >= 4) return '';
    const wait = Math.max(DELAY_MS * 2 ** attempt, Number(res.headers.get('retry-after') ?? 0) * 1000);
    process.stdout.write(`\n  throttled, waiting ${Math.round(wait / 1000)}s\n`);
    await sleep(wait);
  }
}

const musicians = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
const byId = new Map(musicians.map((m) => [m.id, m]));
// Longest first: "Sonny Boy Williamson II" has to match before "Sonny Boy Williamson".
const names = musicians
  .filter((m) => m.name.length >= MIN_NAME && m.name.includes(' '))
  .map((m) => ({ name: m.name, id: m.id }))
  .sort((a, b) => b.name.length - a.name.length);

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf-8')) : {};
const targets = musicians
  .map((m) => ({ m, title: wikipediaTitle(m.source) }))
  .filter((x) => x.title)
  .slice(0, limit);
const uncached = targets.filter((x) => cache[x.title] === undefined);
console.log(`${targets.length} musicians with an article, ${uncached.length} to download`);

for (const [i, { title }] of uncached.entries()) {
  cache[title] = await fetchExtract(title);
  if (i % 25 === 0 || i === uncached.length - 1) fs.writeFileSync(CACHE, JSON.stringify(cache));
  process.stdout.write(`\r  fetched ${i + 1}/${uncached.length}`);
  await sleep(DELAY_MS);
}
if (uncached.length) { fs.writeFileSync(CACHE, JSON.stringify(cache)); process.stdout.write('\n'); }

let added = 0, already = 0, collab = 0, guarded = 0, unclear = 0, empty = 0;
const applied = [];
const review = [];

targets.forEach(({ m: subject, title }) => {
  const text = cache[title];
  if (!text) { empty++; return; }
  prose(text).split(/(?<=[.!?])\s+/).forEach((sentence) => {
    if (sentence.length > 600) return;   // a run-on list, usually a credits dump
    const claimed = [];
    let lastEnd = -1, lastKind = null, lastCue = null;
    names.forEach(({ name, id }) => {
      if (id === subject.id) return;
      const at = sentence.indexOf(name);
      if (at === -1) return;
      if (claimed.some(([s, e]) => at < e && at + name.length > s)) return;
      claimed.push([at, at + name.length]);

      // "Alan Lomax learned from Muddy Waters THAT Johnson had performed" is
      // reported speech, not tuition.
      if (/^\s*that\b/.test(sentence.slice(at + name.length))) { unclear++; return; }
      // "Watson discussed his influences and those he had influenced,
      // referencing Guitar Slim" points both ways at once.
      if (/\binfluences\b/i.test(sentence) && /\binfluenced\b/i.test(sentence)) { unclear++; return; }

      let { kind, cue } = classify(sentence, at);
      // "influenced by Johnny Winter, Jimi Hendrix and Albert King": only the
      // first name is near the cue, so carry the verdict along the list.
      if (kind === 'unclear' && lastKind && at > lastEnd &&
          /^[\s,;]*(and|&)?[\s,;]*$/i.test(sentence.slice(lastEnd, at))) {
        kind = lastKind; cue = `${lastCue} (list)`;
      }
      if (kind !== 'unclear') { lastEnd = at + name.length; lastKind = kind; lastCue = cue; }

      if (kind === 'collaboration') { collab++; return; }
      if (kind === 'unclear') { unclear++; return; }

      // Full articles discuss other people; only the subject's own sentences count.
      const reason = THIRD_PARTY.test(sentence) ? 'third party in sentence'
        : HEDGE.test(sentence) ? 'hedged claim' : null;
      if (reason) {
        guarded++;
        review.push(`- **${subject.name}** ~ ${name} — _${reason}_\n  > ${sentence.trim().replace(/\s+/g, ' ')}`);
        return;
      }

      const target = kind === 'ancestor' ? subject : byId.get(id);
      const source = kind === 'ancestor' ? id : subject.id;

      // An influence who only started a decade after the person they
      // influenced is either a reversed reading or a wrong activeFrom. Both
      // want a human, not an import.
      const ys = startYear(byId.get(source)), yt = startYear(target);
      if (ys && yt && ys > yt + 10) {
        guarded++;
        review.push(`- **${byId.get(source).name}** (${ys}) → **${target.name}** (${yt}) — ` +
          `_influencer starts 10+ years later_\n  > ${sentence.trim().replace(/\s+/g, ' ')}`);
        return;
      }

      target.influencedBy ??= [];
      const mirrored = (byId.get(source).influences ?? []).includes(target.id);
      if (target.influencedBy.includes(source) || mirrored) { already++; return; }
      target.influencedBy.push(source);
      added++;
      applied.push(`  + ${byId.get(source).name} → ${target.name}   [${cue}]`);
    });
  });
});

console.log(`\n${added} new edges, ${already} already recorded, ${collab} read as collaboration, ` +
  `${guarded} held back by a guard, ${unclear} mentions with no cue, ${empty} articles empty`);
(verbose ? applied : applied.slice(0, 40)).forEach((l) => console.log(l));
if (!verbose && applied.length > 40) console.log(`  … ${applied.length - 40} more (--verbose)`);

if (dryRun) { console.log('\n--dry-run: nothing written'); process.exit(0); }
fs.writeFileSync(DATA, JSON.stringify(musicians, null, 2) + '\n');
fs.writeFileSync(REVIEW,
  `# Influence sentences a guard held back\n\n` +
  `Generated by \`mine-influences-from-wikipedia.js\`. Each sentence carries an\n` +
  `influence cue, but something about it says the edge may not belong to this\n` +
  `musician — a relative or third party in the same sentence, or a claim the\n` +
  `article hedges. Read and file by hand.\n\n${review.join('\n')}\n`);
console.log(`\nWrote ${DATA} and ${REVIEW} (${review.length} to review)`);
