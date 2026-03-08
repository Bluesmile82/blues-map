import fs from 'fs';
import readline from 'readline';

const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf-8'));

// Find musicians with questionable quality
const questionable = [];

for (const m of musicians) {
  if (!m.incomplete) {
    const issues = [];
    
    if (m.birthPlace && m.birthPlace.length < 8 && !m.birthPlace.includes(',')) {
      issues.push(`Birth place: "${m.birthPlace}" (missing state?)`);
    }
    
    if (m.instrument && m.instrument.length < 5) {
      issues.push(`Minimal instrument: "${m.instrument}"`);
    }
    
    if (m.bluesStyle && m.bluesStyle.length < 5) {
      issues.push(`Minimal style: "${m.bluesStyle}"`);
    }
    
    if (m.description && m.description.length < 25) {
      issues.push(`Minimal description: "${m.description}"`);
    }
    
    if ((!m.albums || m.albums.length === 0) && m.activeFrom && parseInt(m.activeFrom) < 1980) {
      issues.push('No albums (pre-1980 musician)');
    }
    
    if (issues.length > 0) {
      questionable.push(m);
    }
  }
}

if (questionable.length === 0) {
  console.log('\n✅ No questionable data quality found!\n');
  process.exit(0);
}

console.log(`\n${'='.repeat(70)}`);
console.log(`FOUND ${questionable.length} MUSICIANS WITH QUESTIONABLE DATA`);
console.log(`${'='.repeat(70)}\n`);
console.log('You will review each one and decide:\n');
console.log('  y = Mark as INCOMPLETE (hide from visualization)');
console.log('  n = Keep as COMPLETE (show in visualization)');
console.log('  q = Quit and save any changes made\n');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function reviewMusician(index) {
  if (index >= questionable.length) {
    console.log('\n✅ Review complete!\n');
    
    // Save changes
    fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
    
    const complete = musicians.filter(m => !m.incomplete).length;
    const incomplete = musicians.filter(m => m.incomplete).length;
    
    console.log(`📊 Updated Statistics:`);
    console.log(`   Complete musicians: ${complete}`);
    console.log(`   Incomplete musicians: ${incomplete}\n`);
    
    rl.close();
    process.exit(0);
  }
  
  const m = questionable[index];
  const musicianIndex = musicians.findIndex(mus => mus.id === m.id);
  
  console.log(`${'='.repeat(70)}`);
  console.log(`Musician ${index + 1} of ${questionable.length}`);
  console.log(`${'='.repeat(70)}\n`);
  
  console.log(`🎸 ${m.name}`);
  console.log(`   ID: ${m.id}\n`);
  
  // Show current data
  console.log(`Current Data:`);
  console.log(`   Birth: ${m.birthDate} in ${m.birthPlace}`);
  console.log(`   Death: ${m.deathDate || 'Still alive'}`);
  console.log(`   Instrument: ${m.instrument || 'None'}`);
  console.log(`   Style: ${m.bluesStyle || 'None'}`);
  console.log(`   Description: ${m.description || 'None'}`);
  console.log(`   Albums: ${m.albums?.length || 0}\n`);
  
  // Show issues
  const issues = [];
  
  if (m.birthPlace && m.birthPlace.length < 8 && !m.birthPlace.includes(',')) {
    issues.push(`  ⚠️  Birth place too short: "${m.birthPlace}" (should include state)`);
  }
  
  if (m.instrument && m.instrument.length < 5) {
    issues.push(`  ⚠️  Minimal instrument: "${m.instrument}"`);
  }
  
  if (m.bluesStyle && m.bluesStyle.length < 5) {
    issues.push(`  ⚠️  Minimal style: "${m.bluesStyle}"`);
  }
  
  if (m.description && m.description.length < 25) {
    issues.push(`  ⚠️  Minimal description: "${m.description}"`);
  }
  
  if ((!m.albums || m.albums.length === 0) && m.activeFrom && parseInt(m.activeFrom) < 1980) {
    issues.push(`  ⚠️  No albums (pre-1980 musician should have some)`);
  }
  
  if (issues.length > 0) {
    console.log(`Issues:`);
    issues.forEach(issue => console.log(issue));
    console.log('');
  }
  
  const answer = await askQuestion('Mark as incomplete? (y/n/q, or skip to keep): ');
  
  if (answer.toLowerCase() === 'y') {
    musicians[musicianIndex].incomplete = true;
    console.log(`   ✅ Marked ${m.name} as INCOMPLETE\n`);
  } else if (answer.toLowerCase() === 'q') {
    console.log('\n💾 Saving changes and quitting...\n');
    fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
    
    const complete = musicians.filter(m => !m.incomplete).length;
    const incomplete = musicians.filter(m => m.incomplete).length;
    
    console.log(`📊 Statistics:`);
    console.log(`   Complete: ${complete}`);
    console.log(`   Incomplete: ${incomplete}\n`);
    
    rl.close();
    process.exit(0);
  } else {
    console.log(`   ✓ Kept ${m.name} as COMPLETE\n`);
  }
  
  // Small pause
  await new Promise(resolve => setTimeout(resolve, 100));
  
  return reviewMusician(index + 1);
}

// Start review
reviewMusician(0);