'use strict';
// Real Narae4 weights, native HWP/HWPX engine and exact owned background Hancom
// process. No desktop input, user documents or existing browser sessions.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{createHash}=require('node:crypto');
const {LocalAI}=require('../src/local-ai.cjs'),{runAgent,tools}=require('../src/agent.cjs'),{executeDocumentTool}=require('../src/document-tools.cjs'),{runPython}=require('../src/python.cjs'),{NativeDocuments}=require('../src/native-documents.cjs'),{HangulWorkspace}=require('../src/hangul-workspace.cjs'),{HangulPreview}=require('../src/hangul-preview.cjs');
const root=path.resolve(__dirname,'..'),installed=path.join(process.env.LOCALAPPDATA,'Programs/NaraeTalk'),home=fs.mkdtempSync(path.resolve(root,'../qa-narae4-hangul-')),workspace=path.join(home,'Documents'),python=path.join(installed,'runtime/python/python.exe');
for(const d of [workspace,path.join(home,'cache'),path.join(home,'data')])fs.mkdirSync(d,{recursive:true});
const ai=new LocalAI({root:installed,home}),native=new NativeDocuments(home,python),preview=new HangulPreview({native,home,python}),documents=new HangulWorkspace({native});
ai.configure({directory:path.join(process.env.LOCALAPPDATA,'NaraeTalk/models'),autoStart:false});
const settings={provider:'local',model:'narae4',localSource:'managed',workspace},signal=new AbortController().signal,events=[],phases=[];
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
async function reuseRunning(){
 const descriptor=JSON.parse(fs.readFileSync(0,'utf8')),command=descriptor.commandLine;
 const argument=name=>command.match(new RegExp('--'+name+'\\s+(?:"([^"]+)"|(\\S+))'))?.slice(1).find(Boolean);
 const port=Number(argument('port')),key=argument('api-key'),alias=argument('alias');
 if(!Number.isSafeInteger(port)||port<1||port>65535||!/^[a-f0-9]{48}$/.test(key||'')||alias!==ai.model('narae4').alias)throw Error('Running Narae4 descriptor validation failed');
 ai.url='http://127.0.0.1:'+port+'/v1';ai.key=key;ai.active={...ai.model('narae4'),decision:undefined};ai.vision=false;
 const list=await ai.api(ai.url+'/models');if(!list.data.some(m=>m.id===alias))throw Error('Running Narae4 identity differs');
 const adapters=await ai.api(ai.url.replace(/\/v1$/,'')+'/lora-adapters');if(adapters.length!==1||path.resolve(adapters[0].path)!==path.resolve(ai.file(ai.model('narae4'),'adapter')))throw Error('Running Narae4 adapter differs');
 ai.activate=async id=>{if(id!=='narae4')throw Error('Fixture may only reuse Narae4');return ai.status();};
 console.log(JSON.stringify({reuseRunningNarae4:true,credentialsLogged:false}));
}
const fixture=(file,pid,args)=>runPython(python,home,'../tests/hangul_fixture.py',{...args,path:file,fixture_root:home,expected_pid:pid});
async function agent(prompt,context,documentContext){
 return runAgent({prompt,context,documentContext,settings,signal,toolDomain:'hangul',baseTools:tools,additionalTools:[],send:event=>{if(event.type==='tool'){events.push(event.name);console.log(JSON.stringify({tool:event.name}));}},request:body=>ai.request({settings,body,signal}),execute:async(name,args)=>{
  const file=path.resolve(args.path||workspace);assert(file===workspace||file.startsWith(workspace+path.sep));
  if(name==='export_pdf'&&documentContext?.live)return preview.export(args.path,args.target);
  if(['read_live_document','edit_live_document'].includes(name))return native.withFileLock(file,()=>runPython(python,home,'live_hangul.py',{...args,action:name==='read_live_document'?'read':'edit',backupDir:path.join(home,'backups'),save:true}));
  return executeDocumentTool(name,args,{workspace,home,python,signal});
 }});
}
(async()=>{
 try{
  if(process.argv.includes('--reuse-running'))await reuseRunning();else if(os.freemem()<2500*1024**2)throw Error('Narae4 smoke test needs 2.5 GB free RAM');
  for(const ext of ['hwpx','hwp']){
   const name='나래4-생성검증.'+ext,file=path.join(workspace,name);console.log(JSON.stringify({phase:'real-narae4-create',format:ext}));
   await agent('"'+name+'"로 만들어줘. 제목은 가상 연수 안내. 본문은 아래 세 줄을 그대로 각각 한 문단으로 넣어줘.\n장소: 초록교실\n비고: 초록교실\n참고: 초록교실\n훈련용 가상 자료이며 실제 학교 일정이 아닙니다.');
   assert(fs.existsSync(file));const created=await executeDocumentTool('read_document',{path:file},{workspace,home,python});assert(created.paragraphs.some(p=>p.text==='장소: 초록교실'));assert(created.paragraphs.some(p=>p.text==='비고: 초록교실'));
   console.log(JSON.stringify({phase:'real-narae4-saved-edit',format:ext}));await agent('장소만 “장소: 초록교실”을 “장소: 별빛교실”로 바꿔 줘.',file);
   const edited=await executeDocumentTool('read_document',{path:file},{workspace,home,python});assert(edited.paragraphs.some(p=>p.text==='장소: 별빛교실'));assert(edited.paragraphs.some(p=>p.text==='비고: 초록교실'));phases.push({format:ext,actualModel:ai.status().active,created:true,edited:true,otherParagraphsPreserved:true});
   if(ext!=='hwpx')continue;
   await native.openFile(file,{background:true});const opened=(await native.list()).open_document_list.find(d=>d.local_path.toLowerCase()===file.toLowerCase());assert(opened?.pid);const pid=opened.pid;
   await fixture(file,pid,{action:'select',text:'초록교실',count:2,occurrence:1});documents.update(await native.list());const context=await documents.capture();assert.equal(context.selection.selected_text,'초록교실');
   console.log(JSON.stringify({phase:'real-narae4-selected-live-edit'}));await agent('선택한 부분을 “바다교실”로 바꿔 줘.',file,context);
   let live=await runPython(python,home,'live_hangul.py',{action:'read',path:file});assert(live.text.includes('참고: 바다교실'));assert(live.text.includes('비고: 초록교실'));assert.equal((await native.list()).open_document_list.find(d=>d.local_path.toLowerCase()===file.toLowerCase()).pid,pid);
   await fixture(file,pid,{action:'select',text:'바다교실'});const styleContext=await documents.capture();console.log(JSON.stringify({phase:'real-narae4-selected-style'}));await agent('선택한 부분을 17포인트 굵게 바꿔 줘.',file,styleContext);
   await fixture(file,pid,{action:'append_unsaved',text:'미저장 확인: 원본을 저장하지 않음'});await fixture(file,pid,{action:'select',text:'바다교실'});
   const before=hash(file),selection=(await runPython(python,home,'live_hangul.py',{action:'read',path:file})).selection;
   console.log(JSON.stringify({phase:'unsaved-live-pdf-preview'}));const rendered=await preview.render(file,{refresh:true});assert(rendered.live&&rendered.modified);assert.equal(hash(file),before);fs.writeFileSync(path.join(home,'preview.png'),Buffer.from(rendered.image,'base64'));live=await runPython(python,home,'live_hangul.py',{action:'read',path:file});assert(live.modified);assert.deepEqual(live.selection,selection);
   const pdfContext=await documents.capture();await agent('현재 한글을 PDF 사본으로 저장해줘.',file,pdfContext);assert.equal(hash(file),before);assert((await runPython(python,home,'live_hangul.py',{action:'read',path:file})).modified);phases.push({liveDocumentDetected:true,selectedDuplicateRangeOnly:true,selectedStyle17Bold:true,unsavedPreview:true,sourceFileUnchanged:true,selectionPreserved:true,sameOwnedPID:true,pdfBytes:fs.statSync(preview.entries.get(file.toLowerCase()).pdf).size});
   await native.closeFile(file,true);
  }
  const result={passed:true,home,model:'narae4',phases,tools:events};fs.writeFileSync(path.join(home,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{
  documents.stop();const state=await native.list().catch(()=>({open_document_list:[]}));for(const d of state.open_document_list)if(path.resolve(d.local_path).startsWith(workspace+path.sep))await native.closeFile(d.local_path,true).catch(()=>{});native.close();await ai.close();
 }
})().catch(error=>{console.error(error.stack);console.error('QA: '+home);process.exitCode=1;});
