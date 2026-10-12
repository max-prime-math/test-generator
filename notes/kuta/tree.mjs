import fs from 'fs';
const d=fs.readFileSync(process.argv[2]).toString('latin1');
const all=[...d.matchAll(/[\x20-\x7e]{4,}/g)].map(m=>[m.index,m[0]]);
const gens=all.filter(([i,s])=>/^M[A-Za-z0-9_]+Generator$/.test(s));
const lo=Math.min(...gens.map(g=>g[0]));
const hiGen=Math.max(...gens.map(g=>g[0]));
const end=all.find(([i,s])=>i>hiGen&&s==='CObject');
for (const [i,s] of all) if(i>=lo-0x200&&i<=(end?end[0]:hiGen+0x4000)&&!/@$/.test(s)&&!/^[^A-Za-z]*$/.test(s)) console.log(i.toString(16),s);
