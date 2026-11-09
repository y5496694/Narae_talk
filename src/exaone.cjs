'use strict';
const {randomUUID}=require('node:crypto');
const fault=code=>Object.assign(new Error('AI 생성에 실패했습니다. 오류 코드: '+code),{code});
function endpoint(value,models=false){const u=new URL(value);if(u.username||u.password||u.hash||u.search||u.protocol!=='https:'&&!(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)))throw fault('EXAONE_ENDPOINT');u.pathname=u.pathname.replace(/\/(?:chat\/completions|models)\/?$/,'').replace(/\/$/,'')+(models?'/models':'/chat/completions');return u.href;}
function messages(body){
 const out=[{role:'system',content:body.instructions||''}];
 for(const item of body.input||[]){
  if(item.type==='function_call'){const call={id:item.call_id,type:'function',function:{name:item.name,arguments:item.arguments||'{}'}};if(out.at(-1)?.role==='assistant'&&out.at(-1).tool_calls)out.at(-1).tool_calls.push(call);else out.push({role:'assistant',content:null,tool_calls:[call]});}
  else if(item.type==='function_call_output')out.push({role:'tool',tool_call_id:item.call_id,content:String(item.output||'')});
  else if(['user','assistant'].includes(item.role)){const content=typeof item.content==='string'?item.content:(item.content||[]).map(p=>{if(p.type==='input_image')throw fault('EXAONE_IMAGE_UNSUPPORTED');if(!['input_text','output_text','text'].includes(p.type))throw fault('EXAONE_INPUT_FORMAT');return p.text||'';}).join('\n');out.push({role:item.role,content});}
 }
 return out;
}
async function call({settings,apiKey,signal,body,fetchImpl=fetch},models=false){const url=endpoint(settings.endpoint,models),u=new URL(url);if(!apiKey&& !['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw fault('EXAONE_KEY_REQUIRED');
 const response=await fetchImpl(url,{method:models?'GET':'POST',redirect:'error',headers:{'content-type':'application/json',...(apiKey?{authorization:'Bearer '+apiKey}:{})},signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(models?15000:180000)]),...(models?{}:{body:JSON.stringify({model:settings.model,messages:messages(body),temperature:0,stream:false,max_tokens:body.max_output_tokens||2048,...(body.tools?.length?{tools:body.tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.parameters}})),tool_choice:body.tool_choice==='required'?'required':'auto',parallel_tool_calls:false}:{})})})});
 if(!response.ok)throw fault('EXAONE_HTTP_'+response.status);return response.json();
}
async function request(options){const data=await call(options),choice=data.choices?.[0];if(!choice||!['stop','tool_calls'].includes(choice.finish_reason))throw fault('EXAONE_INCOMPLETE');const output=[];
 if(choice.message?.tool_calls?.length){for(const t of choice.message.tool_calls){const f=t.function;if(t.type!=='function'||!options.body.tools?.some(x=>x.name===f?.name))throw fault('EXAONE_UNKNOWN_TOOL');let args;try{args=JSON.parse(f.arguments||'{}');}catch{throw fault('EXAONE_TOOL_ARGUMENTS');}if(!args||Array.isArray(args)||typeof args!=='object')throw fault('EXAONE_TOOL_ARGUMENTS');output.push({type:'function_call',name:f.name,arguments:JSON.stringify(args),call_id:t.id||randomUUID()});}}
 else {const text=choice.message?.content;if(typeof text!=='string'||!text.trim())throw fault('EXAONE_EMPTY');output.push({type:'message',role:'assistant',content:[{type:'output_text',text}]});}return {output};
}
async function listModels(options){const data=await call(options,true);if(!Array.isArray(data.data))throw fault('EXAONE_MODELS');return data.data.filter(x=>typeof x.id==='string').map(x=>({id:x.id,name:x.id}));}
module.exports={request,listModels,messages,endpoint};
