Add up to EIGHT new blues musicians to src/data/musicians.json and open ONE pull request. You are in a fresh checkout of the blues-map repo. Keep the change self-contained.

GOAL: fill underpopulated styles and add influential artists who are missing. Do NOT add Jazz, British Blues, Soul Blues, Rhythm and Blues or Blues Rock artists. Quality over quantity: 4 good entries with images beat 8 obscure ones without. If fewer than 8 good candidates exist, add fewer.

1. SEE WHAT'S TAKEN AND WHAT'S MISSING
   Run: node scripts/daily-candidates.cjs
   It reads origin/main AND every open PR branch, so musicians in unmerged PRs count as taken. It prints:
   - style counts, fewest first. Pick mostly from the 6 smallest styles that aren't marked "do not add" (today: Kansas City, Detroit, Contemporary, Hill Country, Swamp, St. Louis).
   - era counts by the decade each career started. Decades marked "(thin)" are underrepresented (today: everything from the 1970s on).
   - scored missing candidates, best first. Score = number of Wikipedia language editions (international reach) + 10 for each blues award or Hall of Fame page that links to them + 15 if their era is thin. The "recognition:" line shows where they're linked from: Blues Hall of Fame, Blues Music Awards, the blues Grammys, International Blues Challenge.
   Mix the picks: at least half from thin eras and/or small styles. For artists active since 1970, recognition (a Blues Music Award, a blues Grammy, Hall of Fame induction, international touring or awards) is the main sign they belong; don't add contemporary artists who have none. Skip non-performers (label owners, producers), non-blues artists (country, pop, rock, desert blues) and anyone in a banned style. Use the score to rank, not as a verdict.
   You may also pick artists from your own knowledge of blues history: sidemen who mattered (e.g. Howlin' Wolf's guitarist Willie Johnson), regional scene leaders, zydeco/swamp pioneers. Every pick needs an English Wikipedia article.
   Prefer artists whose Wikipedia article has a photo. Check before you pick:
   https://en.wikipedia.org/w/api.php?action=query&titles=<Title>&prop=pageimages&format=json

2. CHECK EVERY PICK FOR DUPLICATES. You must do this for each one:
   node scripts/daily-candidates.cjs check "<Full Name>" "<Wikipedia URL>"
   - DUPLICATE (exit 1) → drop it.
   - REVIEW lines → read them. If any is the same person under another name (stage name vs birth name, "Blind"/"Big"/"Little" prefix, nickname, "II"), drop it.
   - Also make sure your own picks this run aren't the same person twice.

3. ADD A STUB for each pick (the array stays valid JSON, 2-space indented). id = name lowercased, spaces → hyphens, punctuation and quotes stripped ("B.B. King" → "bb-king").
   { id, name, image: "", image_source: null, birthDate: "", birthPlace: "", birthCoords: [0,0], deathDate: null, deathPlace: null, deathCoords: null, spentTimePlaces: [], instrument: "", bluesStyle: "<style>", youtubeLink: "", albums: [], description: "", activeFrom: "", influences: [], influencedBy: [], incomplete: true, playedWith: [], source: "<Wikipedia URL>", secondaryInstruments: [], createdAt: "<today YYYY-MM-DD>" }
   bluesStyle must be one of the values already in the file, spelled exactly the same: Country Blues, Delta Blues, Chicago Blues, Piedmont Blues, Memphis Blues, Texas Blues, West Coast Blues, Boogie Woogie, Classic Blues, Jump Blues, Swamp Blues, New Orleans Blues, Hill Country Blues, Detroit Blues, St. Louis Blues, Kansas City Blues, Contemporary Blues, Gospel. (Zydeco artists go under Swamp Blues.)

4. ENRICH: node enrich-musicians-v3.js --musician <id> for each pick. Check that it exits without errors and that `source` still holds the Wikipedia URL (put it back if it was cleared).

5. IMAGE. Required; do not skip this.
   If `image` is still empty after enriching, the lookups were probably rate-limited. Wait 30 s and try again in this order:
   a. Wikipedia pageimages for the article title (the original image URL, or the thumbnail at 500px).
   b. Wikidata P18 → https://commons.wikimedia.org/wiki/Special:FilePath/<file>?width=500
   c. Commons search: Category:<Name>, then intitle:"<Name>".
   Use only Wikimedia-hosted URLs (upload.wikimedia.org / commons.wikimedia.org). No third-party sites like alchetron or cloudfront: those links break. Set image_source to the file page URL. If nothing is found, leave it empty and list the artist under "No image" in your final report.

6. RELATIONSHIPS AND TEXT (required). Using the Wikipedia article and your knowledge:
   - description: 2–3 sentences on the artist's contribution to blues, if empty.
   - influences / influencedBy / playedWith: ids that ALREADY exist in the file. Search the ids for teachers, bandmates and session partners. Keep links reciprocal: if you add X to this artist's influencedBy, add this artist to X's influences (same for playedWith). Don't touch anything else.
   - youtubeLink and album youtubeLinks: only real watch URLs you're confident of, performed by the artist. No covers, tributes or AI videos.
   - incomplete: false once birthDate, birthPlace, birthCoords, description, instrument, bluesStyle, youtubeLink and at least one album are filled. A missing image doesn't make an entry incomplete.

7. CHECKS
   - node -e "JSON.parse(require('fs').readFileSync('src/data/musicians.json','utf8'));console.log('ok')"
   - npm test (it fails if createdAt is missing)
   - Run the duplicate check again for each added id. Open PRs may have changed while you worked.
   - git diff should show only the new blocks plus a few reciprocal-link lines.

8. PR: create branch daily-musicians-<today>, commit ONLY src/data/musicians.json ("data: add <names>"), push, then run gh pr create to main.
   Title: "Add blues musicians: <first 3 names>, and N more".
   Body: one bullet per musician linking to <netlify-preview-url>/map/<id>. Nothing else. Don't request a Copilot review.
   If you have to resolve merge conflicts with main, re-run step 2's check afterwards and confirm that none of your entries were lost or duplicated.

If nothing new passes the checks, don't open a PR. Report that no artist was added.

FINAL REPORT: list the added ids with their style, era and recognition, and the ids added without an image.
