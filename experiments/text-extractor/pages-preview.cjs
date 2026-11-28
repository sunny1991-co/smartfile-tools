"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
if(process.env.CF_PAGES!=="1"||process.env.CF_PAGES_BRANCH!=="research/text-extractor")throw Error("Preview branch only");
const root=__dirname,out=path.resolve(root,"../../site");
execFileSync("npm",["ci","--ignore-scripts","--no-audit","--no-fund"],{cwd:root,stdio:"inherit"});
execFileSync(process.execPath,["build.cjs"],{cwd:root,stdio:"inherit"});
// Replace only the generated output folder on this isolated preview build.
fs.rmSync(out,{recursive:true,force:true});
fs.cpSync(path.join(root,"preview"),out,{recursive:true});
fs.writeFileSync(path.join(out,"robots.txt"),"User-agent: *\nDisallow: /\n");
fs.writeFileSync(path.join(out,"_headers"),"/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; connect-src 'self'; style-src 'self'; img-src 'self' blob: data:; font-src 'self' data:; object-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'\n");
if(!fs.readFileSync(path.join(out,"index.html"),"utf8").includes('noindex,nofollow')||fs.existsSync(path.join(out,"sitemap.xml"))||fs.existsSync(path.join(out,"tools")))throw Error("Preview isolation failed");
console.log("PASS isolated noindex OCR Pages preview; main build unaffected");
