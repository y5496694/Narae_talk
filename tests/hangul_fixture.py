"""COM-only fixture control. Refuses any file outside the named QA directory."""
import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
import pythoncom,win32process,win32event,win32api
from hwp_native import application_for,selected_text,apply
from live_hangul import select_text,read,selection_info
pythoncom.CoInitialize()
guard=win32event.CreateMutex(None,False,'Local\\NaraeOffice.HwpAutomation.v1')
state=win32event.WaitForSingleObject(guard,30000)
acquired=state in (win32event.WAIT_OBJECT_0,win32event.WAIT_ABANDONED)
try:
    if not acquired:raise ValueError('Fixture could not acquire the Hancom automation lock')
    req=json.load(sys.stdin);file=Path(req['path']).resolve();root=Path(req['fixture_root']).resolve()
    if not file.is_relative_to(root):raise ValueError('Fixture target escapes the QA directory')
    app,doc=application_for(file)
    pid=win32process.GetWindowThreadProcessId(int(app.XHwpWindows.Item(0).WindowHandle))[1]
    if pid!=req['expected_pid']:raise ValueError('Fixture Hangul PID differs from the owned process')
    if req['action']=='select':select_text(app,req['text'],req.get('count',1),req.get('occurrence',0))
    elif req['action']=='append_unsaved':app.HAction.Run('Cancel');app.MovePos(3,0,0);apply(app,'InsertText',{'Text':'\r\n'+req['text']})
    else:raise ValueError('Unsupported fixture action')
    print(json.dumps({'ok':True,'data':{**read(app,file),'pid':pid,'selection':selection_info(app)}},ensure_ascii=False))
except Exception as error:
    print(json.dumps({'ok':False,'error':str(error)},ensure_ascii=False));sys.exit(1)
finally:
    if acquired:win32event.ReleaseMutex(guard)
    win32api.CloseHandle(guard);pythoncom.CoUninitialize()
