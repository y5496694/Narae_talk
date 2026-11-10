(()=>{
'use strict';
let current=null;
const statuses={pending:['○','대기'],in_progress:['●','진행 중'],completed:['✓','완료'],blocked:['!','멈춤'],failed:['!','실패'],waiting:['…','응답 대기'],cancelled:['■','중지'],skipped:['−','미사용']};
const expanded=new Map();
function element(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=String(text);if(cls)e.className=cls;return e;}
function state(s){return statuses[s]||statuses.pending;}
function clock(at){const d=new Date(at);return Number.isFinite(at)&&!Number.isNaN(d.valueOf())?d.toLocaleTimeString('ko-KR',{hour12:false}):'';}
function renderPhase(value,task,phase,index){
 const row=element('li',undefined,'task-phase');row.dataset.status=phase.status;const detail=element('details',undefined,'task-detail'),summary=element('summary');
 const key=String(value.id||'legacy')+':'+task.id+':'+phase.id;detail.dataset.processKey=key;detail.open=expanded.get(key)===true;
 const [mark,status]=state(phase.status);summary.append(element('span',mark,'task-status'),element('span','태스크 '+(index+1)+' · '+phase.title,'task-title'),element('span',status,'task-badge'));
 const body=element('div',undefined,'task-process');body.append(element('strong','수행 과정'));
 const actions=task.phases?(task.steps||[]).filter(s=>s.phaseId===phase.id):[phase];
 if(phase.summary)body.append(element('p',phase.summary));
 if(!actions.length&&!phase.summary)body.append(element('p',phase.status==='pending'?'아직 시작하지 않은 태스크입니다.':'보관된 실행 과정이 없습니다.'));
 for(const step of actions){
  const action=element('section',undefined,'task-action');action.append(element('strong',step.title));
  if(step.criterion)action.append(element('p','확인 기준 · '+step.criterion,'task-criterion'));
  if(step.reason)action.append(element('p',step.reason,'task-reason'));
  if(step.attempts>1)action.append(element('p','동일 작업 시도 '+step.attempts+'회'));
  if(step.omittedProcess)action.append(element('p','이전 과정 '+step.omittedProcess+'개는 보관 한도로 생략했습니다.'));
  const events=step.process||[];
  if(!events.length)action.append(element('p',step.status==='pending'?'아직 수행하지 않았습니다.':'이전 버전 기록에는 세부 수행 과정이 저장되지 않았습니다.'));
  for(const event of events){
   const entry=element('div',undefined,'task-event');entry.dataset.status=event.status;
   entry.append(element('time',clock(event.at)),element('span',event.message));
   if(event.tool)entry.append(element('code','도구 · '+event.tool+(event.operation?' / '+event.operation:'')));
   for(const fact of event.facts||[])entry.append(element('small',fact));
   if(event.code)entry.append(element('small','오류 코드 · '+event.code));action.append(entry);
  }
  body.append(action);
 }
 detail.append(summary,body);detail.addEventListener('toggle',()=>{if(!detail.isConnected)return;expanded.set(key,detail.open);if(expanded.size>600)expanded.delete(expanded.keys().next().value);});row.append(detail);return row;
}
function renderPlan(value){
 if(!value?.tasks?.length)return null;const box=element('section',undefined,'task-plan'),heading=element('strong','To Do · '+value.tasks.filter(t=>t.status==='completed').length+'/'+value.tasks.length),hint=element('small','태스크를 누르면 수행 과정을 볼 수 있어요.','task-plan-hint'),list=element('ol');box.append(heading,hint,list);
 for(const task of value.tasks){const row=element('li');row.dataset.status=task.status;if(task.status==='in_progress')row.setAttribute('aria-current','step');const [mark,status]=state(task.status),titleRow=element('div',undefined,'task-row');titleRow.append(element('span',mark,'task-mark'),element('span',task.title,'task-title'),element('small',status,'task-status'));row.append(titleRow);
  if(task.reason)row.append(element('small',task.reason,'task-reason'));
  const phases=task.phases?.length?task.phases:task.steps;
  if(phases?.length){const nested=element('ol',undefined,'task-steps');phases.forEach((p,i)=>nested.append(renderPhase(value,task,p,i)));row.append(nested);}
  if(task.omittedSteps)row.append(element('small','최근 수행 과정만 표시 · 이전 '+task.omittedSteps+'개 생략','task-criterion'));list.append(row);
 }
 return box;
}
function elapsed(){const value=document.getElementById('processElapsed');if(value&&current){const seconds=Math.max(0,Math.floor((Date.now()-current.started)/1000));value.textContent=seconds<60?seconds+'초 경과':Math.floor(seconds/60)+'분 '+seconds%60+'초 경과';}}
function render(){
 const list=$('talkMessages'),atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<100,old=document.getElementById('talkProcess');
 const focused=old?.contains(document.activeElement)?document.activeElement.closest('details')?.dataset.processKey:null;
 old?.remove();if(!current||!separate||selected==='self')return;list.querySelector('.talk-empty')?.remove();
 const card=element('section',undefined,'talk-process');card.id='talkProcess';card.setAttribute('aria-label','요청 수행 과정');
 const heading=element('div',undefined,'process-heading'),spinner=element('span',undefined,'process-spinner');spinner.setAttribute('aria-hidden','true');heading.append(spinner,element('strong','요청을 처리하고 있습니다'));
 const history=element('ul');for(const step of current.steps||[])history.append(element('li',step.label));
 const active=element('p',current.label,'process-current'),time=element('small');active.setAttribute('role','status');time.id='processElapsed';time.setAttribute('aria-hidden','true');
 card.append(heading);const tasks=renderPlan(current.plan);if(tasks)card.append(tasks);else card.append(history);card.append(active,time);list.append(card);elapsed();
 if(focused)for(const d of card.querySelectorAll('details'))if(d.dataset.processKey===focused){d.querySelector('summary').focus({preventScroll:true});break;}
 if(atBottom&&!focused)list.scrollTop=list.scrollHeight;
}
window.naraeChatProgress={renderPlan,start(){current={started:Date.now(),label:'요청을 전달하고 있습니다',steps:[]};render();},sync(data){if(data.progress)current=data.progress;else if(!sending)current=null;render();},clear(){current=null;render();}};
window.narae.onEvent(event=>{if(event.type==='talkProgress'&&event.friend===selected){current=event.progress;render();}});setInterval(elapsed,1000);
})();
