'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {taskFor,taskStep}=require('../src/agent-task.cjs');
const pair=(args,value,id)=>[{type:'function_call',name:'gyomu_browser',call_id:id,arguments:JSON.stringify(args)},{type:'function_call_output',call_id:id,output:JSON.stringify(value)}];
const tools=[{name:'gyomu_browser',parameters:{properties:{action:{enum:['click','expand','collapse','snapshot']}},required:['action']}}];

test('a collapsed CLX menu opens through its actual icon, retains ARIA state when filtered and does not toggle on repeated expand',async()=>{
 const {OfficeSchoolBrowser}=await import('../src/school-browser.mjs'),browser=new OfficeSchoolBrowser();
 try{
  await browser.start({headed:false});
  await browser.page.setContent('<a role="menuitem" aria-label="복무" aria-expanded="false" class="cl-sidenavigation-item" style="display:block;width:240px;height:32px"><div style="display:inline-block;width:200px">복무 0단계 메뉴항목</div><div class="cl-expand-icon" style="display:inline-block;width:25px;height:25px">+</div></a><div id="submenu" hidden><div onclick="window.opened=true">개인근무상황관리 1단계</div></div><script>window.toggles=0;document.querySelector(".cl-expand-icon").onclick=e=>{const menu=e.currentTarget.parentElement,expanded=menu.getAttribute("aria-expanded")!=="true";window.toggles++;menu.setAttribute("aria-expanded",String(expanded));document.querySelector("#submenu").hidden=!expanded;};</script>');
  let screen=await browser.execute({action:'snapshot',filter:'복무'});
  assert.equal(screen.elements.length,1);assert.equal(screen.elements[0].role,'menuitem');assert.equal(screen.elements[0].menuToggle,true);assert.equal(screen.elements[0].expanded,'false');
  const input=pair({action:'snapshot',filter:'복무'},screen,'a'),task=taskFor('나이스 2038-09-13 14:30~16:30 조퇴 초안. 사유는 합성 검증');
  input.push(...pair({action:'snapshot',filter:'개인근무상황관리'},{...screen,elements:[],appliedFilter:'개인근무상황관리'},'b'),...pair({action:'snapshot',filter:'복무'},screen,'c'));
  const step=taskStep(task,input,tools);assert.deepEqual(step.tools[0].parameters.properties.action.enum,['expand']);assert.deepEqual(step.tools[0].parameters.properties.ref.enum,[screen.elements[0].ref]);
  screen=await browser.execute({action:'expand',ref:screen.elements[0].ref});assert.equal(screen.elements.find(e=>e.label==='복무').expanded,'true');assert.equal(await browser.page.evaluate(()=>window.toggles),1);
  screen=await browser.execute({action:'expand',ref:screen.elements.find(e=>e.label==='복무').ref});assert.equal(await browser.page.evaluate(()=>window.toggles),1);
  screen=await browser.execute({action:'snapshot',filter:'개인근무상황관리'});assert.equal(screen.elements.length,1);
  await browser.execute({action:'click',ref:screen.elements[0].ref});assert.equal(await browser.page.evaluate(()=>window.opened),true);
  screen=await browser.execute({action:'snapshot',filter:'복무'});screen=await browser.execute({action:'collapse',ref:screen.elements[0].ref});assert.equal(await browser.page.locator('#submenu').isVisible(),false);
  screen=await browser.execute({action:'click',ref:screen.elements.find(e=>e.label==='복무').ref});assert.equal(await browser.page.locator('#submenu').isVisible(),true);
  const expanded=screen.elements.find(e=>e.label==='복무');input.push(...pair({action:'expand',ref:expanded.ref},{...screen,elements:[expanded]},'d'),...pair({action:'snapshot',filter:'개인근무상황관리'},{...screen,elements:[]},'e'),...pair({action:'snapshot',filter:'복무'},{...screen,elements:[expanded]},'f'));assert.match(taskStep(task,input,tools).receipt,/다시 눌러 접지/);
 }finally{await browser.browser?.close();}
});

test('invalid observation limits cannot dispatch a click or invalidate its current ref',async()=>{
 const {OfficeSchoolBrowser}=await import('../src/school-browser.mjs'),browser=new OfficeSchoolBrowser();
 try{await browser.start({headed:false});await browser.page.setContent('<button onclick="window.clicks=(window.clicks||0)+1">합성 메뉴</button>');const screen=await browser.execute({action:'snapshot'}),ref=screen.elements[0].ref;
  for(const options of [{limit:120},{chars:10},{offset:-1}])await assert.rejects(browser.execute({action:'click',ref,...options}),e=>e.code==='INVALID_ARGUMENT');
  await assert.rejects(browser.snapshot({limit:120}),e=>e.code==='INVALID_ARGUMENT');assert.equal(await browser.page.evaluate(()=>window.clicks||0),0);
  await browser.execute({action:'click',ref});assert.equal(await browser.page.evaluate(()=>window.clicks),1);
 }finally{await browser.browser?.close();}
});
