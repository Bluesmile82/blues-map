Add up to EIGHT new blues musicians to src/data/musicians.json, all in ONE rolling pull request that collects every day's additions until the owner merges it. You are in a fresh checkout of the blues-map repo. Keep the change self-contained.

GOAL: add influential artists who are missing, mostly from the classic era (careers that started 1920–1969), and fill underpopulated styles. Do NOT add Jazz, British Blues, Soul Blues, Rhythm and Blues or Blues Rock artists. Quality over quantity: 4 good entries with images beat 8 obscure ones without. If fewer than 8 good candidates exist, add fewer.

0. GET ON THE ROLLING BRANCH
   Find the open rolling PR: gh pr list --state open --search "Daily blues musicians in:title" --json number,headRefName
   - If one exists: git fetch origin <headRefName> && git checkout <headRefName> && git merge origin/main. If the merge conflicts in musicians.json, keep both sides (every entry from main AND every entry from the branch), then check the JSON parses and nothing is duplicated (step 7). Commit the merge.
   - If none exists: git checkout -b claude/daily-musicians origin/main (the previous one was merged or closed; it's fine to replace the old remote branch).
   If gh fails here, stop and report it. Don't fall back to a new PR.

1. SEE WHAT'S TAKEN AND WHAT'S MISSING
   Run: node scripts/daily-candidates.cjs
   It reads origin/main AND every open PR branch, so musicians in unmerged PRs count as taken. If it exits with "gh pr list failed", stop and report it: picking without that check creates duplicates. It prints:
   - style counts, fewest first. Pick mostly from the smallest styles that aren't marked "do not add". Contemporary Blues is a catch-all, not a target, even though it looks small.
   - era counts by the decade each career started. Decades marked "(priority)" are 1920–1969, the classic recorded era.
   - scored missing candidates, best first. Score = number of Wikipedia language editions (international reach) + 10 for each recognition source + 15 if their career started in a priority era. The "recognition:" line shows the sources: Blues Hall of Fame, Blues Music Awards, the blues Grammys, the Blanco y Negro Blues podcast (https://blancoynegroblues.blogspot.com, artists tagged on its episodes), or the pre-war candidate list (new-musicians.md). Podcast and pre-war list artists were picked by the repo owner, so prefer them: include at least one of each per run while any remain.
   ERA MIX: every pick but one must have started their career before 1970. At most ONE artist per run whose career started in 1970 or later, and only one with a Blues Music Award, a blues Grammy or a Blues Hall of Fame induction. If no such artist fits, add none from that era. Skip non-performers (label owners, producers), non-blues artists (country, pop, rock and roll, desert blues) and anyone in a banned style. Use the score to rank, not as a verdict.
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

8. PR: on the branch from step 0, commit ONLY src/data/musicians.json ("data: add <names>").
   - Rolling PR already open: git push, then append to its body (gh pr view <number> --json body, then gh pr edit <number> --body ...): a "### <today>" heading followed by one bullet per new musician linking to <netlify-preview-url>/map/<id>. Keep the earlier days' sections.
   - No open PR: git push --force -u origin claude/daily-musicians, then gh pr create to main with title "Daily blues musicians" and the same body format ("### <today>" + bullets).
   Nothing else in the body. Don't request a Copilot review. Never open a second PR.
   If you resolved merge conflicts in step 0, re-run step 2's check for every musician in the PR, not just today's, and confirm none were lost or duplicated.

If nothing new passes the checks, don't commit or push. Report that no artist was added.

FINAL REPORT: list the added ids with their style, era and recognition, the ids added without an image, and the rolling PR's URL with its total musician count.
