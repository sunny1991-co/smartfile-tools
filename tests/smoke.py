from pathlib import Path
import os, tempfile, threading, functools, http.server, random, re
from PIL import Image
from pypdf import PdfReader, PdfWriter
import zxingcpp
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def end_headers(self):
        for line in (ROOT/'site'/'_headers').read_text().splitlines():
            if line.startswith('  '):
                name,value=line.strip().split(':',1);self.send_header(name,value.strip())
        super().end_headers()
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
        expect(page.locator('#status')).to_have_text(re.compile(r'^Done'),timeout=30000)
        expect(page.locator('button[type=submit]')).to_be_enabled()
        assert page.locator('#status').inner_text().startswith('Done'),page.locator('#status').inner_text()
    def get(name):
        with page.expect_download() as event: page.locator('#result a').click()
        path=d/name;event.value.save_as(path);return path
    page.goto(base)
    assert page.locator('.tile').count()==19
    assert page.locator('.tile .tool-icon svg').count()==19
    assert page.locator('.tool-group').count()==3
    shapes=page.locator('.tile svg').evaluate_all("(xs)=>xs.map(x=>x.innerHTML)")
    assert len(set(shapes))==19
    assert page.locator('.category-nav a').count()==3
    page.locator('.category-nav a').first.click()
    assert page.evaluate("location.hash")=='#group-pdf'
    assert page.locator('#group-pdf .tile').count()==8
    search=page.locator('#tool-search')
    expect(search).to_be_visible()
    search.fill('merge pdf');assert page.locator('.tile:visible').count()==1
    assert page.locator('.tile:visible').get_attribute('href')=='/tools/merge-pdf/'
    search.fill('५० kb');assert page.locator('.tile:visible').count()==1
    assert page.locator('.tile:visible').get_attribute('href')=='/tools/compress/'
    search.fill('photo se pdf');assert page.locator('.tile:visible').count()==1
    search.fill('xyz-no-tool');assert page.locator('.tile:visible').count()==0
    expect(page.locator('#search-status')).to_contain_text('No tools found')
    page.locator('#clear-search').click();assert page.locator('.tile:visible').count()==19
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    for width in (320,390,768,1280):
        page.set_viewport_size({'width':width,'height':844})
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),width
    page.set_viewport_size({'width':390,'height':844})
    for kb in (20,50,100,200):
        go('compress');page.locator('#files').set_input_files(str(fixture));page.locator(f'[data-kb="{kb}"]').click();run()
        f=get(f'{kb}.jpg');assert f.stat().st_size<=kb*1024;Image.open(f).verify()
    print('PASS four compression presets')
    for slug,wh in [('resize',(200,150)),('signature',(300,100)),('passport',(413,531)),('crop',(150,120))]:
        go(slug);page.locator('#files').set_input_files(str(fixture));page.locator('#width').fill(str(wh[0]));page.locator('#height').fill(str(wh[1]));run()
        assert Image.open(get(slug+'.jpg')).size==wh
    go('resize');assert page.locator('.photo-tabs a').count()==6
    assert page.locator('.photo-tabs a[aria-current=page]').inner_text()=='Resolution'
    page.locator('#files').set_input_files(str(fixture));page.locator('[data-resolution="1280,720"]').click();run()
    assert Image.open(get('hd.jpg')).size==(1280,720)
    page.locator('.photo-tabs a').first.click();assert page.url.endswith('/tools/crop/')
    page.locator('#files').set_input_files(str(fixture));page.locator('[data-ratio="1:1"]').click()
    expect(page.locator('#width')).to_have_value('480');expect(page.locator('#x')).to_have_value('80');run()
    assert Image.open(get('square-crop.jpg')).size==(480,480)
    go('photo-sheet');page.locator('#files').set_input_files(str(fixture));page.locator('#paper').select_option('4x6');page.locator('#copies').select_option('6');run()
    sheet=Image.open(get('sheet-6.jpg'));assert sheet.size==(1200,1800);assert '6 photos' in page.locator('#result').inner_text()
    page.locator('#paper').select_option('a4');page.locator('#copies').select_option('12');run()
    sheet=Image.open(get('sheet-12.jpg'));assert sheet.size==(2480,3508);assert '12 photos' in page.locator('#result').inner_text()
    go('crop');page.locator('#files').set_input_files(str(fixture));page.locator('#x').fill('630');page.locator('button[type=submit]').click();expect(page.locator('#status')).to_have_class('error',timeout=30000)
    go('image-to-pdf');page.locator('#files').set_input_files([str(fixture),str(d/'resize.jpg')]);run();reader=PdfReader(get('output.pdf'));assert len(reader.pages)==2;assert all(len(x.images)==1 for x in reader.pages)
    go('convert');page.locator('#files').set_input_files(str(fixture));page.locator('#format').select_option('image/webp');run();im=Image.open(get('converted.webp'));assert im.format=='WEBP' and im.size==(640,480)
    alpha=d/'alpha.png';Image.new('RGBA',(32,32),(255,0,0,0)).save(alpha)
    go('convert');page.locator('#files').set_input_files(str(alpha));page.locator('#format').select_option('image/png');run();im=Image.open(get('alpha-output.png')).convert('RGBA');assert im.getpixel((0,0))[3]==0
    go('inspect');page.locator('#files').set_input_files(str(fixture));run();assert '640 × 480 pixels' in page.locator('#result').inner_text();assert '4:3' in page.locator('#result').inner_text();assert str(fixture.stat().st_size)+' bytes' in page.locator('#result').inner_text()
    # PDFs with distinct page dimensions make order independently verifiable.
    for filename, widths in [('one.pdf',[120,140]),('two.pdf',[220])]:
        writer=PdfWriter()
        for width in widths: writer.add_blank_page(width=width,height=300)
        with (d/filename).open('wb') as fp: writer.write(fp)
    go('merge-pdf');page.locator('#pdf-files').set_input_files([str(d/'one.pdf'),str(d/'two.pdf')]);run()
    merged=get('merged.pdf');assert [int(x.mediabox.width) for x in PdfReader(merged).pages]==[120,140,220]
    go('split-pdf');page.locator('#pdf-files').set_input_files(str(merged));page.locator('#pages').fill('3,1');run();assert [int(x.mediabox.width) for x in PdfReader(get('extracted.pdf')).pages]==[220,120]
    go('split-pdf');page.locator('#pdf-files').set_input_files(str(merged));page.locator('#pages').fill('4');page.locator('button[type=submit]').click();expect(page.locator('#status')).to_have_class('error',timeout=30000);assert page.locator('#result a').count()==0
    enc=PdfWriter();enc.add_blank_page(width=120,height=300);enc.encrypt('test-password')
    with (d/'encrypted.pdf').open('wb') as fp:enc.write(fp)
    go('split-pdf');page.locator('#pdf-files').set_input_files(str(d/'encrypted.pdf'));page.locator('#pages').fill('1');page.locator('button[type=submit]').click();expect(page.locator('#status')).to_have_class('error',timeout=30000);assert page.locator('#result a').count()==0
    go('remove-pdf-pages');page.locator('#pdf-files').set_input_files(str(merged));page.locator('#pages').fill('2');run()
    assert [int(x.mediabox.width) for x in PdfReader(get('removed.pdf')).pages]==[120,220]
    go('remove-pdf-pages');page.locator('#pdf-files').set_input_files(str(merged));page.locator('#pages').fill('1-3');page.locator('button[type=submit]').click();expect(page.locator('#status')).to_have_class('error',timeout=30000);assert page.locator('#result a').count()==0
    go('reorder-pdf');page.locator('#pdf-files').set_input_files(str(merged));page.locator('#pages').fill('3,1,2');run()
    assert [int(x.mediabox.width) for x in PdfReader(get('reordered.pdf')).pages]==[220,120,140]
    go('reorder-pdf');page.locator('#pdf-files').set_input_files(str(merged));page.locator('#pages').fill('1,2');page.locator('button[type=submit]').click();expect(page.locator('#status')).to_have_class('error',timeout=30000)
    go('rotate-pdf');page.locator('#pdf-files').set_input_files(str(merged));page.locator('#pages').fill('2');run()
    rotated=get('rotated.pdf');assert [x.rotation for x in PdfReader(rotated).pages]==[0,90,0]
    go('rotate-pdf');page.locator('#pdf-files').set_input_files(str(rotated));page.locator('#rotation').select_option('180');run()
    assert [x.rotation for x in PdfReader(get('rotate-all.pdf')).pages]==[180,270,180]
    go('watermark-pdf');page.locator('#pdf-files').set_input_files(str(rotated));page.locator('#watermark').fill('DRAFT');run()
    assert all('DRAFT' in x.extract_text() for x in PdfReader(get('watermarked.pdf')).pages)
    go('number-pdf');page.locator('#pdf-files').set_input_files(str(rotated));page.locator('#start-number').fill('7');run()
    numbered=PdfReader(get('numbered.pdf'));assert [x.extract_text().strip() for x in numbered.pages]==['7','8','9'];assert [x.rotation for x in numbered.pages]==[0,90,0]
    for slug in ('remove-pdf-pages','reorder-pdf','rotate-pdf','watermark-pdf','number-pdf'):
        go(slug);page.locator('#pdf-files').set_input_files(str(d/'encrypted.pdf'))
        if slug in ('remove-pdf-pages','reorder-pdf'):page.locator('#pages').fill('1')
        if slug=='watermark-pdf':page.locator('#watermark').fill('DRAFT')
        page.locator('button[type=submit]').click();expect(page.locator('#status')).to_have_class('error',timeout=30000);assert page.locator('#result a').count()==0
    print('PASS PDF remove, reorder, rotate, watermark, page numbers, invalid selection and encrypted rejection')
    for value in ('https://example.com/smartfile','नमस्ते SmartFile'):
        go('qr');page.locator('#qr-text').fill(value);run();decoded=zxingcpp.read_barcode(Image.open(get('code.png')));assert decoded is not None and decoded.text==value,decoded
    print('PASS PDF merge/extract, invalid range, encrypted rejection and independently decoded QR')
    go('age');page.locator('#birth').fill('2000-02-29');page.locator('#asof').fill('2023-02-28');run();assert '23 years, 0 months, 0 days' in page.locator('#result').inner_text()
    go('words');page.locator('#text').fill('hello world\nthree');run();assert '3 words' in page.locator('#result').inner_text()
    page.goto(base+'/hi/')
    assert page.locator('html').get_attribute('lang')=='hi'
    page.locator('#tool-search').fill('हस्ताक्षर')
    assert page.locator('.tile:visible').count()==1
    assert page.locator('.tile:visible').get_attribute('href')=='/hi/tools/signature/'
    page.locator('#clear-search').click()
    assert page.locator('.tile:visible').count()==19
    assert page.locator('.tile').count()==19
    assert page.locator('.tile .tool-icon svg').count()==19
    assert page.locator('.tool-group').count()==3
    for slug in ('compress','resize','signature','crop','passport','image-to-pdf','age','convert','inspect','merge-pdf','split-pdf','qr','words','remove-pdf-pages','rotate-pdf','reorder-pdf','watermark-pdf','number-pdf','photo-sheet'):
        page.goto(base+'/hi/tools/'+slug+'/')
        assert page.locator('html').get_attribute('lang')=='hi'
        assert page.locator('#fields label').count()>0
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),slug
        assert page.locator('nav a.language').get_attribute('href')=='/tools/'+slug+'/'
    page.goto(base+'/hi/tools/compress/');page.locator('#files').set_input_files(str(fixture));page.locator('[data-kb="20"]').click();page.locator('button[type=submit]').click()
    expect(page.locator('#status')).to_have_text('तैयार। अपना परिणाम जांचें।',timeout=30000)
    assert get('hi-20.jpg').stat().st_size<=20*1024
    page.goto(base+'/hi/tools/age/');page.locator('#birth').fill('2000-02-29');page.locator('#asof').fill('2023-02-28');page.locator('button[type=submit]').click()
    expect(page.locator('#result')).to_contain_text('23 साल, 0 महीने, 0 दिन')
    page.goto(base+'/hi/tools/rotate-pdf/');page.locator('#pdf-files').set_input_files(str(merged));page.locator('button[type=submit]').click()
    expect(page.locator('#status')).to_have_text('तैयार। अपना परिणाम जांचें।',timeout=30000)
    assert [x.rotation for x in PdfReader(get('hi-rotated.pdf')).pages]==[90,90,90]
    print('PASS Hindi pages, language links, compression, age and rotation results')
    assert not errors,errors;assert not external,external
    print('PASS resize, crop, signature, ID photo, PDF, age, word count and no external requests')
    screenshots=ROOT/'preview-output'/'screenshots'
    screenshots.mkdir(parents=True,exist_ok=True)
    for name,url,width,height in [('home-mobile','/',390,844),('home-desktop','/',1280,900),('hindi-home','/hi/',390,844),('compress-mobile','/tools/compress/',390,844),('pdf-mobile','/tools/merge-pdf/',390,844),('hindi-compress','/hi/tools/compress/',390,844)]:
        page.set_viewport_size({'width':width,'height':height})
        page.goto(base+url)
        page.screenshot(path=str(screenshots/(name+'.png')),full_page=False)
    assert not errors,errors;assert not external,external
    browser.close()
server.shutdown()
