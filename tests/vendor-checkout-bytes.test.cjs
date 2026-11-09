'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
test('a fresh Windows-style checkout preserves CBE upstream bytes without activating upstream attributes',()=>{
 const source=path.resolve(__dirname,'..'),root=fs.mkdtempSync(path.join(os.tmpdir(),'narae-vendor-checkout-'));
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 try {
  git('init','--quiet');git('config','core.autocrlf','true');git('config','core.safecrlf','false');
  fs.copyFileSync(path.join(source,'.gitattributes'),path.join(root,'.gitattributes'));
  const lock=JSON.parse(fs.readFileSync(path.join(source,'vendor/MESSENGER_LOCK.json'),'utf8')).sources['cbe-messenger-cli'];
  for(const file of Object.keys(lock.files)){
   const relative=path.join('vendor/cbe-messenger-cli',file==='.gitattributes'?file+'.upstream':file),target=path.join(root,relative);
   fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,relative),target);
  }
  git('add','--','.gitattributes','vendor/cbe-messenger-cli');
  const attr=git('check-attr','text','--','vendor/cbe-messenger-cli/cbe.cmd');assert.match(attr,/text: unset/);
  for(const file of Object.keys(lock.files)){
   const relative=path.join('vendor/cbe-messenger-cli',file==='.gitattributes'?file+'.upstream':file);fs.unlinkSync(path.join(root,relative));
  }
  git('checkout-index','--all','--force');
  assert.equal(fs.existsSync(path.join(root,'vendor/cbe-messenger-cli/.gitattributes')),false);
  for(const [file,expected] of Object.entries(lock.files)){
   const relative=path.join('vendor/cbe-messenger-cli',file==='.gitattributes'?file+'.upstream':file);
   assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,relative))).digest('hex'),expected,file);
  }
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
