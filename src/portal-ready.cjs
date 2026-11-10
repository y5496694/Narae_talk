'use strict';
const product=(system,title)=>system==='neis'?/나이스|NEIS/i.test(title||''):/K-에듀파인/.test(title||'');
const origin=value=>{try{return new URL(value).origin;}catch{return '';}};
function serviceLinks(screen,label){const matches=(screen.elements||[]).filter(e=>!e.disabled&&e.label?.replace(/\s/g,'').replace(/\(새창열림\)$/,'')===label),links=matches.filter(e=>e.role==='link'||e.tag==='a'),targets=(links.length?links:matches).filter(e=>!(/^\d+$/.test(e.id||'')&&/^javascript:/i.test(e.href||''))),urlTargets=targets.filter(e=>/^https?:\/\//.test(e.id||''));return urlTargets.length?urlTargets:targets;}
const expired=screen=>/세션(?:이|가)?\s*(?:만료되었|만료됐|종료되었)|만료된\s*세션|로그인\s*(?:정보|세션)(?:가|이)?\s*(?:없습니다|만료되었|만료됐|유효하지\s*않습니다)/.test(screen.nativeDialog?.message||screen.text||'');
function usable(system,screen,expectedOrigin){let origin;try{origin=new URL(screen.url).origin;}catch{return false;}return origin===expectedOrigin&&origin.startsWith('https://')&&product(system,screen.title)&&!/로그인|SSO LOGIN/i.test(screen.title||'')&&!/다른 앱 및 서비스|로컬 네트워크.*(?:허용|액세스)|HTTP(?:\s+ERROR)?\s+[45]\d\d|접속.*실패|오류코드/.test(screen.text||'')&&!/로그인(?:이|을)?\s*필요|세션[^\n]{0,20}(?:만료|종료)|인증[^\n]{0,20}만료/.test(screen.text||'')&&screen.elements?.length>0&&!screen.elements.some(e=>e.type==='password'||/인증서.*로그인/.test(e.label||''))&&screen.loading!==true&&!screen.nativeDialog;}
async function ensure(args,{cfg,browser,state,signal,login,onProgress=()=>{}}){
 const systems=args.systems||[],portalOrigin=new URL(cfg.portalUrl).origin;if(state.serviceRegion!==cfg.region)state.services={};state.services||={};
 const observe=async page=>{signal?.throwIfAborted();browser.page=page;browser.frame=null;browser.invalidate();return browser.execute({action:'snapshot',limit:100,chars:3000});};
 // Reuse only service pages verified in this browser and this education region.
 if(systems.length&&state.serviceRegion===cfg.region){let ready=true;const original=browser.page;
  for(const system of systems){const saved=state.services[system];if(!saved||saved.page.isClosed()||!usable(system,await observe(saved.page),saved.origin)){ready=false;break;}}
  if(ready)return {authenticated:true,complete:true,stage:'verified',region:cfg.region,reused:true,systems:Object.fromEntries(systems.map(system=>[system,true]))};
  browser.page=original;browser.frame=null;browser.invalidate();
 }
 const expected=Object.fromEntries(systems.map(system=>[system,origin(cfg[system+'Url'])])),ready={},stale=[],pages=[...new Set([browser.page,...(browser.context?.pages?.()||[])])].filter(page=>page&&!page.isClosed()),portalPages=[];
 for(const page of pages){const host=origin(page.url()),system=systems.find(s=>host===expected[s]||host===state.services[s]?.origin);if(!system&&host!==portalOrigin)continue;onProgress('열린 '+(system==='neis'?'나이스':system==='edufine'?'K-에듀파인':'업무포털')+' 창 확인 중');const screen=await observe(page);if(expired(screen)){stale.push(page);continue;}if(system&&usable(system,screen,host))ready[system]={page,origin:host};else if(host===portalOrigin)portalPages.push(page);}
 const reused=async()=>{state.services={...state.services,...ready};state.serviceRegion=cfg.region;if(systems.length)await observe(ready[systems.at(-1)].page);return {authenticated:true,complete:true,stage:'verified',region:cfg.region,reused:true,systems:Object.fromEntries(systems.map(s=>[s,true]))};};
 if(systems.length&&systems.every(s=>ready[s]))return reused();
 // A portal's informational notice can hide its authenticated navigation.
 // Search for the real close control instead of assuming a fixed ref or URL.
 for(const page of stale.length?[]:portalPages){let screen=await observe(page);if(!screen.elements?.some(e=>e.type==='password')&&!/인증|접근.*허용|다른 앱/.test(screen.dialog||'')){const filtered=await browser.execute({action:'snapshot',filter:'전체닫기',limit:20,chars:500}),close=filtered.elements?.filter(e=>!e.disabled&&e.label?.replace(/[\s×✕]/g,'')==='전체닫기');if(close?.length===1){await browser.execute({action:'click',ref:close[0].ref});screen=await observe(page);}else screen=await observe(page);}
  if(!/로그아웃|Logout/i.test(screen.text||''))continue;
  if(!systems.length)return reused();
  for(const system of systems){if(ready[system])continue;screen=await observe(page);const label=system==='neis'?'나이스':'K-에듀파인';screen=await browser.execute({action:'snapshot',filter:label,limit:100,chars:500});const links=serviceLinks(screen,label);if(links.length!==1)break;onProgress('기존 업무포털에서 '+label+' 연결 중');await browser.execute({action:'click',ref:links[0].ref});
   for(let attempt=0;attempt<12&&!ready[system];attempt++){for(const candidate of browser.context.pages().filter(p=>!p.isClosed()&&origin(p.url())===expected[system])){const current=await observe(candidate);if(usable(system,current,expected[system])){ready[system]={page:candidate,origin:expected[system]};break;}if(expired(current)&&!stale.includes(candidate))stale.push(candidate);}if(!ready[system])await browser.execute({action:'wait',ms:350});}
  }
  if(systems.every(s=>ready[s]))return reused();
  if(!stale.length)return {authenticated:true,complete:false,stage:'existing_service_unconfirmed',region:cfg.region,message:'기존 업무포털 로그인은 확인했지만 요청한 업무 화면 진입을 확인하지 못했습니다. 열린 업무 창을 유지합니다.'};
 }
 if(stale.length){
  if(Object.hasOwn(state,'expiryRecoverySignal')&&state.expiryRecoverySignal===signal)return {authenticated:false,complete:false,stage:'session_expired_again',region:cfg.region,message:'새 로그인 뒤에도 세션 만료 안내가 확인됐습니다. 같은 인증을 반복하지 않았습니다.'};
  onProgress('세션 만료 확인 · 해당 업무 창을 닫고 새 로그인 준비');
  // Preserve the browser and its final-action attempt records, other regions,
  // unrelated tabs and native WXS windows. Close only this portal/expired tabs.
  for(const page of new Set([...stale,...portalPages]))if(!page.isClosed())await page.close();
  if(browser.pendingDialog?.page?.isClosed())browser.pendingDialog=null;
  Object.assign(state,{attempted:false,submitted:false,passwordAttempted:false,stage:'observing',services:{},expiryRecoverySignal:signal});
  if(browser.attached)return {authenticated:false,complete:false,stage:'dedicated_browser_required',region:cfg.region,message:'만료된 업무 창을 닫았습니다. 등록된 인증서로 새 업무 창에 로그인해야 합니다.'};
  browser.page=await browser.context.newPage();browser.frame=null;browser.invalidate();
 }
 // The shared certificate engine verifies only this region's portal login.
 // Its generic product-title tab reuse is not regional evidence: an older
 // province's NEIS tab can have the same title. Enter requested services via
 // the exact-origin checks above, without reading credentials a second time.
 const result=await login({...args,operation:'login',systems:[]},{cfg,browser,state,signal});
 if(!result.complete||!result.authenticated||!systems.length)return {...result,region:cfg.region};
 return ensure(args,{cfg,browser,state,signal,onProgress,login:async()=>({...result,complete:false,stage:'system_handoff_unconfirmed',region:cfg.region,message:'진입한 업무 창을 요청한 교육청의 주소와 대조하지 못했습니다. 인증은 반복하지 않고 열린 창을 유지합니다.'})});
}
module.exports={ensure,usable,expired};
