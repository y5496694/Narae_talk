'use strict';
// The portal repository owns the verified local DPAPI credential path.
const fs=require('node:fs'),path=require('node:path');
const shared=require('../vendor/narae-gyomu/packages/narae_gyomoo_portal/skills/narae-gyomu-work-portal/scripts/portal-login.cjs');
const tool=structuredClone(shared.tool);tool.parameters.properties.operation.enum.push('ensure');tool.description+=' ensure는 포탈 친구의 업무 실행 전 로그인·요청 시스템을 확인하고 검증한 업무 창으로 연결한다. 인증은 업무포털의 인증서 로그인 버튼과 사이트 안 인증 프로그램의 저장매체·인증서·암호란·확인 버튼으로 수행한다. SSO 주소를 직접 열거나 토큰을 전달하지 않는다. 보안 문서가 없으면 열린 창에서 직접 로그인을 요청한다.';
function configure(home,value){
 if(!value||typeof value!=='object'||Array.isArray(value))return shared.configure(home,value);
 const {autoAllowLocalAccess,...settings}=value;
 if(autoAllowLocalAccess!==undefined&&typeof autoAllowLocalAccess!=='boolean')throw Error('autoAllowLocalAccess는 boolean이어야 합니다.');
 const previous=shared.config(home),result=shared.configure(home,settings),file=path.join(home,'data/school-profile.json'),saved=JSON.parse(fs.readFileSync(file,'utf8'));
 const allow=autoAllowLocalAccess??(previous.region===saved.region?previous.autoAllowLocalAccess:undefined);
 if(allow!==undefined)fs.writeFileSync(file,JSON.stringify({...saved,autoAllowLocalAccess:allow},null,2));
 return {...result,autoAllowLocalAccess:allow===true};
}
async function login(args,deps){
 const browser=deps.browser,execute=browser.execute,reported=new Set();
 browser.execute=async function(command){
  if(command.action==='open'&&command.url!==deps.cfg.portalUrl)throw Object.assign(Error('업무포털의 인증서 로그인 버튼과 사이트 안 인증 프로그램으로 로그인해야 합니다.'),{code:'CERTIFICATE_UI_LOGIN_REQUIRED'});
  const entry=browser.refs?.get(command.ref)?.entry||browser.lastObservation?.elements?.find(e=>e.ref===command.ref),label=String(entry?.label||'').replace(/\s/g,'');let stage;
  if(command.action==='click'){if(/교육행정.*전자서명.*인증서.*로그인/.test(label))stage='사이트의 인증서 로그인 버튼 선택 중';else if(/^(하드디스크|이동식디스크)$/.test(label))stage='인증 프로그램에서 저장매체 선택 중';else if(deps.state?.stage==='certificate_open'&&['row','tr'].includes(entry?.role||entry?.tag))stage='인증 프로그램에서 본인 인증서 선택 중';else if(label==='확인'&&deps.state?.submitted)stage='인증 프로그램의 확인 버튼 선택 중';}
  if(command.action==='snapshot'&&deps.state?.stage==='password_input')stage='인증 프로그램의 암호 입력 결과 확인 중';
  if(stage&&!reported.has(stage)){reported.add(stage);deps.onProgress?.(stage);}
  return execute.call(this,command);
 };
 try{return await shared.login({...args,allow_local_access:args.allow_local_access??deps.cfg.autoAllowLocalAccess===true},deps);}finally{browser.execute=execute;}
}
module.exports={...shared,tool,configure,login};
