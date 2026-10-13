import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url));
test('desktop PWA uses branded HH PNGs, not legacy folder icon',()=>{
 const m=JSON.parse(read('manifest.webmanifest').toString('utf8'));
 const icons=m.icons.filter(x=>x.type==='image/png');
 assert.deepEqual(icons.map(x=>x.sizes),['192x192','512x512']);
 assert.deepEqual(icons.map(x=>x.src),['/pwa/hh-icon-192.png','/pwa/hh-icon-512.png']);
 for(const ico of icons){
  const png=read(ico.src.slice(1));
  assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),Number(ico.sizes.split('x')[0]));
  assert.equal(png.readUInt32BE(20),Number(ico.sizes.split('x')[1]));
 }
 const html=read('index.html').toString('utf8');
 assert.match(html,/href="\/favicon\.svg\?v=hh-icon-2"/);
 assert.match(html,/href="\/manifest\.webmanifest\?v=hh-icon-2"/);
});
test('signed-in Project user name is immediately to the left of Sign out',()=>{
 const html=read('index.html').toString('utf8');
 assert.match(html,/<div class="hh-account-controls">\s*<span id="projectIdentity"[^>]*><\/span>\s*<button id="authBtn"/);
 const css=read('styles.css').toString('utf8');
 assert.match(css,/\.hh-account-controls\{display:flex/);
});
