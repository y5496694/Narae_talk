"""Read-only inventory of visible figures/tables in a generated PDF snapshot."""
import base64,io,json,re,sys
from pathlib import Path
import pypdfium2 as pdfium
import pypdfium2.raw as raw

def inspect(request):
    file=Path(request['path']).resolve()
    if file.suffix.lower()!='.pdf':raise ValueError('PDF 사본만 검사합니다.')
    result=[]
    with pdfium.PdfDocument(file) as document:
        for number in range(len(document)):
            page=document[number]
            try:
                width,height=page.get_size();images=0;paths=0;bounds=[]
                for obj in page.get_objects():
                    if obj.type==raw.FPDF_PAGEOBJ_IMAGE:
                        left,bottom,right,top=obj.get_bounds()
                        if abs((right-left)*(top-bottom))>=width*height*.002:images+=1;bounds.append([left,bottom,right,top])
                    elif obj.type==raw.FPDF_PAGEOBJ_PATH:
                        left,bottom,right,top=obj.get_bounds()
                        # Hancom can print every glyph as a tiny outline. Those
                        # paths are text, not thousands of separate diagrams.
                        if abs((right-left)*(top-bottom))>=width*height*.001:paths+=1;bounds.append([left,bottom,right,top])
                textpage=page.get_textpage()
                try:text=textpage.get_text_range()
                finally:textpage.close()
                has_caption=bool(re.search(r'(?:그림|사진|화면|도식|그래프)\s*[\[<(]?\s*\d|\[\s*표\s*\d|(?:Figure|Fig\.?|Table)\s*\d',text,re.I))
                box=[min(b[0] for b in bounds),min(b[1] for b in bounds),max(b[2] for b in bounds),max(b[3] for b in bounds)] if bounds else None
                result.append({'page':number,'images':images,'vectorObjects':paths,'visual':bool(images or has_caption and paths or paths>=8),'bounds':box,'text':text})
            finally:page.close()
    return {'pages':len(result),'visualPages':[{k:v for k,v in p.items() if k!='text'} for p in result if p['visual']],'pageInfo':result}

def render(request):
    with pdfium.PdfDocument(request['path']) as document:
        number=request['page']
        if type(number) is not int or not 0<=number<len(document):raise ValueError('쪽 번호를 확인하세요.')
        page=document[number]
        try:
            width,height=page.get_size();box=request.get('bounds');crop=(0,0,0,0)
            if box and len(box)==4:
                left,bottom,right,top=box
                crop=(max(0,left-24),max(0,bottom-24),max(0,width-right-24),max(0,height-top-24))
            bitmap=page.render(scale=1.8,crop=crop);image=bitmap.to_pil();buffer=io.BytesIO()
            try:image.save(buffer,format='PNG');return {'page':number,'image':base64.b64encode(buffer.getvalue()).decode(),'width':image.width,'height':image.height}
            finally:image.close();bitmap.close()
        finally:page.close()

if __name__=='__main__':
    try:
        request=json.load(sys.stdin)
        print(json.dumps({'ok':True,'data':render(request) if request.get('action')=='render' else inspect(request)},ensure_ascii=False))
    except Exception as error:print(json.dumps({'ok':False,'error':str(error)},ensure_ascii=False));sys.exit(1)
