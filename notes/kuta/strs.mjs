import fs from 'fs';
const d=fs.readFileSync(process.argv[2]); const re=new RegExp(process.argv[3],'i');
const lat=d.toString('latin1');
for (const m of lat.matchAll(/[\x20-\x7e]{6,}/g)) if(re.test(m[0])) console.log('A',m.index.toString(16),m[0].slice(0,200));
for (const m of lat.matchAll(/(?:[\x20-\x7e]\x00){6,}/g)) { const s=m[0].replace(/\x00/g,''); if(re.test(s)) console.log('W',m.index.toString(16),s.slice(0,200)); }
