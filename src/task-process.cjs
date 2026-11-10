'use strict';
// This is an observable execution journal, never model thinking or raw tool I/O.
const PRIVATE=/bearer\s+\S+|sk-[\w-]{8,}|-----BEGIN|(?:api[_ -]?key|password|secret|비밀번호|인증서.?암호|토큰)\s*[:=은는]\s*\S+/i;
const safe=(value,max=100)=>typeof value==='string'&&!PRIVATE.test(value)?value.replace(/[\r\n\t]+/g,' ').trim().slice(0,max):'';
const token=value=>typeof value==='string'&&/^[a-zA-Z][a-zA-Z0-9_.:-]{0,79}$/.test(value)?value:'';
const operations={read:'읽기',list:'목록 조회',query:'조회',search:'검색',status:'상태 확인',doctor:'실행 환경 점검',describe:'사용할 도구 확인',inspect:'구성 확인',open:'열기',prepare:'실행 미리보기',preview:'변경 미리보기',result:'처리 결과 조회',add:'등록',create:'생성',edit:'편집',update:'수정',save:'저장',export:'출력',send:'전송',confirm:'최종 결과 확인',apply:'승인한 변경 적용',run:'지정 작업 실행',ensure:'로그인·연결 확인',snapshot:'화면 관찰',fill:'관찰한 입력란에 입력',click:'관찰한 항목 선택'};
function title(name,args={},definition){
 const op=token(args.operation||args.action),label=operations[op]||op;
 const names={list_files:'작업 폴더의 파일 목록 조회',read_image:'첨부 이미지 읽기',inspect_document_visuals:'문서의 그림·표 확인',create_document:'요청한 한글 문서 작성·저장',edit_document:'한글 사본 편집·저장',edit_live_document:'열린 한글의 요청 영역 편집',export_pdf:'한글 문서의 PDF 사본 출력',gyomu_addon_read:'친구의 원본 업무 절차 읽기',gyomu_skill_read:'업무 실행 절차 읽기',gyomu_system_status:'업무 도구 연결 상태 확인',plan_live_page_edit:'수업안의 요청 항목 작성'};
 if(names[name])return names[name];
 const area=/ezedu/.test(name)?'이지에듀 일정':/movie/.test(name)?'영상 프로젝트':/kakao/.test(name)?'카카오톡':/cbe|messenger/.test(name)?'업무 메신저':/neis/.test(name)?'나이스':/edufine/.test(name)?'에듀파인':/wxs/.test(name)?'공문·기안':/portal/.test(name)?'업무포털':/cron/.test(name)?'예약 작업':'';
 if(area)return area+' · '+(label||'요청한 업무 처리');
 const description=safe(definition?.description,100).split(/(?<=[다요])\.[\s]|[\r\n]/)[0].replace(/\.$/,'');
 return description?(description.slice(0,64)+(label?' · '+label:'')):(token(name)||'등록 도구')+(label?' · '+label:' 실행');
}
function draft(task,prompt,options={}){
 const p=prompt.replace(/"[^"\n]*"|'[^'\n]*'|“[^”]*”|`[^`]*`/g,' '),items=[];
 const add=(role,title)=>{if(!items.some(i=>i.role===role))items.push({id:task.id+'-phase-'+role,role,title,status:'pending'});};
 const doc=/한글|문서|hwpx?|pdf/i.test(p)||options.toolDomain==='hangul'&&!/파일\s*목록|작업\s*폴더|디렉터리/.test(p);
 const browser=options.toolDomain==='browser'||/사이트|네이버|다음|구글|뉴스|기사|웹페이지|https?:\/\//i.test(p);
 const edit=/수정|편집|바꾸|바꿔|변경|굵게|서식/.test(p),create=/만들|작성|생성/.test(p),read=/읽|조회|목록|검색|찾아|확인|보여|봐/.test(p);
 if(doc){if(edit||read&&!create)add('read','문서의 원문·요청 영역 읽기');if(create)add('write','요청한 문서 작성·저장');else if(edit)add('write','요청한 본문·서식 편집');if(/PDF|출력|변환/i.test(p))add('export','PDF 사본 출력·저장');}
 else if(browser){if(/열|들어|접속|이동|방문|https?:\/\//.test(p))add('navigate','요청한 사이트·실제 링크 열기');if(/검색|찾아/.test(p))add('search','요청한 검색어로 자료 찾기');if(/읽|뉴스|기사|본문|봐|보여|확인|요약|정리/.test(p))add('read','대상 페이지·기사 본문 읽기');}
 else if(/일정/.test(p)){add(create||/등록|추가/.test(p)?'write':'read',create||/등록|추가/.test(p)?'요청한 일정 입력·등록':'요청한 기간의 일정 조회');}
 else if(options.portalWorkflow||/나이스|에듀파인|업무포[털탈]|공문|공람|메신저|쪽지/.test(p)){
  if(options.portalWorkflow||/로그인|포[털탈]/.test(p))add('connect','현재 로그인·업무 시스템 연결 확인');
  add('read',/공문|공람/.test(p)?'요청한 공문 목록·본문 조회':/쪽지|메신저/.test(p)?'대화·수신자·첨부 확인':'요청한 업무 화면·내역 조회');
  if(/보내|전송|등록|신청|상신|결재|수정/.test(p)&&!/하지|금지|말고|전까지만/.test(p))add('write','요청한 대상·내용 확인 후 승인된 처리');
 }
 else if(/파일.*목록|작업.*폴더|디렉터리/.test(p))add('read','작업 폴더의 파일 목록 조회');
 if(!items.length)add('work',safe(p,80)||'사용자가 요청한 작업');
 if(/요약|정리|비교|설명/.test(p))add('compose','조회한 근거로 요청한 답변 정리');
 add('check','요청 조건과 실제 결과 대조');task.phases=items;task.processVersion=1;
 return items;
}
function role(name,args){
 if(name==='export_pdf')return 'export';
 if(/portal_login/.test(name))return 'connect';
 if(name==='gyomu_browser')return ['open','tab','frame','back'].includes(args.action)?'navigate':args.action==='search'?'search':'read';
 const op=args.operation||args.action||'';
 if(/^(?:create|edit|export|save|send|delete|add|apply|run|replace|submit)/.test(name)||/^(?:add|create|edit|update|save|send|send-self|send-image|send-file|apply|run|submit|confirm)$/.test(op)||/_prepare$/.test(name))return 'write';
 return 'read';
}
function phaseFor(task,name,args,description){
 let r=role(name,args);
 if(r==='read'&&task.phases.some(p=>['write','export'].includes(p.role)&&p.status==='completed'))r='check';
 let phase=task.phases.find(p=>p.role===r)||task.phases.find(p=>p.role==='work');
 if(!phase){phase={id:task.id+'-phase-extra-'+task.phases.length,role:r,title:description,status:'pending'};task.phases.splice(-1,0,phase);}
 return phase;
}
function facts(value){
 const v=value?.result&&typeof value.result==='object'?value.result:value,out=[];if(!v||typeof v!=='object')return out;
 for(const[k,label]of Object.entries({verified:'저장·재조회 검증',complete:'처리 완료',sent:'전송',saved:'저장',authenticated:'로그인',loaded:'자료 로드'}))if(typeof v[k]==='boolean')out.push(label+' '+(v[k]?'확인':'미확인'));
 for(const[k,label]of Object.entries({count:'건수',total:'전체 건수',pages:'쪽수',bytes:'바이트',changed:'변경 수'}))if(Number.isFinite(v[k])&&v[k]>=0)out.push(label+' '+v[k]);
 for(const[k,label]of Object.entries({items:'항목',rows:'행',files:'파일',documents:'문서',messages:'메시지',attachments:'첨부',results:'검색 결과'}))if(Array.isArray(v[k]))out.push(label+' '+v[k].length+'개');
 const text=typeof v.text==='string'?v.text:typeof v.body==='string'?v.body:typeof v.document?.body==='string'?v.document.body:null;if(text!==null)out.push('본문 '+text.length+'자');
 if(v.path)out.push('결과 파일 경로 반환');if(v.hasMore===true)out.push('추가 본문 있음');
 return out.slice(0,12);
}
function record(step,status,{name,args={},value,error}={}){
 const op=token(args.operation||args.action),event={at:Date.now(),status,message:({in_progress:'도구 실행 시작',completed:'도구 응답 수신',waiting:'사용자 입력·처리 결과 대기',failed:'오류·미완료 응답',cancelled:'사용자가 실행 중지'})[status]||'결과 점검',tool:token(name)};
 if(op)event.operation=op;
 if(status==='in_progress'){
  event.facts=[];for(const [k,label]of Object.entries({page:'쪽',offset:'읽기 시작 위치',limit:'조회 한도',count:'요청 개수'}))if(Number.isInteger(args[k])&&args[k]>=0)event.facts.push(label+' '+args[k]);
 }else {event.facts=facts(value);const code=error?.code||value?.code||value?.result?.code;if(typeof code==='string'&&/^[A-Z][A-Z0-9_]{0,79}$/.test(code))event.code=code;}
 step.process||=[];step.process.push(event);if(step.process.length>24){step.process.splice(0,step.process.length-24);step.omittedProcess=(step.omittedProcess||0)+1;}
}
module.exports={safe,title,draft,phaseFor,record,facts};
