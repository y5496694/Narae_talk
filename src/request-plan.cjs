'use strict';
const {randomUUID}=require('node:crypto');
const MAX_TASKS=12;
const action=/(?:들어가|접속|열어|방문|이동|띄워|검색|찾아|찾고|읽|봐|보여|확인|요약|정리|비교|만들|작성|수정|편집|바꾸|바꿔|변경|서식|저장|출력|변환|보내|전송|등록|삭제|신청|상신|결재|다운로드|실행|계산|설명|알려)/i;
const incomplete=/미완료|미확인|확인하지 못|확인할 수 없|완료로 처리하지|완료하지 못|시작하지 못|찾지 못|읽지 못|이동하지 못|실행하지 못|실패|로그인 대기|승인 대기|직접 로그인이 필요|열린 웹 페이지가 없습니다|일부만/;
// Mask quoted payloads, URLs and brackets before finding task boundaries. Their
// text remains byte-for-byte intact in the instructions we actually execute.
function maskPayload(text){return text.replace(/https?:\/\/[^\s<>]+|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|“[^”]*”|「[^」]*」|`[^`]*`|\([^)]*\)|\[[^\]]*\]/g,m=>'\uFFFC'.repeat(m.length));}
function splitRequest(prompt,{portalWorkflow=false}={}){
 if(typeof prompt!=='string')return [];
 const masked=maskPayload(prompt),cuts=[];
 const numbered=[...masked.matchAll(/(?:^|\n)\s*(?:\d+[.)]|[-*])\s+/g)];
 // Existing school state machines own login, draft/review and final actions.
 // Keep cross-clause prohibitions and conditional instructions in one scope.
 if(numbered.length<2&&(portalWorkflow||/나이스|NEIS|에듀파인|WXS|공문|공람|기안|복무|연가|조퇴|출장/i.test(prompt))||/하지\s*(?:마|말|않)|말고|금지|전까지만|직전에|(?:경우|때)\s*만|않으면|실패하면/.test(prompt))return [prompt.trim()];
 if(numbered.length>1){for(const m of numbered)cuts.push({start:m.index,end:m.index+m[0].length});}
 else {
  const boundary=/(?:들어가|열어|찾아|돌아가)(?:고|서)|(?:검색|확인|작성|수정|저장|요약|정리|비교|실행|다운로드|접속|이동|출력|변환|등록|삭제|신청|첨부|계산|설명)(?:하고|해서|한\s*(?:뒤|후|다음))|(?:읽|만들|보내|열)(?:고|은\s*(?:뒤|후|다음))|[,;\n]+\s*(?:그리고|그다음|그 다음|다음으로|이어서|마지막으로)\s*|\s+(?:그리고|그다음|다음으로|이어서|마지막으로)\s+/g;
  for(const m of masked.matchAll(boundary))cuts.push({start:m.index,end:m.index+m[0].length,verb:!/^\s*[,;\n]|^\s+(?:그리고|그다음|다음으로|이어서|마지막으로)/.test(m[0])});
 }
 if(!cuts.length)return [prompt.trim()];
 const parts=[];let cursor=0;
 for(const cut of cuts){
  const end=cut.verb?cut.end:cut.start;
  let piece=prompt.slice(cursor,end).trim();
  if(cut.verb)piece=piece.replace(/(?:고|서|한\s*(?:뒤|후|다음))$/,'').trim();
  if(piece)parts.push(piece);
  cursor=cut.end;
 }
 const tail=prompt.slice(cursor).trim();if(tail)parts.push(tail);
 if(parts.length<2||parts.some(p=>!action.test(maskPayload(p))))return [prompt.trim()];
 // Reading/searching and its summary are one evidence-preserving workflow.
 const merged=[];
 for(const part of parts){if(merged.length&&/^(?:(?:그\s*)?(?:내용|결과|본문|자료)(?:을|를)?\s*)?(?:요약|정리|비교)(?:해|하|해줘|해봐|해\s*줘|해주세요|해줘요|해봐요|해라|해서|하고)?[.!?\s]*$/.test(part))merged[merged.length-1]+=' 그리고 '+part;else merged.push(part);}
 if(merged.length>MAX_TASKS)throw Error('한 요청의 작업 목록은 최대 '+MAX_TASKS+'개입니다. 요청을 나누어 주세요.');
 return merged;
}
function expectedMutation(prompt){return /(?:만들|작성|생성|수정|편집|저장|출력|변환|보내|전송|등록|삭제|신청|상신|결재|첨부|다운로드)\s*(?:해|하|줘|만|라|어|고|받|부탁|$)/.test(maskPayload(prompt));}
function mutationTool(name,args={}){return /^(?:create_|edit_|export_)/.test(name)||/^(?:send|add|apply|save|delete|submit|confirm|export|download|run|replace|edit|create)/.test(args.operation||args.action||'');}
function blockedResult(text,evidence,outcome,prompt=''){
 if(outcome?.complete===false)return outcome.reason||'현재 단계의 완료를 확인하지 못했습니다.';
 const latest=new Map();for(const e of evidence)latest.set(e.name+':'+(e.args.action||e.args.operation||''),e);
 if([...latest.values()].some(e=>e.value?.error||e.value?.success===false||e.value?.ok===false||e.value?.pending===true||e.value?.complete===false))return '도구 오류 또는 확인 대기가 남아 있습니다.';
 if(expectedMutation(prompt)){
  const sends=/보내|전송/.test(maskPayload(prompt));
  const verified=evidence.some(e=>{if(!mutationTool(e.name,e.args))return false;const v=e.value?.result||e.value;return v&&!v.error&&v.verified!==false&&v.complete!==false&&!v.pending&&(sends?v.sent===true&&v.verified===true:e.name==='export_pdf'?v.pages>0&&v.bytes>0:v.modeledContentVerified===true||v.verified===true||v.success===true||v.ok===true);});
  if(!verified)return '변경 작업의 실제 실행·검증 결과를 확인하지 못했습니다.';
 }
 if(outcome?.complete===true)return null;
 if(incomplete.test(text))return '현재 단계의 완료를 확인하지 못했습니다.';
 const meaningful=evidence.filter(e=>e.value&&!e.value.error&&!/system_status|skill_read|addon_read/.test(e.name)&&!(e.name==='gyomu_browser'&&['snapshot','wait','tabs','frames'].includes(e.args.action)));
 const requiresTool=/들어가|접속|열어|방문|이동|검색|찾아|읽|봐|보여|확인|파일|문서|뉴스|기사/.test(prompt)||expectedMutation(prompt);
 return meaningful.length||!requiresTool?null:'실제 작업 결과를 확인하지 못했습니다.';
}
function planText(plan,results){
 const marks={pending:'[ ]',in_progress:'[→]',completed:'[x]',blocked:'[!]',cancelled:'[중지]'};
 return '작업 목록\n'+plan.tasks.map((t,i)=>`${i+1}. ${marks[t.status]} ${t.title}${t.reason?' · '+t.reason:''}`).join('\n')+'\n\n'+results.map((r,i)=>`${i+1}. ${plan.tasks[i].title}\n${plan.tasks[i].status==='blocked'?'완료 미확인: '+plan.tasks[i].reason+'\n확인할 단계 결과:\n':''}${r}`).join('\n\n');
}
async function runPlan(options,runSingle){
 const parts=splitRequest(options.prompt,options);if(parts.length<2)return runSingle(options);
 const plan={id:randomUUID(),tasks:parts.map((prompt,i)=>({id:'task-'+(i+1),title:prompt.slice(0,240),status:'pending'}))},results=[],history=[...(options.history||[])];
 let context=options.context,documentContext=options.documentContext;
 const publish=()=>options.send({type:'taskPlan',plan:structuredClone(plan)});publish();
 for(let i=0;i<parts.length;i++){
  const task=plan.tasks[i],evidence=[];let outcome;
  try{
   options.signal.throwIfAborted();task.status='in_progress';publish();
   const text=await runSingle({...options,context,documentContext,prompt:parts[i],history,planContext:results.map((result,n)=>({task:parts[n],result:result.slice(0,2000)})).slice(-6),agentInstructions:(options.agentInstructions||'')+'\n원래 사용자 요청 전체(금지·범위·수신자·파일 조건을 모두 유지):\n'+options.prompt+'\n현재 작업 '+(i+1)+'/'+parts.length+'만 수행하고 나머지는 실행기가 순서대로 처리합니다. 이전 작업의 결과는 대화 기록에서 확인하세요.',onOutcome:value=>{outcome=value;},send:event=>{if(event.type!=='text')options.send(event);},execute:async(name,args,signal)=>{try{const value=await options.execute(name,args,signal);evidence.push({name,args,value});return value;}catch(error){evidence.push({name,args,value:{error:error.message}});throw error;}}});
   options.signal.throwIfAborted();results.push(text);
   const reason=blockedResult(text,evidence,outcome,parts[i]);task.status=reason?'blocked':'completed';if(reason)task.reason=String(reason).slice(0,400);publish();
   if(reason)break;
   // Carry only verified tool observations into dependent document tasks. A
   // newly created file replaces the old context; a live edit carries its
   // actual readback selection rather than the stale pre-edit coordinates.
   const created=evidence.findLast(e=>e.name==='create_document'&&!e.value?.error&&e.value?.path);
   if(created){context=created.value.path;if(documentContext||options.toolDomain==='hangul')documentContext={path:context,live:false};}
   else if(documentContext?.live){const read=evidence.findLast(e=>e.name==='read_live_document'&&!e.value?.error&&e.args.path===documentContext.path);if(read)documentContext={...documentContext,selection:read.value.selection||null};}
   history.push({role:'user',content:parts[i]},{role:'assistant',content:text});
  }catch(error){task.status=options.signal.aborted?'cancelled':'blocked';task.reason=options.signal.aborted?'사용자가 작업을 중지했습니다.':String(error.message).slice(0,400);publish();error.taskPlan=structuredClone(plan);throw error;}
 }
 const text=planText(plan,results);options.send({type:'text',text});return text;
}
module.exports={splitRequest,runPlan,blockedResult,MAX_TASKS};
