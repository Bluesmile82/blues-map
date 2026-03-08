import fs from 'fs';
import readline from 'readline';

const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf-8'));

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function searchMusicians() {
  console.log('\n🔍 Search for a musician:');
  const searchTerm = await askQuestion('Enter name (or part of name): ');
  
  const matches = musicians.filter(m => 
    m.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  if (matches.length === 0) {
    console.log('\n❌ No musicians found. Try another search.\n');
    return null;
  }
  
  if (matches.length === 1) {
    return matches[0];
  }
  
  console.log(`\nFound ${matches.length} matches:\n`);
  matches.forEach((m, i) => {
    console.log(`${i + 1}. ${m.name} (${m.id})`);
  });
  
  const choice = await askQuestion('\nSelect musician (number): ');
  const index = parseInt(choice) - 1;
  
  if (index >= 0 && index < matches.length) {
    return matches[index];
  }
  
  console.log('\n❌ Invalid selection.\n');
  return null;
}

async function editField(musician, fieldName, currentValue, fieldType = 'text') {
  console.log(`\n📝 ${fieldName}`);
  console.log(`   Current: "${currentValue}"`);
  
  if (fieldType === 'array') {
    console.log(`   (Array with ${currentValue.length} items)`);
    const action = await askQuestion('   (v)iew, (e)dit, or (Enter) to skip: ');
    
    if (action.toLowerCase() === 'v') {
      console.log(`\n   Current items:`);
      currentValue.forEach((item, i) => {
        if (typeof item === 'object') {
          console.log(`   ${i + 1}. ${JSON.stringify(item)}`);
        } else {
          console.log(`   ${i + 1}. ${item}`);
        }
      });
      return await editField(musician, fieldName, currentValue, 'array');
    }
    
    if (action.toLowerCase() === 'e') {
      const newItem = await askQuestion('   Add new item (or press Enter to cancel): ');
      if (newItem.trim()) {
        currentValue.push(newItem.trim());
        console.log(`   ✅ Added: "${newItem.trim()}"`);
      }
      return currentValue;
    }
    
    return currentValue;
  }
  
  if (fieldType === 'object-array') {
    console.log(`   (Array with ${currentValue.length} objects)`);
    const action = await askQuestion('   (v)iew, (e)dit, or (Enter) to skip: ');
    
    if (action.toLowerCase() === 'v') {
      console.log(`\n   Current albums:`);
      currentValue.forEach((album, i) => {
        console.log(`   ${i + 1}. ${album.name}`);
        if (album.youtubeLink) {
          console.log(`      YouTube: ${album.youtubeLink}`);
        }
      });
      return await editField(musician, fieldName, currentValue, 'object-array');
    }
    
    if (action.toLowerCase() === 'e') {
      const name = await askQuestion('   Album name: ');
      const link = await askQuestion('   YouTube link (optional): ');
      
      if (name.trim()) {
        currentValue.push({
          name: name.trim(),
          youtubeLink: link.trim() || ''
        });
        console.log(`   ✅ Added album: "${name.trim()}"`);
      }
      return currentValue;
    }
    
    return currentValue;
  }
  
  if (fieldType === 'coords') {
    console.log(`   Format: [longitude, latitude]`);
    const newValue = await askQuestion('   New value (or press Enter to keep): ');
    if (newValue.trim()) {
      try {
        const coords = newValue.trim().split(',').map(s => parseFloat(s.trim()));
        if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
          return coords;
        }
        console.log('   ❌ Invalid format. Use: longitude, latitude');
      } catch (e) {
        console.log('   ❌ Invalid format. Use: longitude, latitude');
      }
    }
    return currentValue;
  }
  
  if (fieldType === 'toggle') {
    console.log(`   Current: ${currentValue ? '✅ true' : '❌ false'}`);
    const newValue = await askQuestion('   Toggle? (y/n, or Enter to keep): ');
    if (newValue.toLowerCase() === 'y') {
      return !currentValue;
    }
    return currentValue;
  }
  
  const newValue = await askQuestion('   New value (or press Enter to keep): ');
  if (newValue.trim()) {
    return newValue.trim();
  }
  
  return currentValue;
}

async function editMusician(musician) {
  const index = musicians.findIndex(m => m.id === musician.id);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`✏️  EDITING: ${musician.name}`);
  console.log(`   ID: ${musician.id}`);
  console.log(`${'='.repeat(70)}`);
  
  // Basic Info
  console.log('\n📋 BASIC INFO');
  musician.name = await editField(musician, 'Name', musician.name);
  
  // Dates
  console.log('\n📅 DATES & LOCATIONS');
  musician.birthDate = await editField(musician, 'Birth Date (YYYY-MM-DD)', musician.birthDate);
  musician.birthPlace = await editField(musician, 'Birth Place', musician.birthPlace);
  musician.birthCoords = await editField(musician, 'Birth Coordinates [lng, lat]', musician.birthCoords, 'coords');
  musician.deathDate = await editField(musician, 'Death Date (YYYY-MM-DD or null)', musician.deathDate);
  musician.deathPlace = await editField(musician, 'Death Place', musician.deathPlace);
  musician.deathCoords = await editField(musician, 'Death Coordinates [lng, lat]', musician.deathCoords, 'coords');
  
  // Active From
  musician.activeFrom = await editField(musician, 'Active From (year)', musician.activeFrom);
  
  // Image
  console.log('\n🖼️  IMAGE');
  musician.image = await editField(musician, 'Image URL', musician.image);
  
  // Music Info
  console.log('\n🎵 MUSIC INFO');
  musician.instrument = await editField(musician, 'Instrument(s)', musician.instrument);
  musician.bluesStyle = await editField(musician, 'Blues Style', musician.bluesStyle);
  musician.youtubeLink = await editField(musician, 'YouTube Link', musician.youtubeLink);
  
  // Albums
  console.log('\n💿 ALBUMS');
  musician.albums = await editField(musician, 'Albums', musician.albums || [], 'object-array');
  
  // Description
  console.log('\n📝 DESCRIPTION');
  musician.description = await editField(musician, 'Description', musician.description);
  
  // Spent Time Places
  console.log('\n📍 SPENT TIME PLACES');
  musician.spentTimePlaces = await editField(musician, 'Spent Time Places', musician.spentTimePlaces || [], 'array');
  
  // Influences
  console.log('\n🔗 INFLUENCES');
  musician.influences = await editField(musician, 'Influences (musician IDs)', musician.influences || [], 'array');
  musician.influencedBy = await editField(musician, 'Influenced By (musician IDs)', musician.influencedBy || [], 'array');
  
  // Status
  console.log('\n⚙️  STATUS');
  musician.incomplete = await editField(musician, 'Mark as Incomplete', musician.incomplete, 'toggle');
  
  // Update the musician in the array
  musicians[index] = musician;
  
  // Save
  fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
  
  console.log('\n✅ Changes saved!\n');
}

async function listAllMusicians() {
  console.log('\n📋 ALL MUSICIANS (grouped by status)\n');
  
  const complete = musicians.filter(m => !m.incomplete);
  const incomplete = musicians.filter(m => m.incomplete);
  
  console.log(`✅ COMPLETE (${complete.length}):`);
  complete.slice(0, 10).forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.name} (${m.id})`);
  });
  if (complete.length > 10) {
    console.log(`   ... and ${complete.length - 10} more`);
  }
  
  console.log(`\n⏳ INCOMPLETE (${incomplete.length}):`);
  incomplete.slice(0, 10).forEach((m, i) => {
    console.log(`   ${i + 1}. ${m.name} (${m.id})`);
  });
  if (incomplete.length > 10) {
    console.log(`   ... and ${incomplete.length - 10} more`);
  }
  
  console.log('');
}

async function editById() {
  const id = await askQuestion('Enter musician ID: ');
  const musician = musicians.find(m => m.id === id);
  
  if (!musician) {
    console.log('\n❌ Musician not found.\n');
    return false;
  }
  
  await editMusician(musician);
  return true;
}

async function showMainMenu() {
  while (true) {
    console.log(`\n${'='.repeat(70)}`);
    console.log('🎸 BLUES MUSICIANS - EDIT MODE');
    console.log(`${'='.repeat(70)}\n`);
    console.log('1. 🔍 Search and edit by name');
    console.log('2. 🆔 Edit by ID');
    console.log('3. 📋 List all musicians');
    console.log('4. ❌ Mark incomplete musicians');
    console.log('5. ✅ Show statistics');
    console.log('6. 🚪 Exit\n');
    
    const choice = await askQuestion('Select option (1-6): ');
    
    switch (choice.trim()) {
      case '1':
        const musician = await searchMusicians();
        if (musician) {
          await editMusician(musician);
        }
        break;
        
      case '2':
        await editById();
        break;
        
      case '3':
        await listAllMusicians();
        break;
        
      case '4':
        console.log('\n❌ Incomplete Musicians:\n');
        musicians.filter(m => m.incomplete).slice(0, 20).forEach((m, i) => {
          console.log(`${i + 1}. ${m.name} (${m.id})`);
        });
        console.log(`\n... and ${musicians.filter(m => m.incomplete).length - 20} more\n`);
        break;
        
      case '5':
        const complete = musicians.filter(m => !m.incomplete).length;
        const incomplete = musicians.filter(m => m.incomplete).length;
        console.log(`\n📊 STATISTICS:\n`);
        console.log(`   Total musicians: ${musicians.length}`);
        console.log(`   ✅ Complete: ${complete}`);
        console.log(`   ⏳ Incomplete: ${incomplete}\n`);
        break;
        
      case '6':
        console.log('\n👋 Goodbye!\n');
        rl.close();
        process.exit(0);
        
      default:
        console.log('\n❌ Invalid option. Please select 1-6.\n');
    }
  }
}

// Start the edit mode
showMainMenu();