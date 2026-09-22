# Influence enrichment

How to add influence links to `src/data/musicians.json` without hand-editing
them one at a time, and what to expect from each source.

## The fields, and which way they point

| Field | Holds |
|---|---|
| `influencedBy` | the musicians who influenced **this** one (ancestors) |
| `influences` | the musicians **this one** influenced (descendants) |

They used to hold the opposite of what they say — `influences` carried
ancestors — and every view compensated by labelling it "Influenced by". The
contents were swapped so the names are now literal; if you are reading an old
branch or a database row written before that, expect the reverse.

**Write a new edge into the influenced musician's `influencedBy`.** Either end
may record an edge and the views read both, so a mirrored entry in the other
musician's `influences` counts as already present and is not duplicated.

One caveat for the Supabase round trip: `db-import.js` and `db-export.js` map
these to `relationship_type` values `influences` / `influenced_by`, so rows
written to the database before the swap carry the old meaning. Run
`npm run db:import` once to push the corrected direction before exporting
from the database again.

## Wikidata (P737)

```bash
node enrich-influences-wikidata.js --dry-run   # report only, writes nothing
node enrich-influences-wikidata.js             # apply
node enrich-influences-wikidata.js --verbose   # also list unresolved names
```

What it does:

1. Turns each musician's `source` into an English Wikipedia title.
2. Resolves titles to Wikidata QIDs through the MediaWiki API, following
   redirects. Results are cached in `.wikidata-qids.json` (gitignored) — this
   is the slow, rate-limited half, so a second run skips it.
3. Asks Wikidata for [P737 "influenced by"](https://www.wikidata.org/wiki/Property:P737)
   in both directions, in batches of 200 QIDs.
4. Keeps a pair only when **both** ends are musicians on the map, then appends
   the influencer to the influenced musician's `influencedBy`.

### What it yielded (September 2026)

Modest. 797 of 846 musicians resolved to a Wikidata item, the query returned
294 P737 pairs, and after discarding pairs with one end off the map, **11 new
edges** survived — Henry Sloan → Charley Patton, Muddy Waters and Robert
Johnson and Elmore James → Rolling Stones, four singers → Aretha Franklin,
T-Bone Walker → Bobby Parker, Amos Milburn → Fats Domino.

Wikidata's P737 coverage for pre-war blues is thin, and most of what it does
have points outward at rock and pop musicians the map doesn't carry. Run it
again after adding musicians; don't expect it to fill the gap on its own.

The run also prints the names Wikidata cites as influences that **aren't on the
map**, most frequent first. That list is a reading of who to add next — though
it is noisy, because P737 is used heavily by editors of modern pop articles.

### Rate limits

Anonymous MediaWiki calls start returning 429 at roughly three per second, so
`DELAY_MS` is 1s and the script honours `Retry-After`. A full title resolution
takes about 5 minutes; the QID cache means you pay that once.

### When it refuses to import: QID collisions

If two musicians resolve to the same Wikidata item, the script skips that item
and names the clash, because at least one entry's `source` points at the wrong
article, and importing under it files one musician's influences against
another. That check caught a real bug on the first run: **Mary Johnson**'s
source was `/wiki/Robert_Johnson`, so the Rolling Stones' debt to Robert
Johnson was being written against a 1920s St. Louis singer.

Thirteen such wrong URLs were fixed (Bessie Smith pointed at Lucille Bogan,
Blind John Davis at Blind Blake, Boyd Gilmore at Bobby Rush, Eddie Taylor at
his son, and so on). The other collisions it surfaced are all now resolved
too: twelve entries sourced to `List_of_blues_musicians` were pointed at their
own articles (eleven had one; Chris Beard is at `Chris_Beard_(singer)`), and
the two duplicate entries — Arthur Crudup and Z.Z. Hill, each present twice
under different spellings — were merged.

820 of 844 musicians now resolve, and **one** collision remains, correctly:
John Cephas and Phil Wiggins genuinely share the Cephas & Wiggins article.

## The descriptions already in the file

```bash
node mine-influences-from-descriptions.js --dry-run    # report only
node mine-influences-from-descriptions.js              # apply + write the review list
```

383 entries name another musician on the map in their own prose. Naming is not
influencing, so a mention only becomes an edge when a **cue phrase in the same
sentence, before the name**, says which way it runs:

| Cue group | Example | Result |
|---|---|---|
| ancestor | "a protégé of Slim Harpo", "learned guitar from Blind Blake" | the named musician goes into the subject's `influences` |
| descendant | "influenced Robert Cray", "an influence on Eric Clapton" | the subject goes into the named musician's `influences` |
| collaboration | "recorded with", "toured with", "brother of" | recognised and skipped, so it is never read as influence |
| none | "alongside Meade Lux Lewis", "a cousin of Lightnin' Hopkins" | written to `influence-candidates.md` for a human |

The last run: **39 new edges**, 39 already recorded, 188 skipped as
collaboration, 541 left for review.

### Two traps the cue matching has to handle

Both of these produced backwards edges before they were fixed, so keep them in
mind if you add cues:

- **A cue inside a word.** "A self-taught musician, he received informal
  lessons from Sonny Boy Williamson I" matched `taught` and filed Arnold as
  Williamson's influence. Cues now have to stand as their own word, and a
  preceding hyphen disqualifies them.
- **The passive with its object in the middle.** "taught guitar **by** Robert
  Johnson" and "mentored in bottleneck slide **by** Blind Willie Johnson" run
  the opposite way to "taught Robert Johnson", and a bare verb cue cannot tell
  them apart. A standalone `by` between the cue and the name flips it.
  `from` does **not** — "influenced players **from** Otis Rush **to** Eric
  Clapton" is a range, and reading it as a passive reverses five true edges.
- **A copula between the cue and the name.** "a significant early influence on
  Toussaint **was** the piano style of Professor Longhair" puts the influencer
  in the predicate, so the name after the cue is not the cue's object. Those
  go to a reader rather than being guessed at.

`influence-candidates.md` is regenerated on every run and is the natural place
to work from by hand — the relationships in it are real, they just need a
reader to say which way they point.

## The full Wikipedia article

```bash
node mine-influences-from-wikipedia.js --dry-run          # report only
node mine-influences-from-wikipedia.js --limit 40         # try it on a few first
node mine-influences-from-wikipedia.js                    # apply + write the review list
```

The `description` field averages ~350 characters; the article behind it
averages ~6,700, and most of what Wikipedia says about who taught whom lives
in that difference. Same cue matching as the descriptions pass — both import
`influence-cues.js` — plus guards, because a full article talks about people
other than its subject.

**The last run: 144 new edges**, 138 already recorded, 910 read as
collaboration, 39 held back by a guard, 5,799 mentions with no cue at all.
That is nearly four times what the descriptions gave.

### One request per article

Whole-article extracts cannot be batched: ask for twenty and the API answers
*"exlimit was too large for a whole article extracts request, lowered to 1"*
and returns one. So it is 787 requests, about 40 minutes with the throttling,
cached in `.wikipedia-extracts.json` (gitignored, ~5 MB) so later runs are
instant.

### The guards, and why each one exists

Every one of these was added after watching it produce a wrong edge in a dry
run:

| Guard | The sentence that earned it |
|---|---|
| third party | "**Eddie's mother** was a self-taught pianist in the style of Professor Longhair" — about his mother |
| hedge | "Elvis Presley **may well have** seen Harris perform" |
| reported speech | "Alan Lomax **learned from** Muddy Waters **that** Johnson had performed…" — being told, not taught |
| both directions at once | "Watson discussed his **influences** and those he had **influenced**, referencing Guitar Slim" |
| chronology | an influencer whose career starts 10+ years *after* the person they supposedly influenced — caught Saffire "influencing" Big Mama Thornton, and Ike Turner "influencing" Pinetop Perkins |

The first four send the sentence to `influence-candidates-wikipedia.md` with
the reason attached. The chronology one is worth keeping even when it fires on
a true edge, because the other explanation is a wrong `activeFrom` — it found
both Sonny Boy Williamson II (listed 1959, recorded from 1941) and Black Ace
(listed 1960, recorded 1937) that way.

### Expected error rate

Spot-checking two samples of the applied edges by reading the source sentence,
roughly **one in twenty-five still points the wrong way** — usually a sentence
whose subject is neither the article's subject nor the named musician. The
chronology guard catches the worst of them. If that is too loose for a given
pass, read `--dry-run --verbose` output before applying.

## Claude reading the same articles

```bash
node classify-influences-claude.js --sample-prompt     # see what gets sent, no key needed
ANTHROPIC_API_KEY=sk-ant-... node classify-influences-claude.js --dry-run
ANTHROPIC_API_KEY=sk-ant-... node classify-influences-claude.js
```

Cue matching keeps getting one thing wrong that no pattern can fix: deciding
*whose* sentence it is. "Eddie's mother was a self-taught pianist in the style
of Professor Longhair" and "Alan Lomax learned from Muddy Waters that Johnson
had performed" both parse perfectly and mean something other than what the
matcher concludes. Reading fixes that, so this pass hands the passages to
Claude and asks for structured edges.

It reuses the article cache from the Wikipedia pass, so it downloads nothing.

### What gets sent

Not whole articles — only sentences that name another musician on the map with
an influence word in them or next to them, plus their neighbours for context.
**421 musicians qualify, averaging 812 characters each**, which is roughly
200k input tokens for the whole run: under a dollar at Sonnet rates, less with
`--model claude-haiku-4-5-20251001`. Answers are cached per musician in
`.claude-influences.json` (gitignored), so an interrupted run resumes free.

The prompt names the musicians actually present in the passages with their
ids, tells Claude to use only what the passages state rather than its own
knowledge of blues history, to skip third parties and hedges, and to return
`[]` when unsure.

### Nothing it returns is trusted on its own

Every proposed edge has to survive four checks, and the run's own test data
exercised all of them:

| Check | Catches |
|---|---|
| both ids on the map | `bob-dylan → alan-wilson` — not a musician this map carries |
| the quote is really in the passages | an invented sentence about Skip James that reads plausibly and is not in the article |
| one end is the article's subject | an edge between two other people mentioned in passing |
| chronology | an influencer whose career starts 10+ years later |

Rejections are written to `influence-candidates-claude.md` with the reason and
the quote, because some of them are real. The chronology check is the blunt
one: it rejects *"Al Wilson taught Son House how to play Son House"*, which is
true — Wilson taught House his own pre-war repertoire before House's comeback
— but reads as a 38-year inversion. A young musician teaching an elder their
own back catalogue is rare enough to be worth a human look rather than an
automatic pass.

### Running it

It needs `ANTHROPIC_API_KEY` in the environment; `--sample-prompt` works
without one and prints exactly what would be sent. Start with `--limit 20
--dry-run` and read the edges before letting it write.

## Other sources, ranked

1. **Wikidata P737** — done, see above. Free, structured, low yield.
2. **The descriptions already in `musicians.json`** — done. 39 edges
   auto-filed, ~540 mentions left in `influence-candidates.md` for a reader.
3. **The full Wikipedia articles** — done, see above, and the best yield of
   any automated source: 144 edges.
4. **Claude reading those same articles** — the script is written and checked;
   it needs an API key to run. Aimed at the errors cue matching cannot avoid.
5. **DBpedia** — tried, and it is a dead end for this dataset. See below.
6. **MusicBrainz** — probed and rejected *for influence*: Muddy Waters' artist
   relationships are band membership, parents, supporting musicians and
   tributes; Howlin' Wolf has exactly one `teacher` link; Robert Johnson has
   none. It is, however, the best source going for **`playedWith`**, which is
   the thinnest of the three relation fields.
7. **AllMusic** — by far the best curated "Influenced By" / "Followers" lists
   for blues, but there's no API and scraping is against their terms. Use it
   by hand for the trunk-tier musicians, where the edges shape the tree most.

## DBpedia — tried, and empty

```bash
node enrich-influences-dbpedia.js --dry-run
```

The idea was sound: DBpedia extracts influence triples from the Influences /
Influenced fields that Wikipedia's musician infobox used to carry and has
since dropped, so it might hold edges no longer stated anywhere else. It
doesn't, at least not for blues.

Querying `dbo:influencedBy`, `dbo:influenced`, `dbp:influencedBy` and
`dbp:influences` in both directions over all 825 resolvable resources returned
**3 pairs, none with both ends on the map**, and the few it did return are
junk extractions — a Colombian novelist cited as an influence on a blues
musician.

The properties themselves are still populated (5,732 `dbo:influencedBy` and
9,798 `dbp:influences` triples exist), but `dbr:Muddy_Waters` and
`dbr:Eric_Clapton` have none: what survives in the current snapshot is mostly
writers and philosophers, whose infoboxes kept the field. DBpedia regenerates
from current dumps, so the old musician values are simply gone.

The script is kept because it costs one run to check, and a future snapshot or
a historical dump could change the answer. Don't expect it to.
