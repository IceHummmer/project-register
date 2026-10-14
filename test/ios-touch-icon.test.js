import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('iOS home screen icon is full bleed, opaque and has native 180px dimensions',()=>{
 const png=readFileSync(new URL('../pwa/hh-ios-180.png',import.meta.url));
 assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 assert.equal(png.readUInt32BE(16),180);
 assert.equal(png.readUInt32BE(20),180);
 // iOS provides the rounded-corner mask: our asset is solid edge to edge.
 let offset=8;
 while(offset+12<=png.length){
  const length=png.readUInt32BE(offset);
  const kind=png.toString('ascii',offset+4,offset+8);
  assert.notEqual(kind,'tRNS','Touch icon must not include transparent outer corners');
  if(kind==='IEND')break;
  offset+=12+length;
 }
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/rel="apple-touch-icon"[^>]+href="\/pwa\/hh-ios-180\.png\?v=3"[^>]+sizes="180x180"/);
 const favicon=readFileSync(new URL('../favicon.svg',import.meta.url),'utf8');
 assert.match(favicon,/<rect width="512" height="512" fill="#ffffff"\/>/);
 assert.doesNotMatch(favicon,/rx="90"/);
});
