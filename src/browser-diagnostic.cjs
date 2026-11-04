'use strict';
function task(prompt){const match=prompt.trim().match(/^브라우저 화면 진단(?:\s+필터\s+["“]([^"”]{1,80})["”])?[.!\s]*$/);return match?{area:'browser-diagnostic',observe:false,diagnostic:true,filter:match[1]}:null;}
const location=value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch{return '';}};
function step(task,input,all){
 const call=input.find(i=>i.type==='function_call'&&i.name==='gyomu_browser');
 if(!call){const args={action:'snapshot',limit:20,chars:500,...(task.filter?{filter:task.filter}:{})},tool=structuredClone(all.find(t=>t.name==='gyomu_browser'));if(!tool)return {tools:[],receipt:'브라우저 관찰 도구가 없습니다.'};tool.parameters={type:'object',properties:Object.fromEntries(Object.entries(args).map(([key,value])=>[key,{type:typeof value==='number'?'integer':'string',enum:[value]}])),required:Object.keys(args),additionalProperties:false};return {tools:[tool],required:true,invoke:{name:'gyomu_browser',args},instructions:'연결된 현재 화면을 한 번만 읽는다. 새 창·로그인·클릭·입력을 실행하지 않는다.'};}
 let value;try{value=JSON.parse(input.find(i=>i.type==='function_call_output'&&i.call_id===call.call_id)?.output||'{}');}catch{return {tools:[],receipt:'화면 관찰 결과를 읽지 못했습니다.'};}
 if(value.error)return {tools:[],receipt:'화면 관찰 실패: '+String(value.error).slice(0,300),complete:false};
 const result={title:value.title,url:location(value.url),dialog:value.dialog,filter:task.filter||null,hasMore:value.hasMore,totalElements:value.totalElements,elements:(value.elements||[]).map(({ref,label,role,tag,id,disabled})=>({ref,label,role,tag,id,...(disabled?{disabled:true}:{})})),frames:(value.frames||[]).map(({index,name,url})=>({index,name,url:location(url)}))};
 return {tools:[],complete:true,receipt:'현재 화면 진단 · 읽기 전용\n'+JSON.stringify(result,null,2)};
}
module.exports={task,step};
