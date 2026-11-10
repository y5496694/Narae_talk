'use strict';
const idleMs=60000;
class BrowserTabCleanup{
 constructor(browser,{busy=()=>false,now=Date.now}={}){Object.assign(this,{browser,busy,now});this.seen=new WeakMap();this.active=0;this.lastUsed=now();this.pending=null;this.stopped=false;}
 start(){
  const {browser}=this;if(browser.attached)return;
  this.watch=page=>{if(this.seen.has(page))return;const state={at:this.now(),navigations:new Set()};this.seen.set(page,state);
   page.on('framenavigated',frame=>{if(frame===page.mainFrame())state.at=this.now();});
   page.on('request',request=>{if(request.isNavigationRequest()){state.navigations.add(request);state.at=this.now();}});
   for(const event of ['requestfinished','requestfailed'])page.on(event,request=>state.navigations.delete(request));
   page.once('close',()=>{browser.pages=browser.pages.filter(p=>!p.isClosed());});
  };
  browser.context.on('page',this.watch);for(const page of browser.context.pages())this.watch(page);
  browser.context.once('close',()=>this.stop());this.timer=setInterval(()=>void this.sweep().catch(()=>{}),15000);this.timer.unref?.();
 }
 stop(){this.stopped=true;clearInterval(this.timer);this.browser.context.off('page',this.watch);}
 blocked(){const b=this.browser;return this.stopped||b.attached||b.closed||this.active>0||this.busy()||b.pendingDialog||b.pendingAction||b.pendingUi||b.finalAuthorization||this.now()-this.lastUsed<idleMs;}
 async run(work){await this.pending?.catch(()=>{});this.active++;try{return await work();}finally{this.active--;this.lastUsed=this.now();}}
 sweep(){if(this.pending)return this.pending;this.pending=this.prune().catch(()=>0).finally(()=>{this.pending=null;});return this.pending;}
 async empty(page){
  let timer;try{return await Promise.race([page.evaluate(()=>location.href==='about:blank'&&document.readyState==='complete'&&!document.title&&document.body&&!document.body.isContentEditable&&document.designMode!=='on'&&!document.body.textContent.trim()&&!document.body.children.length&&!document.querySelector('script,iframe,frame,form,input,textarea,button,canvas,object,embed')&&!window.onbeforeunload),new Promise(resolve=>{timer=setTimeout(()=>resolve(false),1000);})]);}catch{return false;}finally{clearTimeout(timer);}
 }
 async prune(){
  if(this.blocked())return 0;let closed=0;
  for(const page of this.browser.context.pages()){
   if(this.blocked())break;const state=this.seen.get(page);
   if(!state||page.isClosed()||page.url()!=='about:blank'||state.navigations.size||this.now()-state.at<idleMs||await page.opener())continue;
   if(!await this.empty(page)||this.blocked()||page.isClosed()||page.url()!=='about:blank'||state.navigations.size||this.now()-state.at<idleMs)continue;
   const remaining=this.browser.context.pages().filter(p=>p!==page&&!p.isClosed());
   if(!remaining.length){await this.browser.browser.close();return closed+1;}
   if(this.browser.page===page){this.browser.page=remaining.find(p=>p.url()!=='about:blank')||remaining[0];this.browser.frame=null;this.browser.invalidate();}
   await page.close({runBeforeUnload:false});closed++;
  }
  return closed;
 }
}
module.exports={BrowserTabCleanup,idleMs};
