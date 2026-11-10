'use strict';
const actions={open:'사이트 여는 중',read:'웹 본문 읽는 중',snapshot:'화면 확인 중',click:'화면에서 항목 여는 중',fill:'검색어·내용 입력 중',wait:'화면이 준비되기를 기다리는 중',search:'검색 중'};
const secretStatus=/bearer\s|password|비밀번호\s*[:=]|암호\s*[:=]|토큰\s*[:=]|api[_-]?key|sk-[\w-]{8,}/i;
function toolLabel(name,args={}){if(name==='gyomu_system_status')return '설치 도구·연결 상태 확인 중';if(name==='gyomu_skill_read')return '업무 사용 절차 읽는 중';if(name==='gyomu_browser')return actions[args.action]||'브라우저 작업 중';if(name==='plan_live_page_edit')return '수업안의 새 내용 작성 중';if(/^report_/.test(name))return '읽은 자료의 근거 정리 중';if(/read_image/.test(name))return '첨부 이미지 확인 중';if(/read_document|read_live_document/.test(name))return '문서 읽는 중';if(/create_document|edit_|export_pdf/.test(name))return '문서 작업 중';if(/cbe|messenger|kakao/.test(name))return '메신저 작업 중';if(/portal|neis|edufine|wxs/.test(name))return '업무포털 작업 중';if(/addon/.test(name))return '친구 사용 안내 확인 중';return '연결된 도구 실행 중';}
class TalkProgress{
 constructor(){this.current=null;}
 start(friend){this.current={friend,started:Date.now(),label:'요청을 확인하고 있습니다',steps:[],plan:null,traces:{}};return this.snapshot(friend);}
 observe(event){const current=this.current;if(!current||event.friend&&event.friend!==current.friend||event.type==='status'&&secretStatus.test(String(event.text||'')))return null;let label;
  if(event.type==='taskPlan'&&event.scope==='agent'){current.plan=structuredClone(event.plan);const active=current.plan.tasks.find(t=>t.status==='in_progress'),blocked=current.plan.tasks.find(t=>['blocked','cancelled'].includes(t.status));current.label=active?'진행 중 · '+active.title:blocked?'작업을 멈췄습니다 · '+blocked.title:'작업 목록을 확인하고 있습니다';return this.snapshot(current.friend);}
  if(event.type==='approval')label=event.approval?'작업 승인을 기다리고 있습니다':'작업을 이어가고 있습니다';
  else if(event.scope==='agent'){if(event.type==='tool')label=toolLabel(event.name,event.args);else if(event.type==='toolDone')label='도구 결과를 확인하고 있습니다';else if(event.type==='status')label=String(event.text||'요청을 처리하고 있습니다').slice(0,140);else if(event.type==='error')label='다음 진행 방법을 확인하고 있습니다';}
  if(event.scope==='agent'&&event.type==='status'&&label){const task=current.plan?.tasks.find(t=>t.status==='in_progress'),step=task?.steps?.find(s=>s.kind==='action'&&s.status==='in_progress');if(step){const trace=current.traces[step.id]||[];if(trace.at(-1)?.text!==label)current.traces[step.id]=[...trace,{at:Date.now(),text:label}].slice(-40);}}
  if(!label||label===current.label)return null;current.steps=[...current.steps,{label:current.label,at:Date.now()}].slice(-3);current.label=label;return this.snapshot(current.friend);
 }
 snapshot(friend){if(this.current?.friend!==friend)return null;const value=structuredClone(this.current);delete value.traces;for(const task of value.plan?.tasks||[])for(const step of task.steps||[]){const trace=this.current.traces[step.id];if(trace?.length)step.process=[...(step.process||[]),...trace].sort((a,b)=>a.at-b.at);}return value;}
 finish(){const friend=this.current?.friend;this.current=null;return friend;}
}
module.exports={TalkProgress,toolLabel};
