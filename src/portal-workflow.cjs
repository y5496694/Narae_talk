'use strict';
const waiting='로그인 대기 · 요청한 업무는 아직 실행하지 않았습니다.';
const workWaiting='업무 복구 대기 · 신청·상신 완료는 확인되지 않았습니다.';
const continuation=/^(?:(?:로그인|인증)\s*(?:완료(?:했(?:어|어요|습니다|음))?|했(?:어|어요|습니다|음)|됐(?:어|어요|습니다))|(?:계속|이어서)(?:\s*(?:해줘|해주세요|진행해줘|처리해줘))?|진행해(?:줘|주세요)?)[.!~\s]*$/;
function requestText(prompt){return String(prompt||'').split('\n첨부 파일 (')[0].replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|“[^”]*”|「[^」]*」/g,'');}
function schoolRequest(prompt){return /나이스|NEIS|에듀파인|공문|복무|조퇴|연가|출장|기안|결재|공람|포[털탈]/i.test(requestText(prompt));}
function isPortal(domain){const friend=require('./talk-store.cjs').definition(domain);return domain==='portal'||friend?.kind==='portal';}
function resume(prompt,history,enabled){
 if(!enabled||!continuation.test(prompt.trim()))return prompt;
 let cursor=history.length-1;while(cursor>=0){const last=history[cursor];if(last?.role!=='assistant'||![waiting,workWaiting].some(text=>last.content.includes(text)))break;const index=history.slice(0,cursor).findLastIndex(message=>message.role==='user');if(index<0)break;const original=history[index];if(!continuation.test(original.content.trim()))return original.content+'\n사용자 후속 요청: '+prompt;cursor=index-1;}return prompt;
}
function plan(prompt,task,enabled,readOnlyRecovery=false){
 if(!enabled||['web','cbe','ezedu','session','office-query','benchmark'].includes(task?.area)||task?.diagnostic||task?.nativeRead||/사용법|방법|절차|설명해|어떻게.*(?:쓰|사용)|기능.*(?:개발|보완)/.test(prompt))return null;
 if(!task&&!schoolRequest(prompt)&&!/조회|보여|목록|찾아|업무|로그인|열어|들어가|신청|상신/.test(prompt))return null;
 const neis=/나이스|NEIS|복무|연가|조퇴|출장|근무상황/i.test(prompt)||/^neis/.test(task?.area||'')||/^neis/.test(task?.preparation?.area||''),edufine=/에듀파인|공문|공람|기안|문서등록대장|문서진행/.test(prompt)||['edufine','edufine-lifecycle','draft-cycle','requisition'].includes(task?.area)||(task?.area==='school-final'||/결재/.test(prompt))&&!neis;
 const work=/조회|보여|목록|검색|공람|복무|연가|조퇴|출장|신청|기안|상신|결재|정리|내용|알려|등록|작성|읽어|처리/.test(prompt);
 return {systems:[...(neis?['neis']:[]),...(edufine?['edufine']:[])],navigationOnly:!work,readOnlyRecovery,allowLocalAccess:!/로컬[^\n.]{0,40}(?:허용하지|연결하지|접근하지|처리하지|허용\s*금지)/.test(prompt)};
}
function step(plan,input,all){
 if(!plan)return null;const name='gyomu_portal_login',call=input.find(item=>item.type==='function_call'&&item.name===name);
 const fixed=(name,args,instructions)=>{const tool=structuredClone(all.find(t=>t.name===name));if(!tool)return {tools:[],receipt:'업무포털 로그인·브라우저 도구가 설치되어 있지 않아 업무를 시작하지 못했습니다.'};tool.parameters={type:'object',properties:Object.fromEntries(Object.entries(args).map(([key,value])=>[key,{type:Array.isArray(value)?'array':typeof value,enum:[value],...(Array.isArray(value)?{items:{type:'string'}}:{})}])),required:Object.keys(args),additionalProperties:false};return {tools:[tool],required:true,invoke:{name,args},instructions};};
 if(!call)return fixed(name,{operation:'ensure',systems:plan.systems,allow_local_access:plan.readOnlyRecovery?false:plan.allowLocalAccess,...(plan.readOnlyRecovery?{read_only:true}:{})},'이 지역 포탈 친구의 나래 브라우저에서 현재 로그인과 필요한 시스템을 먼저 확인한다. 유효 세션은 재사용하고 등록된 보안 문서로만 한 번 인증한다. 복구가 조회 전용이면 열린 업무 창만 확인하고 인증·클릭을 반복하지 않는다.');
 let result;try{result=JSON.parse(input.find(item=>item.type==='function_call_output'&&item.call_id===call.call_id)?.output||'{}');}catch{}
 const ready=result?.complete===true&&result.authenticated===true&&plan.systems.every(system=>result.systems?.[system]===true);
 if(!ready&&(result?.error||plan.readOnlyRecovery)){const code=/^[A-Z][A-Z0-9_]{1,70}$/.test(result?.code||'')?' · '+result.code:'';return {tools:[],complete:false,pending:true,receipt:workWaiting+'\n'+(result?.message||'현재 업무 화면의 연결 확인 도구에서 오류가 발생했습니다.')+code+'\n로그인 실패로 단정하거나 인증을 반복하지 않았습니다. 열린 화면의 처리 결과를 확인한 뒤 “계속”으로 원래 요청을 이어갈 수 있습니다.'};}
 if(!ready)return {tools:[],complete:false,pending:true,receipt:waiting+'\n'+(result?.region?'교육청: '+result.region+'\n':'')+(result?.stage==='profile_required'?'등록된 보안 문서가 없거나 사용할 수 없어 직접 로그인이 필요합니다.':result?.stage==='region_mismatch'?'보안 문서와 포탈의 지역이 달라 직접 로그인이 필요합니다.':result?.message||'업무포털 로그인·시스템 진입을 확인하지 못했습니다.')+'\n'+(result?.stage==='runtime_unconfirmed'&&!result?.certificateSubmitted?'열린 업무 창의 관찰·연결 결과가 불명확합니다. 창은 보존했으며 인증서 제출을 다시 하지 않았습니다. 현재 화면을 확인한 뒤 “계속”이라고 말씀해 주세요.':result?.authenticated?'업무포털 로그인은 확인했습니다. 나래 브라우저에서 요청한 시스템 화면을 확인한 뒤 “계속”이라고 말씀해 주세요.':'나래 브라우저에서 해당 지역 업무포털에 직접 로그인한 뒤 “로그인 완료”라고 말씀해 주세요. 인증서 정보는 설정 → 인증서에서 등록할 수 있습니다.')+' 원래 요청을 이어서 처리하겠습니다.'};
 if(plan.navigationOnly)return {tools:[],receipt:'업무포털 로그인'+(plan.systems.length?'과 '+plan.systems.map(system=>system==='neis'?'나이스':'K-에듀파인').join('·')+' 진입':'')+'을 실제 화면에서 확인했습니다.'};
 if(!input.slice(input.indexOf(call)+1).some(item=>item.type==='function_call'&&item.name==='gyomu_browser'))return fixed('gyomu_browser',{action:'snapshot'},'로그인 도구가 연결한 실제 업무 창의 최신 화면을 읽고 원래 요청을 이어간다. 로그인만 완료했다고 업무까지 완료한 것으로 답하지 않는다.');
 return null;
}
module.exports={waiting,workWaiting,isPortal,resume,plan,step,schoolRequest,requestText};
