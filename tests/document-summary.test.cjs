'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summarizeDocument,normalize,sourceUnits,batches,supported}=require('../src/document-summary.cjs');
const {liveDocumentStep}=require('../src/live-document-task.cjs'),{runAgent,tools}=require('../src/agent.cjs');
const output=(name,args)=>({output:[{type:'function_call',name,call_id:'summary',arguments:JSON.stringify(args)}]});
function model(body){
 const tool=body.tools[0];
 if(tool.name==='read_live_document')return output(tool.name,{path:tool.parameters.properties.path.enum[0]});
 const data=JSON.parse(body.input.at(-1).content);
 if(tool.name==='record_document_notes'){const source=data.source||data.notes,selected=[source[0],source.at(-1)].filter((p,i,a)=>p&&a.findIndex(q=>q.id===p.id)===i);return output(tool.name,{points:selected.map(p=>({kind:'핵심',text:p.text.slice(-220),source_ids:[p.id]}))});}
 assert.equal(tool.name,'write_document_summary');const selected=[data.notes[0],data.notes[Math.floor(data.notes.length/2)],data.notes.at(-1)].slice(-(tool.parameters.properties.sections.maxItems||3));return output(tool.name,{sections:selected.map((p,i)=>({heading:['핵심 주제','적용 과정','연구 결과'][i],text:p.text.padEnd(16,' '),source_ids:[p.id]}))});
}
test('normalization decodes HWP entities and splitting retains every paragraph including the document end',()=>{
 assert.equal(normalize('시&#8231;도\r\n&#8203; A &amp; B'),'시‧도\nA & B');const body=('기초 문해를 교과 학습으로 연결한다. '.repeat(55)+'\n').repeat(12)+'끝부분 핵심 결과';const units=sourceUnits(body),parts=batches(units);assert(parts.length>2);assert.equal(parts.flat().map(p=>p.id).length,units.length);assert(parts.at(-1).at(-1).text.endsWith('끝부분 핵심 결과'));assert.equal(units.map(p=>p.text).join('').replaceAll('\n','').replaceAll(' ',''),normalize(body).replaceAll('\n','').replaceAll(' ',''));
});
test('live-document summaries receive the whole observed body instead of its first 12000 characters',()=>{
 const body='문서 본문입니다.\n'.repeat(1500)+'후반의 실제 연구 결과',file='D:/fixture/research.hwp',input=[{type:'function_call',name:'read_live_document',call_id:'read',arguments:JSON.stringify({path:file})},{type:'function_call_output',call_id:'read',output:JSON.stringify({text:body,liveRevision:'r1',pages:20,truncated:false})}],step=liveDocumentStep('현재 문서를 요약해줘',input,tools,{live:true,path:file});assert.equal(step.context.documents[0].body,body);assert.equal(step.documentSummary.complete,true);assert.equal(step.documentSummary.pages,20);assert.equal(step.documentSummary.verify.revision,'r1');
});
test('source IDs and numeric claims are checked against the actual supporting paragraphs',()=>{
 const source=[{id:'p1',text:'평균은 78점에서 93.5점으로 15.5점 증가했다.'}];assert.doesNotThrow(()=>supported([{text:'78점에서 93.5점으로 향상됐다.',source_ids:['p1']}],source));assert.throws(()=>supported([{text:'100점이 됐다.',source_ids:['p1']}],source),/수치/);assert.throws(()=>supported([{text:'점수가 향상됐다.',source_ids:['invented']}],source),/근거/);
});

test('nearby table evidence can repair a citation, but row numbers cannot be invented as program stages',()=>{
 const source=[{id:'p1',text:'개발 환경은 웹 브라우저이다.'},{id:'p2',text:'최소 RAM 4GB와 화면 1280*720을 사용한다.'}];const notes=supported([{text:'개발 환경은 RAM 4GB를 사용한다.',source_ids:['p1']}],source);assert(notes[0].source_ids.includes('p2'));
 assert.throws(()=>supported([{text:'3단계는 AI 스케치북이다.',source_ids:['p1']}],[{id:'p1',text:'1단계 그리기\n행 번호 3 AI 스케치북'}]),/행 번호/);
});
test('every long-document part is analyzed and tail results survive synthesis without an excerpt fallback',async()=>{
 const body=Array.from({length:260},(_,i)=>'기초 문해 능력을 교과 학습 참여와 연결하는 연구를 수행하였다. 반복 학습과 피드백을 제공하였다.').join('\n')+'\n최종 평균은 78점에서 93.5점으로 15.5점 상승했다.',requests=[];
 const report=await summarizeDocument({prompt:'이 문서 요약해줘',documents:[{title:'연구.hwp',bodyRead:true,body}],request:async b=>{requests.push(b);return model(b);},pages:20,signal:new AbortController().signal});assert.equal(report.reports[0].audit.length,report.reports[0].parts);assert(report.reports[0].parts>2);assert(report.text.includes('93.5'));assert(report.text.includes('문서 전체 텍스트 · 20쪽'));assert(!report.text.includes('본문: 「'));assert(!requests.some(r=>r.tools.some(t=>t.name==='report_evidence')));assert(requests.some(r=>JSON.parse(r.input.at(-1).content).source?.some(s=>s.text.includes('최종 평균'))));
});
test('invalid final claims retry once then stop rather than presenting source headings as a summary',async()=>{
 let attempts=0;await assert.rejects(summarizeDocument({prompt:'요약',documents:[{bodyRead:true,body:'가상 연구의 평균은 78점에서 93.5점으로 증가하였다.'}],signal:new AbortController().signal,request:async body=>{if(body.tools[0].name==='write_document_summary'){attempts++;return output('write_document_summary',{sections:[{heading:'결과',text:'가상 연구에서 모든 학생이 100점에 도달하였다.',source_ids:['n1']}]});}return model(body);}}),e=>e.code==='DOCUMENT_SUMMARY_INCOMPLETE');assert.equal(attempts,2);
});

test('general summaries reject unrelated licensing appendices while a licensing document retains its actual subject',async()=>{
 for(const licensing of [false,true]){const body=licensing?'이 문서는 저작권 라이선스와 재배포 조건을 정리한 안내문이다.':'학생별 읽기 수준을 진단하고 맞춤형 수업과 피드백을 제공하는 연구이다.';let writes=0;const result=await summarizeDocument({prompt:'문서를 요약해줘',documents:[{bodyRead:true,body}],signal:new AbortController().signal,request:async request=>{if(request.tools[0].name!=='write_document_summary')return model(request);writes++;return output('write_document_summary',{sections:[{heading:'핵심 내용',text:licensing||writes===1?'저작권 라이선스와 재배포 조건을 안내하는 절차가 적용되었다.':body,source_ids:['n1']}]});}});assert.equal(writes,licensing?1:2);assert.equal(result.text.includes('라이선스'),licensing);}
});

test('the published report includes a concrete observed image relationship with its page and uncertainty',async()=>{
 const observed='왼쪽에는 학생이 그린 도형, 오른쪽에는 변환한 그림이 배치되어 있다.';const report=await summarizeDocument({prompt:'그림도 포함해 요약',documents:[{bodyRead:true,body:'학습자가 그린 도형을 결과 그림으로 바꾸는 기능을 개발하였다.'}],visuals:{pages:1,totalPages:1,complete:true,uncertain:['v0008'],notes:[{kind:'시각 자료',text:observed,source_ids:['v0008'],uncertain:true}]},signal:new AbortController().signal,request:async body=>model(body)});assert.match(report.text,/그림·표 대표 분석 \(8쪽 · 일부 판독 제한\)/);assert(report.text.includes(observed));
});

test('a generated result that omits the measured change is replaced with the verified source result paragraph',async()=>{
 const outcome='전체 평균은 78점에서 93.5점으로 15.5점 증가하였다. '+'학생의 현재 수행 수준과 오류 유형을 확인하여 개별화된 읽기와 쓰기 활동을 지도하고 다음 학습에 반영하였다. '.repeat(3).trim();const report=await summarizeDocument({prompt:'요약',documents:[{bodyRead:true,body:'연구 결과\n'+outcome}],signal:new AbortController().signal,request:async request=>{if(request.tools[0].name==='record_document_notes')return model(request);const data=JSON.parse(request.input.at(-1).content);return output('write_document_summary',{sections:[{heading:'연구 결과',text:'전체 평균은 78점에서 93.5점으로 상승하였다.',source_ids:[data.notes.at(-1).id]}]});}});assert(report.text.includes(outcome));assert.equal(report.reports[0].sections.length,1);assert.equal(report.reports[0].sections[0].text,outcome);
});
test('cancellation stops remaining document parts and incomplete coverage stays explicitly partial',async()=>{
 const controller=new AbortController();let calls=0;await assert.rejects(summarizeDocument({prompt:'요약',documents:[{bodyRead:true,body:'본문 내용입니다. '.repeat(900)}],signal:controller.signal,send:()=>controller.abort(),request:async()=>{calls++;}}));assert.equal(calls,0);
 const report=await summarizeDocument({prompt:'요약',documents:[{bodyRead:true,body:'교육 프로그램을 개발하여 학생에게 맞춤형 피드백을 제공하였다.'}],complete:false,request:async b=>model(b),signal:new AbortController().signal});assert.match(report.text,/일부 텍스트/);assert.equal(report.complete,false);
});
test('the actual agent routes document summaries through synthesis and checks the source version again before publishing',async()=>{
 for(const changed of [false,true]){let reads=0;const events=[],file='D:/fixture/research.hwp',options={prompt:'현재 문서를 요약해줘',context:file,documentContext:{live:true,path:file},settings:{provider:'local',workspace:'D:/fixture'},signal:new AbortController().signal,send:e=>events.push(e),request:async body=>model(body),execute:async name=>{if(name==='inspect_document_visuals')return {pages:20,token:'fixture',visualPages:[],liveRevision:'stable'};assert.equal(name,'read_live_document');reads++;return {text:'학생의 기초 문해를 실제 교과 학습과 연결하는 교육 프로그램을 개발하였다. '.repeat(30)+'평균은 78점에서 93.5점으로 상승했다.',liveRevision:reads>1&&changed?'changed':'stable',pages:20,truncated:false};}};
  if(changed){await assert.rejects(runAgent(options),e=>e.code==='DOCUMENT_SUMMARY_CHANGED');assert(!events.some(e=>e.type==='text'));}else{const text=await runAgent(options);assert.match(text,/93.5/);assert.match(text,/20쪽/);}assert.equal(reads,2);
 }
});

test('selected-text summaries stay within that selection and unavailable images keep whole-document results partial',async()=>{
 const file='D:/fixture/research.hwp',selected='선택한 수업 내용은 개별화 학습과 피드백을 연결하여 학습 참여를 돕는다.';
 for(const selectionOnly of [true,false]){const outcomes=[];let visualCalls=0;const text=await runAgent({prompt:selectionOnly?'선택한 부분 요약해줘':'현재 문서 요약해줘',documentContext:{path:file,live:true},settings:{provider:'local',workspace:'D:/fixture'},signal:new AbortController().signal,onOutcome:o=>outcomes.push(o),send:()=>{},request:async body=>{if(body.tools[0].name==='record_document_notes'&&selectionOnly)assert(!JSON.stringify(body.input).includes('범위 밖 본문'));return model(body);},execute:async name=>{if(name==='inspect_document_visuals'){visualCalls++;throw Error('시각 분석 사본을 만들지 못했습니다.');}return {text:'범위 밖 본문\n'+selected,liveRevision:'stable',pages:1,truncated:false,selection:{selected_text:selected,truncated:false}};}});
  assert.equal(visualCalls,selectionOnly?0:1);assert.match(text,selectionOnly?/선택 영역/:/시각 분석 미완료/);assert.equal(outcomes.at(-1).complete,selectionOnly);
 }
});
