import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const musiciansPath = path.resolve(__dirname, '../src/data/musicians.json');

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../dist')));

// API Routes
app.get('/api/musicians', (req, res) => {
  try {
    const musicians = JSON.parse(fs.readFileSync(musiciansPath, 'utf-8'));
    res.json(musicians);
  } catch (error) {
    console.error('Error reading musicians:', error);
    res.status(500).json({ error: 'Failed to read musicians' });
  }
});

app.put('/api/musicians', (req, res) => {
  try {
    const updatedMusician = req.body;
    
    // Read current musicians
    const musicians = JSON.parse(fs.readFileSync(musiciansPath, 'utf-8'));
    
    // Find and update the musician
    const index = musicians.findIndex(m => m.id === updatedMusician.id);
    if (index === -1) {
      return res.status(404).json({ error: 'Musician not found' });
    }
    
    musicians[index] = updatedMusician;
    
    // Write back to file
    fs.writeFileSync(musiciansPath, JSON.stringify(musicians, null, 2), 'utf-8');
    
    console.log(`✅ Updated musician: ${updatedMusician.name}`);
    res.json(updatedMusician);
  } catch (error) {
    console.error('Error saving musician:', error);
    res.status(500).json({ error: 'Failed to save musician' });
  }
});

app.post('/api/musicians', (req, res) => {
  try {
    const newMusician = req.body;
    
    if (!newMusician.id) {
      return res.status(400).json({ error: 'Musician ID is required' });
    }
    
    // Read current musicians
    const musicians = JSON.parse(fs.readFileSync(musiciansPath, 'utf-8'));
    
    // Check if musician already exists
    const exists = musicians.find(m => m.id === newMusician.id);
    if (exists) {
      return res.status(409).json({ error: 'Musician already exists' });
    }
    
    // Add new musician
    musicians.push(newMusician);
    
    // Write back to file
    fs.writeFileSync(musiciansPath, JSON.stringify(musicians, null, 2), 'utf-8');
    
    console.log(`✅ Created musician: ${newMusician.name}`);
    res.json(newMusician);
  } catch (error) {
    console.error('Error creating musician:', error);
    res.status(500).json({ error: 'Failed to create musician' });
  }
});

// Favorites API endpoints (dev only)
if (process.env.VITE_ENABLE_EDIT_MODE === 'true') {
  const FAVORITES_PATH = path.join(__dirname, '../data/favourites.json');

  // Helper to read favorites
  async function getFavorites() {
    try {
      const data = await fs.promises.readFile(FAVORITES_PATH, 'utf-8');
      return JSON.parse(data).favorites || [];
    } catch (error) {
      console.error('Error reading favorites:', error);
      return [];
    }
  }

  // Helper to write favorites
  async function saveFavorites(favorites) {
    await fs.promises.writeFile(FAVORITES_PATH, JSON.stringify({ favorites }, null, 2));
  }

  // GET /api/favorites - Get all favorite musician IDs
  app.get('/api/favorites', async (req, res) => {
    try {
      const favorites = await getFavorites();
      res.json({ favorites });
    } catch (error) {
      res.status(500).json({ error: 'Failed to read favorites' });
    }
  });

  // POST /api/favorites - Add a musician to favorites
  app.post('/api/favorites', async (req, res) => {
    try {
      const { musicianId } = req.body;
      if (!musicianId) {
        return res.status(400).json({ error: 'musicianId is required' });
      }
      const favorites = await getFavorites();
      if (!favorites.includes(musicianId)) {
        favorites.push(musicianId);
        await saveFavorites(favorites);
      }
      res.json({ favorites });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add favorite' });
    }
  });

  // DELETE /api/favorites/:id - Remove a musician from favorites
  app.delete('/api/favorites/:id', async (req, res) => {
    try {
      const { id } = req.params;
      let favorites = await getFavorites();
      favorites = favorites.filter(fav => fav !== id);
      await saveFavorites(favorites);
      res.json({ favorites });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove favorite' });
    }
  });

  console.log('✓ Favorites API endpoints enabled (dev mode)');
}

app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📁 Serving musicians from: ${musiciansPath}`);
});