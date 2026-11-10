'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runPlan}=require('../src/request-plan.cjs');
const {checklist}=require('../src/task-checklist.cjs');
const signal=()=>new AbortController().signal;
test('document To Do publishes real read/edit/check Tasks before its first tool, with per-Task process evidence',async()=>{
 const plans=[];let calls=0;
 await runPlan({prompt:'열린 한글 수정해줘',toolDomain:'hangul',signal:signal(),send:e=>{if(e.type==='taskPlan')plans.push(e.plan);},execute:async name=>{
  calls++;assert(plans[0].tasks[0].phases.length>=3);assert.equal(plans.at(-1).tasks[0].phases.filter(p=>p.status==='in_progress').length,1);
  return name==='edit_live_document'?{verified:true,changed:2}:{text:'credential-canary private-body-canary',liveRevision:'private-revision-canary'};
 }},async o=>{await o.execute('read_live_document',{},o.signal);await o.execute('edit_live_document',{},o.signal);await o.execute('read_live_document',{},o.signal);o.onOutcome({complete:true,verified:true});return '수정 후 확인';});
 assert.equal(calls,3);const t=plans.at(-1).tasks[0];assert.deepEqual(t.phases.map(p=>p.status),['completed','completed','completed']);
 assert(t.steps.filter(s=>s.kind==='action').every(s=>s.process?.length>=2));assert(t.steps.some(s=>s.process?.some(e=>e.facts?.includes('본문 36자')))||t.steps.some(s=>s.process?.some(e=>e.facts?.some(f=>/^본문 \d+자$/.test(f)))));
 assert(!JSON.stringify(t).includes('private-body-canary'));assert(!JSON.stringify(t).includes('private-revision-canary'));
});
test('unknown registered tools use their actual description/operation, not connected-tool boilerplate',async()=>{
 const t={id:'unknown'},c=checklist(t,'일정 보여줘',()=>{},{tools:[{name:'custom_schedule',description:'학교 일정을 조회합니다. 원문을 유지합니다.'}]});
 await c.execute('custom_schedule',{operation:'list',api_key:'secret-canary',body:'payload-canary'},signal(),async()=>({items:[{},{}],complete:true}));
 const s=t.steps[0];assert.doesNotMatch(s.title,/연결된 도구 실행/);assert.match(s.title,/학교 일정/);assert(s.process.some(e=>e.tool==='custom_schedule'));assert(s.process.some(e=>e.facts?.includes('항목 2개')));assert.doesNotMatch(JSON.stringify(t),/secret-canary|payload-canary/);
});
test('failed and waiting actions record honest states, never start dependent To Dos, and retain task-specific traces',async()=>{
 for(const value of [{pending:true},{error:'secret-canary',code:'AUTH_REQUIRED'}]){
  let plan,calls=0;await runPlan({prompt:'1. 일정 조회해줘\n2. 파일 목록 보여줘',signal:signal(),send:e=>{if(e.type==='taskPlan')plan=e.plan;},execute:async()=>{calls++;return value;}},async o=>{await o.execute('gyomu_ezedu',{operation:'list'},o.signal);o.onOutcome({complete:false,pending:!!value.pending});return '실행 대기';});
  assert.equal(calls,1);assert.deepEqual(plan.tasks.map(t=>t.status),['blocked','pending']);const s=plan.tasks[0].steps[0];assert.equal(s.status,value.pending?'waiting':'failed');assert.equal(s.process.at(-1).status,s.status);assert.doesNotMatch(JSON.stringify(s.process),/secret-canary/);
 }
});
test('finished plans and task processes persist across conversation-store recreation without cross-session exposure',async t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{AgentConversations}=require('../src/agent-conversations.cjs');const dir=fs.mkdtempSync(path.join(os.tmpdir(),'narae-task-process-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const task={id:'persist'},c=checklist(task,'파일 목록 보여줘',()=>{});await c.execute('list_files',{},signal(),async()=>({files:['private-name-canary'],complete:true}));c.startCheck();c.finish(null);
 const store=new AgentConversations(dir);store.append('local','assistant','확인','pc',100,{plan:{id:'p',tasks:[task]}});const saved=new AgentConversations(dir).read('local').messages[0].plan.tasks[0];assert.deepEqual(saved,task);assert(saved.steps[0].process.length>=2);assert.equal(new AgentConversations(dir).read('a'.repeat(32)).messages.length,0);assert.doesNotMatch(JSON.stringify(saved),/private-name-canary/);
});
test('cancellation creates no phantom success and an unstarted Task has no process history',async()=>{
 const abort=new AbortController();let plan,calls=0;await assert.rejects(runPlan({prompt:'1. 문서 읽어줘\n2. 일정 조회해줘',signal:abort.signal,send:e=>{if(e.type==='taskPlan')plan=e.plan;},execute:async()=>{calls++;abort.abort();throw abort.signal.reason;}},async o=>{await o.execute('read_document',{},o.signal);return 'not reached';}));
 assert.equal(calls,1);assert.equal(plan.tasks[0].steps[0].process.at(-1).status,'cancelled');assert(plan.tasks[1].phases.every(p=>p.status==='pending'));assert(plan.tasks[1].steps.every(s=>!s.process?.length));
});
