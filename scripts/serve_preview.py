#!/usr/bin/env python3
"""Local-only SmartFile preview. Never bind to a public interface."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
import argparse

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site"

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
    def end_headers(self):
        for name, value in site_headers(self.path.split('?')[0], (SITE / "_headers").read_text(encoding='utf-8')):
            self.send_header(name, value)
        super().end_headers()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8791)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("choose a port from 1024 to 65535")
    if not (SITE / "index.html").is_file():
        parser.error("extract the entire preview ZIP first")
    with ThreadingHTTPServer(("127.0.0.1", args.port), partial(Handler, directory=str(SITE))) as httpd:
        print(f"Open http://127.0.0.1:{args.port}/  (Ctrl+C to stop)", flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
