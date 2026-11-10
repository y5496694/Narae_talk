'use strict';
const journal=require('./task-process.cjs');
const MAX_STEPS=40;
function criterion(prompt){
 if(/상신|결재|전송|보내/.test(prompt)&&!/하지|미상신|초안/.test(prompt))return '요청한 대상과 실제 처리 결과를 재조회해 대조';
 if(/수정|편집|저장|작성|만들/.test(prompt))return '요청한 변경과 저장·재읽기 결과를 대조';
 return '실제 조회 결과와 요청한 대상·범위를 대조';
}
function describe(name,args={},observed={},tools=[]){
 const label=String(observed.label||'').replace(/[\r\n\t]+/g,' ').trim().slice(0,60);
 if(name==='gyomu_browser'&&label&&['click','fill','select','check','uncheck'].includes(args.action))return {title:label+' · '+({click:'항목 선택',fill:'요청 값 입력',select:'선택지 적용',check:'선택',uncheck:'선택 해제'})[args.action],criterion:'관찰한 항목의 실행 응답 확인 · 전체 완료는 마지막에 별도 점검'};
 if(name==='gyomu_portal_login')return {title:'업무포털 로그인·시스템 연결 확인',criterion:'로그인과 요청한 시스템 진입 결과 확인'};
 if(name==='gyomu_browser')return {title:({snapshot:'현재 업무 화면 확인',read:'대상 본문 읽기',tabs:'열린 업무 창 확인',tab:'확인한 업무 창으로 전환',frames:'업무 프레임 확인',frame:'확인한 업무 프레임으로 전환',click:'관찰한 항목 선택',fill:'요청한 값 입력',select:'확인한 선택지 적용',open:'요청한 사이트 열기',wait:'화면 준비 상태 확인'})[args.action]||'현재 화면에서 요청한 작업 수행',criterion:'현재 화면의 도구 응답 확인 · 전체 완료는 마지막에 별도 점검'};
 if(name==='gyomu_wxs_read')return {title:args.operation==='prepare'?'공문 본문·첨부 읽기 준비':'공문 본문·첨부 읽기 결과 확인',criterion:'같은 공문의 실제 읽기 결과 확인'};
 if(/read_live_document|read_document/.test(name))return {title:args.page?args.page+'쪽 원문 읽기':'문서 원문 읽기',criterion:'실제 문서의 본문·버전 응답 확인'};
 return {title:journal.title(name,args,tools.find(t=>t.name===name)),criterion:'해당 작업의 실제 도구 응답·검증 상태 확인'};
}
function resultState(name,value,args={}){
 const result=value?.result||value;
 if(value==null||value?.error||value?.success===false||value?.ok===false||result?.error||result?.success===false||result?.ok===false)return 'failed';
 if(value.pending===true||result.pending===true)return 'waiting';
 if(value.complete===false||result.complete===false||value.verified===false||result.verified===false)return 'failed';
 if(name==='gyomu_portal_login'&&['ensure','login'].includes(args.operation)&&!(value.complete===true&&value.authenticated===true&&(args.systems||[]).every(system=>value.systems?.[system]===true)))return 'failed';
 return 'completed';
}
// Only public labels and state are stored in the chat. Arguments, credentials,
// document bodies and the private retry keys never enter the checklist.
function checklist(task,prompt,publish,options={}){
 const check={id:task.id+'-check',kind:'check',title:'요청한 결과 점검',criterion:criterion(prompt),status:'pending'};
 task.steps=[check];journal.draft(task,prompt,options);check.phaseId=task.phases.at(-1).id;let serial=0;const pending=new Map();
 const activate=(phase,status)=>{if(status==='in_progress')for(const p of task.phases)if(p!==phase&&p.status==='in_progress')p.status='waiting';phase.status=status;};
 return {
  async execute(name,args,signal,run,observed){
   signal?.throwIfAborted();
   const key=JSON.stringify([name,args]);let step=pending.get(key);
   if(!step||!task.steps.includes(step)){step={id:task.id+'-step-'+(++serial),kind:'action',...describe(name,args,observed,options.tools||[]),status:'pending'};task.steps.splice(-1,0,step);}
   // Keep the bounded recent action history and explicitly count older processes.
   if(task.steps.length>MAX_STEPS){const removed=task.steps.shift();for(const [key,value]of pending)if(value===removed)pending.delete(key);task.omittedSteps=(task.omittedSteps||0)+1;}
   const phase=journal.phaseFor(task,name,args,step.title);step.phaseId=phase.id;activate(phase,'in_progress');step.status='in_progress';step.attempts=(step.attempts||0)+1;delete step.reason;journal.record(step,'in_progress',{name,args});publish();
   try{const value=await run(name,args,signal);step.status=resultState(name,value,args);if(signal?.aborted)step.status='cancelled';if(step.status==='waiting'){step.reason='처리 결과 대기';pending.set(key,step);}else{pending.delete(key);if(step.status==='failed')step.reason='도구 결과에 오류·미완료가 있습니다.';}activate(phase,step.status);journal.record(step,step.status,{name,args,value});publish();return value;}
   catch(error){step.status=signal?.aborted?'cancelled':'failed';step.reason=signal?.aborted?'사용자가 작업을 중지했습니다.':'도구 실행을 완료하지 못했습니다.';activate(phase,step.status);journal.record(step,step.status,{name,args,error});publish();throw error;}
  },
  startCheck(){check.status='in_progress';delete check.reason;activate(task.phases.at(-1),'in_progress');journal.record(check,'in_progress');check.process.at(-1).message='요청 조건과 실제 도구 결과 대조 시작';publish();},
  finish(reason,text){check.status=reason?'blocked':'completed';if(reason)check.reason=String(reason).slice(0,400);activate(task.phases.at(-1),check.status);journal.record(check,reason?'failed':'completed');check.process.at(-1).message=reason?'요청 조건 충족 미확인':'요청 조건과 실제 결과 대조 완료';if(!reason)for(const p of task.phases){if(p.role==='compose'&&typeof text==='string'&&text.trim()){p.status='completed';p.summary='실제 도구 관찰을 반영한 답변 생성 완료';}else if(p.status==='pending'){p.status='skipped';p.summary='실행기가 이 계획 단계를 사용하지 않았습니다.';}}publish();},
  stop(reason,cancelled){check.status=cancelled?'cancelled':'blocked';check.reason=reason;for(const p of task.phases)if(p.status==='in_progress'||p.role==='check')p.status=check.status;journal.record(check,cancelled?'cancelled':'failed');publish();}
 };
}
module.exports={checklist,criterion,resultState,MAX_STEPS};
