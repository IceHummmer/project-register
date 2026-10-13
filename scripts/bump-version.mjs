import fs from 'node:fs';
const mode=process.argv[2]||'patch';
if(!['patch','minor','major'].includes(mode))throw new Error('Expected patch, minor or major');
const file=new URL('../version.json',import.meta.url);
const info=JSON.parse(fs.readFileSync(file,'utf8'));
if(!/^\d+\.\d+\.\d+$/.test(info.version))throw new Error('Invalid application version');
let [major,minor,patch]=info.version.split('.').map(Number);
if(mode==='major'){major++;minor=0;patch=0;}
else if(mode==='minor'){minor++;patch=0;}else patch++;
info.version=[major,minor,patch].join('.');
fs.writeFileSync(file,JSON.stringify(info,null,2)+'\n');
console.log('HH release version: '+info.version);
