/**
 * Shared cue-phrase matching for the two text miners
 * (mine-influences-from-descriptions.js, mine-influences-from-wikipedia.js).
 *
 * A mention of another musician only becomes an influence edge when a cue
 * phrase in the same sentence, before the name, says which way it runs.
 */

// The mentioned musician influenced the subject.
export const ANCESTOR = [
  'influenced by', 'inspired by', 'influence of', 'in the tradition of',
  'protégé of', 'protege of', 'disciple of', 'student of', 'apprenticed to',
  'learned from', 'learned guitar from', 'learned to play from', 'learned his',
  'lessons from', 'took lessons from',
  'taught by', 'mentored by', 'studied with', 'studied under', 'tutored by',
  'in the style of', 'modeled on', 'modelled on', 'modeled after', 'patterned after',
  'idolized', 'idolised', 'drew on', 'drew heavily from', 'drawing on',
  'following in the footsteps of', 'echoing', 'covering',
  'after hearing', 'after he heard', 'after she heard', 'after they heard',
];
// The subject influenced the mentioned musician.
export const DESCENDANT = [
  'influenced', 'an influence on', 'influence on', 'inspired', 'mentored',
  'taught', 'mentor to', 'championed', 'echoed in the work of', 'echoed in',
  'paved the way for', 'passed his', 'handed down to',
];
// Not an influence at all — recognised so it is not mistaken for one.
export const COLLABORATION = [
  'recorded with', 'played with', 'performed with', 'toured with', 'worked with',
  'accompanied by', 'accompanied', 'backed by', 'backed', 'sideman', 'sideman for',
  'member of', 'joined', 'formed', 'duo with', 'partnership with', 'sat in with',
  'collaborated with', 'collaborations with', 'appeared with', 'billed with',
  'married to', 'brother of', 'sister of', 'son of', 'daughter of', 'father of',
];

export const norm = (s) => s.toLowerCase().replace(/[’']/g, "'");
const isLetter = (ch) => !!ch && /\p{L}/u.test(ch);

/**
 * The cue that binds to a name at `at`, or null: nearest cue ending before it.
 * A cue has to stand as its own word — without this, "self-taught musician"
 * reads as "taught" and files the lesson in the wrong direction.
 */
export function cueBefore(sentence, at, cues, window = 60) {
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
      if (gap >= 0 && gap <= window && (!best || gap < best.gap)) best = { cue, gap };
    }
  }
  return best;
}

/** 'ancestor' | 'descendant' | 'collaboration' | 'unclear', plus the cue that decided it. */
export function classify(sentence, at, window = 60) {
  // "influenced by" must win over "influenced", so ancestors are tested first
  // and a collaboration cue closer to the name beats a distant influence one.
  const a = cueBefore(sentence, at, ANCESTOR, window);
  const d = cueBefore(sentence, at, DESCENDANT, window);
  const c = cueBefore(sentence, at, COLLABORATION, window);
  const best = [
    a && { kind: 'ancestor', ...a },
    d && { kind: 'descendant', ...d },
    c && { kind: 'collaboration', ...c },
  ].filter(Boolean).sort((x, y) => x.gap - y.gap)[0];
  if (!best) return { kind: 'unclear', cue: null };

  const gapText = sentence.slice(at - best.gap, at);

  // A copula between the cue and the name means the name is the sentence's
  // predicate, not the cue's object: "a significant early influence ON
  // Toussaint WAS the piano style of Professor Longhair" runs the opposite
  // way to "an influence on Professor Longhair". Too tangled to call — let a
  // reader have it.
  if (/\b(was|were|is|are|became)\b/i.test(gapText)) return { kind: 'unclear', cue: null };

  // An object pronoun means the cue's object is already spoken for, and the
  // name further along is something else: "blueswomen who had inspired THEM,
  // such as Big Mama Thornton" reads backwards if Thornton is taken as the
  // one inspired.
  if (/\b(them|him|her|us|me|himself|herself|themselves)\b/i.test(gapText)) {
    return { kind: 'unclear', cue: null };
  }

  // The passive puts its object between the verb and the name: "taught guitar
  // BY Robert Johnson" runs the opposite way to "taught Robert Johnson", and a
  // bare verb cue cannot tell them apart. A standalone `by` settles it. Note
  // `from` does NOT: "influenced players FROM Otis Rush TO Eric Clapton" is a
  // range, and reading it as a passive reverses a true edge.
  if (best.kind === 'descendant' && /\bby\b/i.test(gapText)) {
    return { kind: 'ancestor', cue: `${best.cue} … by` };
  }
  return best;
}
