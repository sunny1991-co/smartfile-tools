# Launch checklist — SmartFile Tools

## 1. Review the local preview first
Open a successful Browser regression run in GitHub. In Artifacts download `smartfile-mobile-preview` (7-day retention). The outer ZIP contains six real Chromium screenshots, a manifest with source commit and SHA-256, and the inner `smartfile-preview.zip`. Extract the inner ZIP into a separate folder. On Android/Termux run `python serve_preview.py` there and open `http://127.0.0.1:8791/`. This avoids the NSE project's port 8787. No npm installation or file upload is needed for the preview. Do not overwrite existing project folders. Test with non-sensitive sample files.

Check mobile navigation, language switch, compression file size, signature dimensions, PDF page order, QR scanning, download and accessibility. Report any issue with its URL/tool and screenshot. Real-device acceptance is separate from CI.

## 2. Hosting (owner approval required)
Review the passing pull request, confirm a public operator support email, and approve a deployment. Use a free Cloudflare Pages project connected only to smartfile-tools. Build command: `npm ci --ignore-scripts --no-audit --no-fund && node scripts/build.cjs`. Output directory: `site`. Initially omit launch variables for a noindex preview; noindex is not private access control. Use restricted access if confidentiality is required. No paid plan or custom domain without explicit approval.

When production origin is known and preview approved, set SITE_URL to that exact HTTPS origin, SITE_CONTACT_EMAIL to the approved public support address, and LAUNCH_APPROVED=yes. Verify HTTPS, production CSP, canonical links, sitemap, no external file-processing requests, and all tool downloads. Do not index a preview URL.

## 3. Search and monetization
Verify the production URL in Google Search Console, submit sitemap.xml, then review indexing and search performance. Measure impressions, clicks, CTR, search queries and indexed pages. Add original helpful guides based on actual search data, not speculative traffic or automatically generated doorway pages. No guarantee of rankings.

Apply for AdSense only after owner review of live content, contact and required policies. Review current eligibility, consent, privacy disclosures, ads.txt, supported hosting/domain and CSP before integrating any third-party script. No ad clicks by the operator, purchased traffic or deceptive placements. Record actual revenue and costs separately. There is no income or approval guarantee.

No hosting account, payment or advertising has been configured in this change.

### Cloudflare configuration isolation
Use `main` as the production branch. Configure SITE_URL, LAUNCH_APPROVED and SITE_CONTACT_EMAIL only in Production. Non-main builds detected via CF_PAGES and CF_PAGES_BRANCH always remain noindex without a sitemap or public contact. Disable automatic preview deployments if not needed or use Cloudflare Access for a private preview. Official build reference: https://developers.cloudflare.com/pages/configuration/build-configuration/ .
