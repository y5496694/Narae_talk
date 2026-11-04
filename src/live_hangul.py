"""Edit the requested running Hancom document without opening a spare app."""
import hashlib,json,shutil,sys,uuid
from pathlib import Path
import pythoncom
from hwp_native import application_for,selected_text,apply,style,style_selected

def selection_info(app):
    pos=tuple(app.GetSelectedPos())
    if len(pos)!=7 or not pos[0]:return None
    text=selected_text(app)
    return {'type':'text','selected_text':text[:10000],'truncated':len(text)>10000,
            'start':list(pos[1:4]),'end':list(pos[4:7])}

def read(app,file,page=None):
    selection=selection_info(app)
    mode=app.GetMessageBoxMode()
    try:
        app.SetMessageBoxMode(0x00010000)
        text=app.GetTextFile('TEXT','')
    finally:app.SetMessageBoxMode(mode)
    pages=int(app.PageCount)
    scope={}
    if page is not None:
        if type(page) is not int or not 1<=page<=pages:raise ValueError(f'편집할 쪽은 1~{pages}쪽에서 지정하세요.')
        page_text=app.GetPageText(page-1,7)
        if not isinstance(page_text,str):raise ValueError('요청한 쪽의 실제 본문을 읽지 못했습니다.')
        scope={'page':page,'pageText':page_text,'pageParagraphs':list(dict.fromkeys(line for line in page_text.splitlines() if line.strip()))}
    return {'path':str(file),'text':text[:300000],'truncated':len(text)>300000,**scope,
            'liveRevision':hashlib.sha256(text.encode('utf-8')).hexdigest(),
            'pages':pages,'modified':bool(app.XHwpDocuments.Active_XHwpDocument.Modified),
            'selection':selection,
            'note':'현재 열린 한글의 텍스트입니다. 표와 서식은 실제 한글에서 보존합니다. 반복되는 문구는 expected_count와 occurrence로 지정하세요.'}

def select_text(app,text,expected,occurrence,page=None):
    if not isinstance(text,str) or not text or len(text)>10000 or '\n' in text or '\r' in text:
        raise ValueError('한 문단 안의 정확한 원문을 1~10000자로 지정하세요.')
    if type(expected) is not int or expected<1 or type(occurrence) is not int or not 0<=occurrence<expected:
        raise ValueError('expected_count와 0부터 시작하는 occurrence를 확인하세요.')
    app.HAction.Run('Cancel');app.MovePos(2,0,0)
    action=app.CreateAction('RepeatFind');params=action.CreateSet();action.GetDefault(params)
    for name,value in {'FindString':text,'Direction':0,'IgnoreMessage':1,'FindType':1}.items():params.SetItem(name,value)
    found=[];seen=set();mode=app.GetMessageBoxMode()
    try:
        app.SetMessageBoxMode(0x00020000)
        while len(found)<=expected and action.Execute(params):
            pos=tuple(app.GetSelectedPos())
            if len(pos)!=7 or not pos[0] or pos[1]!=pos[4]:raise ValueError('한 문단 안의 텍스트만 선택할 수 있습니다.')
            if pos in seen:break
            seen.add(pos)
            if selected_text(app)!=text:raise ValueError('찾은 한글 원문이 요청과 다릅니다.')
            if page is not None:
                # A page edit replaces complete text paragraphs, preserving the
                # surrounding table/cell controls and all other document pages.
                indicator=tuple(app.KeyIndicator())
                if len(indicator)!=9 or not indicator[0] or int(indicator[3])!=page:continue
                app.SetPos(pos[1],pos[2],0);app.HAction.Run('MoveSelParaEnd')
                paragraph=selected_text(app)
                app.SetPos(*pos[1:4]);app.SelectText(pos[2],pos[3],pos[5],pos[6])
                if paragraph!=text:continue
            found.append(pos)
    finally:app.SetMessageBoxMode(mode)
    if len(found)!=expected:raise ValueError(f'원문 후보 수가 다릅니다. 예상 {expected}, 실제 {len(found)}. 다시 읽으세요.')
    pos=found[occurrence];app.SetPos(*pos[1:4]);app.SelectText(pos[2],pos[3],pos[5],pos[6])
    if selected_text(app)!=text:raise ValueError('편집 직전 원문 확인 실패')
    return pos

def run(req):
    file=Path(req['path']).resolve()
    if file.suffix.lower() not in {'.hwp','.hwpx'}:raise ValueError('HWP/HWPX 문서만 지원합니다.')
    app,doc=application_for(file)
    page=req.get('page');current=read(app,file,page)
    if req['action']=='read':return current
    if req['action']=='preview':
        from hangul_preview import print_open_document
        target=Path(req['target']).resolve()
        if target.suffix.lower()!='.pdf' or target.exists():raise ValueError('새 PDF 미리보기 경로가 필요합니다.')
        before_hash=hashlib.sha256(file.read_bytes()).hexdigest()
        position,selection=tuple(app.GetPos()),tuple(app.GetSelectedPos())
        try:
            result=print_open_document(app,target)
            after=read(app,file)
            if after['liveRevision']!=current['liveRevision'] or hashlib.sha256(file.read_bytes()).hexdigest()!=before_hash:
                raise ValueError('미리보기 중 원본 내용이 변경되었습니다. 다시 확인하세요.')
            if after['modified']!=current['modified']:raise ValueError('미리보기 중 한글의 저장 상태가 바뀌었습니다.')
            return {**result,'liveRevision':current['liveRevision'],'source_unchanged':True,'live':True}
        finally:
            app.SetPos(*position)
            if len(selection)==7 and selection[0] and selection[1]==selection[4]:app.SelectText(selection[2],selection[3],selection[5],selection[6])
    if req.get('liveRevision')!=current['liveRevision']:raise ValueError('열린 문서가 바뀌었습니다. 다시 읽은 뒤 편집하세요.')
    operations=req.get('operations')
    if not isinstance(operations,list) or not 1<=len(operations)<=40:raise ValueError('편집 작업을 1~40개 지정하세요.')
    for op in operations:
        if page is not None and (op.get('op')!='replace_text' or op.get('text') not in current['pageParagraphs']):
            raise ValueError('요청한 쪽에서 실제 읽은 문단만 수정할 수 있습니다. 다른 쪽이나 문단 일부로 범위를 넓히지 마세요.')
        if op.get('op') in {'replace_text','set_style'}:
            expected,occurrence=op.get('expected_count',1),op.get('occurrence',0)
            if type(expected) is not int or expected<1 or type(occurrence) is not int or not 0<=occurrence<expected:
                raise ValueError('편집할 원문의 후보 수와 위치가 유효하지 않습니다. 문서를 다시 읽어 확인하세요.')
        if op.get('op') in {'replace_text','replace_selection'} and (not isinstance(op.get('replacement'),str) or len(op['replacement'])>200000):
            raise ValueError('바꿀 내용을 확인하세요.')
    position=tuple(app.GetPos());selection=tuple(app.GetSelectedPos())
    if page is not None:
        if len({op['text'] for op in operations})!=len(operations):raise ValueError('같은 문단을 한 요청에서 여러 번 수정할 수 없습니다.')
        try:
            # Check every target before the first mutation. Work from the end
            # so length changes do not move a later target onto another page.
            for op in operations:select_text(app,op['text'],op.get('expected_count',1),op.get('occurrence',0),page)
        finally:
            app.HAction.Run('Cancel');app.SetPos(*position)
            if len(selection)==7 and selection[0] and selection[1]==selection[4]:app.SelectText(selection[2],selection[3],selection[5],selection[6])
        operations=sorted(operations,key=lambda op:current['text'].rfind(op['text']),reverse=True)
    backup=Path(req['backupDir'])/(uuid.uuid4().hex+'-'+file.name);backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,backup)
    live_backup=None
    if current['modified']:
        # Keep the unsaved document as well as the last disk version. Exporting
        # HWPML does not save, close or replace the user's active document.
        mode=app.GetMessageBoxMode()
        try:
            app.SetMessageBoxMode(0x00010000)
            snapshot=app.GetTextFile('HWPML2X','')
        finally:app.SetMessageBoxMode(mode)
        if not isinstance(snapshot,str) or not snapshot.strip():raise ValueError('미저장 문서의 복구 사본을 만들지 못해 편집하지 않았습니다.')
        live_backup=str(backup)+'.live.hwpml';Path(live_backup).write_text(snapshot,encoding='utf-8')
    complete=0
    try:
        verified_operations=[]
        for op in operations:
            text=op.get('text','')
            if op['op'] in {'replace_selection','set_selection_style'}:
                selected=tuple(app.GetSelectedPos())
                if len(selected)!=7 or not selected[0] or list(selected[1:4])!=op.get('start') or list(selected[4:7])!=op.get('end') or selected_text(app)!=text:
                    raise ValueError('선택 영역이 요청 후 변경되었습니다. 한글에서 다시 선택하고 요청하세요.')
                if not text or len(text)>10000:raise ValueError('선택 영역은 1~10000자로 지정하세요.')
                pos=selected
            else:pos=select_text(app,text,op.get('expected_count',1),op.get('occurrence',0),page)
            if op['op'] in {'replace_text','replace_selection'}:
                new=op.get('replacement')
                if not isinstance(new,str) or len(new)>200000:raise ValueError('바꿀 내용을 확인하세요.')
                apply(app,'InsertText',{'Text':new})
                if op['op']=='replace_selection':
                    end=tuple(app.GetPos())
                    if end[0]==pos[1]:selection=(True,*pos[1:4],*end)
            elif op['op'] in {'set_style','set_selection_style'}:
                # Reuse the native style validator with an exact captured range.
                target={'text':text,'occurrences':op.get('expected_count',1),'occurrence':op.get('occurrence',0),'position':pos[1:]}
                allowed={'font_size','font_family','bold','italic','underline','text_color','align'}
                step={key:value for key,value in op.items() if key in allowed}
                facts=style_selected(app,step,pos) if op['op']=='set_selection_style' else style(app,step,target)
                verified_operations.append({'op':op['op'],'properties':facts['properties']})
            else:raise ValueError('지원하지 않는 네이티브 편집 작업입니다.')
            complete+=1
        if req.get('save',True) and not doc.Save(True):raise ValueError('저장 결과를 확인하지 못했습니다.')
        return {**read(app,file,page),'saved':req.get('save',True),'completed':complete,'verified':True,
                'verifiedOperations':verified_operations,'appliedOperations':operations,'backup':str(backup),'liveBackup':live_backup}
    except Exception as error:
        raise ValueError(f'{error}\n완료한 작업: {complete}/{len(req.get("operations",[]))}. 열린 문서에 일부 변경이 남을 수 있습니다. 백업: {backup}') from error
    finally:
        app.HAction.Run('Cancel')
        try:
            app.SetPos(*position)
            if len(selection)==7 and selection[0] and selection[1]==selection[4]:app.SelectText(selection[2],selection[3],selection[5],selection[6])
        except pythoncom.com_error:pass

if __name__=='__main__':
    pythoncom.CoInitialize()
    import win32event,win32api
    guard=win32event.CreateMutex(None,False,'Local\\NaraeOffice.HwpAutomation.v1');acquired=False
    try:
        state=win32event.WaitForSingleObject(guard,30000)
        acquired=state in (win32event.WAIT_OBJECT_0,win32event.WAIT_ABANDONED)
        if not acquired:raise ValueError('다른 한글 작업이 진행 중입니다. 잠시 후 다시 시도하세요.')
        print(json.dumps({'ok':True,'data':run(json.load(sys.stdin))},ensure_ascii=False))
    except Exception as error:print(json.dumps({'ok':False,'error':str(error)},ensure_ascii=False));sys.exit(1)
    finally:
        if acquired:win32event.ReleaseMutex(guard)
        win32api.CloseHandle(guard);pythoncom.CoUninitialize()
