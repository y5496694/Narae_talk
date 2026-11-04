(()=>{'use strict';
 if(!separate||selected!=='hangul')return;
 document.body.classList.add('hangul-chat','hangul-pane-closed');$('hangulToggle').hidden=false;
 let documentState=null,page=0,pages=0,token=null,request=0,previewKey='',statusRevision=0,paneOpen=false,connected=false;
 const restartNotice='문서 연결 기능을 적용하려면 트레이에서 나래톡을 완전히 종료한 뒤 다시 실행하세요.';
 const errorText=error=>String(error?.message||error).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/,'');
 const toggleHome=document.createComment('한글 미리보기 펼치기');$('hangulToggle').before(toggleHome);
 const message=text=>{$('hangulStatus').textContent=text;$('hangulStatus').hidden=!text;return ++statusRevision;};
 function current(){return documentState?.document;}
 function renderState(value){
  if(!connected)return;
  documentState=value;const file=current();$('hangulDocumentPath').textContent=file?.path||'한글에서 문서를 열거나 열기 버튼으로 파일을 선택하세요.';$('hangulDocumentPath').title=file?.path||'';$('hangulCopyPath').disabled=!file;$('hangulFollow').setAttribute('aria-pressed',String(value.followActive));
  const list=$('hangulDocumentList'),chosen=file?.path||'';list.replaceChildren();const placeholder=node('option','문서 선택');placeholder.value='';list.append(placeholder);const files=[...(value.documents||[]).map(d=>({path:d.path,name:d.name+' · 열린 문서'})),...(value.recent||[]).map(path=>({path,name:path.split(/[\\/]/).pop()}))];if(file&&!files.some(d=>d.path===file.path))files.unshift(file);const seen=new Set();for(const item of files){if(seen.has(item.path))continue;seen.add(item.path);const option=node('option',item.name);option.value=item.path;list.append(option);}list.value=chosen;
  const selection=value.selection,hasText=Boolean(selection?.selected_text);$('hangulContext').hidden=!file;$('hangulContextName').textContent=file?.name||'';$('hangulSelection').hidden=!hasText;$('hangulSelectionLabel').textContent=hasText?'한글에서 선택한 텍스트 · '+selection.selected_text.length+'자'+(selection.truncated?' · 일부 표시':''):'';$('hangulSelectionText').textContent=selection?.selected_text||'';
  if(value.error)message(value.error);
  const key=file?file.path+':'+value.previewRevision:'';if(key!==previewKey){previewKey=key;page=0;token=null;if(file&&paneOpen)void preview(true).catch(error=>message(errorText(error)));else if(!file){request++;$('hangulDocumentView').replaceChildren(node('p','열기 버튼으로 문서를 선택하세요.','hangul-empty'));$('hangulPageNumber').textContent='';$('hangulPrevious').disabled=true;$('hangulNext').disabled=true;message('');}}
 }
 const viewport=window.createHangulPreview({view:$('hangulDocumentView'),slider:$('hangulZoomSlider'),ratio:$('hangulZoomRatio'),isOpen:()=>paneOpen,previous:()=>$('hangulPrevious').click(),next:()=>$('hangulNext').click()});
 async function preview(refresh=false){const file=current();if(!file)return;const version=++request,status=message('미리보기를 준비하고 있습니다…');const result=await call('hangulPreview',{path:file.path,page,token,refresh});if(version!==request||current()?.path!==file.path)return;token=result.token;page=result.page;pages=result.pages;const image=node('img');image.alt=file.name+' PDF 미리보기 '+(page+1)+'쪽';image.src='data:image/png;base64,'+result.image;$('hangulDocumentView').replaceChildren(image);$('hangulPageNumber').textContent=(page+1)+' / '+pages;$('hangulPrevious').disabled=page===0;$('hangulNext').disabled=page+1>=pages;viewport.changed();if(status===statusRevision)message('');}
 const guarded=fn=>action(async event=>{try{await fn(event);}catch(error){message(errorText(error));}});
 $('hangulToggle').onclick=guarded(async()=>{if(!connected)return;const expanded=!paneOpen;await call('hangulPane',{expanded});paneOpen=expanded;$('hangulWorkspace').hidden=!expanded;document.body.classList.toggle('hangul-pane-closed',!expanded);if(expanded)$('hangulPageNavigation').append($('hangulToggle'));else toggleHome.after($('hangulToggle'));$('hangulToggle').setAttribute('aria-expanded',String(expanded));$('hangulToggle').title=expanded?'한글 화면 접기':'한글 화면 펼치기';$('hangulToggle').setAttribute('aria-label',$('hangulToggle').title);if(expanded&&current())await preview(!token);});
 $('hangulChoose').onclick=guarded(async()=>renderState(await call('hangulChoose')));
 $('hangulCopyPath').onclick=guarded(async()=>{await call('hangulCopyPath');$('hangulCopyPath').textContent='복사됨';setTimeout(()=>{$('hangulCopyPath').textContent='복사';},1500);});
 $('hangulFollow').onclick=guarded(async()=>renderState(await call('hangulFollow')));
 $('hangulDocumentList').onchange=guarded(async()=>{if($('hangulDocumentList').value)renderState(await call('hangulSelect',{path:$('hangulDocumentList').value}));});
 $('hangulPrevious').onclick=guarded(async()=>{if(page>0){page--;await preview();}});
 $('hangulNext').onclick=guarded(async()=>{if(page+1<pages){page++;await preview();}});
 window.narae.onEvent(event=>{if(event.type==='hangulState')renderState(event.state);});
 void call('state').then(async state=>{if(!state.capabilities?.hangulWorkspace||!state.capabilities?.hangulPane){$('hangulConnectionNotice').textContent=restartNotice;$('hangulConnectionNotice').hidden=false;$('hangulToggle').disabled=true;return;}connected=true;renderState(await call('hangulState'));}).catch(error=>{$('hangulConnectionNotice').textContent=errorText(error);$('hangulConnectionNotice').hidden=false;});
})();
