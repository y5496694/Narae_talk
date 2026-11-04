'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {HangulWorkspace}=require('../src/hangul-workspace.cjs'),{HangulPreview}=require('../src/hangul-preview.cjs'),{RemotePolicy}=require('../src/remote-policy.cjs'),{liveDocumentStep}=require('../src/live-document-task.cjs'),{tools}=require('../src/agent.cjs'),{hangulMethods}=require('../src/hangul-methods.cjs');
function fixture(t){const home=fs.mkdtempSync(path.join(os.tmpdir(),'narae-hangul-unit-')),file=path.join(home,'external.hwpx'),workspace=path.join(home,'Documents');fs.mkdirSync(workspace);fs.writeFileSync(file,'synthetic document bytes');t.after(()=>fs.rmSync(home,{recursive:true,force:true}));return {home,file,workspace};}
function record(input,name,args,value){const id=String(input.length);input.push({type:'function_call',name,call_id:id,arguments:JSON.stringify(args)},{type:'function_call_output',call_id:id,output:JSON.stringify(value)});}
test('opened documents and exact selection flow into only the Hangul workspace, with manual selection and close lifecycle',async t=>{
 const {file}=fixture(t),native=new EventEmitter(),events=[],grants=[];let watches=0,stops=0;const selection={type:'text',selected_text:'실제 선택',start:[0,1,2],end:[0,1,7]},info={open_document_list:[{format:'hwp',local_path:file,file_name:path.basename(file),is_active_document:true,selected_region:selection,modified:true,pid:123}]};
 native.list=async()=>info;native.watch=()=>watches++;native.unwatch=()=>stops++;native.whenFileIdle=async()=>{};
 const documents=new HangulWorkspace({native,authorize:file=>grants.push(file),notify:s=>events.push(s)});documents.start();documents.start();assert.equal(watches,1);native.emit('document-info',info);const state=documents.state();assert.equal(state.document.path,file);assert.equal(state.selection.selected_text,'실제 선택');assert.equal((await documents.capture()).live,true);assert(documents.allowedSource(await documents.capture(),file));assert(!documents.allowedSource(await documents.capture(),path.join(path.dirname(file),'unknown.hwpx')));documents.select(file);info.open_document_list=[];await documents.refresh();assert.equal(documents.state().document.path,file);await documents.follow();assert.equal(documents.state().document,null);documents.stop();assert.equal(stops,1);assert.equal(native.listenerCount('document-info'),0);assert(grants.length>0&&events.length>0);
});
test('local selected-source authorization cannot grant remote input, arbitrary files, outputs or creation outside the workspace',async t=>{
 const {file,workspace,home}=fixture(t),policy=new RemotePolicy({workspace:()=>workspace,autoAllow:()=>true}),signal=new AbortController().signal,grant={inputAllowed:p=>path.resolve(p)===file};
 assert.throws(()=>policy.prepare('read_live_document',{path:file}),/작업 폴더/);assert.equal(policy.prepare('read_live_document',{path:file},grant).path,file);
 assert.throws(()=>policy.prepare('create_document',{path:file},grant),/작업 폴더/);assert.throws(()=>policy.prepare('export_pdf',{path:file,target:path.join(home,'outside.pdf')},grant),/작업 폴더/);
 let executed=false;await policy.run('read_live_document',{path:file},signal,async()=>{executed=true;},grant);assert(executed);policy.close();
});

test('opening another native document resumes automatic recognition after a manually chosen file',async t=>{
 const {file,home}=fixture(t),manual=path.join(home,'manual.hwpx'),opened=path.join(home,'newly-opened.hwp');fs.writeFileSync(manual,'manual');fs.writeFileSync(opened,'new native');
 const documents=new HangulWorkspace({native:{}}),info=file=>({open_document_list:[{format:'hwp',local_path:file,file_name:path.basename(file),pid:123,is_active_document:true}]});
 documents.update(info(file));documents.select(manual);documents.update(info(file));assert.equal(documents.state().document.path,manual);
 documents.update(info(opened));assert.equal(documents.state().document.path,opened);assert.equal(documents.state().followActive,true);
});

test('a newly opened Hancom instance is recognized after focus has already returned to chat',async t=>{
 const {file,home}=fixture(t),next=path.join(home,'new.hwp');fs.writeFileSync(next,'next');const {NativeDocuments}=require('../src/native-documents.cjs'),native=new NativeDocuments(home,'unused');
 const doc=(file,pid)=>({format:'hwp',local_path:file,pid,is_active_document:true,is_foreground:false});let documents=[doc(file,1)];native.request=async()=>structuredClone({open_document_list:documents,selected_region_by_format:{}});
 await native.list();documents.push({...doc(next,2),selected_region:{selected_text:'새 문서의 선택'}});let result=await native.list();assert.equal(result.open_document_list.find(d=>d.is_active_document).local_path,next);assert.equal(result.selected_region_by_format.hwp.selected_text,'새 문서의 선택');result=await native.list();assert.equal(result.open_document_list.find(d=>d.is_active_document).local_path,next);
 documents[0].is_foreground=true;result=await native.list();assert.equal(result.open_document_list.find(d=>d.is_active_document).local_path,file);native.close();
});
test('live selection editing is bound to the actual coordinates, revision and readback while duplicate text is preserved',t=>{
 const {file}=fixture(t),selection={type:'text',selected_text:'원문',start:[0,2,0],end:[0,2,2]},context={path:file,live:true,selection},input=[],prompt='선택한 부분을 “새 문구”로 바꿔줘';
 let step=liveDocumentStep(prompt,input,tools,context);assert.equal(step.tools[0].name,'read_live_document');
 record(input,'read_live_document',{path:file},{text:'원문\n원문',liveRevision:'before',selection});step=liveDocumentStep(prompt,input,tools,context);const args=Object.fromEntries(Object.entries(step.tools[0].parameters.properties).map(([k,s])=>[k,s.enum[0]]));assert.deepEqual(args.operations,[{op:'replace_selection',text:'원문',start:[0,2,0],end:[0,2,2],replacement:'새 문구'}]);
 record(input,'edit_live_document',args,{text:'원문\n새 문구',liveRevision:'after',completed:1,verified:true,saved:true,backup:'fixture'});assert.equal(liveDocumentStep(prompt,input,tools,context).tools[0].name,'read_live_document');record(input,'read_live_document',{path:file},{text:'원문\n새 문구',liveRevision:'after'});assert.equal(liveDocumentStep(prompt,input,tools,context).complete,true);
 input.at(-1).output=JSON.stringify({text:'새 문구\n새 문구',liveRevision:'after'});assert.equal(liveDocumentStep(prompt,input,tools,context).complete,false);
});
test('changed selections stop editing and PDF requests retain a real output step',t=>{
 const {file,workspace}=fixture(t),context={path:file,live:true,selection:{selected_text:'원문',start:[0,1,0],end:[0,1,2]}},input=[];
 record(input,'read_live_document',{path:file},{text:'본문',liveRevision:'r',selection:{selected_text:'다른 선택',start:[0,2,0],end:[0,2,5]}});assert.equal(liveDocumentStep('선택한 부분 바꿔줘',input,tools,context).complete,false);
 const pdf=liveDocumentStep('현재 한글을 PDF 사본으로 저장해줘',input,tools,context,workspace);assert.equal(pdf.tools[0].name,'export_pdf');assert(pdf.tools[0].parameters.properties.target.enum[0].startsWith(workspace));
});
test('live preview uses the existing unsaved document, caches pagination and exports a separate PDF without editing the source',async t=>{
 const {home,file,workspace}=fixture(t),calls=[],native={list:async()=>({open_document_list:[{local_path:file,is_active_document:true,modified:true}]}),withFileLock:async(_file,fn)=>fn()};
 const preview=new HangulPreview({native,home,python:'synthetic',runPython:async(_python,_home,script,args)=>{calls.push({script,args});if(args.action==='preview'){fs.writeFileSync(args.target,'%PDF fixture');return {pages:2};}return {pages:2,page:args.page,image:'fixture'};}});
 const original=fs.readFileSync(file),first=await preview.render(file,{refresh:true});await preview.render(file,{page:1,token:first.token});assert.equal(calls.filter(c=>c.args.action==='preview').length,1);assert.equal(calls[0].script,'live_hangul.py');const exported=await preview.export(file,path.join(workspace,'copy.pdf'));assert(exported.pages===2&&exported.bytes>0);assert.deepEqual(fs.readFileSync(file),original);assert(!calls.some(c=>c.args.action==='edit'));
});
test('Hangul document RPCs reject another chat before accessing native state',async t=>{
 const {file}=fixture(t);let read=false;const api=hangulMethods({documents:{refresh:async()=>{read=true;return {};}},assertSender:event=>{if(event.sender!=='hangul')throw Error('wrong chat');}});
 await assert.rejects(api.hangulState({}, {sender:'browser'}),/wrong chat/);assert.equal(read,false);await api.hangulState({}, {sender:'hangul'});assert(read);
});
test('copy path uses the selected document and is restricted to the Hangul chat',async t=>{
 const {file}=fixture(t),copied=[],api=hangulMethods({documents:{state:()=>({document:{path:file}})},copyText:text=>copied.push(text),assertSender:event=>{if(event.sender!=='hangul')throw Error('wrong chat');}});
 await assert.rejects(api.hangulCopyPath({path:'other.hwp'},{sender:'browser'}),/wrong chat/);assert.deepEqual(copied,[]);assert.deepEqual(await api.hangulCopyPath({path:'other.hwp'},{sender:'hangul'}),{path:file});assert.deepEqual(copied,[file]);
});

test('the document pane expands to the right and folding restores chat dimensions without showing or focusing a window',()=>{
 const {setHangulPane}=require('../src/hangul-window.cjs');let bounds={x:1500,y:100,width:394,height:715},minimum;
 const win={getBounds:()=>({...bounds}),setBounds:b=>{bounds=b;},setMinimumSize:(w,h)=>{minimum=[w,h];},isMaximized:()=>false},screen={getDisplayMatching:()=>({workArea:{x:0,y:0,width:1920,height:1040}})};
 setHangulPane(win,true,screen);assert.equal(bounds.width,1040);assert.equal(bounds.x,880);assert.deepEqual(minimum,[720,540]);bounds.width=800;setHangulPane(win,false,screen);assert.equal(bounds.width,394);assert.deepEqual(minimum,[320,480]);setHangulPane(win,true,screen);assert.equal(bounds.width,800);assert.throws(()=>setHangulPane(win,'true',screen));
});
