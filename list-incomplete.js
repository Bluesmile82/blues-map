import fs from 'fs';

const musicians = JSON.parse(fs.readFileSync('./src/data/musicians.json', 'utf-8'));

const incomplete = musicians.filter(m => m.incomplete);

console.log(`\n${'='.repeat(60)}`);
console.log(`INCOMPLETE BLUES MUSICIANS`);
console.log(`${'='.repeat(60)}`);
console.log(`Total: ${incomplete.length} musicians need data\n`);
console.log(`To fill in data, run: npm run fill-data\n`);
console.log(`${'='.repeat(60)}\n`);

incomplete.forEach((m, i) => {
  console.log(`${String(i + 1).padStart(3)}. ${m.name}`);
});

console.log(`\n${'='.repeat(60)}\n`);