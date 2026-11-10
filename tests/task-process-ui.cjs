'use strict';
// Real request-plan/checklist and renderer; local tool responses only. No live school work or provider claim.
const {chromium}=require('playwright-core'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {runPlan}=require('../src/request-plan.cjs');
const root=path.resolve(__dirname,'..'),output=process.env.NARAE_QA_OUTPUT||path.resolve(root,'../talk-task-details-evidence/ui');
(async()=>{
 fs.mkdirSync(output,{recursive:true});const plans=[];
 await runPlan({prompt:'열린 한글 수정해줘 그리고 파일 목록 보여줘',toolDomain:'hangul',signal:new AbortController().signal,send:e=>{if(e.type==='taskPlan')plans.push(e.plan);},execute:async name=>name==='edit_live_document'?{verified:true,changed:2}:name==='list_files'?{files:['private-file-canary'],complete:true}:{text:'private-body-canary'}},async o=>{
  if(o.prompt.includes('파일 목록'))await o.execute('list_files',{},o.signal);else {await o.execute('read_live_document',{},o.signal);await o.execute('edit_live_document',{body:'private-input-canary'},o.signal);await o.execute('read_live_document',{},o.signal);}o.onOutcome({complete:true,verified:true});return '요청한 처리 완료';
 });
 const live=plans.find(p=>p.tasks[0].steps.some(s=>s.process?.at(-1)?.tool==='edit_live_document'&&s.status==='in_progress')),final=plans.at(-1);assert(live);
 const browser=await chromium.launch({headless:true,executablePath:path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe')});
 try{
  const page=await browser.newPage({viewport:{width:394,height:715}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const boot=async()=>{
   await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0;font:13px Arial,sans-serif;background:#e9f0f6}#talkMessages{box-sizing:border-box;padding:12px;overflow:auto;height:700px}</style><div id="talkMessages"></div></html>');
   await page.addStyleTag({path:path.join(root,'ui/talk.css')});await page.addScriptTag({content:"var separate=true,selected='hangul',sending=false;var callbacks=[];var $=id=>document.getElementById(id);window.narae={onEvent:fn=>callbacks.push(fn)};"});await page.addScriptTag({path:path.join(root,'ui/talk-progress.js')});
  };
  const update=plan=>page.evaluate(plan=>callbacks[0]({type:'talkProgress',friend:'hangul',progress:{started:Date.now(),label:'태스크 실행 중',steps:[],plan}}),plan);
  await boot();await update(plans[0]);assert.equal(await page.locator('.task-plan>ol>li').count(),2);assert.equal(await page.locator('.task-steps>li').count(),5);assert.doesNotMatch(await page.locator('.task-plan').innerText(),/연결된 도구 실행/);
  await update(live);let detail=page.locator('.task-detail').nth(1);await detail.locator('summary').click();assert(await detail.evaluate(e=>e.open));assert.match(await detail.innerText(),/edit_live_document/);assert.match(await detail.innerText(),/도구 실행 시작/);
  await detail.locator('summary').focus();await page.waitForFunction(()=>document.querySelectorAll('.task-detail')[1].open);
  await update(final);detail=page.locator('.task-detail').nth(1);assert(await detail.evaluate(e=>e.open));assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY');assert.match(await detail.innerText(),/저장·재조회 검증 확인/);assert.match(await detail.innerText(),/변경 수 2/);assert.match(await detail.innerText(),/도구 응답 수신/);assert.doesNotMatch(await page.locator('body').innerText(),/private-(?:body|input|file)-canary/);
  // Keyboard is the same native disclosure control, not a mouse-only fake button.
  await detail.locator('summary').press('Enter');assert(!(await detail.evaluate(e=>e.open)));await detail.locator('summary').press('Space');assert(await detail.evaluate(e=>e.open));
  for(const width of [394,320]){await page.setViewportSize({width,height:715});assert(await page.locator('.task-plan').evaluate(e=>e.scrollWidth<=e.clientWidth+1));assert(await detail.locator('.task-process').evaluate(e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:path.join(output,'task-process-'+width+'.png')});}
  // Completed conversation record survives a renderer recreation; older entries are honest about missing history.
  const saved=JSON.parse(JSON.stringify(final));await boot();await page.evaluate(p=>document.getElementById('talkMessages').append(window.naraeChatProgress.renderPlan(p)),saved);await page.locator('.task-detail').nth(1).locator('summary').click();assert.match(await page.locator('.task-detail').nth(1).innerText(),/edit_live_document/);
  const before=await page.locator('#talkMessages').innerHTML();await page.evaluate(()=>callbacks[0]({type:'talkProgress',friend:'other-friend',progress:null}));assert.equal(await page.locator('#talkMessages').innerHTML(),before);
  await page.evaluate(()=>{document.getElementById('talkMessages').replaceChildren(window.naraeChatProgress.renderPlan({id:'old',tasks:[{id:'old-task',title:'예전 작업 <img src=x onerror=alert(1)>',status:'completed',steps:[{id:'old-step',title:'이전 태스크',status:'completed'}]}]}));});await page.locator('summary').click();assert.match(await page.locator('.task-process').innerText(),/이전 버전 기록/);assert.equal(await page.locator('img').count(),0);assert.deepEqual(errors,[]);
  const result={passed:true,scope:'real-planner-and-renderer/local-tool-fixtures/no-live-provider',checks:['predeclared-semantic-tasks','sequential-tool-process-grouping','click-and-keyboard-detail','live-update-keeps-expanded-and-focus','tool-result-facts','no-raw-private-input-output','320-and-394-layout','completed-history-rerender','friend-event-isolation','legacy-record-and-XSS-safety'],output};fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
