from pathlib import Path
import os, tempfile, threading, functools, http.server, random
from PIL import Image
from pypdf import PdfReader
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'site')))
threading.Thread(target=server.serve_forever,daemon=True).start()
base=f'http://127.0.0.1:{server.server_port}'
with tempfile.TemporaryDirectory() as td,sync_playwright() as p:
    d=Path(td); random.seed(17); fixture=d/'photo.png'
    Image.frombytes('RGB',(640,480),random.randbytes(640*480*3)).save(fixture)
    args={'headless':True}
    if os.getenv('CHROMIUM_PATH'): args['executable_path']=os.environ['CHROMIUM_PATH']
    browser=p.chromium.launch(**args)
    page=browser.new_page(viewport={'width':390,'height':844},accept_downloads=True)
    errors=[]; external=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:external.append(r.url) if not r.url.startswith((base,'blob:','data:')) else None)
    def go(slug):
        page.goto(base+'/tools/'+slug+'/')
        page.locator('#fields input, #fields textarea').first.wait_for()
    def run():
        page.locator('button[type=submit]').click()
        page.wait_for_function("document.querySelector('button[type=submit]').disabled === false && document.querySelector('#status').textContent !== ''")
        assert page.locator('#status').inner_text().startswith('Done'),page.locator('#status').inner_text()
    def get(name):
        with page.expect_download() as event: page.locator('#result a').click()
        path=d/name;event.value.save_as(path);return path
    page.goto(base)
    assert page.locator('.tile').count()==8
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    for kb in (20,50,100,200):
        go('compress');page.locator('#files').set_input_files(str(fixture));page.locator(f'[data-kb="{kb}"]').click();run()
        f=get(f'{kb}.jpg');assert f.stat().st_size<=kb*1024;Image.open(f).verify()
    print('PASS four compression presets')
    for slug,wh in [('resize',(200,150)),('signature',(300,100)),('passport',(413,531)),('crop',(150,120))]:
        go(slug);page.locator('#files').set_input_files(str(fixture));page.locator('#width').fill(str(wh[0]));page.locator('#height').fill(str(wh[1]));run()
        assert Image.open(get(slug+'.jpg')).size==wh
    go('crop');page.locator('#files').set_input_files(str(fixture));page.locator('#x').fill('630');page.locator('button[type=submit]').click();page.wait_for_function("document.querySelector('#status').className==='error'")
    go('image-to-pdf');page.locator('#files').set_input_files([str(fixture),str(d/'resize.jpg')]);run();reader=PdfReader(get('output.pdf'));assert len(reader.pages)==2;assert all(len(x.images)==1 for x in reader.pages)
    go('age');page.locator('#birth').fill('2000-02-29');page.locator('#asof').fill('2023-02-28');run();assert '23 years, 0 months, 0 days' in page.locator('#result').inner_text()
    go('words');page.locator('#text').fill('hello world\nthree');run();assert '3 words' in page.locator('#result').inner_text()
    assert not errors,errors;assert not external,external
    print('PASS resize, crop, signature, ID photo, PDF, age, word count and no external requests')
    browser.close()
server.shutdown()
