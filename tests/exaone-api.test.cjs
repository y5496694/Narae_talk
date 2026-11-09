'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const exaone=require('../src/exaone.cjs'),connections=require('../src/connection-settings.cjs');
const endpoint='https://api.exaone.ai/v1/chat/completions',model='k-exaone_v2.5';
const settings={provider:'exaone',connectionMode:'api',endpoint,model};
const reply=message=>({ok:true,json:async()=>({model,choices:[{finish_reason:message.tool_calls?'tool_calls':'stop',message}],usage:{prompt_tokens:10,completion_tokens:12}})});
test('EXAONE selection is the hosted K-EXAONE 2.5 API, not a local model',()=>{
 const original=connections.normalize({provider:'openai',connectionMode:'api',aiConnections:{'openai:api':{endpoint:'https://api.openai.com/v1/responses',model:'keep-gpt'},'local:managed':{endpoint:'http://127.0.0.1:11434/v1',model:'narae4'}}});
 const selected=connections.update(original,{provider:'exaone',connectionMode:'oauth'});
 assert.equal(selected.endpoint,endpoint);assert.equal(selected.model,model);assert.equal(selected.connectionMode,'api');
 assert.equal(connections.update(selected,{provider:'openai',connectionMode:'api'}).model,'keep-gpt');assert.equal(connections.update(selected,{provider:'local'}).model,'narae4');
});
test('upgrade repairs the previous local EXAONE slot without touching other slots',()=>{
 const raw={provider:'exaone',endpoint:'http://127.0.0.1:11434/v1',model:'EXAONE-4.0-1.2B',aiConnections:{'exaone:api':{endpoint:'http://127.0.0.1:11434/v1',model:'EXAONE-4.0-1.2B'},'openai:api':{endpoint:'https://api.openai.com/v1/responses',model:'keep-gpt'}}};
 const normalized=connections.normalize(raw);assert.equal(normalized.endpoint,endpoint);assert.equal(normalized.model,model);assert.equal(normalized.aiConnections['exaone:api'].endpoint,endpoint);assert.equal(normalized.aiConnections['openai:api'].model,'keep-gpt');assert.equal(raw.model,'EXAONE-4.0-1.2B');
 const updated=connections.update(normalized,{endpoint:'http://localhost:11434/v1',model:'wrong-local-model'});assert.equal(updated.endpoint,endpoint);assert.equal(updated.model,model);
});
test('hosted API always requires a key before network access and never accepts local endpoints',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return reply({content:'not reached'});};
 await assert.rejects(exaone.request({settings,body:{},fetchImpl}),/EXAONE_KEY_REQUIRED/);assert.equal(calls,0);
 assert.throws(()=>exaone.endpoint('http://localhost:11434/v1'),/EXAONE_ENDPOINT/);
 assert.throws(()=>exaone.endpoint('https://example.test/v1'),/EXAONE_ENDPOINT/);
 assert.throws(()=>exaone.endpoint('https://api.exaone.ai:8443/v1'),/EXAONE_ENDPOINT/);
 assert.equal(exaone.endpoint('https://api.exaone.ai/v1'),endpoint);
});
test('official hosted model catalog does not invent an undocumented GET models call',async()=>{
 let calls=0;const result=await exaone.listModels({settings,fetchImpl:async()=>{calls++;throw Error('NO_MODELS_ENDPOINT');}});
 assert.deepEqual(result,[{id:model,name:'K-EXAONE 2.5'}]);assert.equal(calls,0);
});
test('hosted request uses Bearer authentication and documented generation settings',async()=>{
 let sent;const result=await exaone.request({settings,apiKey:'fixture-private-key',body:{input:[{role:'user',content:'안녕'}]},fetchImpl:async(url,options)=>{
  assert.equal(url,endpoint);assert.equal(options.method,'POST');assert.equal(options.headers.authorization,'Bearer fixture-private-key');assert.equal(options.redirect,'error');sent=JSON.parse(options.body);return reply({content:'\n\n안녕하세요.',reasoning_content:'private internal reasoning'});
 }});
 assert.equal(sent.model,model);assert.equal(sent.temperature,1);assert.equal(sent.top_p,.95);assert.equal(sent.reasoning_effort,'low');assert.equal(sent.max_tokens,16384);assert.equal(sent.stream,false);assert.equal(sent.chat_template_kwargs.preserve_thinking,true);
 assert.equal(result.output[0].content[0].text,'안녕하세요.');assert.doesNotMatch(JSON.stringify(result.output),/private internal reasoning/);assert.equal(result.usage.prompt_tokens,10);
});
test('tool reasoning is returned to the API on the next turn but is not emitted as chat text',async()=>{
 const first=await exaone.request({settings,apiKey:'fixture-key',body:{input:[{role:'user',content:'파일 확인'}],tools:[{name:'list_files',parameters:{type:'object'}}],tool_choice:'required'},fetchImpl:async()=>reply({content:null,reasoning_content:'private tool reasoning',tool_calls:[{id:'call-one',type:'function',function:{name:'list_files',arguments:'{}'}}]})});
 const input=[{role:'user',content:'파일 확인'},...first.output,{type:'function_call_output',call_id:'call-one',output:'{"files":["proof.txt"]}'}];let sent;
 const second=await exaone.request({settings,apiKey:'fixture-key',body:{input},fetchImpl:async(url,options)=>{sent=JSON.parse(options.body);return reply({content:'proof.txt를 확인했습니다.'});}});
 const assistant=sent.messages.find(m=>m.role==='assistant'&&m.tool_calls);assert.equal(assistant.reasoning_content,'private tool reasoning');assert.equal(assistant.tool_calls[0].id,'call-one');assert.equal(sent.messages.at(-1).role,'tool');assert.equal(second.output[0].content[0].text,'proof.txt를 확인했습니다.');
});
test('API failures expose only stable error codes, not upstream messages or API keys',async()=>{
 await assert.rejects(exaone.request({settings,apiKey:'fixture-secret',body:{},fetchImpl:async()=>({ok:false,status:401,json:async()=>({error:{message:'fixture-secret debug provider internals'}})})}),e=>e.message==='AI 생성에 실패했습니다. 오류 코드: EXAONE_HTTP_401');
 await assert.rejects(exaone.request({settings,apiKey:'fixture-secret',body:{},fetchImpl:async()=>{throw Error('fixture-secret transport detail');}}),e=>e.message==='AI 생성에 실패했습니다. 오류 코드: EXAONE_NETWORK');
});
