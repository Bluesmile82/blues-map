import fs from 'fs';
import readline from 'readline';

const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf-8'));

// Mark incomplete musicians
musicians.forEach(m => {
  const hasBasicData = 
    m.birthDate && 
    m.birthDate !== '' && 
    m.birthPlace && 
    m.birthPlace !== '' &&
    m.birthCoords[0] !== 0;
  
  m.incomplete = !hasBasicData;
});

// Count statistics
const complete = musicians.filter(m => !m.incomplete).length;
const incomplete = musicians.filter(m => m.incomplete).length;

console.log(`\n📊 Statistics:`);
console.log(`✅ Complete musicians: ${complete}`);
console.log(`⏳ Incomplete musicians: ${incomplete}`);
console.log(`📝 Total: ${musicians.length}\n`);

// Save with incomplete flag
fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
console.log('✅ Marked incomplete musicians in musicians.json');