"""Package tested static preview files only, without npm or Python packages."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import hashlib, json, os
ROOT=Path(__file__).resolve().parents[1]
site=ROOT/'site'
output=ROOT/'preview-output'
output.mkdir(exist_ok=True)
pages=list(site.rglob('index.html'))
assert len(pages)==46
assert all('noindex, nofollow' in p.read_text(encoding='utf-8') for p in pages)
assert 'Disallow: /' in (site/'robots.txt').read_text()
assert not (site/'sitemap.xml').exists()
assert len(list((output/'screenshots').glob('*.png')))==6
for p in site.rglob('*'):
    assert not p.is_symlink(),p
files=sorted(p for p in site.rglob('*') if p.is_file())
readme='''SmartFile Tools — local preview, not a public launch.
Extract this inner ZIP into a new directory. Python 3 is the only requirement.
In Termux, go into that directory and run: python serve_preview.py
Then open http://127.0.0.1:8791/ in your phone browser.
Stop with Ctrl+C. If 8791 is in use: python serve_preview.py --port 8792
Do not use a public bind address. No API keys, ads or accounts required.
Do not deploy this noindex preview to production.
'''
zip_path=output/'smartfile-preview.zip'
with ZipFile(zip_path,'w',ZIP_DEFLATED) as z:
    for p in files:z.write(p,'site/'+p.relative_to(site).as_posix())
    z.write(ROOT/'scripts'/'serve_preview.py','serve_preview.py')
    z.writestr('START-HERE.txt',readme)
with ZipFile(zip_path) as z:assert z.testzip() is None
report={'commit':os.getenv('GITHUB_SHA','local'),'pages':len(pages),'files':len(files),'zip_sha256':hashlib.sha256(zip_path.read_bytes()).hexdigest(),'preview_only':True,'ads':False,'public_launch':False}
(output/'preview-manifest.json').write_text(json.dumps(report,indent=2)+'\n')
print('PASS packaged local preview with 46 pages, 6 screenshots and ZIP integrity',report)
