import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const js=readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('Project Register account is one username button with confirmation dialog',()=>{
 assert.match(html,/id="authBtn"/);
 assert.doesNotMatch(html,/id="projectIdentity"/);
 assert.match(html,/id="projectSignOutDialog"/);
 assert.match(js,/projectSignOutDialog.*showModal/);
 assert.match(js,/projectSignOutConfirm/);
});
test('Project admin transfers use signed proof before Microsoft flow',()=>{
 assert.match(js,/hh_admin_transfer/);
 assert.match(js,/completeAdminTransfer/);
 assert.match(js,/admin-handoff\/issue/);
 assert.match(js,/admin-handoff\/exchange/);
});
test('Project shows HH copyright and release semver',()=>{
 assert.match(html,/© Helsingin Hitsaus/);
 assert.match(html,/data-hh-version/);
 assert.match(js,/version\.json/);
});
