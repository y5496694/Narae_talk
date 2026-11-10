'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {runPlan}=require('../src/request-plan.cjs');
const {checklist,resultState,MAX_STEPS}=require('../src/task-checklist.cjs');
const signal=()=>new AbortController().signal;
test('a single To Do publishes an execution Task before dispatch and completes only after result checking',async()=>{
 const plans=[],calls=[];let dispatches=0;
 const text=await runPlan({prompt:'열린 한글 수정해줘',signal:signal(),send:e=>{if(e.type==='taskPlan')plans.push(e.plan);},execute:async(name,args)=>{
  dispatches++;const task=plans.at(-1).tasks[0];assert.equal(task.status,'in_progress');assert.equal(task.steps.at(-2).status,'in_progress');assert.equal(task.steps.at(-1).status,'pending');calls.push(name);return {verified:true};
 }},async o=>{await o.execute('read_live_document',{path:'D:/private/doc.hwp'},o.signal);await o.execute('edit_live_document',{path:'D:/private/doc.hwp'},o.signal);await o.execute('read_live_document',{path:'D:/private/doc.hwp'},o.signal);o.onOutcome({complete:true,verified:true});o.send({type:'text',text:'수정 후 다시 읽어 확인했습니다.'});return '수정 후 다시 읽어 확인했습니다.';});
 assert.equal(plans[0].tasks[0].steps[0].kind,'check');assert.equal(dispatches,3);assert.deepEqual(calls,['read_live_document','edit_live_document','read_live_document']);assert.equal(plans.at(-1).tasks[0].status,'completed');assert(plans.at(-1).tasks[0].steps.every(s=>s.status==='completed'));assert(!JSON.stringify(plans).includes('D:/private'));assert.equal(text,'수정 후 다시 읽어 확인했습니다.');
});
test('a claimed document edit with only a read blocks verification and does not invent or retry a mutation',async()=>{
 let plan,calls=0;const text=await runPlan({prompt:'한글 문서 수정해줘',signal:signal(),send:e=>{if(e.type==='taskPlan')plan=e.plan;},execute:async()=>{calls++;return {text:'original'};}},async o=>{await o.execute('read_document',{},o.signal);return '수정했습니다.';});
 assert.equal(calls,1);assert.equal(plan.tasks[0].status,'blocked');assert.equal(plan.tasks[0].steps.at(-1).status,'blocked');assert.match(text,/완료 미확인/);
});
test('login waiting blocks the owning To Do and leaves the next To Do unstarted without exposing arguments',async()=>{
 let plan,calls=0;await runPlan({prompt:'1. 나이스 복무 조회해줘\n2. 공문 목록 보여줘',portalWorkflow:true,signal:signal(),send:e=>{if(e.type==='taskPlan')plan=e.plan;},execute:async()=>{calls++;return {complete:false,authenticated:false,stage:'profile_required'};}},async o=>{await o.execute('gyomu_portal_login',{operation:'ensure',systems:['neis'],private:'credential-canary'},o.signal);return '로그인 대기 · 요청한 업무는 아직 실행하지 않았습니다.';});
 assert.equal(calls,1);assert.deepEqual(plan.tasks.map(t=>t.status),['blocked','pending']);assert.equal(plan.tasks[0].steps[0].status,'failed');assert.equal(plan.tasks[1].steps.length,1);assert(!JSON.stringify(plan).includes('credential-canary'));
});
test('pending reads reuse the same Task, while the executor controls polling and final verification',async()=>{
 let calls=0,plan;await runPlan({prompt:'공문 본문 읽어줘',signal:signal(),send:e=>{if(e.type==='taskPlan')plan=e.plan;},execute:async()=>++calls===1?{pending:true}:{document:{body:'actual'},closed:true}},async o=>{const args={operation:'result',id:'private-receipt'};await o.execute('gyomu_wxs_read',args,o.signal);await o.execute('gyomu_wxs_read',args,o.signal);o.onOutcome({complete:true});return '공문 본문을 확인했습니다.';});
 assert.equal(calls,2);assert.equal(plan.tasks[0].steps.length,2);assert.equal(plan.tasks[0].steps[0].attempts,2);assert.equal(plan.tasks[0].steps[0].status,'completed');assert.equal(plan.tasks[0].status,'completed');assert(!JSON.stringify(plan).includes('private-receipt'));
});
test('cancellation preserves action results and cancels the result check without starting another To Do',async()=>{
 const controller=new AbortController();let plan,calls=0;await assert.rejects(runPlan({prompt:'네이버 들어가고 다음 들어가',signal:controller.signal,send:e=>{if(e.type==='taskPlan')plan=e.plan;},execute:async()=>{calls++;controller.abort();return {url:'https://www.naver.com/'};}},async o=>{await o.execute('gyomu_browser',{action:'open'},o.signal);return '사이트를 열었습니다.';}));
 assert.equal(calls,1);assert.deepEqual(plan.tasks.map(t=>t.status),['cancelled','pending']);assert.equal(plan.tasks[0].steps.at(-1).status,'cancelled');
});
test('long action lists are bounded and preserve the mandatory result check',async()=>{
 const task={id:'fixture'},checks=checklist(task,'문서 읽어줘',()=>{});for(let i=0;i<100;i++)await checks.execute('read_document',{offset:i},signal(),async()=>({text:'actual'}));assert.equal(task.steps.length,MAX_STEPS);assert.equal(task.omittedSteps,101-MAX_STEPS);assert.equal(task.steps.at(-1).kind,'check');assert.equal(task.steps.at(-1).status,'pending');
});
test('login needs the requested authenticated systems and unverified edits are not successful Tasks',()=>{
 const args={operation:'ensure',systems:['neis','edufine']};assert.equal(resultState('gyomu_portal_login',{},args),'failed');assert.equal(resultState('gyomu_portal_login',{complete:true,authenticated:true,systems:{neis:true}},args),'failed');assert.equal(resultState('gyomu_portal_login',{complete:true,authenticated:true,systems:{neis:true,edufine:true}},args),'completed');assert.equal(resultState('edit_live_document',{verified:false}),'failed');
});
test('Task labels use the observed field name without storing entered values or browser references',async()=>{
 const task={id:'field'},checks=checklist(task,'나이스 조회해줘',()=>{});await checks.execute('gyomu_browser',{action:'fill',ref:'private-ref',text:'private-input'},signal(),async()=>({title:'나이스'}),{label:'시작일자'});assert.match(task.steps[0].title,/시작일자/);assert(!JSON.stringify(task).includes('private-'));
});
test('each task records the real operation, tool, times and result counts without argument values or document bodies',async()=>{
 const task={id:'details'},checks=checklist(task,'설치 상태와 쪽지 확인',()=>{});
 await checks.execute('gyomu_system_status',{password:'argument-canary'},signal(),async()=>({text:'private-body-canary'}));
 await checks.execute('gyomu_skill_read',{area:'neis'},signal(),async()=>({text:'private-body-canary'}));
 await checks.execute('gyomu_cbe_inbox',{operation:'recent',detail:true,count:2},signal(),async()=>({documents:[{text:'private-body-canary'},{text:'private-body-canary'}]}));
 assert.match(task.steps[0].title,/설치 도구·연결 상태/);assert.match(task.steps[1].title,/나이스 사용 절차/);assert.match(task.steps[2].title,/쪽지 본문·첨부/);assert.match(task.steps[2].result,/본문 2건/);
 for(const step of task.steps.filter(s=>s.kind==='action')){assert(step.tool);assert(step.startedAt<=step.finishedAt);assert.equal(step.process.length,2);assert.equal(step.status,'completed');}
 assert(!JSON.stringify(task).includes('canary'));assert(!JSON.stringify(task).includes('연결된 도구 실행'));
});
