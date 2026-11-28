"""Independent, read-only check of the live SmartFile Pages deployment."""
import argparse
import concurrent.futures
import urllib.request
import urllib.error
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit
from xml.etree import ElementTree

ORIGIN = "https://smartfile-tools.pages.dev"
TOOLS = "exam-photo compress resize signature crop passport image-to-pdf age convert inspect merge-pdf split-pdf qr words remove-pdf-pages rotate-pdf reorder-pdf watermark-pdf number-pdf photo-sheet photo-studio background-changer".split()
PAGES = [prefix + suffix for prefix in ("", "/hi") for suffix in ("/", "/privacy/", "/terms/", "/about/", *("/tools/" + t + "/" for t in TOOLS))]
ASSETS = ["/assets/style.css", "/assets/tools.js", "/assets/library.js", "/assets/photo-studio.js", "/assets/background.js", "/assets/background-worker.js", "/assets/pdf-worker.js", "/assets/icon.svg", "/assets/vendor/pdf-lib.min.js", "/assets/vendor/qrcode.js", "/assets/vendor/THIRD-PARTY-LICENSES.txt"]

class Page(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.lang = ""
        self.robots = ""
        self.canonical = ""
        self.scripts = []
        self.verification = ""
        self.feed(text)
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "html": self.lang = a.get("lang", "")
        if tag == "meta" and a.get("name", "").lower() == "robots": self.robots = a.get("content", "").lower()
        if tag == "meta" and a.get("name") == "google-site-verification": self.verification = a.get("content", "")
        if tag == "link" and a.get("rel") == "canonical": self.canonical = a.get("href", "")
        if tag == "script": self.scripts.append(a.get("src", ""))

def fetch(path):
    req = urllib.request.Request(ORIGIN + path, headers={"User-Agent":"SmartFile-Release-Check/1.0","Accept-Encoding":"identity"})
    with urllib.request.urlopen(req, timeout=15) as r:
        assert r.status == 200, (path, r.status)
        assert urlsplit(r.geturl()).netloc == urlsplit(ORIGIN).netloc, (path, r.geturl())
        return r.headers, r.read(4 * 1024 * 1024 + 1)

def check_page(path, mode):
    headers, raw = fetch(path)
    assert headers.get_content_type() == "text/html", path
    assert len(raw) <= 4 * 1024 * 1024, path
    text = raw.decode("utf-8")
    p = Page(text)
    assert "SmartFile Tools" in text and "<h1>" in text, path
    assert p.lang == ("hi" if path.startswith("/hi/") else "en"), path
    if mode == "preview":
        assert "noindex" in p.robots, (path, "missing preview noindex")
        assert not p.canonical, path
    else:
        assert "noindex" not in p.robots and p.canonical == ORIGIN+path, path
        assert "noindex" not in headers.get("X-Robots-Tag", "").lower(), path
        if path == "/":
            assert p.verification == "bmYnICLK9emGjMVNQUG8j0t86MgFR7ZJU_sR_DEc-Z4", "ownership tag missing"
        if path in ("/about/", "/hi/about/"):
            assert "mailto:sunnykummar090909@gmail.com" in text, "public support contact missing"
    for src in p.scripts:
        assert src and urlsplit(urljoin(ORIGIN+path, src)).netloc == urlsplit(ORIGIN).netloc, (path, src)
    csp = headers.get("Content-Security-Policy","")
    assert "connect-src 'none'" in csp and "script-src 'self'" in csp and "unsafe-eval" not in csp, (path, csp)
    assert headers.get("X-Content-Type-Options","").lower()=="nosniff", path
    return path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mode", choices=["preview","indexed"], default="preview")
    args=ap.parse_args()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for path in pool.map(lambda p:check_page(p,args.mode), PAGES):
            print("PASS HTTP 200, language and security:",path,flush=True)
    for path in ASSETS:
        h,b=fetch(path)
        assert b and h.get_content_type() != "text/html", (path,h.get_content_type())
        print("PASS asset:",path)
    _,robots=fetch("/robots.txt")
    if args.mode=="preview":
        assert re.search(rb"(?im)^Disallow:\s*/\s*$",robots), robots
        assert b"Sitemap:" not in robots
    else:
        assert not re.search(rb"(?im)^Disallow:\s*/\s*$",robots), robots
        assert b"Sitemap: "+(ORIGIN+"/sitemap.xml").encode() in robots
        _,xml=fetch("/sitemap.xml")
        root=ElementTree.fromstring(xml)
        urls={e.text for e in root.findall(".//{http://www.sitemaps.org/schemas/sitemap/0.9}loc")}
        assert urls=={ORIGIN+p for p in PAGES},urls
    print("PASS live",args.mode,"checks:",len(PAGES),"pages,",len(ASSETS),"assets; robots policy verified")
    print("This is an HTTP/security check, not real-device or search-index confirmation.")

if __name__=="__main__":
    main()
