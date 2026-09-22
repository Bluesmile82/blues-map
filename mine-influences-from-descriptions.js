/**
 * Mine `influencedBy` out of the descriptions already in musicians.json.
 *
 *   node mine-influences-from-descriptions.js [--dry-run] [--verbose]
 *
 * 383 entries name another musician on the map in their own prose, but naming
 * is not influencing: "recorded with", "was a protégé of" and "his sound
 * echoes in" are three different relationships. So a mention only becomes an
 * edge when a cue phrase in the same sentence says which way it runs, and
 * everything else is written to influence-candidates.md for a human to read.
 *
 * Direction follows the file's own convention: `influencedBy` holds the people
 * who influenced that musician. See INFLUENCE_ENRICHMENT.md.
 */
import fs from 'fs';

const DATA = './src/data/musicians.json';
const REVIEW = './influence-candidates.md';
const MIN_NAME = 9;      // shorter names ("Bo Carter") collide with ordinary prose
const WINDOW = 60;       // how far before a name a cue may sit and still bind to it

const dryRun = process.argv.includes('--dry-run');
const verbose = process.argv.includes('--verbose');

// The mentioned musician influenced the subject.
const ANCESTOR = [
  'influenced by', 'inspired by', 'influence of', 'in the tradition of',
  'protégé of', 'protege of', 'disciple of', 'student of', 'apprenticed to',
  'learned from', 'learned guitar from', 'learned to play from', 'learned his',
  'lessons from', 'took lessons from',
  'taught by', 'mentored by', 'studied with', 'studied under', 'tutored by',
  'in the style of', 'modeled on', 'modelled on', 'modeled after', 'patterned after',
  'idolized', 'idolised', 'drew on', 'drew heavily from', 'drawing on',
  'following in the footsteps of', 'echoing', 'covering', 'after hearing',
];
// The subject influenced the mentioned musician.
const DESCENDANT = [
  'influenced', 'an influence on', 'influence on', 'inspired', 'mentored',
  'taught', 'mentor to', 'championed', 'echoed in the work of', 'echoed in',
  'paved the way for', 'passed his', 'handed down to',
];
// Not an influence at all — recognised so it is not mistaken for one.
const COLLABORATION = [
  'recorded with', 'played with', 'performed with', 'toured with', 'worked with',
  'accompanied by', 'accompanied', 'backed by', 'backed', 'sideman', 'sideman for',
  'member of', 'joined', 'formed', 'duo with', 'partnership with', 'sat in with',
  'collaborated with', 'collaborations with', 'appeared with', 'billed with',
  'married to', 'brother of', 'sister of', 'son of', 'daughter of', 'father of',
];

const norm = (s) => s.toLowerCase().replace(/[’']/g, "'");

/**
 * The cue that binds to a name at `at`, or null: nearest cue ending before it.
 * A cue has to stand as its own word — without this, "self-taught musician"
 * reads as "taught" and files the lesson in the wrong direction.
 */
const isLetter = (ch) => !!ch && /\p{L}/u.test(ch);
function cueBefore(sentence, at, cues) {
  const hay = norm(sentence);
  let best = null;
  for (const cue of cues) {
    let from = 0;
    for (;;) {
      const i = hay.indexOf(norm(cue), from);
      if (i === -1 || i >= at) break;
      from = i + 1;
      const before = hay[i - 1];
      if (isLetter(before) || before === '-') continue;
      if (isLetter(hay[i + cue.length])) continue;
      const gap = at - (i + cue.length);
      if (gap >= 0 && gap <= WINDOW && (!best || gap < best.gap)) best = { cue, gap };
    }
  }
  return best;
}

function classify(sentence, at) {
  // "influenced by" must win over "influenced", so ancestors are tested first
  // and a collaboration cue closer to the name beats a distant influence one.
  const a = cueBefore(sentence, at, ANCESTOR);
  const d = cueBefore(sentence, at, DESCENDANT);
  const c = cueBefore(sentence, at, COLLABORATION);
  const best = [
    a && { kind: 'ancestor', ...a },
    d && { kind: 'descendant', ...d },
    c && { kind: 'collaboration', ...c },
  ].filter(Boolean).sort((x, y) => x.gap - y.gap)[0];
  if (!best) return { kind: 'unclear', cue: null };

  // The passive puts its object between the verb and the name: "taught guitar
  // BY Robert Johnson" and "mentored in slide FROM Blind Willie Johnson" run
  // the opposite way to "taught Robert Johnson", and a bare verb cue cannot
  // tell them apart. A standalone by/from in the gap settles it.
  const gapText = sentence.slice(at - best.gap, at);
  if (best.kind === 'descendant' && /\b(by|from)\b/i.test(gapText)) {
    return { kind: 'ancestor', cue: `${best.cue} … ${/\bby\b/i.test(gapText) ? 'by' : 'from'}` };
  }
  return best;
}

const musicians = JSON.parse(fs.readFileSync(DATA, 'utf-8'));
const byId = new Map(musicians.map((m) => [m.id, m]));

// Longest names first: "Sonny Boy Williamson II" must match before "Sonny Boy Williamson".
const names = musicians
  .filter((m) => m.name.length >= MIN_NAME && m.name.includes(' '))
  .map((m) => ({ name: m.name, id: m.id }))
  .sort((a, b) => b.name.length - a.name.length);

let added = 0, collab = 0, unclear = 0, already = 0;
const applied = [];
const review = [];

musicians.forEach((subject) => {
  const text = subject.description ?? '';
  if (!text) return;
  text.split(/(?<=[.!?])\s+/).forEach((sentence) => {
    const claimed = [];   // character spans already matched, so a longer name wins
    names.forEach(({ name, id }) => {
      if (id === subject.id) return;
      const at = sentence.indexOf(name);
      if (at === -1) return;
      if (claimed.some(([s, e]) => at < e && at + name.length > s)) return;
      claimed.push([at, at + name.length]);

      const { kind, cue } = classify(sentence, at);
      // ancestor: the named musician influenced the subject; descendant: the reverse.
      const target = kind === 'ancestor' ? subject : byId.get(id);
      const source = kind === 'ancestor' ? id : subject.id;

      if (kind === 'collaboration') { collab++; return; }
      if (kind === 'unclear') {
        unclear++;
        review.push(`- **${subject.name}** ~ ${name}\n  > ${sentence.trim()}`);
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

console.log(`${added} new edges, ${already} already recorded, ` +
  `${collab} read as collaboration, ${unclear} left for review`);
if (verbose) applied.forEach((l) => console.log(l));
else applied.slice(0, 25).forEach((l) => console.log(l));

if (dryRun) { console.log('\n--dry-run: nothing written'); process.exit(0); }

fs.writeFileSync(DATA, JSON.stringify(musicians, null, 2) + '\n');
fs.writeFileSync(REVIEW,
  `# Musician mentions with no cue phrase\n\n` +
  `Generated by \`mine-influences-from-descriptions.js\`. Each entry names another\n` +
  `musician on the map, but the sentence does not say how they are related, so no\n` +
  `edge was written. Read and file by hand.\n\n${review.join('\n')}\n`);
console.log(`\nWrote ${DATA} and ${REVIEW} (${review.length} to review)`);
