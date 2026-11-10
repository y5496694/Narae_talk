'use strict';
const journal=require('./task-process.cjs');
const MAX_STEPS=40;
const publicText=(value,max=160)=>typeof value==='string'&&!/bearer\s|password|비밀번호|암호\s*[:=]|토큰\s*[:=]|sk-[A-Za-z0-9_-]{8,}/i.test(value)?value.replace(/[\r\n\t]+/g,' ').trim().slice(0,max):'';
const areas={portal:'업무포털',neis:'나이스',edufine:'K-에듀파인',wxs:'공문 편집기',cbe:'소통메신저',hangul:'나래한글',overview:'통합 도구'};
function toolName(name){if(name==='gyomu_browser')return '나래 브라우저';if(/portal|neis|edufine|wxs|system_status|skill_read/.test(name))return '나래교무 포탈';if(/cbe|messenger/.test(name))return '소통메신저';if(/ezedu/.test(name))return '이지에듀';if(/kakao/.test(name))return '카카오톡';if(/document|export_pdf|live_page/.test(name))return '나래한글';if(name==='list_files')return '파일 도구';return name;}
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
 if(name==='gyomu_system_status')return {title:'설치 도구·연결 상태 조회',criterion:'설치 상태와 도구 응답 확인'};
 if(name==='gyomu_skill_read')return {title:(areas[args.area]||'업무 도구')+' 사용 절차 읽기',criterion:'해당 업무의 실제 사용 안내 확인'};
 if(name==='gyomu_addon_read')return {title:(({ezedu:'이지에듀',hiclass:'하이클래스',movie:'무비 메이커'})[args.id]||'추가 친구')+' 사용 절차 읽기',criterion:'설치한 친구의 사용 안내 확인'};
 if(name==='gyomu_ezedu')return {title:'이지에듀 일정 조회·처리',criterion:'요청한 기간과 실제 일정 응답 대조'};
 if(name==='gyomu_cbe_inbox')return {title:({recent:args.detail?'최근 쪽지 본문·첨부 읽기':'최근 쪽지 제목 목록 조회',summarize:'조회한 쪽지 본문·첨부 읽기',search:'쪽지·대화 내용 검색',choose:'선택한 쪽지 본문·첨부 읽기',resolve:'쪽지 수신자 확인',open:'선택한 메신저 창 열기',files:'첨부파일 받기'})[args.operation]||'소통메신저 요청 처리',criterion:'요청한 쪽지·대화와 조회 응답 대조'};
 if(name==='gyomu_cbe_notes')return {title:args.operation==='list'?'쪽지 목록 조회':'선택한 쪽지 본문 읽기',criterion:'실제 쪽지의 조회 범위와 응답 확인'};
 if(name==='gyomu_cbe_chats')return {title:args.operation==='list'?'대화방 목록 조회':'선택한 대화 내용 읽기',criterion:'실제 대화방과 조회한 메시지 범위 확인'};
 if(name==='gyomu_cbe_search')return {title:'소통메신저 수신자 검색',criterion:'현재 이름·소속을 대조해 수신자 확인'};
 if(name==='gyomu_cbe_prepare')return {title:args.kind==='chat'?'요청한 대화 전송 처리':'요청한 쪽지 전송 처리',criterion:'실제 전송 결과와 서버 기록 대조'};
 if(name==='gyomu_wxs_save')return {title:'공문 임시저장',criterion:'같은 공문의 실제 저장 결과 확인'};
 if(name==='list_files')return {title:'작업 폴더의 파일 목록 조회',criterion:'실제 파일 목록과 조회 범위 확인'};
 if(name==='create_document')return {title:'새 문서 작성·저장',criterion:'생성한 문서의 저장·재읽기 확인'};
 if(/edit_/.test(name))return {title:'문서의 요청한 부분 수정',criterion:'변경 내용과 저장·재읽기 확인'};
 if(name==='export_pdf')return {title:'문서의 PDF 사본 저장',criterion:'PDF 파일과 실제 쪽 수 확인'};
 return {title:journal.title(name,args,tools.find(t=>t.name===name)),criterion:'해당 작업의 실제 응답 확인'};
}
function target(name,args,observed){if(observed?.label)return publicText(observed.label,60);if(/document|export_pdf/.test(name))return publicText(String(args.path||args.target||'').split(/[\\/]/).at(-1),80);if(name==='gyomu_portal_login')return (args.systems||[]).map(s=>({neis:'나이스',edufine:'K-에듀파인'})[s]).filter(Boolean).join(' · ')||'업무포털';if(name==='gyomu_browser'&&args.action==='open'){try{return new URL(args.url).origin;}catch{}}if(name==='gyomu_skill_read')return areas[args.area]||'';return '';}
function resultSummary(name,value,args={},status){
 const v=value?.result||value||{},stages={profile_required:'등록된 인증정보 확인 필요',region_mismatch:'인증정보와 교육청 불일치',certificate_button_unconfirmed:'사이트의 인증서 로그인 버튼 확인 실패',certificate_origin_unconfirmed:'인증서 화면의 출처 확인 실패',password_input_unconfirmed:'인증서 암호 입력 결과 미확인',login_result_unknown:'로그인 결과 미확인',security_module_loading:'보안 프로그램 로딩 대기',runtime_unconfirmed:'로그인 도구의 화면 연결 미확인',existing_service_unconfirmed:'요청한 업무 시스템 진입 미확인'};
 if(status==='waiting')return '처리 결과를 기다리고 있습니다.';
 if(status==='failed')return stages[v.stage]||((String(v.code||value?.code||'').match(/^[A-Z][A-Z0-9_]{2,60}$/)?.[0]||'작업 응답의 오류·미완료 상태')+' 확인');
 if(name==='gyomu_portal_login')return (v.reused?'기존 로그인 재사용 · ':'')+'업무포털 로그인 확인'+(args.systems?.length?' · '+args.systems.map(s=>({neis:'나이스',edufine:'K-에듀파인'})[s]).filter(Boolean).join('·')+' 진입 확인':'');
 if(Array.isArray(v.documents))return '본문 '+v.documents.length+'건 확인'+(v.unconfirmed?.length?' · 미확인 '+v.unconfirmed.length+'건':'');
 if(Array.isArray(v.items))return '조회 항목 '+v.items.length+'건 확인'+(v.hasMore?' · 다음 페이지 있음':'');
 if(Array.isArray(v.files))return '파일 '+v.files.length+'개 확인';
 if(Array.isArray(value))return '조회 항목 '+value.length+'건 확인';
 if(name==='gyomu_browser')return (publicText(v.title,70)||'현재 화면')+' · '+(Array.isArray(v.elements)?'관찰 항목 '+v.elements.length+'개 확인':'실행 응답 확인');
 if(v.sent===true&&v.verified===true)return '전송 후 서버 기록 대조 완료';
 if(name==='export_pdf'&&Number.isSafeInteger(v.pages))return 'PDF '+v.pages+'쪽 저장 확인';
 if(v.verified===true||v.modeledContentVerified===true)return '실제 처리 결과 검증 완료';
 if(name==='gyomu_system_status')return '설치 도구·연결 상태 응답 확인';
 if(/skill_read|addon_read/.test(name))return '업무 사용 안내 읽기 완료';
 return '요청한 도구의 실행 응답을 확인했습니다.';
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
   if(!step||!task.steps.includes(step)){step={id:task.id+'-step-'+(++serial),kind:'action',...describe(name,args,observed,options.tools||[]),tool:toolName(name),target:target(name,args,observed),process:[],status:'pending'};task.steps.splice(-1,0,step);}
   // Long paginated reads retain a bounded recent action history plus the check.
   if(task.steps.length>MAX_STEPS){const removed=task.steps.shift();for(const [key,value]of pending)if(value===removed)pending.delete(key);task.omittedSteps=(task.omittedSteps||0)+1;}
   const phase=journal.phaseFor(task,name,args,step.title);step.phaseId=phase.id;activate(phase,'in_progress');step.status='in_progress';step.attempts=(step.attempts||0)+1;step.startedAt??=Date.now();delete step.finishedAt;delete step.reason;journal.record(step,'in_progress',{name,args});publish();
   try{const value=await run(name,args,signal);step.status=resultState(name,value,args);if(signal?.aborted)step.status='cancelled';step.finishedAt=Date.now();step.result=step.status==='cancelled'?'사용자가 중지했습니다.':resultSummary(name,value,args,step.status);if(step.status==='waiting'){step.reason='처리 결과 대기';pending.set(key,step);}else{pending.delete(key);if(step.status==='failed')step.reason=step.result;}activate(phase,step.status);journal.record(step,step.status,{name,args,value});publish();return value;}
   catch(error){step.status=signal?.aborted?'cancelled':'failed';step.finishedAt=Date.now();step.reason=signal?.aborted?'사용자가 중지했습니다.':resultSummary(name,{code:error.code},{},'failed');step.result=step.reason;activate(phase,step.status);journal.record(step,step.status,{name,args,error});publish();throw error;}
  },
  startCheck(){check.status='in_progress';check.startedAt=Date.now();delete check.reason;activate(task.phases.at(-1),'in_progress');journal.record(check,'in_progress');check.process.at(-1).message='요청 조건과 실제 도구 결과 대조 시작';publish();},
  finish(reason,text){check.status=reason?'blocked':'completed';check.finishedAt=Date.now();if(reason)check.reason=String(reason).slice(0,400);activate(task.phases.at(-1),check.status);journal.record(check,reason?'failed':'completed');check.process.at(-1).message=reason?'요청 조건 충족 미확인':'요청 조건과 실제 결과 대조 완료';if(!reason)for(const p of task.phases){if(p.role==='compose'&&typeof text==='string'&&text.trim()){p.status='completed';p.summary='실제 도구 관찰을 반영한 답변 생성 완료';}else if(p.status==='pending'){p.status='skipped';p.summary='실행기가 이 계획 단계를 사용하지 않았습니다.';}}publish();},
  stop(reason,cancelled){check.status=cancelled?'cancelled':'blocked';check.finishedAt=Date.now();check.reason=reason;for(const p of task.phases)if(p.status==='in_progress'||p.role==='check')p.status=check.status;journal.record(check,cancelled?'cancelled':'failed');publish();}
 };
}
module.exports={checklist,criterion,resultState,MAX_STEPS};
