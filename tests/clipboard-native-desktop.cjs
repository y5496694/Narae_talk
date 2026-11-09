'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{_electron}=require('playwright-core');
const {snapshotClipboard,restoreClipboard}=require('./helpers/clipboard.cjs');
const root=path.resolve(__dirname,'..'),qa=fs.mkdtempSync(path.join(os.tmpdir(),'narae-clipboard-native-')),home=path.join(qa,'home');let app;
(async()=>{fs.mkdirSync(path.join(home,'data'),{recursive:true});fs.writeFileSync(path.join(home,'data/local-ai.json'),'{"autoStart":false}');
 try{
  app=await _electron.launch({executablePath:require('electron'),args:[root,'--talk'],env:{...process.env,NARAE_TALK_HOME:home,NARAE_TALK_MIGRATE:'0'},timeout:60000});
  await app.evaluate(snapshotClipboard);
  await app.evaluate(async({clipboard})=>{globalThis.__naraeOriginalClipboard=globalThis.__naraeQaClipboard;delete globalThis.__naraeQaClipboard;await clipboard.clear();});
  const emptyTypes=await app.evaluate(async({clipboard})=>(await clipboard.read()).map(item=>item.types));
  await app.evaluate(snapshotClipboard);
  assert.equal(await app.evaluate(()=>globalThis.__naraeQaClipboard.length),0);
  await app.evaluate(({clipboard})=>clipboard.writeText('클립보드 합성 시험'));
  await app.evaluate(restoreClipboard);
  assert.equal(await app.evaluate(({clipboard})=>clipboard.readText()),'');
  await app.evaluate(async({clipboard,ClipboardItem,nativeImage})=>{
   const image=nativeImage.createFromBitmap(Buffer.alloc(4*4*4,180),{width:4,height:4});
   await clipboard.write([new ClipboardItem({'text/plain':new Blob(['한글 원문'],{type:'text/plain'}),'text/html':new Blob(['<b>한글 원문</b>'],{type:'text/html'}),'image/png':new Blob([image.toPNG()],{type:'image/png'})})]);
  });
  const before=await app.evaluate(async({clipboard})=>{const{createHash}=process.mainModule.require('node:crypto');return Promise.all((await clipboard.read()).map(async item=>Object.fromEntries(await Promise.all(item.types.map(async type=>[type,createHash('sha256').update(Buffer.from(await(await item.getType(type)).arrayBuffer())).digest('hex')])))));});
  await app.evaluate(snapshotClipboard);await app.evaluate(async({clipboard})=>{await clipboard.clear();});await app.evaluate(restoreClipboard);
  const after=await app.evaluate(async({clipboard})=>{const{createHash}=process.mainModule.require('node:crypto');return Promise.all((await clipboard.read()).map(async item=>Object.fromEntries(await Promise.all(item.types.map(async type=>[type,createHash('sha256').update(Buffer.from(await(await item.getType(type)).arrayBuffer())).digest('hex')])))));});
  assert.deepEqual(after,before);
  console.log(JSON.stringify({passed:true,emptyTypes,checks:['native-empty-clipboard-backup-restored-after-test-text','native-text-html-png-bytes-restored']}));
 }finally{if(app){try{await app.evaluate(()=>{if(Object.hasOwn(globalThis,'__naraeOriginalClipboard')){globalThis.__naraeQaClipboard=globalThis.__naraeOriginalClipboard;delete globalThis.__naraeOriginalClipboard;}});await app.evaluate(restoreClipboard);}finally{await app.close();}}}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
