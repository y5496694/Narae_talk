'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {BrowserTabCleanup,idleMs}=require('../src/browser-tab-cleanup.cjs');
const {OfficeIntegrations}=require('../src/office-integrations.cjs');
async function fixture(t){
 const {OfficeSchoolBrowser}=await import('../src/school-browser.mjs'),browser=new OfficeSchoolBrowser();await browser.start({headed:false});
 t.after(()=>browser.browser?.close());let now=Date.now(),busy=false;browser.tabCleanup.stop();browser.tabCleanup=new BrowserTabCleanup(browser,{now:()=>now,busy:()=>busy});browser.tabCleanup.start();
 await browser.context.route('https://cleanup.fixture/**',route=>route.fulfill({contentType:'text/html;charset=utf-8',body:'<title>유지할 업무 화면</title><label>초안<input value="작성 중"></label>'}));
 return {browser,advance:()=>{now+=idleMs+1;},busy:value=>{busy=value;}};
}
test('idle empty tabs close and release page references while the current draft stays intact',async t=>{
 const f=await fixture(t),b=f.browser;await b.execute({action:'open',url:'https://cleanup.fixture/work'});const work=b.page,blank=await b.context.newPage(),draft=await b.context.newPage();await draft.setContent('<textarea>저장 전 내용</textarea>');b.page=blank;
 f.advance();f.busy(true);assert.equal(await b.tabCleanup.sweep(),0);assert.equal(blank.isClosed(),false);f.busy(false);
 assert.equal(await b.tabCleanup.sweep(),1);assert.equal(blank.isClosed(),true);assert.equal(b.pages.includes(blank),false);assert.equal(b.page,work);assert.equal(work.isClosed(),false);assert.equal(await draft.locator('textarea').inputValue(),'저장 전 내용');assert.equal((await b.execute({action:'snapshot'})).title,'유지할 업무 화면');
});
test('a new empty tab has a grace period, and certificate popups and populated blank documents survive',async t=>{
 const f=await fixture(t),b=f.browser;await b.execute({action:'open',url:'https://cleanup.fixture/work'});
 const blank=await b.context.newPage(),pop= b.context.waitForEvent('page');await b.page.evaluate(()=>void window.open('about:blank'));const popup=await pop;
 const frame=await b.context.newPage();await frame.setContent('<iframe srcdoc="인증 프로그램"></iframe>');assert.equal(await b.tabCleanup.sweep(),0);assert.equal(blank.isClosed(),false);
 f.advance();assert.equal(await b.tabCleanup.sweep(),1);assert.equal(blank.isClosed(),true);assert.equal(popup.isClosed(),false);assert.equal(frame.isClosed(),false);
});
test('an in-flight navigation remains open even while its visible URL is still about:blank',async t=>{
 const f=await fixture(t),b=f.browser;await b.execute({action:'open',url:'https://cleanup.fixture/work'});let release,entered;const gate=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{entered=resolve;});
 await b.context.route('https://pending.fixture/**',async route=>{entered();await gate;await route.fulfill({contentType:'text/html;charset=utf-8',body:'<title>늦게 열린 업무</title><button>계속</button>'});});const pending=await b.context.newPage(),navigation=pending.goto('https://pending.fixture/slow');
 try{await requested;assert.equal(pending.url(),'about:blank');f.advance();assert.equal(await b.tabCleanup.sweep(),0);assert.equal(pending.isClosed(),false);}finally{release();await navigation;}
 assert.equal(await pending.title(),'늦게 열린 업무');
});
test('site dialogs and work beginning during an asynchronous cleanup check prevent tab closure',async t=>{
 const f=await fixture(t),b=f.browser;await b.execute({action:'open',url:'https://cleanup.fixture/work'});const blank=await b.context.newPage();f.advance();
 const noticed=b.page.waitForEvent('dialog');await b.page.evaluate(()=>{setTimeout(()=>alert('화면 안내 대기'),0);});await noticed;assert.equal(await b.tabCleanup.sweep(),0);assert.equal(blank.isClosed(),false);
 const dialog=b.dialogState();await b.execute({action:'dialog',decision:'accept',expectedId:dialog.id,expectedMessage:dialog.message});f.advance();
 const empty=b.tabCleanup.empty.bind(b.tabCleanup);b.tabCleanup.empty=async page=>{const result=await empty(page);f.busy(true);return result;};assert.equal(await b.tabCleanup.sweep(),0);assert.equal(blank.isClosed(),false);
});
test('an entirely empty idle browser exits and the next request reconnects without a stale context',async t=>{
 const f=await fixture(t),old=f.browser;f.advance();assert.equal(await old.tabCleanup.sweep(),1);assert.equal(old.closed,true);assert.equal(old.tabCleanup.stopped,true);
 const home=fs.mkdtempSync(path.join(os.tmpdir(),'narae-empty-browser-')),integration=new OfficeIntegrations({home,root:path.resolve(__dirname,'..'),headed:false,busy:()=>false,settings:()=>({browserMode:'isolated'})});
 integration.instance={browser:old};integration.ready=async()=>integration;integration.Browser=(await import('../src/school-browser.mjs')).OfficeSchoolBrowser;
 t.after(async()=>{await integration.disconnectBrowser();fs.rmSync(home,{recursive:true,force:true});});
 const originalMake=integration.makeBrowser.bind(integration);integration.makeBrowser=async(...args)=>{const browser=await originalMake(...args);await browser.context.route('https://reconnected.fixture/**',route=>route.fulfill({contentType:'text/html;charset=utf-8',body:'<title>다음 요청</title><button>확인</button>'}));return browser;};
 const screen=await integration.browserCall({action:'open',url:'https://reconnected.fixture/'});assert.equal(screen.title,'다음 요청');assert.notEqual(integration.instance.browser,old);assert.equal(integration.instance.browser.closed,false);
});
test('restarting a managed profile keeps cookies without restoring its old web and blank tabs',async t=>{
 const {OfficeSchoolBrowser}=await import('../src/school-browser.mjs'),profile=fs.mkdtempSync(path.join(os.tmpdir(),'narae-no-tab-restore-'));let browser=new OfficeSchoolBrowser({profile});
 t.after(async()=>{await browser.browser?.close();fs.rmSync(profile,{recursive:true,force:true});});
 await browser.start({headed:false});await browser.context.route('https://cleanup.fixture/**',route=>route.fulfill({contentType:'text/html;charset=utf-8',body:'<title>지난 세션</title><button>이전 화면</button>'}));await browser.execute({action:'open',url:'https://cleanup.fixture/first'});const second=await browser.context.newPage();await second.goto('https://cleanup.fixture/second');await browser.context.newPage();
 await browser.context.addCookies([{name:'synthetic',value:'preserved',url:'https://cleanup.fixture',expires:Math.floor(Date.now()/1000)+3600}]);await browser.browser.close();browser=new OfficeSchoolBrowser({profile});await browser.start({headed:false});
 assert.deepEqual(browser.context.pages().map(page=>page.url()),['about:blank']);assert((await browser.context.cookies()).some(cookie=>cookie.name==='synthetic'&&cookie.value==='preserved'));
});
