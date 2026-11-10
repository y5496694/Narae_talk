'use strict';
// Component verification in headless Chrome. Never connects to a user browser,
// starts Electron or uses the desktop input/automation APIs.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),output=process.env.NARAE_QA_OUTPUT||path.resolve(root,'../qa-task-plan');
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:path.join(process.env.PROGRAMFILES,'Google/Chrome/Application/chrome.exe')});
 try{
  const page=await browser.newPage({viewport:{width:394,height:715}});
  await page.setContent('<!doctype html><html lang="ko"><meta charset="utf-8"><style>body{margin:0;font:13px Arial,sans-serif;background:#e9f0f6}#talkMessages{box-sizing:border-box;padding:12px;overflow:auto;height:700px}.talk-message-content{min-width:0;width:100%}</style><div id="talkMessages"></div></html>');
  await page.addStyleTag({path:path.join(root,'ui/talk.css')});
  await page.addScriptTag({content:"var separate=true,selected='browser',sending=false;var callbacks=[];var $=id=>document.getElementById(id);function node(tag,text,cls){var e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}window.narae={onEvent:fn=>callbacks.push(fn)};"});
  await page.addScriptTag({path:path.join(root,'ui/talk-progress.js')});
  const plan={id:'fixture',tasks:[{id:'1',title:'네이버 뉴스 열기',status:'completed'},{id:'2',title:'가장 위 기사 본문을 실제로 읽고 내용을 확인하기',status:'in_progress'},{id:'3',title:'다음 열기 <img src=x onerror=alert(1)>',status:'pending'}]};
  await page.evaluate(plan=>callbacks[0]({type:'talkProgress',friend:'browser',progress:{started:Date.now(),label:'웹 본문 읽는 중',steps:[],plan}}),plan);
  assert.equal(await page.locator('.task-plan li').count(),3);assert.equal(await page.locator('[aria-current=step]').count(),1);assert.equal(await page.locator('.task-plan img').count(),0);
  const start=Date.now()-3000;plan.tasks[1].steps=[{id:'read',kind:'action',title:'공문 본문·첨부 읽기 결과 확인',criterion:'같은 공문의 실제 읽기 결과 확인',tool:'나래교무 포탈',target:'선택한 공문',startedAt:start,finishedAt:start+2000,result:'본문 2건 확인',process:[{at:start,text:'공문 창 열기 시작'},{at:start+1000,text:'첨부 내용 확인 중'},{at:start+2000,text:'본문 2건 확인'}],status:'completed'},{id:'save',kind:'action',title:'요청한 값 입력 <img src=x onerror=alert(1)>',criterion:'현재 화면의 도구 응답 확인',status:'in_progress'},{id:'check',kind:'check',title:'요청한 결과 점검',criterion:'요청한 변경과 저장·재읽기 결과를 대조',status:'pending'}];
  await page.evaluate(plan=>callbacks[0]({type:'talkProgress',friend:'browser',progress:{started:Date.now(),label:'요청한 값 입력 중',steps:[],plan}}),plan);
  assert.equal(await page.locator('.task-steps>li').count(),3);assert.equal(await page.locator('[aria-current=step]').count(),1);assert.equal(await page.locator('.task-plan img').count(),0);assert.match(await page.locator('.task-plan>strong').innerText(),/To Do/);
  await page.locator('.task-detail').first().locator('summary').click();const detail=page.locator('[data-step-id=read]');await detail.waitFor({state:'visible'});for(const expected of ['나래교무 포탈','선택한 공문','본문 2건 확인','공문 창 열기 시작','첨부 내용 확인 중','2초'])assert((await detail.innerText()).includes(expected));
  await page.evaluate(plan=>callbacks[0]({type:'talkProgress',friend:'browser',progress:{started:Date.now(),label:'다음 작업 진행 중',steps:[],plan}}),plan);assert.equal(await page.locator('.task-detail').first().evaluate(e=>e.open),true);
  for(const width of [394,320]){
   await page.setViewportSize({width,height:715});
   assert(await page.locator('.task-plan').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
   await page.screenshot({path:path.join(output,'task-plan-'+width+'.png')});
  }
  plan.tasks[1].status='blocked';plan.tasks[1].reason='본문 확인 실패';
  plan.tasks[1].steps[1].status='failed';plan.tasks[1].steps[2].status='blocked';plan.tasks[1].steps[2].reason='본문 확인 실패';
  await page.evaluate(plan=>{window.naraeChatProgress.clear();document.getElementById('talkMessages').append(window.naraeChatProgress.renderPlan(plan));},plan);
  assert.equal(await page.locator('#talkProcess').count(),0);assert.equal(await page.locator('.task-plan>ol>[data-status=blocked]').count(),1);assert.equal(await page.locator('.task-plan>ol>[data-status=pending]').count(),1);assert.equal(await page.locator('.task-steps [data-status=blocked]').count(),1);assert.match(await page.locator('.task-plan').innerText(),/1\/3/);
  console.log(JSON.stringify({passed:true,checks:['live-task-list','click-task-and-action-to-see-tool-target-timing-results-and-process','expanded-task-survives-live-updates','narrow-layout-394-and-320','text-only-task-titles','persisted-blocked-and-pending-tasks'],output}));
 }finally{await browser.close();}
})().catch(error=>{console.error(error.stack);process.exitCode=1;});
