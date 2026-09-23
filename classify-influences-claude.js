/**
 * Read the influence passages of each Wikipedia article with Claude and return
 * structured edges — the pass that cue matching cannot do, because deciding
 * *whose* sentence it is needs reading, not pattern matching.
 *
 *   ANTHROPIC_API_KEY=sk-ant-... node classify-influences-claude.js [options]
 *
 * Options:
 *   --dry-run          print the edges, write nothing
 *   --offline          never call the API: classify with whatever answers are
 *                      already cached, which lets a Claude session fill the
 *                      cache by hand (see --dump-prompts)
 *   --dump-prompts F   write the prompts as JSON to F and exit (no API call)
 *   --sample-prompt    print the prompt for one musician and exit (no API call)
 *   --limit N          only the first N musicians
 *   --model NAME       default claude-sonnet-5; claude-haiku-4-5-20251001 is cheaper
 *   --verbose          list every edge, and why each rejection was rejected
 *
 * It reads the article cache that mine-influences-from-wikipedia.js builds
 * (.wikipedia-extracts.json), so run that first. Answers are cached per
 * musician in .claude-influences.json, so an interrupted run resumes free.
 *
 * Nothing Claude returns is trusted on its own: an edge is applied only when
 * both ids are on the map, the quote it cites is really in the article, and
 * the chronology is not absurd. Everything else goes to a review file.
 */
import fs from 'fs';

const API_KEY = process.env.ANTHROPIC_API_KEY;
const DATA = './src/data/musicians.json';
const EXTRACTS = './.wikipedia-extracts.json';
const CACHE = './.claude-influences.json';
const REVIEW = './influence-candidates-claude.md';
const API_URL = 'https://api.anthropic.com/v1/messages';
const DELAY_MS = 400;
const MAX_PASSAGE_CHARS = 9000;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const offline = args.includes('--offline');
const dumpPrompts = args.includes('--dump-prompts') ? args[args.indexOf('--dump-prompts') + 1] : null;
const samplePrompt = args.includes('--sample-prompt');
const verbose = args.includes('--verbose');
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const MODEL = args.includes('--model') ? args[args.indexOf('--model') + 1] : 'claude-sonnet-5';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const musicians = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
const byId = new Map(musicians.map((m) => [m.id, m]));
if (!fs.existsSync(EXTRACTS)) {
  console.error(`No ${EXTRACTS}. Run mine-influences-from-wikipedia.js first — it downloads the articles.`);
  process.exit(1);
}
const extracts = JSON.parse(fs.readFileSync(EXTRACTS, 'utf-8'));

function wikipediaTitle(source) {
  const m = /^https?:\/\/en\.wikipedia\.org\/wiki\/([^#?]+)/.exec(source ?? '');
  return m ? decodeURIComponent(m[1]).replace(/_/g, ' ') : null;
}

const INFLUENCE_WORD = /\b(influen\w*|inspir\w*|taught|teacher|mentor\w*|protégé|protege|learn\w*|studied|idoliz\w*|idolis\w*|imitat\w*|style of)\b/i;
const names = musicians
  .filter((m) => m.name.length >= 6 && m.name.includes(' '))
  .map((m) => ({ name: m.name, id: m.id }))
  .sort((a, b) => b.name.length - a.name.length);

/**
 * Only the sentences worth paying for: one that mentions another musician on
 * the map AND talks about influence, plus its neighbour for context.
 */
function passages(text, subjectId) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const keep = new Set();
  const present = new Set();
  sentences.forEach((s, i) => {
    const hit = names.filter(({ name, id }) => id !== subjectId && s.includes(name));
    if (!hit.length) return;
    // The influence word may sit in the sentence before or after the name:
    // "He idolised one man above all. That man was Muddy Waters."
    const near = [sentences[i - 1], s, sentences[i + 1]].filter(Boolean);
    if (!near.some((n) => INFLUENCE_WORD.test(n))) return;
    hit.forEach(({ id }) => present.add(id));
    if (i > 0) keep.add(i - 1);
    keep.add(i);
    if (i + 1 < sentences.length) keep.add(i + 1);
  });
  const text2 = [...keep].sort((a, b) => a - b)
    .map((i) => sentences[i].trim().replace(/\s+/g, ' '))
    .join(' ');
  return { text: text2.slice(0, MAX_PASSAGE_CHARS), present: [...present] };
}

function buildPrompt(subject, { text, present }) {
  const roster = present.map((id) => `- ${byId.get(id).name} (id: ${id})`).join('\n');
  return `Below are passages from the English Wikipedia article about ${subject.name} (id: ${subject.id}).

Identify every MUSICAL INFLUENCE relationship they state between ${subject.name} and any musician in this list:

${roster}

Rules:
- Only relationships the passages actually state. Do not use your own knowledge of blues history.
- An influence is one musician shaping another's music: teaching, mentoring, being learned from, being imitated, being cited as an inspiration. Playing together, recording together, being related, or covering a song is NOT an influence.
- Get the direction right. Read who is doing the influencing.
- If a sentence is about a third person (a relative, a bandmate, a producer) rather than about ${subject.name} or the listed musician, skip it.
- If the article hedges ("may have", "reportedly", "some say"), skip it.
- Skip anything you are not confident about. Returning nothing is a correct answer.

Reply with ONLY a JSON array, no prose, no code fence:
[{"influencer_id": "...", "influenced_id": "...", "quote": "the exact sentence from the passages that states it"}]

One of the two ids must be ${subject.id}. The quote must be copied verbatim from the passages.

PASSAGES:
${text}`;
}

async function askClaude(prompt) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        text: data.content?.find((b) => b.type === 'text')?.text ?? '',
        usage: data.usage ?? {},
      };
    }
    const body = await res.text();
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) {
      throw new Error(`Claude API ${res.status}: ${body.slice(0, 300)}`);
    }
    const wait = Math.max(1000 * 2 ** attempt, Number(res.headers.get('retry-after') ?? 0) * 1000);
    console.log(`\n  API ${res.status}, retrying in ${Math.round(wait / 1000)}s`);
    await sleep(wait);
  }
}

function parseEdges(text) {
  const body = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  const start = body.indexOf('[');
  if (start === -1) return [];
  try {
    const parsed = JSON.parse(body.slice(start, body.lastIndexOf(']') + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const startYear = (m) => {
  for (const f of ['activeFrom', 'birthDate']) {
    const y = Number(String(m?.[f] ?? '').slice(0, 4));
    if (y) return f === 'birthDate' ? y + 18 : y;
  }
  return null;
};

// ─── run ─────────────────────────────────────────────────────────────────────

const targets = musicians
  .map((m) => ({ m, title: wikipediaTitle(m.source) }))
  .filter((x) => x.title && extracts[x.title])
  .map((x) => ({ ...x, p: passages(extracts[x.title], x.m.id) }))
  .filter((x) => x.p.present.length)
  .slice(0, limit);

if (samplePrompt) {
  const pick = targets.find((t) => t.p.present.length > 2) ?? targets[0];
  console.log(buildPrompt(pick.m, pick.p));
  console.log(`\n--- ${targets.length} musicians have passages worth sending; ` +
    `avg ${Math.round(targets.reduce((n, t) => n + t.p.text.length, 0) / targets.length)} chars each`);
  process.exit(0);
}

if (dumpPrompts) {
  fs.writeFileSync(dumpPrompts, JSON.stringify(
    targets.map(({ m, p }) => ({ id: m.id, name: m.name, candidates: p.present, passages: p.text })), null, 2));
  console.log(`Wrote ${targets.length} prompts to ${dumpPrompts}`);
  process.exit(0);
}

if (!API_KEY && !offline) {
  console.error('\nANTHROPIC_API_KEY is required, or pass --offline to use only cached answers.');
  console.error('--sample-prompt and --dump-prompts need no key.\n');
  process.exit(1);
}

const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf-8')) : {};
let inTok = 0, outTok = 0, asked = 0;

let missing = 0;
for (const [i, { m, p }] of targets.entries()) {
  if (cache[m.id] === undefined && offline) { missing++; continue; }
  if (cache[m.id] === undefined) {
    const { text, usage } = await askClaude(buildPrompt(m, p));
    cache[m.id] = parseEdges(text);
    inTok += usage.input_tokens ?? 0;
    outTok += usage.output_tokens ?? 0;
    asked++;
    if (asked % 20 === 0) fs.writeFileSync(CACHE, JSON.stringify(cache));
    await sleep(DELAY_MS);
  }
  if (i % 25 === 0 || i === targets.length - 1) {
    process.stdout.write(`\r  ${i + 1}/${targets.length} (${asked} asked)`);
  }
}
if (!offline) fs.writeFileSync(CACHE, JSON.stringify(cache));
process.stdout.write('\n');
if (missing) console.log(`  ${missing} of ${targets.length} have no cached answer and were skipped (--offline)`);

let added = 0, already = 0, rejected = 0;
const applied = [];
const review = [];
const reject = (why, e, subject) => {
  rejected++;
  if (verbose) console.log(`  – ${why}: ${e.influencer_id} → ${e.influenced_id} (${subject.name})`);
  review.push(`- **${subject.name}** — _${why}_\n  > ${(e.quote ?? '').slice(0, 300)}`);
};

for (const { m: subject, p } of targets) {
  const text = p.text;
  for (const e of cache[subject.id] ?? []) {
    const src = byId.get(e.influencer_id), tgt = byId.get(e.influenced_id);
    if (!src || !tgt) { reject('unknown id', e, subject); continue; }
    if (src.id === tgt.id) { reject('self edge', e, subject); continue; }
    if (src.id !== subject.id && tgt.id !== subject.id) { reject('neither end is the subject', e, subject); continue; }
    // The quote has to be in the article — this is the check against invention.
    const quote = (e.quote ?? '').trim().replace(/\s+/g, ' ');
    if (quote.length < 20 || !text.includes(quote.slice(0, 60))) {
      reject('quote not found in the passages', e, subject); continue;
    }
    const ys = startYear(src), yt = startYear(tgt);
    if (ys && yt && ys > yt + 10) { reject(`influencer starts ${ys - yt}y later`, e, subject); continue; }

    tgt.influencedBy ??= [];
    const mirrored = (src.influences ?? []).includes(tgt.id);
    if (tgt.influencedBy.includes(src.id) || mirrored) { already++; continue; }
    tgt.influencedBy.push(src.id);
    added++;
    applied.push(`  + ${src.name} → ${tgt.name}\n      "${quote.slice(0, 140)}"`);
  }
}

const cost = (inTok / 1e6) * 3 + (outTok / 1e6) * 15;   // Sonnet list price
console.log(`\n${added} new edges, ${already} already recorded, ${rejected} rejected`);
if (asked) console.log(`${asked} articles sent — ${inTok} input, ${outTok} output tokens (~$${cost.toFixed(2)} at Sonnet rates)`);
(verbose ? applied : applied.slice(0, 30)).forEach((l) => console.log(l));
if (!verbose && applied.length > 30) console.log(`  … ${applied.length - 30} more (--verbose)`);

if (dryRun) { console.log('\n--dry-run: nothing written'); process.exit(0); }
fs.writeFileSync(DATA, JSON.stringify(musicians, null, 2) + '\n');
fs.writeFileSync(REVIEW,
  `# Edges Claude proposed that were rejected\n\n` +
  `Generated by \`classify-influences-claude.js\`. Each one failed a check —\n` +
  `an id that is not on the map, a quote that is not in the article, a\n` +
  `chronology that does not work. Worth reading: some are real relationships\n` +
  `stated in a way the checks could not confirm.\n\n${review.join('\n')}\n`);
console.log(`\nWrote ${DATA} and ${REVIEW} (${review.length} rejected)`);
