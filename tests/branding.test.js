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
  assert.match(jsx,/src="\/dm-logo\.png/);
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

// Regression: the Node server must return PNG bytes, not its SPA HTML fallback.
// Keep this independent of a Vite build, since CI runs tests before build.
test('brand assets are served as real PNG files with correct MIME', async()=>{
  const {createApp}=await import('../src/app.js');
  const {mkdtempSync,mkdirSync,copyFileSync,rmSync}=await import('node:fs');
  const {tmpdir}=await import('node:os');
  const temp=mkdtempSync(join(tmpdir(),'good-thoughts-brand-'));
  const cwd=process.cwd();
  try{
    mkdirSync(join(temp,'dist'));
    for(const name of ['dm-logo.png','dm-icon.png'])
      copyFileSync(join(root,'web/public',name),join(temp,'dist',name));
    process.chdir(temp);
    const app=createApp({dbPath:join(temp,'test.sqlite'),adminToken:'a-strong-private-test-admin-token-value'});
    try{
      await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
      const base='http://127.0.0.1:'+app.server.address().port;
      for(const name of ['dm-logo.png','dm-icon.png']){
        const response=await fetch(base+'/'+name);
        assert.equal(response.status,200);
        assert.match(response.headers.get('content-type'),/^image\/png/);
        const body=Buffer.from(await response.arrayBuffer());
        assert.equal(body.toString('hex',0,8),'89504e470d0a1a0a');
      }
      const privatePath=await fetch(base+'/.env');
      assert.notEqual(privatePath.headers.get('content-type'),'application/octet-stream');
    }finally{await app.close();}
  }finally{process.chdir(cwd);rmSync(temp,{force:true,recursive:true});}
});

test('site does not pretend offline channels are ready or accept email without mail',()=>{
 const jsx=readFileSync(join(root,'web/src/main.jsx'),'utf8');
 assert.match(jsx,/fetch\('\/api\/health'/);
 assert.match(jsx,/disabled=\{!agreed\|\|loading\|\|!channels\.emailEnabled\}/);
 assert.match(jsx,/DobryeMysliFactoryBot/);
 assert.match(jsx,/Приём вопросов с сайта пока готовится/);
});

test('form recognizes a verified browser session and skips the code screen only on explicit API response',()=>{
 const jsx=readFileSync(join(root,'web/src/main.jsx'),'utf8');
 assert.match(jsx,/fetch\('\/api\/email-session'/);
 assert.match(jsx,/result\.requiresVerification===false/);
 assert.match(jsx,/Новый код не нужен/);
 assert.match(jsx,/\/api\/email-session\/forget/);
});
