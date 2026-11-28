"""Synthetic performance gate, not a claim about actual Android hardware."""
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from tempfile import TemporaryDirectory
from time import perf_counter
import threading, json, random, re
from PIL import Image
from pypdf import PdfWriter, PdfReader
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
def site_headers(url_path, text):
    """Apply _headers like Cloudflare Pages: matching rules in order, '! Name' removes a header."""
    rules, current = [], None
    for line in text.splitlines():
        if not line.strip(): continue
        if not line.startswith(" "):
            current = (line.strip(), []); rules.append(current)
        elif current: current[1].append(line.strip())
    out = {}
    for pattern, lines in rules:
        if pattern == url_path or (pattern.endswith("*") and url_path.startswith(pattern[:-1])):
            for item in lines:
                if item.startswith("!"): out.pop(item[1:].strip().lower(), None)
                else:
                    name, value = item.split(":", 1); out[name.strip().lower()] = (name.strip(), value.strip())
    return list(out.values())
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def end_headers(self):
        for name, value in site_headers(self.path.split('?')[0], (ROOT/'site'/'_headers').read_text(encoding='utf-8')):
            self.send_header(name, value)
        super().end_headers()

def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'site')))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    origin=f'http://127.0.0.1:{server.server_port}'
    report={'environment':'Chromium Linux CI, 390x844, CDP CPU slowdown 4x; local HTTP except home network simulation','cases':[]}
    try:
        with TemporaryDirectory() as tmp,sync_playwright() as p:
            d=Path(tmp)
            # Deterministic synthetic camera-sized images, never user files.
            rng=random.Random(27)
            photo=d/'photo.jpg'
            Image.frombytes('RGB',(2400,1800),rng.randbytes(2400*1800*3)).save(photo,quality=90)
            photos=[]
            for i in range(10):
                path=d/f'photo-{i}.jpg';path.write_bytes(photo.read_bytes());photos.append(str(path))
            pdfs=[]
            for i in range(2):
                path=d/f'doc-{i}.pdf';w=PdfWriter()
                for j in range(50):w.add_blank_page(width=595,height=842)
                with path.open('wb') as fp:w.write(fp)
                pdfs.append(str(path))
            browser=p.chromium.launch()
            context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,accept_downloads=True,service_workers='block')  # offline cache is covered by smoke.py; keep failure injection deterministic
            page=context.new_page();cdp=context.new_cdp_session(page)
            cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
            errors=[];external=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('request',lambda r:external.append(r.url) if not r.url.startswith((origin,'blob:','data:')) else None)
            def home():
                cdp.send('Network.enable')
                cdp.send('Network.setCacheDisabled',{'cacheDisabled':True})
                cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':150,'downloadThroughput':200000,'uploadThroughput':100000})
                start=perf_counter();page.goto(origin,wait_until='load',timeout=15000)
                expect(page.locator('.tile').first).to_be_visible()
                elapsed=perf_counter()-start
                assert elapsed<5,('homepage seconds',elapsed)
                sizes=page.evaluate("performance.getEntriesByType('resource').map(x=>({name:x.name,bytes:x.transferSize}))")
                assert all('/vendor/' not in x['name'] for x in sizes),sizes
                total=sum(x['bytes'] for x in sizes)+page.evaluate("performance.getEntriesByType('navigation')[0].transferSize")
                assert total<=100*1024,('homepage transfer',total)
                assert page.locator('.tile svg').count()==28
                assert page.locator('#tool-search').is_visible()
                assert not any('/fonts/' in x['name'] for x in sizes),sizes
                report['cases'].append({'case':'cold homepage simulated network','seconds':round(elapsed,3),'budget_seconds':5,'transfer_bytes':total})
                cdp.send('Network.emulateNetworkConditions',{'offline':False,'latency':0,'downloadThroughput':-1,'uploadThroughput':-1})
                cdp.send('Network.setCacheDisabled',{'cacheDisabled':False})
            def go(slug):
                page.goto(origin+'/tools/'+slug+'/',wait_until='load',timeout=15000)
                expect(page.locator('#fields input').first).to_be_visible()
            def run(name,budget,verify):
                # Timer heartbeat measures event-loop gaps while an operation is running.
                page.evaluate("() => { window.perfGaps=[]; let prev=performance.now(); window.perfTimer=setInterval(()=>{const now=performance.now();window.perfGaps.push(now-prev);prev=now},50); }")
                start=perf_counter()
                try:
                    page.locator('button[type=submit]').click(timeout=5000)
                    expect(page.locator('#status')).to_have_text(re.compile(r'^Done'),timeout=budget*1000)
                    expect(page.locator('button[type=submit]')).to_be_enabled(timeout=2000)
                    seconds=perf_counter()-start
                    with page.expect_download(timeout=5000) as event:page.locator('#result a').click()
                    dest=d/(name+'.out');event.value.save_as(dest);verify(dest)
                    gaps=page.evaluate("() => {clearInterval(window.perfTimer);return window.perfGaps}")
                    gap=max(gaps,default=0)
                    row={'case':name,'seconds':round(seconds,3),'budget_seconds':budget,'max_heartbeat_gap_ms':round(gap,1),'output_bytes':dest.stat().st_size}
                    report['cases'].append(row);print('PERF',json.dumps(row),flush=True)
                    assert seconds<=budget,row
                    assert gap<=2000,('UI event loop stall',row)
                finally:
                    page.evaluate("() => clearInterval(window.perfTimer)")
            def valid_pdf(n):
                def verify(path):
                    r=PdfReader(path);assert len(r.pages)==n
                    for pg in r.pages:assert float(pg.mediabox.width)>0
                return verify
            def valid_image(path):
                assert path.stat().st_size<=50*1024
                with Image.open(path) as im:im.verify()
            home()
            go('compress');page.locator('#files').set_input_files(str(photo));page.locator('[data-kb="50"]').click()
            run('photo-compress-50kb',15,valid_image)
            run('photo-compress-repeat',15,valid_image)
            go('photo-studio');page.locator('#files').set_input_files(str(photo));expect(page.locator('#preview')).to_be_visible(timeout=10000)
            page.locator('#rotate').click();page.locator('#filter').select_option('sepia');page.locator('#resolution').select_option('1920')
            def valid_studio(path):
                with Image.open(path) as im:assert im.size==(1440,1920);im.verify()
            run('studio-rotate-filter-export',15,valid_studio)
            plain=d/'plain-large.png';im=Image.new('RGB',(2400,1800),'white');im.paste((220,30,40),(500,400,1900,1400));im.save(plain)
            go('background-changer');page.locator('#files').set_input_files(str(plain));page.locator('#background-mode').select_option('transparent')
            def valid_cutout(path):
                with Image.open(path).convert('RGBA') as im:
                    assert im.size==(1600,1200) and im.getpixel((5,5))[3]==0 and im.getpixel((800,600))[3]==255
            run('plain-background-worker',15,valid_cutout)
            go('photo-sheet');page.locator('#files').set_input_files(str(photo));page.locator('#copies').select_option('12')
            def valid_sheet(path):
                with Image.open(path) as im:assert im.size==(2480,3508);im.verify()
            run('photo-sheet-12-a4',15,valid_sheet)
            go('image-to-pdf');page.locator('#files').set_input_files(photos[:3]);run('three-camera-photos',15,valid_pdf(3))
            go('image-to-pdf');page.locator('#files').set_input_files(photos);run('ten-camera-photos',45,valid_pdf(10))
            go('merge-pdf');page.locator('#pdf-files').set_input_files(pdfs);run('merge-100-blank-pages',15,valid_pdf(100))
            go('rotate-pdf');page.locator('#pdf-files').set_input_files(pdfs[0]);run('rotate-50-blank-pages',12,valid_pdf(50))
            go('split-pdf');page.locator('#pdf-files').set_input_files(pdfs[0]);page.locator('#pages').fill('999');page.locator('button[type=submit]').click()
            expect(page.locator('#status')).to_have_class('error',timeout=5000);expect(page.locator('button[type=submit]')).to_be_enabled();assert page.locator('#result a').count()==0
            page.locator('#pages').fill('1-10');run('recover-after-invalid-range',12,valid_pdf(10))
            # Hold worker network response to deterministically test cancel before computation.
            go('merge-pdf');page.locator('#pdf-files').set_input_files(pdfs)
            page.route('**/assets/pdf-worker.js',lambda route:route.abort())
            page.locator('button[type=submit]').click()
            expect(page.locator('#status')).to_have_class('error',timeout=5000)
            expect(page.locator('button[type=submit]')).to_be_enabled()
            page.unroute('**/assets/pdf-worker.js')
            go('merge-pdf');page.locator('#pdf-files').set_input_files(pdfs)
            # Cancel within the same browser task after the worker starts.
            page.evaluate("""() => {const b=document.querySelector('#cancel-pdf');const watch=new MutationObserver(()=>{if(!b.hidden){watch.disconnect();b.click()}});watch.observe(b,{attributes:true,attributeFilter:['hidden']});document.querySelector('form').requestSubmit()}""")
            expect(page.locator('#status')).to_have_text(re.compile(r'^Processing cancelled'),timeout=5000)
            expect(page.locator('button[type=submit]')).to_be_enabled();assert page.locator('#result a').count()==0
            run('merge-after-cancel',15,valid_pdf(100))
            assert not errors,errors
            assert not external,external
            browser.close()
        report['passed']=True
        print('PASS synthetic mobile performance budgets and valid output recovery',flush=True)
    finally:
        output=ROOT/'preview-output';output.mkdir(exist_ok=True)
        (output/'performance-report.json').write_text(json.dumps(report,indent=2))
        server.shutdown();server.server_close()
if __name__=='__main__':main()
