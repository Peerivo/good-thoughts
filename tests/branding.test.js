import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=process.cwd();
test('browser title uses requested em dash and Peerivo.net',()=>{
  const html=readFileSync(join(root,'web/index.html'),'utf8');
  assert.match(html,/<title>Фабрика добрых мыслей — Peerivo\.net<\/title>/);
  assert.match(html,/rel="icon".*?dm-icon\.png/);
});
test('menu has one link back to Peerivo and renders original brand logo',()=>{
  const jsx=readFileSync(join(root,'web/src/main.jsx'),'utf8');
  assert.match(jsx,/<nav className="site-nav"[^>]*><a href="https:\/\/peerivo.net\/">/);
  assert.match(jsx,/src="\/dm-logo\.png"/);
  assert.equal((jsx.match(/<nav /g)||[]).length,1);
});
test('brand assets have white-background PNG headers and exact sizes',()=>{
  for(const [name,w,h] of [['dm-logo.png',640,360],['dm-icon.png',512,512]]){
   const png=readFileSync(join(root,'web/public',name));
   assert.equal(png.toString('hex',0,8),'89504e470d0a1a0a');
   assert.equal(png.readUInt32BE(16),w);
   assert.equal(png.readUInt32BE(20),h);
   assert.equal(png[25],2); // truecolor RGB (no transparency)
  }
});
