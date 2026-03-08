import fs from 'fs';
import readline from 'readline';

const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf-8'));

// Get incomplete musicians
const incomplete = musicians.filter(m => m.incomplete);

if (incomplete.length === 0) {
  console.log('\n✅ All musicians are complete! Great job!\n');
  process.exit(0);
}

console.log(`\n📝 There are ${incomplete.length} musicians needing data\n`);
console.log('You will be prompted to fill in data for each musician.');
console.log('Press Enter to skip a field, or type "skip" to skip this musician entirely.\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function processMusician(index) {
  if (index >= incomplete.length) {
    console.log('\n✅ All incomplete musicians processed!\n');
    rl.close();
    
    // Save all musicians
    fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
    
    const remaining = musicians.filter(m => m.incomplete).length;
    console.log(`📊 Remaining incomplete: ${remaining}`);
    console.log(`✅ Newly completed: ${incomplete.length - remaining}\n`);
    
    process.exit(0);
  }
  
  const musician = incomplete[index];
  const originalIndex = musicians.findIndex(m => m.id === musician.id);
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Musician ${index + 1} of ${incomplete.length}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n🎸 ${musician.name}`);
  console.log(`   ID: ${musician.id}\n`);
  
  // Show current data if any
  const currentData = [];
  if (musician.birthDate) currentData.push(`Born: ${musician.birthDate}`);
  if (musician.birthPlace) currentData.push(`Place: ${musician.birthPlace}`);
  if (musician.instrument) currentData.push(`Instrument: ${musician.instrument}`);
  if (musician.bluesStyle) currentData.push(`Style: ${musician.bluesStyle}`);
  
  if (currentData.length > 0) {
    console.log(`Current data: ${currentData.join(' | ')}\n`);
  }
  
  const skip = await askQuestion('Press Enter to continue, or type "skip" to skip this musician: ');
  
  if (skip.toLowerCase() === 'skip') {
    console.log(`⏭️  Skipping ${musician.name}\n`);
    return processMusician(index + 1);
  }
  
  // Collect data
  console.log('\n📝 Enter information (press Enter to skip a field):\n');
  
  const birthDate = await askQuestion('Birth date (YYYY-MM-DD): ');
  if (birthDate.trim()) musicians[originalIndex].birthDate = birthDate.trim();
  
  const birthPlace = await askQuestion('Birth place (City, State): ');
  if (birthPlace.trim()) musicians[originalIndex].birthPlace = birthPlace.trim();
  
  const birthCoords = await askQuestion('Birth coordinates (longitude,latitude): ');
  if (birthCoords.trim()) {
    const [lng, lat] = birthCoords.trim().split(',').map(s => parseFloat(s.trim()));
    if (!isNaN(lng) && !isNaN(lat)) {
      musicians[originalIndex].birthCoords = [lng, lat];
    }
  }
  
  const deathDate = await askQuestion('Death date (YYYY-MM-DD, or press Enter if alive): ');
  if (deathDate.trim()) {
    musicians[originalIndex].deathDate = deathDate.trim();
  } else {
    musicians[originalIndex].deathDate = null;
  }
  
  const deathPlace = await askQuestion('Death place (City, State, or press Enter if alive): ');
  if (deathPlace.trim()) {
    musicians[originalIndex].deathPlace = deathPlace.trim();
  } else {
    musicians[originalIndex].deathPlace = null;
  }
  
  const instrument = await askQuestion('Instrument(s): ');
  if (instrument.trim()) musicians[originalIndex].instrument = instrument.trim();
  
  const bluesStyle = await askQuestion('Blues style: ');
  if (bluesStyle.trim()) musicians[originalIndex].bluesStyle = bluesStyle.trim();
  
  const activeFrom = await askQuestion('Active from (year): ');
  if (activeFrom.trim()) musicians[originalIndex].activeFrom = activeFrom.trim();
  
  const description = await askQuestion('Short description: ');
  if (description.trim()) musicians[originalIndex].description = description.trim();
  
  // Check if now complete
  const hasBasicData = 
    musicians[originalIndex].birthDate && 
    musicians[originalIndex].birthDate !== '' && 
    musicians[originalIndex].birthPlace && 
    musicians[originalIndex].birthPlace !== '' &&
    musicians[originalIndex].birthCoords[0] !== 0;
  
  musicians[originalIndex].incomplete = !hasBasicData;
  
  // Save progress after each musician
  fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
  
  if (!musicians[originalIndex].incomplete) {
    console.log(`\n✅ ${musician.name} marked as COMPLETE!\n`);
  } else {
    console.log(`\n⚠️  ${musician.name} still needs more data\n`);
  }
  
  // Small pause
  await new Promise(resolve => setTimeout(resolve, 500));
  
  return processMusician(index + 1);
}

// Start processing
processMusician(0);