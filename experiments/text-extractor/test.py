from pathlib import Path
from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
from functools import partial
from tempfile import TemporaryDirectory
import threading,re,time,json,unicodedata
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
        run(img,['भारत मेरा देश है','SMART FILE TEST'],camera=True)
        scan=d/'scan.pdf'
        with Image.open(img) as im:im.convert('RGB').save(scan,'PDF',resolution=100)
        run(scan,['भारत मेरा देश है','SMART FILE TEST'])
        with page.expect_download() as event:page.locator('#download').click()
        out=d/'text.txt';event.value.save_as(out);assert 'भारत' in out.read_text()
        # Printed Devanagari accuracy is measured on exact normalized text, not just a keyword.
        def normalized(s):
            return ' '.join(unicodedata.normalize('NFC',s).split())
        def cer(a,b):
            a,b=normalized(a),normalized(b)
            row=list(range(len(b)+1))
            for i,c in enumerate(a,1):
                nxt=[i]
                for k,v in enumerate(b,1):nxt.append(min(row[k]+1,nxt[-1]+1,row[k-1]+(c!=v)))
                row=nxt
            return row[-1]/max(1,len(a))
        expected='कृपया अपना नाम लिखें। शिक्षा और स्वास्थ्य महत्वपूर्ण हैं।'
        for font in ('Noto Sans Devanagari','Noto Serif Devanagari'):
            fixture=b.new_page(viewport={'width':1500,'height':450})
            fixture.set_content('<body style="background:white;color:black;font:54px '+font+';padding:36px">कृपया अपना नाम लिखें।<br>शिक्षा और स्वास्थ्य महत्वपूर्ण हैं।</body>')
            fixture.evaluate('document.fonts.ready')
            sample=d/(font.replace(' ','-')+'.png');fixture.screenshot(path=str(sample));fixture.close()
            run(sample,[],lang='hin')
            actual=page.locator('#text').input_value();error=cer(expected,actual)
            print('OCR QUALITY',font,'CER',round(error,4),repr(actual),flush=True)
            assert error<=.10,(font,error,actual)
        # Repeated use and failed inputs must never leave old text downloadable.
        bad=d/'broken.pdf';bad.write_bytes(b'%PDF-1.7\ninvalid')
        page.locator('#file').set_input_files(str(bad));assert page.locator('#text').input_value()==''
        page.locator('#start').click();expect(page.locator('#status')).to_have_attribute('data-state','error',timeout=15000)
        expect(page.locator('#download')).to_be_disabled();expect(page.locator('#start')).to_be_enabled()
        too_many=d/'six.pdf';w=PdfWriter()
        for _ in range(6):w.add_blank_page(width=595,height=842)
        with too_many.open('wb') as fp:w.write(fp)
        page.locator('#file').set_input_files(str(too_many));page.locator('#start').click()
        expect(page.locator('#status')).to_have_attribute('data-state','error',timeout=15000)
        expect(page.locator('#download')).to_be_disabled()
        page.locator('#file').set_input_files(str(img))
        page.evaluate("()=>{document.querySelector('#form').requestSubmit();document.querySelector('#cancel').click()}")
        expect(page.locator('#status')).to_have_attribute('data-state','error',timeout=10000)
        expect(page.locator('#start')).to_be_enabled();expect(page.locator('#download')).to_be_disabled()
        run(eng,['SMART FILE PDF TEST'],'eng')
        # Fresh browser context, 4x CPU slowdown and 8 Mbps connection with 150 ms latency.
        cold=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
        cold.route('**/*',route);mobile=cold.new_page();cdp=cold.new_cdp_session(mobile)
        cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
        cdp.send('Network.enable')
        cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':150,'downloadThroughput':1000000,'uploadThroughput':500000})
        transfers=[]
        mobile.on('requestfinished',lambda r:transfers.append((r.url,r.sizes()['responseBodySize'])))
        mobile.goto(base+'/');assert mobile.evaluate('document.documentElement.scrollWidth<=innerWidth')
        assert not any('/vendor/' in u for u,_ in transfers)
        mobile.locator('#file').set_input_files(str(img))
        start=time.monotonic();mobile.locator('#start').click()
        expect(mobile.locator('#status')).to_have_attribute('data-state','done',timeout=45000)
        elapsed=time.monotonic()-start
        assert normalized(mobile.locator('#text').input_value())==normalized('भारत मेरा देश है SMART FILE TEST')
        total=sum(n for u,n in transfers if '/vendor/' in u)
        print('OCR COLD MOBILE',round(elapsed,2),'seconds',total,'vendor bytes',flush=True)
        assert elapsed<=45 and total<=10*1024*1024,(elapsed,total)
        cold.close()
        assert not external,external
        print('PASS font accuracy benchmark, malformed PDF, page limit, cancel and retry',flush=True)
        b.close()
        print('PASS direct PDF, camera-file OCR, mixed Hindi-English, scanned PDF and UTF-8 export',flush=True)
finally:
    server.shutdown();server.server_close()
