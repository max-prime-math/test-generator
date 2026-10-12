import fs from 'fs';
const d=fs.readFileSync(process.argv[2]).toString('latin1');
const re=/[\x20-\x7e]{3,}/g; let out=[];
for (const m of d.matchAll(re)) out.push([m.index,m[0]]);
// find the region: first index of a string ending with 'Generator' that starts with M
const gens=out.filter(([i,s])=>/^M[A-Za-z0-9]+Generator$/.test(s));
const lo=Math.min(...gens.map(g=>g[0]))-0x800, hi=Math.max(...gens.map(g=>g[0]))+0x800;
for (const [i,s] of out) if(i>=lo&&i<=hi) console.log(i.toString(16),s);
