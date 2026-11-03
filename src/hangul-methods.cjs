'use strict';
const fs=require('node:fs'),path=require('node:path');
const {same}=require('./hangul-workspace.cjs');
function hangulMethods({documents,preview,native,assertSender,chooseFile,canSelect,execute,output,idle,setPane}){
 const current=()=>{const file=documents.state().document?.path;if(!file)throw Error('먼저 한글 문서를 열거나 선택하세요.');return file;};
 const guard=fn=>async(args,event)=>{assertSender(event);return fn(args||{},event);};
 return {
  hangulPane:guard(({expanded},event)=>{if(typeof expanded!=='boolean')throw Error('한글 화면 표시 상태를 확인하세요.');return setPane(event,expanded);}),
  hangulState:guard(()=>documents.refresh()),
  hangulFollow:guard(()=>documents.follow()),
  hangulChoose:guard(async(_args,event)=>{const file=await chooseFile(event);return file?documents.select(file):documents.state();}),
  hangulSelect:guard(async({path:file})=>{await documents.refresh();if(!canSelect(file))throw Error('열린 문서 또는 최근 선택한 문서를 고르세요.');return documents.select(file);}),
  hangulOpenNative:guard(async()=>{const file=current();await native.openFile(file);return documents.refresh();}),
  hangulPreview:guard(({path:file,page,token,refresh})=>{if(file&&!same(file,current()))throw Error('미리보기 대상이 변경되었습니다.');return preview.render(current(),{page,token,refresh});}),
  hangulRead:guard(async()=>{const state=documents.state(),result=await execute(state.document?.live?'read_live_document':'read_document',{path:current()});return {...result,text:result.text||(result.paragraphs||result.blocks||[]).map(p=>p.text).join('\n')};}),
  hangulCreate:guard(async({name,title='',text=''})=>{idle();if(typeof name!=='string'||!name.trim()||!/^.{1,200}\.hwpx?$/i.test(name)||path.basename(name)!==name)throw Error('새 HWP/HWPX 파일 이름을 입력하세요.');if(typeof text!=='string'||text.length>200000||typeof title!=='string'||title.length>200)throw Error('문서 제목·본문을 확인하세요.');const file=output(name),result=await execute('create_document',{path:file,title,text});documents.select(result.path);return documents.state();}),
  hangulExport:guard(async()=>{idle();const file=current(),target=output(path.basename(file,path.extname(file))+'-'+Date.now()+'.pdf');return preview.export(file,target);})
 };
}
module.exports={hangulMethods};
