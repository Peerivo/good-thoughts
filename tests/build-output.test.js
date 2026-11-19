import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('ordinary builds cannot overwrite the active public dist directory',()=>{
 const config=readFileSync('vite.config.js','utf8');
 const ignore=readFileSync('.gitignore','utf8');
 const deploy=readFileSync('scripts/deploy-site.sh','utf8');
 assert.match(config,/outDir:'\.\.\/dist-build'/);
 assert.match(ignore,/dist-build\//);
 assert.match(deploy,/mv -Tf "\$link_tmp" dist/);
 assert.match(deploy,/rolling back|revert to previous release/);
});
