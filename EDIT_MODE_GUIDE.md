# Blues Genealogy - Edit Mode

## New Features Added! ✨

### 📝 Edit Mode in the UI
You can now edit musician information directly from the web interface!

## How to Use

### Start the Development Server with Backend

```bash
npm run dev:server
```

This will:
1. Start the Vite dev server (frontend)
2. Start the Express server (backend API)
3. Enable editing musicians directly in the browser

### Editing Musicians

1. **Toggle Edit Mode**
   - Click "Edit Mode" button in the top-right navbar
   - The button will highlight when active

2. **Click on a Musician**
   - In Edit Mode, clicking a musician opens the Edit Panel
   - In View Mode, clicking shows the Musician Panel

3. **Edit Information**
   You can edit:
   - ✅ **Basic Info**: Name, description
   - ✅ **Images**: Image URL
   - ✅ **Dates & Locations**: Birth/death dates, places, coordinates
   - ✅ **Music Info**: Instrument, blues style, YouTube link
   - ✅ **Albums**: Add/remove albums with YouTube links
   - ✅ **Spent Time Places**: Locations where they lived
   - ✅ **Influences**: Musician IDs they influenced/were influenced by
   - ✅ **Status**: Mark as complete/incomplete

4. **Save Changes**
   - Click "Save Changes" button
   - Changes are saved to `src/data/musicians.json`
   - Page automatically reloads to show updates

## Field-by-Field Guide

### Basic Info
- **Name**: Musician's full name
- **Description**: 1-2 sentence biography

### Images
- **Image URL**: Link to musician's photo (Wikipedia, Wikimedia Commons, etc.)
- Preview shows if image loads successfully

### Dates & Locations
- **Birth Date**: YYYY-MM-DD format
- **Birth Place**: City, State (or City, Country)
- **Birth Coordinates**: longitude,latitude (get from Google Maps)
- **Death Date**: YYYY-MM-DD or leave empty if still alive
- **Death Place**: City, State or leave empty if still alive
- **Death Coordinates**: longitude,latitude or leave empty
- **Active From**: Year they started performing

### Music Info
- **Instrument**: e.g., "Guitar, Vocals", "Piano"
- **Blues Style**: e.g., "Chicago Blues, Electric Blues"
- **YouTube Link**: Full YouTube URL for their music

### Albums
- **Album Name**: Name of the album
- **YouTube Link**: Optional YouTube link for the album
- Click "+ Add Album" to add new albums
- Click "Remove" to delete albums

### Spent Time Places
- **Place Name**: City, State
- **Coordinates**: longitude,latitude
- Important for showing where musicians lived and performed

### Influences
- Enter musician IDs separated by commas
- e.g., "muddy-waters, howlin-wolf, bb-king"
- Use the kebab-case ID (shown when you hover over musicians)

### Status
- **Mark as incomplete**: Hides musician from visualization
- Uncheck to show them in the tree view

## Getting Coordinates

1. Go to [Google Maps](https://maps.google.com)
2. Search for the location (e.g., "Houston, Texas")
3. Right-click on the exact location
4. Copy the coordinates
5. Paste as: longitude,latitude
   - Example: `-95.3698, 29.7604`

## Finding YouTube Links

1. Go to [YouTube](https://youtube.com)
2. Search for the musician or album
3. Click "Share" on the video
4. Copy the URL
5. Paste into the YouTube Link field

## Finding Images

Good sources for blues musician images:
- **Wikipedia**: Search "[Musician Name] blues" → Click image → Copy URL
- **Wikimedia Commons**: Many public domain blues photos
- **AllMusic**: Often has artist photos

## Workflow Example

### Complete Albert Collins (Already Done!)

1. Toggle Edit Mode
2. Click on Albert Collins
3. Add albums:
   - "The Cool Sound of Albert Collins (1965)" + YouTube link
   - "Ice Pickin' (1978)" + YouTube link
   - And 5 more albums...
4. Add spent time places:
   - Leona, Texas [birth]
   - Houston, Texas [career]
   - Palo Alto, California [later]
   - Las Vegas, Nevada [final]
5. Add influences:
   - "lightnin-hopkins, john-lee-hooker, t-bone-walker"
6. Uncheck "Mark as incomplete"
7. Save Changes
8. ✨ Albert Collins now appears in visualization!

## Developer Notes

### API Endpoint
- **PUT /api/musicians**: Updates a musician
- **GET /api/musicians**: Gets all musicians

### Server Structure
```
server/
  ├── server.js        # Express server with API
  └── (serves dist/)
```

### Data Flow
1. User edits in EditPanel component
2. Save sends PUT request to /api/musicians
3. Server updates src/data/musicians.json
4. Page reloads to show changes
5. InfluenceView re-renders with new data

## Keyboard Shortcuts (Coming Soon)

- Ctrl+E: Toggle edit mode
- Ctrl+S: Save changes (when editing)
- Esc: Close panel

## Tips

1. **Work in Batches**: Edit 5-10 musicians at a time
2. **Save Often**: Save after each musician (auto-saves to JSON)
3. **Use Wikipedia**: Great source for images, dates, places
4. **Check Coordinates**: Make sure coordinates match the place
5. **Add Albums**: Start with 3-5 most famous albums
6. **Link Influences**: Connect musicians who influenced each other

## Troubleshooting

### "Save failed" error
- Check that the server is running: `npm run server`
- Look at console for specific error messages

### Image not showing
- Verify the URL is correct
- Try opening the image URL in a new tab
- Use a different image source (Wikipedia, Wikimedia Commons)

### Coordinates not working
- Format must be: longitude,latitude
- Use negative numbers for US locations
- Get fresh coordinates from Google Maps

### Changes not appearing
- Refresh the page after saving
- Check browser console for errors
- Verify the JSON file was updated

## What's Next?

After you edit musicians:
1. They automatically appear in the visualization
2. Their influence connections show up
3. Their albums and links are clickable
4. Complete musicians display, incomplete ones hide

Happy editing! 🎸