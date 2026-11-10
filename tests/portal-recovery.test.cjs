'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {OfficeIntegrations}=require('../src/office-integrations.cjs');
test('read-only portal recovery never asks for mutation approval or starts a browser and can verify an open service',async()=>{
 const cfg=require('../src/school-region.cjs').resolve('충북'),page={isClosed:()=>false,url:()=>cfg.neisUrl},integration=new OfficeIntegrations({policy:{approve(){throw Error('read-only recovery cannot request a mutation approval');}}});
 integration.ready=async()=>integration;integration.schoolConfig=()=>cfg;integration.instance={browser:{closed:false,page,context:{pages:()=>[page]},invalidate(){},execute:async args=>{assert.equal(args.action,'snapshot');return {url:cfg.neisUrl,title:'4세대 나이스 시스템',text:'근무상황신청',elements:[{label:'신청기간 시작일자',role:'textbox'}]};}}};integration.connectBrowser=()=>{throw Error('recovery cannot connect or authenticate');};
 const args={operation:'ensure',systems:['neis'],read_only:true,allow_local_access:false};assert.equal((await integration.execute('gyomu_portal_login',args)).complete,true);
 integration.instance.browser.closed=true;assert.equal((await integration.execute('gyomu_portal_login',args)).stage,'recovery_verification_required');integration.instance.browser=null;assert.equal((await integration.execute('gyomu_portal_login',args)).complete,false);
});
test('model timeout and recovery restrictions retain specific error codes without logging secret details',()=>{
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'narae-portal-errors-'));try{for(const code of ['EXAONE_TIMEOUT','EXAONE_INCOMPLETE','REPLAN_READ_ONLY']){const text=require('../src/agent-errors.cjs').failure(home,Object.assign(Error('SECRET_PROVIDER_BODY'),{code}),{provider:'exaone',model:'k-exaone_v2.5'});assert(text.includes(code));assert(!text.includes('SECRET'));assert(!text.includes('직접 로그인'));}assert(!fs.readFileSync(path.join(home,'logs/agent-errors.jsonl'),'utf8').includes('SECRET'));}finally{fs.rmSync(home,{recursive:true,force:true});}
});
