'use strict';
const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {same}=require('./hangul-workspace.cjs');
class HangulPreview{
 constructor({native,python,home,runPython=require('./python.cjs').runPython}){Object.assign(this,{native,python,home,runPython});this.entries=new Map();}
 async render(file,{page=0,token,refresh=false}={}){
  file=fs.realpathSync(file);if(!Number.isSafeInteger(page)||page<0)throw Error('미리보기 쪽 번호를 확인하세요.');
  let entry=this.entries.get(file.toLowerCase());
  if(refresh||!entry||token!==entry.token||!fs.existsSync(entry.pdf))entry=await this.native.withFileLock(file,async()=>{
   const state=await this.native.list(),opened=state.open_document_list.find(d=>same(d.local_path,file));
   if(opened&&!opened.is_active_document&&opened.modified!==false)throw Error('미저장 문서의 미리보기를 보려면 한글에서 해당 문서를 활성화하세요.');
   const token=randomUUID(),folder=path.join(this.home,'cache/hangul-preview');fs.mkdirSync(folder,{recursive:true});const pdf=path.join(folder,token+'.pdf'),before=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
   const live=Boolean(opened?.is_active_document),result=await this.runPython(this.python,this.home,live?'live_hangul.py':'documents.py',live?{action:'preview',path:file,target:pdf}:{action:'previewNativeHangul',path:file,target:pdf});
   if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==before)throw Error('미리보기 중 원본 파일이 변경되었습니다. 다시 확인하세요.');
   const value={file,pdf,token,pages:result.pages,live,modified:opened?.modified===true,sourceHash:before,liveRevision:result.liveRevision};this.entries.set(file.toLowerCase(),value);return value;
  });
  const result=await this.runPython(this.python,this.home,'documents.py',{action:'inspect',path:entry.pdf,page});return {...result,token:entry.token,live:entry.live,modified:entry.modified,sourcePath:file};
 }
 async inspectVisuals(file,{page,token}={}){
  file=fs.realpathSync(file);const key=file.toLowerCase();
  if(page===undefined){const first=await this.render(file,{page:0,refresh:true}),entry=this.entries.get(key);entry.visuals=await this.runPython(this.python,this.home,'pdf_visuals.py',{path:entry.pdf});return {kind:'document_visuals',pages:entry.pages,visualPages:entry.visuals.visualPages,token:first.token,sourceHash:entry.sourceHash,liveRevision:entry.liveRevision};}
  const entry=this.entries.get(key);if(!Number.isSafeInteger(page)||page<0||!entry||page>=entry.pages||token!==entry.token||!entry.visuals)throw Error('같은 문서의 시각 분석 목록을 먼저 확인하세요.');if(!fs.existsSync(entry.pdf))throw Error('시각 분석 사본이 삭제되었습니다. 다시 읽어야 합니다.');const result=await this.runPython(this.python,this.home,'pdf_visuals.py',{action:'render',path:entry.pdf,page,bounds:entry.visuals.pageInfo[page]?.bounds});return {kind:'image',page,pages:entry.pages,token,image:{mimeType:'image/png',base64:result.image},text:entry.visuals.pageInfo[page]?.text||'',sourceHash:entry.sourceHash,liveRevision:entry.liveRevision};
 }
 async export(file,target){if(fs.existsSync(target))throw Error('PDF 사본은 새 이름으로 저장하세요.');const result=await this.render(file,{refresh:true}),entry=this.entries.get(fs.realpathSync(file).toLowerCase());fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(entry.pdf,target,fs.constants.COPYFILE_EXCL);return {path:target,pages:result.pages,bytes:fs.statSync(target).size,source_unchanged:true,live:result.live};}
}
module.exports={HangulPreview};
