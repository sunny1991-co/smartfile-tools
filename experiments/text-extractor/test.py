from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from functools import partial
from tempfile import TemporaryDirectory
import threading,re,time,json
from playwright.sync_api import sync_playwright,expect
from PIL import Image
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject,NameObject,DecodedStreamObject
ROOT=Path(__file__).resolve().parent
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self' data:; object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.send_header('X-Content-Type-Options','nosniff')
        super().end_headers()
server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'preview')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
try:
    with TemporaryDirectory() as td,sync_playwright() as p:
        d=Path(td);b=p.chromium.launch();context=b.new_context(viewport={'width':390,'height':844},accept_downloads=True);page=context.new_page();external=[];requests=[]
        def route(r):
            if not r.request.url.startswith((base+'/', 'blob:', 'data:')) or r.request.method!='GET':
                external.append(r.request.url);r.abort()
            else:r.continue_()
        context.route('**/*',route);context.on('request',lambda r:requests.append(r.url))
        fixture=b.new_page(viewport={'width':1000,'height':350})
        fixture.set_content('<body style="background:white;color:black;font:64px Noto Sans Devanagari,sans-serif;padding:30px">भारत मेरा देश है<br>SMART FILE TEST</body>')
        fixture.evaluate('document.fonts.ready')
        img=d/'mixed.png';fixture.screenshot(path=str(img));fixture.close()
        eng=d/'eng.pdf';w=PdfWriter();pg=w.add_blank_page(width=595,height=842);font=w._add_object(DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')}));pg[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})});st=DecodedStreamObject();st.set_data(b'BT /F1 24 Tf 50 700 Td (SMART FILE PDF TEST) Tj ET');pg[NameObject('/Contents')]=w._add_object(st)
        with eng.open('wb') as fp:w.write(fp)
        page.goto(base+'/');assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not any('/vendor/' in x for x in requests)
        def run(path,expected,lang='hin+eng',camera=False):
            page.locator('#camera' if camera else '#file').set_input_files(str(path));page.locator('#lang').select_option(lang)
            start=time.monotonic();page.locator('#start').click()
            expect(page.locator('#status')).to_have_attribute('data-state','done',timeout=125000)
            value=page.locator('#text').input_value()
            for token in expected:assert token in value,(token,value)
            expect(page.locator('#download')).to_be_enabled()
            print('OCR CASE',path.name,round(time.monotonic()-start,2),repr(value),flush=True)
        run(eng,['SMART FILE PDF TEST'],'eng');assert not any('/vendor/ocr/' in x for x in requests)
        run(img,['भारत','SMART FILE TEST'],camera=True)
        scan=d/'scan.pdf'
        with Image.open(img) as im:im.convert('RGB').save(scan,'PDF',resolution=100)
        run(scan,['भारत','SMART FILE TEST'])
        with page.expect_download() as event:page.locator('#download').click()
        out=d/'text.txt';event.value.save_as(out);assert 'भारत' in out.read_text()
        assert not external,external
        b.close()
        print('PASS direct PDF, camera-file OCR, mixed Hindi-English, scanned PDF and UTF-8 export',flush=True)
finally:
    server.shutdown();server.server_close()
