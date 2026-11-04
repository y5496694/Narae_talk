'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {analyzeVisuals,conciseVisual}=require('../src/document-visual-summary.cjs');
const png=fs.readFileSync(path.resolve(__dirname,'../ui/assets/narae-office.png')).toString('base64');
test('actual page image inputs are analyzed individually and every detected visual page is covered',async()=>{
 const seen=[],result=await analyzeVisuals({manifest:{pages:3,token:'snapshot',visualPages:[{page:0},{page:2}]},prompt:'그림도 포함해 요약',signal:new AbortController().signal,readPage:async page=>({token:'snapshot',image:{mimeType:'image/png',base64:png},text:'그리기 활동과 피드백을 보여 주는 화면'}),request:async body=>{const content=body.input.at(-1).content;assert.equal(content.filter(p=>p.type==='input_image').length,1);assert.equal(body.documentProse,true);assert.equal(body.tools.length,0);seen.push(Number(content[0].text.match(/문서 (\d+)쪽/)[1]));return {output:[{type:'message',content:[{type:'output_text',text:'왼쪽에 입력 화면이 있고 오른쪽에 결과 화면이 배치되어 있다. 학습자가 그린 도형에 시각적인 피드백을 제공하는 구성을 보여 준다.'}]}]};}});assert.deepEqual(seen,[1,3]);assert.equal(result.pages,2);assert(result.notes.every(n=>n.text.includes('왼쪽')));assert.deepEqual(result.uncertain,[]);assert(result.complete);
});
test('changed snapshots and uncertain numeric OCR remain explicitly unconfirmed',async()=>{
 const manifest={pages:1,token:'snapshot',visualPages:[{page:0}]};let inferred=false;const wrong=await analyzeVisuals({manifest,signal:new AbortController().signal,readPage:async()=>({token:'wrong',image:{mimeType:'image/png',base64:png}}),request:async()=>{inferred=true;}});assert(!inferred);assert.equal(wrong.complete,false);assert.equal(wrong.failed[0].page,1);
 const unconfirmed=await analyzeVisuals({manifest,prompt:'요약',signal:new AbortController().signal,readPage:async()=>({token:'snapshot',text:'점수는 흐려 판독하기 어려움',image:{mimeType:'image/png',base64:png}}),request:async()=>({output:[{type:'message',content:[{type:'output_text',text:'흐린 결과에서 100점을 확인했다.'}]}]})});assert.equal(unconfirmed.complete,false);assert.equal(unconfirmed.notes.length,0);assert.match(unconfirmed.failed[0].error,/수치/);
});

test('visual descriptions cannot promote a table row into an unsupported software stage',async()=>{
 const result=await analyzeVisuals({manifest:{pages:1,token:'snapshot',visualPages:[{page:0}]},referenceText:'1단계 그리기\n3 AI 스케치북',readPage:async()=>({token:'snapshot',text:'1단계 그리기\n3 AI 스케치북',image:{mimeType:'image/png',base64:png}}),request:async()=>({truncated:true,output:[{type:'message',content:[{type:'output_text',text:'3단계는 AI 스케치북으로, 왼쪽 낙서를 오른쪽 그림으로 바꾸는 화면입니다.'}]}]})});
 assert(result.complete);assert(!result.notes[0].text.includes('3단계'));assert.match(result.notes[0].text,/해당 활동은/);assert.equal(result.notes[0].uncertain,true);assert.deepEqual(result.uncertain,['v0001']);
});

test('repetitive visual output is bounded and keeps the actual spatial relationship as uncertain evidence',()=>{
 const sentence='왼쪽에는 입력한 도형이 있고 오른쪽에는 변환한 결과 그림이 배치되어 있습니다.';const result=conciseVisual(('프로그램 개요입니다. '+sentence+' ').repeat(20));assert.equal(result.text,sentence);assert.equal(result.uncertain,true);assert(result.text.length<=480);
});
test('text requests keep the already loaded Narae4 vision model instead of reloading a text-only runtime',async()=>{
 const {LocalAI}=require('../src/local-ai.cjs'),home=fs.mkdtempSync(path.join(os.tmpdir(),'narae-retain-vision-')),ai=new LocalAI({root:path.resolve(__dirname,'..'),home});let vision;
 try{ai.active={id:'narae4',alias:'test-model',projector:{}};ai.vision=true;ai.activate=async(_id,options)=>{vision=options.vision;};ai.fitMessages=async()=>{};ai.api=async()=>({model:'test-model',choices:[{finish_reason:'stop',message:{content:'{"type":"final","text":"확인했습니다."}'}}]});await ai.request({settings:{provider:'local',localSource:'managed',model:'narae4'},body:{instructions:'요약',input:[{role:'user',content:'본문을 종합해줘'}],tools:[]}});assert.equal(vision,true);}finally{await ai.close();if(path.basename(home).startsWith('narae-retain-vision-'))fs.rmSync(home,{recursive:true,force:true});}
});

test('visual prose uses plain text generation without the action JSON grammar and cannot offer tools',async()=>{
 const {LocalAI,messagesFor}=require('../src/local-ai.cjs'),home=fs.mkdtempSync(path.join(os.tmpdir(),'narae-visual-prose-')),ai=new LocalAI({root:path.resolve(__dirname,'..'),home});let payload;
 try{ai.active={id:'narae4',alias:'test-model',projector:{}};ai.vision=true;ai.activate=async()=>{};ai.fitMessages=async()=>{};ai.api=async(_url,body)=>{payload=body;return {model:'test-model',choices:[{finish_reason:'stop',message:{content:'왼쪽은 입력 화면이고 오른쪽은 변환된 결과 화면입니다.'}}]};};const answer=await ai.request({settings:{provider:'local',localSource:'managed',model:'narae4'},body:{instructions:'이미지의 관계를 설명',documentProse:true,input:[{role:'user',content:'시각 분석'}],tools:[]}});assert.equal(payload.response_format,undefined);assert(!payload.messages[0].content.includes('응답은 JSON 하나'));assert.match(answer.output[0].content[0].text,/오른쪽/);assert.throws(()=>messagesFor({instructions:'설명',documentProse:true,tools:[{name:'write'}],input:[]}),/도구/);}finally{await ai.close();if(path.basename(home).startsWith('narae-visual-prose-'))fs.rmSync(home,{recursive:true,force:true});}
});

test('length-limited visual prose retains complete sentences and explicitly reports truncation',async()=>{
 const {LocalAI}=require('../src/local-ai.cjs'),home=fs.mkdtempSync(path.join(os.tmpdir(),'narae-prose-length-')),ai=new LocalAI({root:path.resolve(__dirname,'..'),home});
 try{ai.active={id:'narae4',alias:'test-model',projector:{}};ai.vision=true;ai.activate=async()=>{};ai.fitMessages=async()=>{};ai.api=async()=>({model:'test-model',choices:[{finish_reason:'length',message:{content:'왼쪽은 입력 화면이고 오른쪽은 변환된 결과 화면입니다. 마지막 설명은 생성 도중'}}]});const answer=await ai.request({settings:{provider:'local',localSource:'managed',model:'narae4'},body:{instructions:'시각 자료 설명',documentProse:true,input:[],tools:[]}});assert.equal(answer.truncated,true);assert.equal(answer.output[0].content[0].text,'왼쪽은 입력 화면이고 오른쪽은 변환된 결과 화면입니다.');}finally{await ai.close();fs.rmSync(home,{recursive:true,force:true});}
});
test('short document fields can contain a real curriculum area while visual descriptions still require prose',async()=>{
 const {LocalAI}=require('../src/local-ai.cjs'),home=fs.mkdtempSync(path.join(os.tmpdir(),'narae-field-prose-')),ai=new LocalAI({root:path.resolve(__dirname,'..'),home});
 try{ai.active={id:'narae4',alias:'test-model',projector:{}};ai.vision=true;ai.activate=async()=>{};ai.fitMessages=async()=>{};let payload;ai.api=async(_url,body)=>{payload=body;return {model:'test-model',choices:[{finish_reason:'stop',message:{content:'수와 연산'}}]};};const settings={provider:'local',localSource:'managed',model:'narae4'},body={instructions:'교과 영역명만 작성',documentProse:true,input:[],tools:[]};await assert.rejects(ai.request({settings,body}),/문서 설명/);const result=await ai.request({settings,body:{...body,documentField:true}});assert.equal(result.output[0].content[0].text,'수와 연산');assert.equal(payload.temperature,0.7);assert.equal(payload.presence_penalty,1.5);assert.equal(payload.top_p,0.8);assert.equal(payload.response_format,undefined);}finally{await ai.close();fs.rmSync(home,{recursive:true,force:true});}
});
