# Monetization readiness — 2026-11-27

## Current state
Production HTTPS health check passed for 34 pages and 6 assets, robots and sitemap in run 46043396382. Owner's Google Search Console property is verified. Google live URL test succeeded; sitemap acceptance and actual indexing are still unconfirmed. Request indexing hit a daily quota. Do not repeatedly submit or use the Google Indexing API for these ordinary pages.

## No-cost AdSense path
Google permits sites on platforms in the Public Suffix List. The public list includes pages.dev as of this review. This suggests the existing site can be submitted, subject to the actual AdSense UI accepting it and policy review. Do not purchase a domain unless needed and approved.
- https://support.google.com/adsense/answer/12170421
- https://publicsuffix.org/list/public_suffix_list.dat
- https://support.google.com/adsense/answer/9724
- https://support.google.com/adsense/answer/7584263

Owner should use an existing AdSense account if they already have one; avoid duplicate accounts. Verify the site address in the Sites interface. Do not assume Search Console ownership equals AdSense approval. Review original content, user experience, age/identity eligibility and policies; do not claim a minimum traffic threshold or guaranteed approval. Prefer obtaining real search performance before requesting review.

## Ownership verification without ad execution
After CI and merge, if the owner chooses to apply and Google offers an HTML meta tag, set production build variable ADSENSE_ACCOUNT_ID to the exact public ca-pub-16-digit identifier from Google. This only adds a meta tag to the production homepage. It never loads ad scripts, sets cookies or adds ads.txt. Preview/local and rolled-back builds omit it. Do not use the example test ID. No real ID is configured.

Before enabling ads: review approval, privacy notice, required CMP/consent, approved ads.txt line, CSP changes, separation from tool download controls, and test no document transmission. No self-clicking, fake traffic, or purchased traffic.

## Monitoring
Daily GitHub HTTPS verification is operational health monitoring, not audience data. Search Console Performance is the free source for Google search clicks, impressions, CTR and queries; Pages report for index coverage. No external analytics script is needed at this stage. Cloudflare Web Analytics adds a browser beacon, which is incompatible with the current strict CSP and no-external-requests test without a separate privacy and security review. Do not enable it yet.
- https://developers.cloudflare.com/pages/how-to/web-analytics/

Once AdSense is approved, record actual page views, page RPM, estimated earnings and payouts separately in the owner account. No revenue estimates until real data; earnings and costs must not be stored in this public repository. No API credentials or financial details in GitHub. Income target is not guaranteed.
