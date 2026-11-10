'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const portal=require('../src/portal-login.cjs'),shared=require('../vendor/narae-gyomu/packages/narae_gyomoo_portal/skills/narae-gyomu-work-portal/scripts/portal-login.cjs');
test('saved local access delegation reaches the login engine while an explicit refusal takes precedence',async t=>{
 const calls=[];t.mock.method(shared,'login',async(args,deps)=>{calls.push({args,deps});return {complete:false};});
 for(const [cfg,args,expected]of [[{autoAllowLocalAccess:true},{},true],[{autoAllowLocalAccess:true},{allow_local_access:false},false],[{}, {},false],[{}, {allow_local_access:true},true]]){const deps={cfg,browser:{execute:async()=>({})}};await portal.login(args,deps);assert.equal(calls.at(-1).args.allow_local_access,expected);assert.equal(calls.at(-1).deps,deps);}
});
test('certificate login can open only the configured portal and cannot feed an SSO address directly',async t=>{
 const opened=[],execute=async command=>{opened.push(command.url);return {};},browser={execute},cfg={portalUrl:'https://cbe.eduptl.kr/login'};
 t.mock.method(shared,'login',async(args,deps)=>deps.browser.execute({action:'open',url:args.url}));
 await portal.login({url:cfg.portalUrl},{browser,cfg});assert.deepEqual(opened,[cfg.portalUrl]);assert.equal(browser.execute,execute);
 await assert.rejects(()=>portal.login({url:'https://idp1-cbe.neis.go.kr:9443/Login_Server/generateFP.jsp'},{browser,cfg}),error=>error.code==='CERTIFICATE_UI_LOGIN_REQUIRED');assert.deepEqual(opened,[cfg.portalUrl]);assert.equal(browser.execute,execute);
});
test('local access preference survives same-region profile edits and does not leak to another region',()=>{
 const home=fs.mkdtempSync('D:/Codex/tmp/portal-local-access-');try{portal.configure(home,{region:'충북',autoAllowLocalAccess:true});assert.equal(portal.config(home).autoAllowLocalAccess,true);portal.configure(home,{region:'충북'});assert.equal(portal.config(home).autoAllowLocalAccess,true);portal.configure(home,{region:'경기'});assert.notEqual(portal.config(home).autoAllowLocalAccess,true);portal.configure(home,{region:'경기',autoAllowLocalAccess:false});assert.equal(portal.config(home).autoAllowLocalAccess,false);}finally{fs.rmSync(home,{recursive:true,force:true});}
});
test('invalid local access preferences cannot overwrite the existing school profile',()=>{
 const home=fs.mkdtempSync('D:/Codex/tmp/portal-local-access-');try{portal.configure(home,{region:'충북',autoAllowLocalAccess:true});const file=path.join(home,'data/school-profile.json'),before=fs.readFileSync(file,'utf8');assert.throws(()=>portal.configure(home,{region:'충북',autoAllowLocalAccess:'true'}),/boolean/);assert.equal(fs.readFileSync(file,'utf8'),before);}finally{fs.rmSync(home,{recursive:true,force:true});}
});
