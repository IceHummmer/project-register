import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Project username button opens a sign-out confirmation instead of instant logout',()=>{
 const h=read('index.html'),js=read('app.js');
 assert.match(h,/<button id="authBtn"/);
 assert.match(h,/id="projectSignOutDialog"/);
 assert.match(h,/id="projectSignOutConfirm"/);
 assert.match(js,/setText\(\$\('#authBtn'\),loggedIn\?state\.user\.username/);
 assert.match(js,/\$\('#projectSignOutDialog'\)\.showModal\(\)/);
 assert.match(js,/projectSignOutConfirm'\)\.addEventListener/);
});
test('Project footer has semantic version and bump script',()=>{
 const html=read('index.html');
 assert.match(html,/© Helsingin Hitsaus/);
 assert.match(html,/data-hh-version/);
 const version=JSON.parse(read('version.json')).version;
 assert.match(version,/^\d+\.\d+\.\d+$/);
 assert.match(read('scripts/bump-version.mjs'),/major.*minor.*patch/);
});
test('Project administrative module transfer never passes a password or cookie in the URL',()=>{
 const js=read('app.js');
 assert.match(js,/\/api\/auth\/admin-handoff\/issue/);
 assert.match(js,/#hh_admin_transfer=/);
 assert.doesNotMatch(js,/window\.location\.assign\(.*password/);
});
