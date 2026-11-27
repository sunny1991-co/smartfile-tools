#!/usr/bin/env python3
"""Local-only SmartFile preview. Never bind to a public interface."""
from pathlib import Path
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from functools import partial
import argparse

ROOT = Path(__file__).resolve().parent
SITE = ROOT / "site"

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        for line in (SITE / "_headers").read_text(encoding="utf-8").splitlines():
            if line.startswith("  "):
                key, value = line.strip().split(":", 1)
                self.send_header(key, value.strip())
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
