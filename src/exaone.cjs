'use strict';
const {randomUUID}=require('node:crypto');
const API_ENDPOINT='https://api.exaone.ai/v1/chat/completions',MODEL='k-exaone_v2.5',PLATFORM_URL='https://docs.exaone.ai/ko/docs/overview';
const fault=code=>Object.assign(new Error('AI 생성에 실패했습니다. 오류 코드: '+code),{code});
function endpoint(value=API_ENDPOINT){
 let u;try{u=new URL(value);}catch{throw fault('EXAONE_ENDPOINT');}
 if(u.origin!=='https://api.exaone.ai'||u.username||u.password||u.hash||u.search||!['','/','/v1','/v1/','/v1/chat/completions','/v1/chat/completions/'].includes(u.pathname))throw fault('EXAONE_ENDPOINT');
 return API_ENDPOINT;
}
function messages(body){
 const out=[{role:'system',content:body.instructions||''}];
 const input=Array.isArray(body.input)?body.input:[{role:'user',content:String(body.input||'')}];
 for(const item of input){
  if(item.type==='function_call'){
   const call={id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments||'{}'}};
   if(out.at(-1)?.role==='assistant'&&out.at(-1).tool_calls)out.at(-1).tool_calls.push(call);
   else out.push({role:'assistant',content:'',tool_calls:[call]});
   if(typeof item._exaoneReasoning==='string')out.at(-1).reasoning_content=item._exaoneReasoning;
  }
  else if(item.type==='function_call_output')out.push({role:'tool',tool_call_id:item.call_id,content:typeof item.output==='string'?item.output:JSON.stringify(item.output??'')});
  else if(['user','assistant'].includes(item.role)){
   const content=typeof item.content==='string'?item.content:(item.content||[]).map(p=>{if(p.type==='input_image')throw fault('EXAONE_IMAGE_UNSUPPORTED');if(!['input_text','output_text','text'].includes(p.type))throw fault('EXAONE_INPUT_FORMAT');return p.text||'';}).join('\n');out.push({role:item.role,content});
  }
 }
 return out;
}
async function call({settings,apiKey,signal,body,fetchImpl=fetch}){
 const url=endpoint(settings.endpoint);
 if(typeof apiKey!=='string'||!apiKey.trim())throw fault('EXAONE_KEY_REQUIRED');
 if(settings.model!==MODEL)throw fault('EXAONE_MODEL');
 const data={model:MODEL,messages:messages(body),temperature:1.0,top_p:0.95,reasoning_effort:'low',chat_template_kwargs:{preserve_thinking:true},stream:false,max_tokens:body.max_output_tokens||16384,
  ...(body.tools?.length?{tools:body.tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}})),tool_choice:body.tool_choice==='required'?'required':'auto',parallel_tool_calls:false}:{})};
 let response;
 try{response=await fetchImpl(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:'Bearer '+apiKey.trim()},signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(180000)]),body:JSON.stringify(data)});}
 catch(error){if(signal?.aborted)throw fault('EXAONE_CANCELLED');throw fault(error.name==='TimeoutError'?'EXAONE_TIMEOUT':'EXAONE_NETWORK');}
 if(!response.ok)throw fault('EXAONE_HTTP_'+response.status);
 try{return await response.json();}catch{throw fault('EXAONE_RESPONSE');}
}
async function request(options){
 const data=await call(options),choice=data.choices?.[0];
 if(data.model&&data.model!==MODEL)throw fault('EXAONE_MODEL_MISMATCH');
 if(!choice||!['stop','tool_calls'].includes(choice.finish_reason))throw fault('EXAONE_INCOMPLETE');const output=[];
 if(choice.message?.tool_calls?.length){
  for(const [index,t]of choice.message.tool_calls.entries()){
   const f=t.function;if(t.type!=='function'||!options.body.tools?.some(x=>x.name===f?.name))throw fault('EXAONE_UNKNOWN_TOOL');let args;
   try{args=JSON.parse(f.arguments||'{}');}catch{throw fault('EXAONE_TOOL_ARGUMENTS');}if(!args||Array.isArray(args)||typeof args!=='object')throw fault('EXAONE_TOOL_ARGUMENTS');
   const item={type:'function_call',name:f.name,arguments:JSON.stringify(args),call_id:t.id||randomUUID()};
   // Keep tool-turn reasoning only in the in-memory model history, never as user-visible text.
   if(index===0&&typeof choice.message.reasoning_content==='string')Object.defineProperty(item,'_exaoneReasoning',{value:choice.message.reasoning_content});
   output.push(item);
  }
 }else{
  const text=choice.message?.content;if(typeof text!=='string'||!text.trim())throw fault('EXAONE_EMPTY');output.push({type:'message',role:'assistant',content:[{type:'output_text',text:text.trim()}]});
 }
 return {output,...(data.usage?{usage:data.usage}:{})};
}
// The official docs publish a single text model, not a GET /v1/models contract.
// This is a catalog, not an authentication check; the UI offers a separate real call.
async function listModels(){return [{id:MODEL,name:'K-EXAONE 2.5'}];}
module.exports={request,listModels,messages,endpoint,API_ENDPOINT,MODEL,PLATFORM_URL};
