'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{ensure}=require('../src/portal-ready.cjs');
async function run(wrongLink){
 const {OfficeSchoolBrowser}=await import('../src/school-browser.mjs'),browser=new OfficeSchoolBrowser();await browser.start({headed:false});
 const cfg={region:'충북',portalUrl:'https://cbe-portal.fixture/login',neisUrl:'https://neis-cbe.fixture/',edufineUrl:'https://edufine-cbe.fixture/'};let logins=0;
 await browser.context.route('**/*',async route=>{const url=new URL(route.request().url());const body=url.hostname==='cbe-portal.fixture'?'<title>충북 업무포털 메인</title><button>로그아웃</button><a href="https://neis-'+(wrongLink?'goe':'cbe')+'.fixture/work" target="_blank">나이스</a>':'<title>나이스 업무</title><button>복무관리</button>';await route.fulfill({contentType:'text/html;charset=utf-8',body});});
 try{
  await browser.page.goto('https://neis-goe.fixture/work');const original=browser.page,state={};
  const login=async(args)=>{assert.deepEqual(args.systems,[],'shared title-only reuse must not select a service');logins++;browser.page=await browser.context.newPage();await browser.page.goto('https://cbe-portal.fixture/home');return {authenticated:true,complete:true,stage:'portal_authenticated',systems:{}};};
  const result=await ensure({systems:['neis']},{cfg,browser,state,login});assert.equal(logins,1);assert(!original.isClosed());assert.equal(original.url(),'https://neis-goe.fixture/work');
  if(wrongLink){assert.equal(result.complete,false);assert.equal(result.stage,'existing_service_unconfirmed');assert.equal(state.services.neis,undefined);}
  else{assert.equal(result.complete,true,JSON.stringify(result));assert.equal(browser.page.url(),'https://neis-cbe.fixture/work');assert.equal(state.serviceRegion,'충북');assert.equal(state.services.neis.origin,'https://neis-cbe.fixture');const count=browser.context.pages().length;const again=await ensure({systems:['neis']},{cfg,browser,state,login:()=>{throw Error('must not authenticate twice');}});assert.equal(again.complete,true);assert.equal(browser.context.pages().length,count);}
 }finally{await browser.browser?.close();}
}
test('regional handoff preserves an older same-title work tab and enters only the configured province origin',()=>run(false));
test('a foreign-province link cannot become verified regional work and cannot trigger another credential attempt',()=>run(true));
