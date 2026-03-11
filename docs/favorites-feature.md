# Favorites Feature

## Overview
The favorites feature allows marking musicians as favorites in local development mode.

## Usage

### Adding to Favorites
1. Open a musician's info panel
2. Click the "Add to Favorites" button (star icon)
3. The button changes to "Favorited" with filled star

### Filtering by Favorites
1. In the Influence view left panel, check "Show favorites only"
2. Only favorited musicians will be displayed
3. Uncheck to show all musicians

### Managing in Search
1. Search for any musician
2. Hover over the search result
3. Click the star icon to toggle favorite status

## Technical Details

- **Storage**: `data/favourites.json`
- **API**: `/api/favorites` (GET, POST, DELETE)
- **Environment**: Only enabled when `VITE_ENABLE_EDIT_MODE=true`
- **State**: Managed in App.tsx, passed to components via props

## Files Modified
- `server/server.js` - API endpoints
- `src/App.tsx` - State management
- `src/components/MusicianPanel.tsx` - Star toggle button
- `src/components/InfluenceView.tsx` - Filter checkbox and search stars
