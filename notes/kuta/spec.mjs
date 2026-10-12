// Ordered human-readable strings in the options/directions area, with generator markers.
import fs from 'fs';
const d=fs.readFileSync(process.argv[2]).toString('latin1');
const all=[...d.matchAll(/[\x20-\x7e]{4,}/g)].map(m=>[m.index,m[0]]);
const gens=all.filter(([i,s])=>/^M[A-Za-z0-9_]+Generator$/.test(s));
const mk=[]; for(let k=0;k<all.length;k++) if(/^M[A-Za-z0-9_]+Options$/.test(all[k][1]) && all.slice(k+1,k+4).some(([,s])=>/Layout|^label|groupBox|^buttonGroup/.test(s))) mk.push(all[k][0]); const treeEnd=mk[0]-0x3000, last=mk[mk.length-1]+0x3000;
// uic class-name occurrences: MXOptions followed shortly by a layout identifier
const isMarker=(k)=>/^M[A-Za-z0-9_]+Options$/.test(all[k][1]) && all.slice(k+1,k+4).some(([,s])=>/Layout|^label|groupBox|^buttonGroup/.test(s));
const ident=(s)=>/^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !/^[A-Z][a-z]+$/.test(s) && !/^[a-z]+$/.test(s) || /^[12][a-zA-Z_]+\(.*\)$/.test(s) || /^(?:@|\W{0,2}[a-zA-Z]{0,2}@)/.test(s) || /^[a-z]+[A-Z]\w*$/.test(s);
let lastEnd=0; const out=[];
for (let k=0;k<all.length;k++){ const [i,s]=all[k]; if(i<treeEnd) continue; if(i>last) break;
  if(isMarker(k)) { out.push(`\n=== ${s.slice(1,-7)} @${i.toString(16)}`); continue; }
  if(ident(s)||!/[A-Za-z]{2}/.test(s)) continue;
  out.push('  '+s);
}
console.log(out.join('\n'));
