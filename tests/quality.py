"""Repeat-use and content fidelity tests with synthetic fixtures; not real-device certification."""
from pathlib import Path
from tempfile import TemporaryDirectory
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from time import perf_counter
import hashlib, json, random, re, threading, subprocess
from PIL import ImageChops
from PIL import Image
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
class Handler(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
    def end_headers(self):
        for line in (ROOT/'site'/'_headers').read_text().splitlines():
            if line.startswith('  '):
                n,v=line.strip().split(':',1);self.send_header(n,v.strip())
        super().end_headers()

def text_pdf(path):
    writer=PdfWriter()
    font=writer._add_object(DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')}))
    for i in range(1,5):
        page=writer.add_blank_page(width=595,height=842)
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):font})})
        stream=DecodedStreamObject();stream.set_data(f'BT /F1 24 Tf 50 700 Td (Document page {i}) Tj ET'.encode())
        page[NameObject('/Contents')]=writer._add_object(stream)
    with path.open('wb') as fp:writer.write(fp)

def pixel_digest(page):
    return [hashlib.sha256(im.image.convert('RGB').tobytes()).hexdigest() for im in page.images]

def render(path,number,work):
    prefix=work/'rendered'
    subprocess.run(['pdftoppm','-f',str(number),'-l',str(number),'-r','72','-cropbox','-png','-singlefile',str(path),str(prefix)],check=True,capture_output=True,timeout=20)
    with Image.open(prefix.with_suffix('.png')) as im:return im.convert('RGB')

def same_visual(a,b):
    assert a.size==b.size,(a.size,b.size)
    assert ImageChops.difference(a,b).getbbox() is None,'Rendered page changed unexpectedly'

def rotation_fixture(path):
    w=PdfWriter()
    for angle in (0,90,180,270):
        pg=w.add_blank_page(width=420,height=620)
        pg.cropbox.lower_left=(20,30)
        pg.cropbox.upper_right=(400,580)
        pg.rotate(angle)
    with path.open('wb') as fp:w.write(fp)

def overlay_check(path,source,work,kind):
    for n in range(1,5):
        original=render(source,n,work);edited=render(path,n,work)
        assert original.size==edited.size
        w,h=edited.size
        bounds=ImageChops.difference(original,edited).getbbox()
        assert bounds is not None,('overlay missing',kind,n)
        x0,y0,x1,y1=bounds
        assert abs((x0+x1)/2-w/2)<w*.05,(kind,n,bounds)
        if kind=='watermark':
            assert y0>h*.35 and y1<h*.65,(kind,n,bounds)
            assert x1-x0>y1-y0,(kind,n,'not horizontal',bounds)
        else:
            assert y0>h*.88 and y1<h,(kind,n,bounds)
        original.close();edited.close()

def main():
    server=ThreadingHTTPServer(('127.0.0.1',0),partial(Handler,directory=str(ROOT/'site')))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    base=f'http://127.0.0.1:{server.server_port}'
    report={'passed':False,'cases':[],'scope':'synthetic Chromium Linux, 4x CPU slowdown; PDF text and image stream fidelity plus independent Poppler raster comparisons for synthetic fixtures'}
    try:
        with TemporaryDirectory() as tmp,sync_playwright() as p:
            d=Path(tmp);rng=random.Random(42)
            photos=[]
            for i in range(6):
                im=Image.frombytes('RGB',(1600,1200),rng.randbytes(1600*1200*3))
                photos.append(im)
            scan=d/'scan.pdf';photos[0].save(scan,save_all=True,append_images=photos[1:],quality=85,resolution=150)
            photo=d/'photo.jpg';photos[0].save(photo,quality=90)
            for im in photos:im.close()
            text=d/'text.pdf';text_pdf(text)
            expected=[pixel_digest(pg) for pg in PdfReader(scan).pages]
            assert len(expected)==6 and all(len(x)==1 for x in expected)
            browser=p.chromium.launch();ctx=browser.new_context(viewport={'width':390,'height':844},accept_downloads=True)
            page=ctx.new_page();cdp=ctx.new_cdp_session(page);cdp.send('Emulation.setCPUThrottlingRate',{'rate':4})
            errors=[];external=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            page.on('request',lambda r:external.append(r.url) if not r.url.startswith((base,'blob:','data:')) else None)
            def go(slug):
                page.goto(base+'/tools/'+slug+'/');expect(page.locator('#fields input').first).to_be_visible()
            def run(name,verify,budget=15):
                start=perf_counter();page.locator('button[type=submit]').click()
                expect(page.locator('#status')).to_have_text(re.compile('^Done'),timeout=budget*1000)
                expect(page.locator('button[type=submit]')).to_be_enabled()
                elapsed=perf_counter()-start
                with page.expect_download() as event:page.locator('#result a').click()
                out=d/(name+'.out');event.value.save_as(out);verify(out)
                assert elapsed<=budget,(name,elapsed)
                report['cases'].append({'case':name,'seconds':round(elapsed,3),'output_bytes':out.stat().st_size})
                print('QUALITY',name,round(elapsed,3),flush=True)
                return out
            def check_compress(path):
                assert path.stat().st_size<=50*1024
                with Image.open(path) as im:assert im.width>0 and im.height>0;im.verify()
            go('compress');page.locator('#files').set_input_files(str(photo));page.locator('[data-kb="50"]').click()
            for i in range(10):run('compress-repeat-'+str(i+1),check_compress)
            page.locator('[data-kb="100"]').click();assert page.locator('#result a').count()==0
            page.locator('#files').set_input_files({'name':'bad.jpg','mimeType':'image/jpeg','buffer':b'not an image'})
            page.locator('button[type=submit]').click();expect(page.locator('#status')).to_have_class('error',timeout=5000)
            assert page.locator('#result a').count()==0;expect(page.locator('#files')).to_be_enabled()
            page.locator('#files').set_input_files(str(photo));page.locator('[data-kb="50"]').click();run('recover-bad-image',check_compress)
            def merged_check(path):
                reader=PdfReader(path);assert len(reader.pages)==10
                assert [pixel_digest(pg) for pg in reader.pages[:6]]==expected
                assert [pg.extract_text().strip() for pg in reader.pages[6:]]==[f'Document page {i}' for i in range(1,5)]
            go('merge-pdf');page.locator('#pdf-files').set_input_files([str(scan),str(text)])
            merged=run('merge-scanned-and-text',merged_check,30)
            for i in range(1,7):same_visual(render(scan,i,d),render(merged,i,d))
            for i in range(1,5):same_visual(render(text,i,d),render(merged,i+6,d))
            print('VISUAL PASS all ten merged pages',flush=True)
            go('split-pdf');page.locator('#pdf-files').set_input_files(str(merged));page.locator('#pages').fill('8,2,10')
            def extract_check(path):
                r=PdfReader(path);assert len(r.pages)==3
                assert r.pages[0].extract_text().strip()=='Document page 2'
                assert pixel_digest(r.pages[1])==expected[1]
                assert r.pages[2].extract_text().strip()=='Document page 4'
            extracted=run('extract-mixed-order',extract_check)
            for i,n in enumerate((8,2,10),1):same_visual(render(merged,n,d),render(extracted,i,d))
            print('VISUAL PASS extraction order and page appearance',flush=True)
            go('rotate-pdf');page.locator('#pdf-files').set_input_files(str(scan));page.locator('#pages').fill('2,4,6')
            def rotated_check(path):
                r=PdfReader(path);assert [pg.rotation for pg in r.pages]==[0,90,0,90,0,90]
                assert [pixel_digest(pg) for pg in r.pages]==expected
            rotated=run('rotate-scanned-content',rotated_check,30)
            # Compare against independently rendered rotation using pypdf and Poppler.
            rw=PdfWriter(clone_from=str(scan))
            for i in (1,3,5):rw.pages[i].rotate(90)
            reference=d/'rotate-reference.pdf'
            with reference.open('wb') as fp:rw.write(fp)
            for i in range(1,7):same_visual(render(reference,i,d),render(rotated,i,d))
            print('VISUAL PASS all six rotated pages',flush=True)
            go('reorder-pdf');page.locator('#pdf-files').set_input_files(str(text));page.locator('#pages').fill('4,2,1,3')
            run('reorder-text',lambda path:check_text(path,[4,2,1,3]))
            go('remove-pdf-pages');page.locator('#pdf-files').set_input_files(str(text));page.locator('#pages').fill('2,4')
            run('remove-text-pages',lambda path:check_text(path,[1,3]))
            go('watermark-pdf');page.locator('#pdf-files').set_input_files(str(text));page.locator('#watermark').fill('TEST')
            def mark_check(path):
                r=PdfReader(path);assert len(r.pages)==4
                for i,pg in enumerate(r.pages,1):
                    value=pg.extract_text();assert f'Document page {i}' in value and 'TEST' in value
            run('watermark-preserves-text',mark_check)
            go('number-pdf');page.locator('#pdf-files').set_input_files(str(text));page.locator('#start-number').fill('7')
            def number_check(path):
                r=PdfReader(path);assert len(r.pages)==4
                for i,pg in enumerate(r.pages,1):
                    assert pg.extract_text().splitlines()==[f'Document page {i}',str(i+6)]
            run('number-preserves-text',number_check)
            fixture=d/'rotation-fixture.pdf';rotation_fixture(fixture)
            go('watermark-pdf');page.locator('#pdf-files').set_input_files(str(fixture));page.locator('#watermark').fill('TEST')
            run('visual-watermark-rotations',lambda path:overlay_check(path,fixture,d,'watermark'))
            go('number-pdf');page.locator('#pdf-files').set_input_files(str(fixture));page.locator('#start-number').fill('7')
            run('visual-page-number-rotations',lambda path:overlay_check(path,fixture,d,'number'))
            print('VISUAL PASS centered watermark and bottom page number across four rotations and crop box offsets',flush=True)
            go('background-changer');white=d/'white.png';Image.new('RGB',(100,100),'white').save(white)
            page.locator('#files').set_input_files(str(white));page.locator('button[type=submit]').click()
            expect(page.locator('#status')).to_have_class('error',timeout=5000);assert page.locator('#result a').count()==0
            expect(page.locator('#files')).to_be_enabled()
            assert not errors,errors
            assert not external,external
            browser.close()
        report['passed']=True
        print('PASS repeat-use, mixed scan/text PDF fidelity and error recovery',flush=True)
    finally:
        out=ROOT/'preview-output';out.mkdir(exist_ok=True);(out/'quality-report.json').write_text(json.dumps(report,indent=2))
        server.shutdown();server.server_close()

def check_text(path,order):
    r=PdfReader(path);assert [p.extract_text().strip() for p in r.pages]==[f'Document page {i}' for i in order]
if __name__=='__main__':main()
