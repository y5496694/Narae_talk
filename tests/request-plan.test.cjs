'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {splitRequest,runPlan,blockedResult}=require('../src/request-plan.cjs');
const {runAgent}=require('../src/agent.cjs');
const browser={type:'function',name:'gyomu_browser',parameters:{type:'object',properties:{action:{type:'string'},url:{type:'string'}},required:['action']}};
test('compound requests preserve order and quoted payloads, summary evidence, prohibitions and school workflows',()=>{
 assert.deepEqual(splitRequest('네이버 뉴스 들어가서 가장 위에 거 봐봐'),['네이버 뉴스 들어가','가장 위에 거 봐봐']);
 assert.deepEqual(splitRequest('1. 네이버 들어가\n2. 다음 들어가'),['네이버 들어가','다음 들어가']);
 assert.deepEqual(splitRequest('https://example.org/news 들어가고 그리고 https://example.org/next 열어줘'),['https://example.org/news 들어가','https://example.org/next 열어줘']);
 assert.equal(splitRequest('네이버 뉴스 3개 탐색해서 요약해줘').length,1);
 assert.equal(splitRequest('문서 만들고 상신하지 마').length,1);
 assert.equal(splitRequest('출장 신청하고 결재선 지정해줘',{portalWorkflow:true}).length,1);
 assert.deepEqual(splitRequest('1. 나이스 출장 내역 보여줘\n2. 공문 목록 보여줘',{portalWorkflow:true}),['나이스 출장 내역 보여줘','공문 목록 보여줘']);
 const quoted=splitRequest('제목은 "네이버 들어가고 다음 들어가"로 문서 만들고 PDF로 출력해줘');assert.equal(quoted.length,2);assert(quoted[0].includes('"네이버 들어가고 다음 들어가"'));
 assert.throws(()=>splitRequest(Array.from({length:13},(_,i)=>`${i+1}. 네이버 들어가`).join('\n')),/최대/);
});
test('a plan is published before execution, advances one task at a time and carries results and original constraints',async()=>{
 const plans=[],calls=[],signal=new AbortController().signal,prompt='네이버 들어가고 다음 들어가';
 const text=await runPlan({prompt,history:[],signal,send:e=>{if(e.type==='taskPlan')plans.push(e.plan);},execute:async(name,args)=>{calls.push(args.url);return {url:args.url};}},async options=>{
  assert.equal(plans.at(-1).tasks.filter(t=>t.status==='in_progress').length,1);assert(options.agentInstructions.includes(prompt));
  if(calls.length){assert(options.history.some(m=>m.role==='assistant'&&m.content==='첫 사이트 열기 확인'));assert.equal(plans.at(-1).tasks[0].status,'completed');}
  await options.execute('gyomu_browser',{action:'open',url:calls.length?'https://www.daum.net/':'https://www.naver.com/'},signal);options.onOutcome({complete:true});return calls.length===1?'첫 사이트 열기 확인':'두 번째 사이트 열기 확인';
 });
 assert.deepEqual(plans[0].tasks.map(t=>t.status),['pending','pending']);assert.deepEqual(plans.at(-1).tasks.map(t=>t.status),['completed','completed']);assert.equal(calls.length,2);assert.match(text,/\[x\]/);
});
test('browser home-to-news uses the observed-link state machine rather than independently guessed URLs',()=>{const prompt='네이버 들어가고 네이버 뉴스 들어가봐',options={toolDomain:'browser',additionalTools:[{name:'gyomu_browser'}]};assert.deepEqual(splitRequest(prompt,options),[prompt]);assert.equal(splitRequest(prompt).length,2);assert.equal(splitRequest('네이버 들어가고 제목 알려줘 그리고 새.hwpx 만들어줘',options).length,3);assert.equal(splitRequest(prompt+' 그리고 새.hwpx 만들어줘',options).length,3);assert.equal(splitRequest(prompt+' 그리고 구글 열어줘',options).length,3);});
test('unverified completion, failed tools and pending login stop dependent tasks',async()=>{
 for(const failure of ['no-evidence','pending','error']){
  const plans=[];let count=0;
  await runPlan({prompt:'네이버 들어가고 다음 들어가',signal:new AbortController().signal,send:e=>{if(e.type==='taskPlan')plans.push(e.plan);},execute:async()=>failure==='pending'?{pending:true}:failure==='error'?{error:'synthetic network error'}:{url:'about:blank'}},async options=>{count++;if(failure!=='no-evidence')await options.execute('gyomu_browser',{action:'open'});return '작업을 완료했습니다.';});
  assert.equal(count,1);assert.deepEqual(plans.at(-1).tasks.map(t=>t.status),['blocked','pending']);
 }
 assert(blockedResult('문서 작성 완료',[{name:'read_document',args:{},value:{text:'읽기만 함'}}],undefined,'문서 만들어줘'));
 assert.equal(blockedResult('PDF 사본을 저장했습니다.',[{name:'export_pdf',args:{target:'D:/synthetic/새.pdf'},value:{pages:1,bytes:100}}],undefined,'PDF로 출력해줘'),null);
 assert.equal(blockedResult('작성된 문서를 읽었습니다.',[{name:'read_document',args:{},value:{text:'실제 본문'}}],undefined,'작성된 문서 읽어줘'),null);
 assert.equal(blockedResult('기사에서 실패 사례를 확인했습니다.',[],{complete:true},'기사 읽어줘'),null);
});
test('verified CBE prepare envelopes count as sends but pending, dry-run and unverified results never do',()=>{for(const value of [{ok:true,result:{sent:true,verified:true}},{sent:true,verified:true}])assert.equal(blockedResult('쪽지 전송 검증',[{name:'gyomu_cbe_prepare',args:{kind:'note'},value}],undefined,'쪽지 보내줘'),null);for(const value of [{ok:true},{ok:true,result:{sent:false,verified:true}},{ok:true,result:{sent:true}},{ok:true,result:{sent:true,verified:false}},{ok:false,result:{sent:true,verified:true}},{pending:true},{error:'response lost'}])assert(blockedResult('전송 완료',[{name:'gyomu_cbe_prepare',args:{kind:'note'},value}],undefined,'쪽지 보내줘'));assert(blockedResult('준비만 완료',[{name:'unrelated_prepare',args:{},value:{sent:true,verified:true}}],undefined,'쪽지 보내줘'));});
test('cancellation preserves completed tasks and never starts the remaining tasks',async()=>{
 const controller=new AbortController(),plans=[];let calls=0;
 await assert.rejects(runPlan({prompt:'네이버 들어가고 다음 들어가고 구글 들어가',signal:controller.signal,send:e=>{if(e.type==='taskPlan')plans.push(e.plan);},execute:async()=>({url:'https://example.org/'})},async options=>{calls++;if(calls===2)controller.abort();options.onOutcome({complete:true});return '사이트 열기 확인';}));
 assert.equal(calls,2);assert.deepEqual(plans.at(-1).tasks.map(t=>t.status),['completed','cancelled','pending']);
});
test('different document tools run in sequence and a read alone cannot verify a requested write',async()=>{
 let calls=0;const events=[],executed=[];
 const text=await runAgent({prompt:'새.hwpx 문서 만들고 파일 목록 보여줘',settings:{provider:'local',workspace:'D:/synthetic'},baseTools:require('../src/agent.cjs').tools.filter(t=>['create_document','list_files'].includes(t.name)),signal:new AbortController().signal,send:e=>events.push(e),request:async body=>{
  if(!executed.includes('create_document'))return {output:[{type:'function_call',name:'create_document',call_id:String(calls++),arguments:JSON.stringify({path:'D:/synthetic/새.hwpx',title:'합성 문서',text:'합성 본문'})}]};
  if(!calls++||!executed.includes('list_files'))return {output:[{type:'function_call',name:'list_files',call_id:'list',arguments:'{}'}]};
  return {output:[{type:'message',content:[{type:'output_text',text:'파일 목록을 확인했습니다.'}]}]};
 },execute:async name=>{executed.push(name);return name==='create_document'?{path:'D:/synthetic/새.hwpx',modeledContentVerified:true}:{files:['새.hwpx']};}});
 assert.deepEqual(executed,['create_document','list_files']);assert.deepEqual(events.filter(e=>e.type==='taskPlan').at(-1).plan.tasks.map(t=>t.status),['completed','completed']);assert.match(text,/파일 목록/);
});
test('the actual agent executes Naver then the top article then Daum, reading the body before the next task',async()=>{
 let page={url:'about:blank'},id=0;const executed=[],plans=[];
 const article='목록의 첫 번째 실제 기사 본문입니다. '.repeat(10);
 const result=await runAgent({prompt:'네이버 뉴스 들어가서 가장 위에 거 봐봐 그리고 다음 들어가',settings:{provider:'openai',workspace:'D:/synthetic'},toolDomain:'browser',baseTools:[],additionalTools:[browser],signal:new AbortController().signal,send:e=>{if(e.type==='taskPlan')plans.push(e.plan);},request:async body=>{
  if(!body.tools.length)return {output:[{type:'message',content:[{type:'output_text',text:'첫 기사 본문을 확인했습니다.'}]}]};
  const tool=body.tools[0],args=Object.fromEntries(Object.entries(tool.parameters.properties).map(([key,value])=>[key,value.enum?.[0]]));return {output:[{type:'function_call',name:tool.name,call_id:String(id++),arguments:JSON.stringify(args)}]};
 },execute:async(name,args)=>{executed.push(args);if(args.action==='open')page=args.url==='https://news.naver.com/'?{url:args.url,title:'네이버 뉴스',sourceKind:'listing',links:[{url:'https://n.news.naver.com/article/001/1',title:'첫 번째 실제 기사'},{url:'https://n.news.naver.com/article/001/2',title:'두 번째 실제 기사'}]}:args.url.includes('/mnews/article/')?{url:args.url,title:'첫 번째 실제 기사',sourceKind:'article',text:article}:{url:args.url,title:'Daum'};return structuredClone(page);}});
 const opens=executed.filter(a=>a.action==='open').map(a=>a.url);assert.deepEqual(opens,['https://news.naver.com/','https://n.news.naver.com/mnews/article/001/1','https://www.daum.net/']);
 assert(executed.findIndex(a=>a.action==='read')<executed.findIndex(a=>a.url==='https://www.daum.net/'));assert.deepEqual(plans.at(-1).tasks.map(t=>t.status),['completed','completed','completed']);assert.match(result,/첫 기사 본문/);
});
test('dependent Hangul tasks carry actual post-edit selection or newly created file instead of the old open document',async()=>{
 const before={selected_text:'원문',start:[0,1,0],end:[0,1,2]},after={selected_text:'새 문구',start:[0,1,0],end:[0,1,4]};
 for(const create of [false,true]){let count=0;await runPlan({prompt:create?'새 문서 만들어줘 그리고 PDF로 출력해줘':'선택한 부분 수정해줘 그리고 선택한 부분 굵게 바꿔줘',toolDomain:'hangul',context:'D:/old.hwpx',documentContext:{path:'D:/old.hwpx',live:true,selection:before},signal:new AbortController().signal,send:()=>{},execute:async name=>name==='create_document'?{path:'D:/new.hwpx',modeledContentVerified:true}:name==='edit_live_document'?{verified:true}:{selection:after}},async o=>{
  if(count++===0){if(create)await o.execute('create_document',{path:'D:/new.hwpx'});else{await o.execute('edit_live_document',{path:'D:/old.hwpx'});await o.execute('read_live_document',{path:'D:/old.hwpx'});}}else{assert.equal(o.context,create?'D:/new.hwpx':'D:/old.hwpx');assert.equal(o.documentContext.live,!create);assert.deepEqual(o.documentContext.selection,create?undefined:after);if(create)await o.execute('export_pdf',{path:o.context});else await o.execute('edit_live_document',{path:o.context});}o.onOutcome({complete:true});return '검증 완료';});assert.equal(count,2);}
});
