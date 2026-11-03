'use strict';
const fs=require('node:fs'),path=require('node:path');
const canonical=file=>fs.realpathSync(path.resolve(file));
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&path.resolve(a).toLowerCase()===path.resolve(b).toLowerCase();
class HangulWorkspace{
 constructor({native,authorize=()=>{},notify=()=>{},recent=()=>[]}={}){Object.assign(this,{native,authorize,notify,recent});this.followActive=true;this.file=null;this.info={open_document_list:[]};this.revision=0;this.previewRevision=0;this.active=false;this.error='';this.onInfo=info=>this.update(info);this.onError=error=>{this.error=String(error);this.changed();};}
 start(){if(this.active)return;this.active=true;this.native.on('document-info',this.onInfo);this.native.on('unavailable',this.onError);this.native.watch({interval:1500});}
 stop(){this.active=false;this.native.off('document-info',this.onInfo);this.native.off('unavailable',this.onError);this.native.unwatch();}
 changed(){this.revision++;this.notify(this.state());}
 update(info){this.info=info;this.error='';const opened=this.docs(),current=opened.find(d=>d.is_foreground)||opened.find(d=>d.is_active_document),key=current?current.local_path.toLowerCase()+':'+current.pid:'';if(current&&this.lastNativeKey!==undefined&&key!==this.lastNativeKey)this.followActive=true;this.lastNativeKey=key;if(this.followActive)this.file=current?canonical(current.local_path):null;if(this.file)this.authorize(this.file);this.changed();return this.state();}
 docs(){return (this.info.open_document_list||[]).filter(d=>d.format==='hwp'&&typeof d.local_path==='string'&&/\.hwpx?$/i.test(d.local_path)&&fs.existsSync(d.local_path));}
 async refresh(){return this.update(await this.native.list());}
 select(file){file=canonical(file);if(!/\.hwpx?$/i.test(file))throw Error('HWP/HWPX 문서를 선택하세요.');this.authorize(file);this.file=file;this.followActive=false;this.previewRevision++;this.changed();return this.state();}
 async follow(){this.followActive=true;return this.refresh();}
 state(){const documents=this.docs(),opened=documents.find(d=>same(d.local_path,this.file)),selected=opened?.selected_region;return {document:this.file?{path:this.file,name:path.basename(this.file),live:Boolean(opened),active:Boolean(opened?.is_active_document),modified:opened?.modified??false,pid:opened?.pid||null}:null,documents:documents.map(d=>({path:d.local_path,name:d.file_name,active:d.is_active_document,modified:d.modified})),selection:selected?structuredClone(selected):null,followActive:this.followActive,revision:this.revision,previewRevision:this.previewRevision,error:this.error,recent:this.recent().filter(f=>/\.hwpx?$/i.test(f)&&fs.existsSync(f)).slice(0,12)};}
 async capture(){if(this.file)await this.native.whenFileIdle(this.file);await this.refresh();const state=this.state();return state.document?{...state.document,selection:state.selection}:null;}
 allowedSource(context,file){try{return Boolean(context?.path&&same(canonical(context.path),canonical(file)));}catch{return false;}}
 async toolResult(name,args,result){if(result?.error)return;if(name==='create_document'&&result?.path&&fs.existsSync(result.path))this.select(result.path);if(/^(?:create_document|edit_document|edit_live_document)$/.test(name)){this.previewRevision++;this.changed();await this.refresh().catch(()=>{});}}
}
module.exports={HangulWorkspace,same};
