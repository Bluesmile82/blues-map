import fs from 'fs';

const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf-8'));

const questionable = [];

for (const m of musicians) {
  if (!m.incomplete) {
    const issues = [];
    
    // Check birth place quality
    if (m.birthPlace && m.birthPlace.length > 0) {
      if (m.birthPlace.length < 8 && !m.birthPlace.includes(',')) {
        issues.push(`Birth place too short: "${m.birthPlace}" (missing state/country?)`);
      }
    }
    
    // Check instrument quality
    if (m.instrument && m.instrument.length < 5) {
      issues.push(`Minimal instrument: "${m.instrument}"`);
    }
    
    // Check blues style quality  
    if (m.bluesStyle && m.bluesStyle.length < 5) {
      issues.push(`Minimal style: "${m.bluesStyle}"`);
    }
    
    // Check description quality
    if (m.description && m.description.length < 25) {
      issues.push(`Minimal description: "${m.description}"`);
    }
    
    // Check for missing albums (pre-1980 musicians should have some)
    if ((!m.albums || m.albums.length === 0) && m.activeFrom && parseInt(m.activeFrom) < 1980) {
      issues.push(`No albums listed (pre-1980 musician)`);
    }
    
    if (issues.length > 0) {
      questionable.push({
        name: m.name,
        id: m.id,
        issues: issues,
        currentData: {
          birthDate: m.birthDate || 'none',
          birthPlace: m.birthPlace || 'none',
          instrument: m.instrument || 'none',
          bluesStyle: m.bluesStyle || 'none',
          description: m.description?.substring(0, 50) + '...' || 'none',
          albums: m.albums?.length || 0
        }
      });
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log(`QUESTIONABLE DATA QUALITY - ${questionable.length} Musicians`);
console.log(`${'='.repeat(70)}\n`);

console.log('These musicians are marked as "complete" but have data quality issues:\n');

questionable.forEach((m, i) => {
  console.log(`${i + 1}. ${m.name}`);
  console.log(`   ID: ${m.id}`);
  console.log(`   Current data:`);
  console.log(`     - Birth: ${m.currentData.birthDate} in ${m.currentData.birthPlace}`);
  console.log(`     - Instrument: ${m.currentData.instrument}`);
  console.log(`     - Style: ${m.currentData.bluesStyle}`);
  console.log(`     - Albums: ${m.currentData.albums}`);
  console.log(`   Issues:`);
  m.issues.forEach(issue => console.log(`     ⚠️  ${issue}`));
  console.log('');
});

if (questionable.length > 0) {
  console.log(`${'='.repeat(70)}\n`);
  console.log('Summary:\n');
  console.log(`  ${questionable.length} musicians have questionable data quality`);
  console.log('  Most issues:\n');
  console.log('  - Missing state in birth place (e.g., "Memphis" vs "Memphis, Tennessee")');
  console.log('  - Minimal instrument/style descriptions');
  console.log('  - No albums for older musicians\n');
  console.log('Recommendations:\n');
  console.log('  1. Leave as-is if data is accurate but minimal');
  console.log('  2. Mark as incomplete if you want better quality');
  console.log('  3. Manually improve data for important musicians\n');
} else {
  console.log('✅ All complete musicians have good data quality!\n');
}

console.log(`${'='.repeat(70)}\n`);