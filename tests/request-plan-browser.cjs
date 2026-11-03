'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {runAgent}=require('../src/agent.cjs'),{OfficeIntegrations}=require('../src/office-integrations.cjs');
const root=path.resolve(__dirname,'..'),home=fs.mkdtempSync(path.resolve(root,'../qa-request-plan-'));
const server=http.createServer((req,res)=>{res.setHeader('content-type','text/html;charset=utf-8');if(req.url==='/news')res.end('<title>합성 뉴스 목록</title><main><h1>합성 뉴스</h1><a href="/article/1">첫 번째 검증 기사</a><a href="/article/2">두 번째 검증 기사</a></main>');else if(req.url==='/article/1')res.end('<title>첫 번째 검증 기사</title><article><h1>첫 번째 검증 기사</h1><p>'+('검증용 첫 번째 기사 본문을 실제 브라우저에서 읽었습니다. ').repeat(12)+'</p></article>');else if(req.url==='/article/2')res.end('<title>두 번째 검증 기사</title><article>선택하면 안 되는 기사</article>');else res.end('<title>최종 목적지</title><main>마지막 작업의 목적지입니다.</main>');});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const integration=new OfficeIntegrations({root,home,python:process.execPath,workspace:()=>home,policy:{approve:async()=>{},allowed:p=>p},settings:()=>({browserMode:'isolated',keepSchoolSession:false}),headed:false});
 const actions=[],plans=[];let id=0;
 try{
  const text=await runAgent({prompt:origin+'/news 들어가서 가장 위 기사 읽어봐 그리고 '+origin+'/last 열어줘',settings:{provider:'openai',workspace:home},toolDomain:'browser',baseTools:[],additionalTools:(await integration.tools()).filter(t=>t.name==='gyomu_browser'),signal:new AbortController().signal,send:event=>{if(event.type==='taskPlan')plans.push(event.plan);},request:async body=>{
   if(!body.tools.length){assert(body.input.at(-1).content.includes('검증용 첫 번째 기사 본문'));return {output:[{type:'message',content:[{type:'output_text',text:'실제 첫 기사 본문 확인 완료'}]}]};}
   const tool=body.tools[0],args=Object.fromEntries(Object.entries(tool.parameters.properties).map(([key,value])=>[key,value.enum?.[0]]));return {output:[{type:'function_call',name:tool.name,call_id:String(id++),arguments:JSON.stringify(args)}]};
  },execute:async(name,args,signal)=>{if(args.action==='open')assert(args.url.startsWith(origin+'/'),'Fixture must stay on the local test server');actions.push(args);return integration.execute(name,args,signal);}});
  assert.deepEqual(actions.filter(a=>a.action==='open').map(a=>a.url),[origin+'/news',origin+'/article/1',origin+'/last']);
  assert.deepEqual(plans.at(-1).tasks.map(t=>t.status),['completed','completed','completed']);assert.match(text,/실제 첫 기사/);
  console.log(JSON.stringify({passed:true,headless:true,actions:actions.map(a=>a.action),checks:['actual-dom-link-order','article-body-before-next-task','sequential-todo-completion'],home}));
 }finally{await integration.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack);process.exitCode=1;server.close();});
