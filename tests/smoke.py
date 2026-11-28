from pathlib import Path
import os, tempfile, threading, functools, http.server, random, re
from PIL import Image
from pypdf import PdfReader, PdfWriter
import zxingcpp
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
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
    def end_headers(self):
        for name, value in site_headers(self.path.split('?')[0], (ROOT/'site'/'_headers').read_text(encoding='utf-8')):
            self.send_header(name, value)
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
    assert page.locator('.tile').count()==25
    assert page.locator('.tile .tool-icon svg').count()==25
    assert page.locator('.tool-group').count()==3
    shapes=page.locator('.tile svg').evaluate_all("(xs)=>xs.map(x=>x.innerHTML)")
    assert len(set(shapes))==25
    assert page.locator('.category-nav a').count()==3
    page.locator('.category-nav a').first.click()
    assert page.evaluate("location.hash")=='#group-pdf'
    assert page.locator('#group-pdf .tile').count()==10
    search=page.locator('#tool-search')
    expect(search).to_be_visible()
    search.fill('merge pdf');assert page.locator('.tile:visible').count()==1
    assert page.locator('.tile:visible').get_attribute('href')=='/tools/merge-pdf/'
    search.fill('५० kb');hrefs=page.locator('.tile:visible').evaluate_all("(xs)=>xs.map(x=>x.getAttribute('href'))")
    assert '/tools/compress/' in hrefs and set(hrefs)<= {'/tools/compress/','/tools/compress-pdf/'},hrefs
    search.fill('photo se pdf');assert page.locator('.tile:visible').count()==1
    search.fill('xyz-no-tool');assert page.locator('.tile:visible').count()==0
    expect(page.locator('#search-status')).to_contain_text('No tools found')
    page.locator('#clear-search').click();assert page.locator('.tile:visible').count()==25
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
    go('resize');assert page.locator('.photo-tabs a').count()==8
    assert page.locator('.photo-tabs a[aria-current=page]').inner_text()=='Resolution'
    page.locator('#files').set_input_files(str(fixture));page.locator('[data-resolution="1280,720"]').click();run()
    assert Image.open(get('hd.jpg')).size==(1280,720)
    page.locator('.photo-tabs a[href="/tools/crop/"]').click();assert page.url.endswith('/tools/crop/')
    page.locator('#files').set_input_files(str(fixture));page.locator('[data-ratio="1:1"]').click()
    expect(page.locator('#width')).to_have_value('480');expect(page.locator('#x')).to_have_value('80');run()
    assert Image.open(get('square-crop.jpg')).size==(480,480)
    go('photo-studio');page.locator('#files').set_input_files(str(fixture));expect(page.locator('#preview')).to_be_visible()
    page.locator('#rotate').click();expect(page.locator('#preview-size')).to_have_text('480 × 640 px')
    page.locator('#undo').click();expect(page.locator('#preview-size')).to_have_text('640 × 480 px')
    page.locator('#redo').click();expect(page.locator('#preview-size')).to_have_text('480 × 640 px')
    page.locator('#crop').select_option('1:1');page.locator('#filter').select_option('gray');page.locator('#resolution').select_option('720');run()
    with Image.open(get('studio.jpg')) as edited:
        assert edited.size==(720,720)
        r,g,b=edited.convert('RGB').getpixel((200,200));assert max(r,g,b)-min(r,g,b)<=3
    page.locator('#reset').click();expect(page.locator('#preview-size')).to_have_text('640 × 480 px')
    assert page.locator('#files').evaluate('(x)=>x.files.length')==1
    print('PASS studio preview, rotate, undo/redo, crop, grayscale, resolution and retained photo')
    cut=d/'plain.png';im=Image.new('RGB',(100,100),'white');im.paste((210,20,30),(30,20,70,80));im.save(cut)
    scene=d/'scene.png';Image.new('RGB',(100,100),(0,100,230)).save(scene)
    go('background-changer');page.locator('#files').set_input_files(str(cut));page.locator('#background-mode').select_option('image');page.locator('#scene').set_input_files(str(scene));run()
    with Image.open(get('background.png')).convert('RGBA') as edited:
        assert edited.getpixel((5,5))==(0,100,230,255)
        assert edited.getpixel((50,50))==(210,20,30,255)
    page.locator('#background-mode').select_option('transparent');run()
    with Image.open(get('cutout.png')).convert('RGBA') as edited:assert edited.getpixel((5,5))[3]==0 and edited.getpixel((50,50))[3]==255
    page.locator('#subject-mode').select_option('transparent');page.locator('#files').set_input_files(str(d/'cutout.png'));page.locator('#background-mode').select_option('color');run()
    with Image.open(get('replaced.png')).convert('RGBA') as edited:assert edited.getpixel((5,5))==(240,245,255,255)
    print('PASS plain-background cutout, transparency and own-scene compositing pixel checks')
    # Exam checker: wrong input is reported, fixed output meets exact pixels and KB range.
    go('exam-photo');page.locator('#exam').select_option('ibps-signature')
    assert page.locator('#width').input_value()=='140' and page.locator('#max-kb').input_value()=='20'
    page.locator('#files').set_input_files(str(fixture));run()
    assert page.locator('#result li[data-ok=no]').count()>=2
    out=get('exam-sign.jpg');im=Image.open(out);kb=out.stat().st_size/1024
    assert im.format=='JPEG' and im.size==(140,60) and 10<=kb<=20,(im.format,im.size,kb)
    plain=d/'plain.png';Image.new('RGB',(900,700),'white').save(plain)
    go('exam-photo');page.locator('#exam').select_option('ssc-photo');page.locator('#files').set_input_files(str(plain));run()
    out=get('exam-photo.jpg');im=Image.open(out);im.load();kb=out.stat().st_size/1024
    assert im.size==(350,450) and 20<=kb<=50,(im.size,kb)
    assert page.locator('#result').inner_text().count('Blank metadata')==1
    go('exam-photo');page.locator('#exam').select_option('custom');page.locator('#width').fill('3000');page.locator('#height').fill('3000');page.locator('#min-kb').fill('1');page.locator('#max-kb').fill('2')
    page.locator('#files').set_input_files(str(fixture));page.locator('button[type=submit]').click()
    expect(page.locator('#status')).to_have_class('error',timeout=30000);assert page.locator('#result a').count()==0
    # Compress PDF: heavy scanned pages fit the KB target, page count and page size stay.
    scans=[Image.frombytes('RGB',(1700,2300),random.randbytes(1700*2300*3)) for _ in range(3)]
    heavy=d/'scans.pdf';scans[0].save(heavy,save_all=True,append_images=scans[1:],resolution=200,quality=95)
    assert heavy.stat().st_size>3*1024*1024
    go('compress-pdf');page.locator('#pdf-files').set_input_files(str(heavy));page.locator('[data-pdfkb="500"]').click()
    assert page.locator('#target-kb').input_value()=='500';run()
    out=get('small.pdf');r=PdfReader(out);src=PdfReader(heavy)
    assert out.stat().st_size<=500*1024,out.stat().st_size
    assert len(r.pages)==3 and [tuple(p.mediabox) for p in r.pages]==[tuple(p.mediabox) for p in src.pages]
    go('compress-pdf');page.locator('#pdf-files').set_input_files(str(heavy));page.locator('#target-kb').fill('20');page.locator('button[type=submit]').click()
    expect(page.locator('#status')).to_have_class('error',timeout=60000);assert page.locator('#result a').count()==0
    # ID card print: two copies of front+back at 85.6 x 54 mm (1011 x 638 px at 300 dpi) on A4.
    fr=d/'front.png';bk=d/'back.png';Image.new('RGB',(1600,1000),(30,90,160)).save(fr);Image.new('RGB',(1600,1000),(160,60,30)).save(bk)
    page.goto(base+'/tools/id-card/');page.locator('#front').wait_for();page.locator('#front').set_input_files(str(fr));page.locator('#back').set_input_files(str(bk));page.locator('#card-copies').select_option('2');run()
    out=get('id.pdf');r=PdfReader(out);assert len(r.pages)==1 and [round(float(v)) for v in r.pages[0].mediabox]==[0,0,595,842]
    sheet=r.pages[0].images[0].image.convert('L');assert sheet.size==(2480,3508)
    box=sheet.point(lambda v:255 if v<200 else 0).getbbox();w,h=box[2]-box[0],box[3]-box[1]
    assert abs(w-(2*1011+118))<=6 and abs(h-(2*638+150))<=6,(box,w,h)
    assert 'Actual size' in page.locator('#result').inner_text()
    # Excel to PDF: a 14-column, 151-row sheet with dates, rupee text and Hindi fits on 3 pages (5 at a fixed 10 pt).
    import zipfile
    def xlsx(path,rows):
        ns='xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
        strings=[];cells=[]
        for ri,row in enumerate(rows,1):
            cs=[]
            for ci,v in enumerate(row):
                ref=chr(65+ci)+str(ri)
                if isinstance(v,tuple):cs.append(f'<c r="{ref}" s="1"><v>{v[0]}</v></c>')
                elif isinstance(v,(int,float)):cs.append(f'<c r="{ref}"><v>{v}</v></c>')
                else:strings.append(v);cs.append(f'<c r="{ref}" t="s"><v>{len(strings)-1}</v></c>')
            cells.append(f'<row r="{ri}">'+''.join(cs)+'</row>')
        with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as z:
            z.writestr('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
            z.writestr('xl/workbook.xml',f'<workbook {ns}><sheets><sheet name="Fees" sheetId="1" r:id="rId1"/><sheet name="Hidden" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>')
            z.writestr('xl/_rels/workbook.xml.rels','<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="worksheets/sheet1.xml"/></Relationships>')
            z.writestr('xl/styles.xml','<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>')
            z.writestr('xl/sharedStrings.xml',f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+''.join(f'<si><t>{s}</t></si>' for s in strings)+'</sst>')
            z.writestr('xl/worksheets/sheet1.xml',f'<worksheet {ns}><sheetData>'+''.join(cells)+'</sheetData></worksheet>')
    head=['Roll No','Student name','Date','Class','Fee ₹','Paid','Due','Phone','City','विषय','Remarks','Status','Bank','Txn ID']
    data=[head]+[[1000+i,f'Student {i} Kumar',(45000+i,),'XII-A',12500.5,10000,2500.5,'9876543210','Lucknow','गणित','Paid by UPI ₹ in two parts','OK','SBI',f'TXN{i:08d}'] for i in range(150)]
    book=d/'fees.xlsx';xlsx(book,data)
    go('sheet-pdf');page.locator('#sheet-file').set_input_files(str(book))
    expect(page.locator('#sheet-name option')).to_have_count(2)
    run();out=get('sheet.pdf');r=PdfReader(out);text=page.locator('#result').inner_text()
    assert '151 rows × 14 columns → 3 pages' in text,text
    assert len(r.pages)==3 and {round(float(p.mediabox[2])) for p in r.pages}<={595,842},(len(r.pages),text)
    csv=d/'list.csv';csv.write_text('Name,Amount\n"Sharma, R",1200\nराम,₹ 50\n',encoding='utf-8')
    go('sheet-pdf');page.locator('#sheet-file').set_input_files(str(csv));run();get('csv.pdf')
    assert '3 rows × 2 columns → 1 page, portrait' in page.locator('#result').inner_text(),page.locator('#result').inner_text()
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
    hrefs=page.locator('.tile:visible').evaluate_all("(xs)=>xs.map(x=>x.getAttribute('href'))")
    assert sorted(hrefs)==['/hi/tools/exam-photo/','/hi/tools/signature/'],hrefs
    page.locator('#clear-search').click()
    assert page.locator('.tile:visible').count()==25
    assert page.locator('.tile').count()==25
    assert page.locator('.tile .tool-icon svg').count()==25
    assert page.locator('.tool-group').count()==3
    for slug in ('exam-photo','compress-pdf','id-card','sheet-pdf','compress','resize','signature','crop','passport','image-to-pdf','age','convert','inspect','merge-pdf','split-pdf','qr','words','remove-pdf-pages','rotate-pdf','reorder-pdf','watermark-pdf','number-pdf','photo-sheet','photo-studio','background-changer'):
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
    # PWA: installable manifest, own-origin service worker, pages keep connect-src 'none', tools open offline.
    man=page.request.get(base+'/manifest.webmanifest').json()
    assert man['display']=='standalone' and man['start_url']=='/' and {i['sizes'] for i in man['icons']}=={'192x192','512x512'}
    for icon in man['icons']:assert Image.open(__import__('io').BytesIO(page.request.get(base+icon['src']).body())).size==tuple(map(int,icon['sizes'].split('x')))
    assert "connect-src 'self'" in page.request.get(base+'/sw.js').headers['content-security-policy']
    assert "connect-src 'none'" in page.request.get(base+'/tools/compress/').headers['content-security-policy']
    page.goto(base+'/tools/compress/');assert page.evaluate("navigator.serviceWorker.ready.then(r=>r.scope)")==base+'/'
    page.reload();page.wait_for_function("navigator.serviceWorker.controller!==null",timeout=15000)
    page.context.set_offline(True)
    try:
        for url,lang in (('/tools/compress-pdf/','en'),('/hi/tools/sheet-pdf/','hi'),('/','en')):
            page.goto(base+url);assert page.locator('html').get_attribute('lang')==lang,url
            if 'tools' in url:page.locator('#fields label').first.wait_for()
        page.goto(base+'/tools/exam-photo/');page.locator('#files').set_input_files(str(fixture));run();assert page.locator('#result a').count()==1
    finally:
        page.context.set_offline(False)
    print('PASS PWA manifest, icons, service worker scope, page CSP unchanged and offline tool pages')
    assert not errors,errors;assert not external,external
    browser.close()
server.shutdown()
