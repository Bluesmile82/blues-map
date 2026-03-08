import fs from 'fs';

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
const incompleteList = musicians.filter(m => m.incomplete);

console.log(`\n📊 Musician Data Statistics:`);
console.log(`✅ Complete musicians: ${complete}`);
console.log(`⏳ Incomplete musicians: ${incompleteList.length}`);
console.log(`📝 Total: ${musicians.length}\n`);

if (incompleteList.length > 0) {
  console.log('Incomplete musicians (first 20):\n');
  incompleteList.slice(0, 20).forEach((m, i) => {
    console.log(`${i + 1}. ${m.name}`);
  });
  
  if (incompleteList.length > 20) {
    console.log(`\n... and ${incompleteList.length - 20} more`);
  }
  
  console.log(`\nTo fill in missing data, run: node fill-missing-data.js`);
}

// Save with incomplete flag
fs.writeFileSync('./src/data/musicians.json', JSON.stringify(musicians, null, 2));
console.log('\n✅ Updated musicians.json with incomplete flags\n');