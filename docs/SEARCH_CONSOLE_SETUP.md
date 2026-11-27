# Search Console and launch next steps

Cloudflare Pages reported a successful preview deployment for main commit 988b07f. The live verification workflow independently checks the site by HTTPS; it is not a substitute for Android acceptance.

1. Open https://smartfile-tools.pages.dev/ on a phone and test a harmless sample image, PDF and language switch. The preview is public but not intended for indexing; noindex/robots are not access controls.
2. Sign in at https://search.google.com/search-console/ and add the URL-prefix property https://smartfile-tools.pages.dev/ (not a domain property). Choose the HTML tag ownership method. After the verification-support change passes CI and is merged, set GOOGLE_SITE_VERIFICATION in Cloudflare Pages production build variables to the content value of the Google-provided HTML meta tag (not the entire tag). Redeploy, confirm the homepage contains the exact meta tag, and press Verify. This does not enable indexing or analytics. Keep the variable for future builds. Non-main Cloudflare previews omit it. The site owner can supply this public tag; never share credentials.
3. Only after owner approval and real-device acceptance, configure production-only Cloudflare build variables SITE_URL=https://smartfile-tools.pages.dev, LAUNCH_APPROVED=yes and SITE_CONTACT_EMAIL=an approved public support address. Rebuild and run Live Pages verification with mode indexed. Do not use an unapproved/private email.
4. Submit sitemap.xml via Search Console once it is live. Check indexing and performance; submission does not guarantee ranking or traffic.
5. Check AdSense eligibility, policies and consent requirements before integration. No ad code is present. Do not buy a domain or traffic without approval. Actual traffic/revenue are not yet measured.

Official references:
- https://support.google.com/webmasters/answer/9008080
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://support.google.com/adsense/answer/12170421

Owner-provided public HTML verification value is now the default only for Cloudflare Pages main builds. An explicit GOOGLE_SITE_VERIFICATION variable overrides it. No local or non-main build publishes the default. This does not grant indexing or enable ads. Confirm deployment and the live meta tag before Verify.
