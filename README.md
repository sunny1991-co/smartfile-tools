# SmartFile Tools — pre-launch v0.1

Static, mobile-first browser utilities. Thirteen tools: compression (20/50/100/200 KB presets), resize, signature, crop, ID photo crop, images to PDF, image format conversion, image size inspection, age, word count, PDF merge/page extraction and QR generation. No account, remote runtime dependencies, paid API, ads or file uploads. PDF and QR libraries are bundled locally at build time.

## Local preview (Termux)
Install Python and Node.js if needed: `pkg install python nodejs`.
Run `npm install --ignore-scripts --no-audit --no-fund`, then `node scripts/build.cjs` then `python -m http.server 8787 --bind 127.0.0.1 --directory site`.
Open http://127.0.0.1:8787. Do not expose this development server publicly.

## Test
`node tests/static.cjs` checks generated pages and links. Browser tests: `pip install -r tests/requirements.txt`, `python -m playwright install chromium`, `python tests/smoke.py`. Browser tests require a supported desktop/CI environment.

## Launch gates
No deployment or paid spend without owner approval. Preview is disallowed by robots.txt unless SITE_URL is set. Before public launch: pass all browser tests, independently review mobile devices, add operator contact information and review actual hosting/privacy/terms. Cloudflare Pages: choose this repo, build command `npm install --ignore-scripts --no-audit --no-fund && node scripts/build.cjs`, output directory `site`; SITE_URL is the actual HTTPS origin only. Verify Google Search Console and submit sitemap only after deployment. Ads remain disabled until approval, privacy/consent review and CSP changes. Do not buy traffic or click your own ads.

Not included: Hindi translations, research automation, admin revenue integration, deployment and AdSense. No traffic or earnings claims. This branch is a source reconstruction of the earlier ZIP, not a byte-for-byte import; test this branch independently.

## PDF/QR dependency gate
PDF-LIB and qrcode-generator use fixed direct versions. Before deployment, commit and review a generated package-lock.json, use npm ci, audit the dependency tree, and verify bundled license notices. PDF extraction creates one PDF in the specified order; it is not a sanitizer, signature-preserving editor or password remover. Browser tests cover ordinary PDFs and QR decoding. The build must succeed before previewing generated pages. The checked-in static pages reflect the prior baseline until regenerated; never deploy directly without the build command.
