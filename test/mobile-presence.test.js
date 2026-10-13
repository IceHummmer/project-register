import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('Project Register online users are left of the Warehouse module button',()=>{
 const header=html.slice(html.indexOf('class="topbar-actions"'),html.indexOf('</header>'));
 assert.ok(header.indexOf('id="otherActiveUsers"')<header.indexOf('id="projectModuleButton"'));
 assert.ok(header.includes('class="hh-module-controls"'));
});

test('mobile Project Register limits visible online colleagues and keeps module action',()=>{
 assert.ok(app.includes("window.matchMedia('(max-width: 620px)').matches"));
 assert.match(app,/others\.slice\(0,1\)/);
 assert.match(app,/online-peer-count/);
 assert.match(css,/@media\(max-width:620px\)/);
 assert.match(css,/\.hh-module-controls \.other-active-users/);
 assert.match(css,/\.hh-module-controls>\.hh-module-button/);
 assert.match(css,/max-width:100%/);
});
