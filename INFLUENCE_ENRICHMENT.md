# Influence enrichment

How to add `influences` links to `src/data/musicians.json` without hand-editing
them one at a time, and what to expect from each source.

## The fields, and which way they point

Two fields hold the influence graph, and **their names are the opposite of
what they hold**. This is the single thing to get right before touching them.

| Field | Actually holds | Evidence |
|---|---|---|
| `influences` | the musicians who influenced **this** one (ancestors) | of the edges where both years are known, 663 point back in time vs 155 forward |
| `influencedBy` | the musicians **this one** influenced (descendants) | 458 point forward vs 191 back — e.g. Albert King's `influencedBy` is Stevie Ray Vaughan |

`influences` is the authoritative one. The card view reads it for "Influenced
by" and derives "Influenced" by scanning every other musician's `influences`
for the current id — it never reads `influencedBy` at all
([CardView.tsx](src/components/CardView.tsx)). The tree view unions both when
scoring, so an edge recorded in either field still draws.

**So: write every new edge into the influenced musician's `influences`.** One
field, one direction. Don't add to `influencedBy`; 489 of its entries are
already mirrors of an `influences` edge, and growing it further just spreads
the same graph across two places.

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
   the influencer to the influenced musician's `influences`.

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

Nine such wrong URLs were fixed (Bessie Smith pointed at Lucille Bogan, Blind
John Davis at Blind Blake, Boyd Gilmore at Bobby Rush, and so on). Four
collisions remain and are expected:

- `Q832500` — twelve entries whose source is `List_of_blues_musicians`. They
  have no article of their own, so they can't be enriched this way.
- `Q2328240` — John Cephas and Phil Wiggins genuinely share the Cephas &
  Wiggins article.
- `Q709044` and `Q135815` — **duplicate entries**: Arthur Crudup appears twice
  (as `Arthur Crudup` and `Arthur "Big Boy" Crudup`) and so does Z.Z. Hill
  (`Z. Z. Hill` / `Z.Z. Hill`). These want merging, which is a data decision,
  not a script's.

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
  them apart. A standalone `by` or `from` between the cue and the name flips
  the direction.

`influence-candidates.md` is regenerated on every run and is the natural place
to work from by hand — the relationships in it are real, they just need a
reader to say which way they point.

## Other sources, ranked

1. **Wikidata P737** — done, see above. Free, structured, low yield.
2. **The descriptions already in `musicians.json`** — done, see above. 39
   edges auto-filed, 541 mentions left in `influence-candidates.md` for a
   reader.
3. **DBpedia `dbo:influencedBy`** — extracted from the Influences field that
   Wikipedia's musician infobox used to carry and has since dropped. Older
   dumps still hold it for pre-war artists whose current articles don't. Same
   shape of job as the Wikidata pass.
4. **AllMusic** — by far the best curated "Influenced By" / "Followers" lists
   for blues, but there's no API and scraping is against their terms. Use it
   by hand for the trunk-tier musicians, where the edges shape the tree most.
