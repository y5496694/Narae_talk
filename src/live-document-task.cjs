'use strict';
const {same}=require('./hangul-workspace.cjs');
const {textReplacement}=require('./document-task.cjs');
const {wantsSummary}=require('./document-summary.cjs');
const path=require('node:path');
function verifiedText(before,after,operations){
 let candidates=[before];
 for(const op of operations){
  if(!['replace_text','replace_selection'].includes(op.op))continue;
  const next=[];for(const text of candidates){let offset=0,index=0;for(let found;(found=text.indexOf(op.text,offset))>=0&&index<512;offset=found+Math.max(1,op.text.length),index++){if(op.op==='replace_selection'||index===(op.occurrence||0))next.push(text.slice(0,found)+op.replacement+text.slice(found+op.text.length));}}
  candidates=next;if(!candidates.length)return false;
 }
 return candidates.includes(after);
}
function liveDocumentStep(prompt,input,all,documentContext,workspace){
 if(!documentContext?.live||/새\s*(?:한글\s*)?문서/.test(prompt)||/만들|생성|작성/.test(prompt)&&!/PDF/i.test(prompt)||!/읽|요약|정리|핵심|내용|수정|고쳐|바꾸|바꿔|변경|굵게|글꼴|서식|선택|이\s*부분|현재|PDF|검토|문단|번역/.test(prompt))return null;
 if(/표|이미지|그림|사진|셀/.test(prompt)&&/추가|삭제|삽입|병합|너비|높이/.test(prompt))return null;
 const file=documentContext.path,records=[];
 for(const item of input){if(item.type!=='function_call_output')continue;const call=input.find(c=>c.type==='function_call'&&c.call_id===item.call_id);if(!call)continue;try{const args=JSON.parse(call.arguments);if(same(args.path,file))records.push({name:call.name,args,value:JSON.parse(item.output)});}catch{}}
 const read=records.findLast(r=>r.name==='read_live_document'&&!r.value?.error),edit=records.findLast(r=>r.name==='edit_live_document');
 const required=(name,args,message)=>{const tool=structuredClone(all.find(t=>t.name===name));if(!tool)return {tools:[],complete:false,receipt:'열린 한글 문서 도구가 연결되어 있지 않습니다.'};tool.parameters={type:'object',properties:Object.fromEntries(Object.entries(args).map(([k,v])=>[k,{type:typeof v==='string'?'string':'array',enum:[v],...(Array.isArray(v)?{items:{type:'object'}}:{})}])),required:Object.keys(args),additionalProperties:false};return {tools:[tool],required:true,instructions:message};};
 if(edit?.value?.error)return {tools:[],complete:false,receipt:'열린 한글 편집이 완료되지 않았습니다. '+edit.value.error};
 if(!read||edit&&records.indexOf(read)<records.indexOf(edit))return required('read_live_document',{path:file},edit?'편집한 실제 열린 한글의 본문을 다시 읽어 저장·변경 결과를 확인하세요.':'현재 열린 한글의 미저장 본문과 실제 선택 영역, liveRevision을 먼저 읽으세요. 파일 사본으로 대체하지 않습니다.');
 if(/PDF/i.test(prompt)&&/출력|내보내|사본|저장|만들|생성/.test(prompt)){
  const exported=records.findLast(r=>r.name==='export_pdf');if(exported)return {tools:[],complete:exported.value.pages>0&&exported.value.bytes>0,receipt:exported.value.pages>0&&exported.value.bytes>0?'현재 열린 한글의 PDF 사본을 저장했습니다.\n'+exported.value.path:'PDF 출력을 확인하지 못했습니다. '+(exported.value.error||'출력 결과 없음')};
  const name=prompt.match(/["“]([^"“”\r\n]+\.pdf)["”]/i)?.[1]||path.basename(file,path.extname(file))+'-'+Date.now()+'.pdf';return required('export_pdf',{path:file,target:path.resolve(workspace||path.dirname(file),name)},'현재 열린 한글의 실제 내용을 저장하지 않고 PDF 사본으로 출력하고 쪽 수·바이트를 확인합니다.');
 }
 if(edit){const before=records.slice(0,records.indexOf(edit)).findLast(r=>r.name==='read_live_document');const ok=edit.value.verified===true&&edit.value.completed===edit.args.operations.length&&read.value.liveRevision===edit.value.liveRevision&&!before?.value.truncated&&!read.value.truncated&&verifiedText(before.value.text,read.value.text,edit.args.operations);return {tools:[],complete:ok,receipt:ok?'현재 열린 한글 문서를 편집하고 본문을 다시 읽어 확인했습니다.\n'+file+'\n'+(edit.value.saved?'변경을 저장했습니다.':'자동 저장 설정에 따라 한글의 미저장 상태로 유지했습니다.')+'\n복구 사본: '+(edit.value.liveBackup||edit.value.backup):'편집 후 원문·저장 결과를 모두 대조하지 못했습니다. 현재 한글 내용을 확인하세요.'};}
 const editing=/수정|고쳐|바꾸|바꿔|변경|굵게|글꼴|서식|번역/.test(prompt);
 if(!editing){const summary=wantsSummary(prompt),selected=/선택|이\s*부분/.test(prompt)?read.value.selection:null;if(summary&&/선택|이\s*부분/.test(prompt)&&!selected?.selected_text)return {tools:[],complete:false,receipt:'한글에서 요약할 텍스트를 선택한 뒤 다시 요청하세요.'};const body=selected?.selected_text||read.value.text,complete=!(selected?selected.truncated:read.value.truncated);return {tools:[],complete,evidenceReport:summary,...(summary?{documentSummary:{complete,pages:selected?undefined:read.value.pages,scope:selected?'선택 영역':'문서 전체 텍스트',verify:{name:'read_live_document',args:{path:file},revision:read.value.liveRevision,key:'liveRevision'}}}:{}),context:{documents:[{title:file,bodyRead:true,body:summary?body:body.slice(0,12000),attachments:[]}],selection:read.value.selection},instructions:'현재 열린 한글에서 실제 읽은 본문과 선택 영역만 근거로 답하세요. 일부 본문만 제공됐으면 그 범위를 표시하세요.'};}
 const selected=read.value.selection,useSelection=Boolean(selected?.selected_text&&!/전체|모든\s*문단|문서\s*전체/.test(prompt));
 if(/선택|이\s*부분/.test(prompt)&&!useSelection)return {tools:[],complete:false,receipt:'한글에서 바꿀 텍스트를 선택한 뒤 다시 요청하세요. 현재 선택 영역을 확인하지 못했습니다.'};
 if(useSelection&&(selected.truncated||documentContext.selection?.content_deferred||documentContext.selection?.selected_text&&JSON.stringify([documentContext.selection.start,documentContext.selection.end,documentContext.selection.selected_text])!==JSON.stringify([selected.start,selected.end,selected.selected_text])))return {tools:[],complete:false,receipt:'선택 영역이 변경되었거나 전체를 읽지 못했습니다. 한글에서 다시 선택하고 요청하세요.'};
 const change=textReplacement(prompt),quotes=[...prompt.matchAll(/["“‘']([^"“”‘’'\r\n]+)["”’']/g)].map(m=>m[1]);
 const styles={...(/굵게/.test(prompt)?{bold:true}:{}),...(/굵기\s*해제|보통\s*굵기/.test(prompt)?{bold:false}:{}),...(/기울임/.test(prompt)?{italic:true}:{}),...(/밑줄/.test(prompt)?{underline:true}:{})};const size=prompt.match(/(\d+(?:\.\d+)?)\s*(?:pt|포인트)/i);if(size)styles.font_size=Number(size[1]);
 if(useSelection){
  const replacement=change&&selected.selected_text===change.from?change.to:quotes.length===1&&/바꾸|바꿔|변경|고쳐|수정/.test(prompt)?quotes[0]:undefined;
  const operation={op:Object.keys(styles).length?'set_selection_style':'replace_selection',text:selected.selected_text,start:selected.start,end:selected.end,...styles,...(replacement!==undefined?{replacement}:{})};
  if(replacement!==undefined||Object.keys(styles).length)return required('edit_live_document',{path:file,liveRevision:read.value.liveRevision,operations:[operation]},'실제로 읽은 선택 영역의 좌표와 원문이 일치하는 한 범위만 편집합니다. 다른 문장과 서식은 유지하고 저장 후 다시 읽으세요.');
 }
 if(change&&!useSelection){const count=read.value.text.split(change.from).length-1;if(count!==1)return {tools:[],complete:false,receipt:'바꿀 원문을 한 곳으로 확정하지 못했습니다. 한글에서 해당 범위를 선택한 뒤 요청하세요.'};return required('edit_live_document',{path:file,liveRevision:read.value.liveRevision,operations:[{op:'replace_text',text:change.from,replacement:change.to,expected_count:1,occurrence:0}]},'현재 열린 문서에서 확인한 유일한 원문만 바꾸고 다시 읽어 검증합니다.');}
 const tool=structuredClone(all.find(t=>t.name==='edit_live_document'));if(!tool)return null;tool.parameters.properties.path={type:'string',enum:[file]};tool.parameters.properties.liveRevision={type:'string',enum:[read.value.liveRevision]};tool.parameters.required=['path','liveRevision','operations'];
 if(useSelection){const props=tool.parameters.properties.operations.items.properties;props.op={type:'string',enum:['replace_selection','set_selection_style']};props.text={type:'string',enum:[selected.selected_text]};props.start={type:'array',enum:[selected.start],items:{type:'integer'}};props.end={type:'array',enum:[selected.end],items:{type:'integer'}};tool.parameters.properties.operations.items.required=['op','text','start','end'];tool.parameters.properties.operations.minItems=1;tool.parameters.properties.operations.maxItems=1;}
 return {tools:[tool],required:true,context:{path:file,text:read.value.text.slice(0,12000),selection:selected},instructions:'읽은 현재 문서와 실제 선택 영역을 대상으로 요청한 텍스트·서식만 편집하세요. liveRevision은 실제 값을 그대로 사용하며 저장 후 다시 읽어 검증합니다.'};
}
module.exports={liveDocumentStep,verifiedText};
