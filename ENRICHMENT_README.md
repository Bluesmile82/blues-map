# Blues Musicians Data Enrichment Tool

This tool automatically enriches the `musicians.json` file with data from Wikidata and Wikipedia APIs.

## Features

- ✅ **Birth/Death Coordinates**: Fetches precise geographic coordinates from Wikidata
- ✅ **Album Information**: Retrieves album discography from Wikidata
- ✅ **Images**: Gets musician photos from Wikipedia/Wikimedia Commons
- ✅ **Descriptions**: Pulles biographical descriptions
- ✅ **Instrument & Style**: Extracts primary instruments and musical genres
- ✅ **Progressive Saving**: Saves every 10 musicians, safe to interrupt
- ✅ **Rate Limiting**: Built-in delays to respect API limits

## Usage

### Quick Start

```bash
npm run enrich
```

This will:
1. Load all musicians from `src/data/musicians.json`
2. Process each musician sequentially
3. Fetch missing data from Wikidata/Wikipedia
4. Save progress every 10 musicians
5. Update the JSON file with enriched data

### What Gets Enriched

For musicians with missing/empty data:

| Field | Source |
|-------|--------|
| Birth coordinates | Wikidata P625 (coordinate location) |
| Death coordinates | Wikidata P625 (coordinate location) |
| Birth place | Wikidata P19 (place of birth) |
| Death place | Wikidata P20 (place of death) |
| Birth date | Wikidata P569 (date of birth) |
| Death date | Wikidata P570 (date of death) |
| Image | Wikipedia API & Wikidata P18 |
| Albums | Wikidata P658 (album) |
| Instrument | Wikidata P1303 (instrument) |
| Blues style | Wikidata P136 (genre) |
| Description | Wikidata entity description |

## API Endpoints Used

1. **Wikidata Query Service** (SPARQL)
   - `https://query.wikidata.org/sparql`
   
2. **Wikidata API**
   - `https://www.wikidata.org/w/api.php`
   
3. **Wikipedia API**
   - `https://en.wikipedia.org/w/api.php`

## Rate Limiting

- **200ms delay** between requests
- Processes 1 musician every ~0.5-1 second
- For 411 musicians: ~3-7 minutes total

## Output Example

### Before
```json
{
  "id": "albert-ammons",
  "name": "Albert Ammons",
  "birthDate": "",
  "birthCoords": [0, 0]
}
```

### After
```json
{
  "id": "albert-ammons",
  "name": "Albert Ammons",
  "birthDate": "1907-04-23",
  "birthPlace": "Chicago, Illinois",
  "birthCoords": [-87.6298, 41.8781],
  "deathDate": "1949-12-02",
  "deathPlace": "Chicago, Illinois",
  "deathCoords": [-87.6298, 41.8781],
  "image": "https://commons.wikimedia.org/wiki/Special:FilePath/Albert%20Ammons.jpg?width=500",
  "instrument": "Piano",
  "bluesStyle": "Boogie woogie",
  "activeFrom": "1930",
  "albums": [
    { "name": "Boogie Woogie Stomp", "year": "1941" }
  ],
  "description": "American pianist and composer"
}
```

## Customization

### Adjust Batch Size

Edit `enrich-musicians-wikidata.js`:
```javascript
if ((i + 1) % 5 === 0) {  // Save every 5 instead of 10
  fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
}
```

### Change Delay

```javascript
const DELAY_MS = 500; // Slower, safer
```

### Process Specific Musicians

```javascript
// Filter musicians
const toProcess = musicians.filter(m => 
  m.name.startsWith('A') // Only A's
);
```

## Adding YouTube Integration

To add YouTube video search, create `.env`:

```bash
YOUTUBE_API_KEY=your_api_key_here
```

Then add the YouTube search function (requires API setup).

## Troubleshooting

### "No Wikidata entity found"
- The musician name might not match Wikidata exactly
- Try searching manually at https://wikidata.org

### Rate Limit Errors
- Increase `DELAY_MS` to 500 or 1000
- Wait a few minutes and restart (progress is saved)

### Missing Coordinates
- Not all Wikidata entities have coordinates
- Birth/death places might be missing from Wikidata

## Manual Data Entry

For musicians not found in Wikidata, you can manually add:

```json
{
  "id": "musician-id",
  "name": "Musician Name",
  "birthDate": "YYYY-MM-DD",
  "birthPlace": "City, State",
  "birthCoords": [longitude, latitude],
  "activeFrom": "YYYY",
  "influences": [],
  "influencedBy": []
}
```

## Wikidata Property Reference

| Property | Description |
|----------|-------------|
| P569 | Date of birth |
| P570 | Date of death |
| P19 | Place of birth |
| P20 | Place of death |
| P625 | Coordinate location |
| P18 | Image |
| P1303 | Instrument |
| P136 | Genre |
| P658 | Album |
| P2031 | Work period (start) |

## License

MIT - Use freely for your blues genealogy project!