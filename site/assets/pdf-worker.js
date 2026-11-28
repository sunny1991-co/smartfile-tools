"use strict";
importScripts("/assets/vendor/pdf-lib.min.js");
let job,tool;
const fail=s=>{throw new Error(s);};
const breathe=()=>new Promise(resolve=>setTimeout(resolve,0));
const progress=(en,hi)=>postMessage({type:"progress",en,hi});
const finish=(bytes,name,pages)=>postMessage({type:"done",bytes,name,pages},[bytes.buffer]);
function pageIndices(raw,count){const out=[],seen=new Set();for(const token of raw.split(",")){const m=/^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(token);if(!m)fail("Enter page numbers or ranges such as 1,3-5.");const a=Number(m[1]),b=Number(m[2]||m[1]);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<1||b<a||b>count)fail("Page range must be within 1–"+count+".");for(let n=a;n<=b;n++){if(seen.has(n))fail("Duplicate pages are not supported.");seen.add(n);out.push(n-1);}}return out;}
async function editPdf(){if(!globalThis.PDFLib)fail("PDF engine unavailable. Reload and try again.");const fs=job.files,merge=tool==="merge-pdf";if((merge&&(fs.length<2||fs.length>10))||(!merge&&fs.length!==1)||fs.reduce((s,f)=>s+f.size,0)>50*1024*1024)fail("Choose the supported number of PDFs, up to 50 MB total.");const out=await PDFLib.PDFDocument.create();let total=0;for(let i=0;i<fs.length;i++){const f=fs[i];if(!f.size)fail("Empty PDF.");const bytes=new Uint8Array(await f.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")fail("Input is not a PDF.");progress("Reading PDF "+(i+1)+" of "+fs.length+"…","PDF "+(i+1)+" / "+fs.length+" पढ़ रहे हैं…");await breathe();let doc;try{doc=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});}catch(e){fail("Cannot read PDF. Encrypted or damaged PDFs are not supported.");}const count=doc.getPageCount();if(!count||count>200)fail("Each PDF must contain 1–200 pages.");const indices=merge?doc.getPageIndices():pageIndices(job.pages,count);total+=indices.length;if(total>200)fail("Output must not exceed 200 pages.");const copied=await out.copyPages(doc,indices);for(const p of copied)out.addPage(p);await breathe();}progress("Saving PDF…","PDF सेव हो रही है…");await breathe();const bytes=await out.save({objectsPerTick:25});finish(bytes,merge?"kaagazkit-merged.pdf":"kaagazkit-extracted.pdf",total);}
// The displayed page coordinate system has a lower-left origin after rotation.
function visiblePage(p){const {x,y,width:w,height:h}=p.getCropBox(),r=((p.getRotation().angle%360)+360)%360;if(![0,90,180,270].includes(r))fail("Unsupported PDF page rotation.");const dw=r%180?h:w,dh=r%180?w:h;if(!(dw>0&&dh>0))fail("Invalid PDF page dimensions.");return {w:dw,h:dh,r,point(a,b){return r===90?{x:x+w-b,y:y+a}:r===180?{x:x+w-a,y:y+h-b}:r===270?{x:x+b,y:y+h-a}:{x:x+a,y:y+b};}};}
async function transformPdf(){
if(!globalThis.PDFLib)fail("PDF engine unavailable. Reload and try again.");
const f=job.files[0];if(!f||!f.size||f.size>50*1024*1024)fail("Choose one PDF up to 50 MB.");
const bytes=new Uint8Array(await f.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")fail("Input is not a PDF.");
progress("Reading PDF…","PDF पढ़ रहे हैं…");await breathe();let source;try{source=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});}catch(e){fail("Cannot read PDF. Encrypted or damaged PDFs are not supported.");}
const count=source.getPageCount();if(count<1||count>200)fail("Each PDF must contain 1–200 pages.");
let indices=source.getPageIndices();
if(tool==="remove-pdf-pages"){const remove=new Set(pageIndices(job.pages,count));indices=indices.filter(i=>!remove.has(i));if(!indices.length)fail("Keep at least one page.");}
if(tool==="reorder-pdf"){indices=pageIndices(job.pages,count);if(indices.length!==count)fail("Enter every page exactly once.");}
const out=await PDFLib.PDFDocument.create();for(const p of await out.copyPages(source,indices))out.addPage(p);
if(tool==="rotate-pdf"){const angle=Number(job.rotation);if(![90,180,270].includes(angle))fail("Unsupported rotation.");const selected=job.pages.trim()?pageIndices(job.pages,count):indices;for(const i of selected){const p=out.getPage(i);p.setRotation(PDFLib.degrees(((p.getRotation().angle+angle)%360+360)%360));}}
if(tool==="watermark-pdf"||tool==="number-pdf"){
const mark=tool==="watermark-pdf",word=mark?job.watermark.trim():"",start=mark?0:Number(job.startNumber);
if(mark&&(!word||! /^[\x20-\x7e]{1,80}$/.test(word)))fail("Enter 1–80 printable ASCII characters.");
if(!mark&&(!Number.isInteger(start)||start<1||start>999999))fail("Enter a valid first page number.");
const font=await out.embedFont(PDFLib.StandardFonts.Helvetica);
for(const [i,p] of out.getPages().entries()){const v=visiblePage(p),text=mark?word:String(start+i),base=font.widthOfTextAtSize(text,1),size=Math.min(mark?48:12,v.w*.8/base,v.h*(mark?.15:.07));if(size<4)fail("Page too small for readable text.");const x=(v.w-font.widthOfTextAtSize(text,size))/2,y=mark?(v.h-size)/2:Math.min(18,v.h*.07);const pt=v.point(x,y);p.drawText(text,{...pt,size,font,color:PDFLib.rgb(mark?.45:.15,mark?.45:.15,mark?.45:.15),opacity:mark?.3:1,rotate:PDFLib.degrees(v.r)});}
}
progress("Saving PDF…","PDF सेव हो रही है…");await breathe();const output=await out.save({objectsPerTick:25});finish(output,"kaagazkit-"+tool+".pdf",indices.length);
}


// Recompress image XObjects (scans/photos) to JPEG until the whole file fits the target.
const LEVELS=[[1,.82],[1,.65],[.85,.6],[.72,.55],[.62,.5],[.52,.45],[.45,.4],[.38,.36],[.32,.32]];
const MIN_LONG_SIDE=500;
function nameOf(v){return v&&v.asString?v.asString():String(v||"");}
async function inflate(bytes){const ds=new DecompressionStream("deflate");const out=new Response(new Blob([bytes]).stream().pipeThrough(ds));return new Uint8Array(await out.arrayBuffer());}
async function decodeImage(stream){const d=stream.dict,N=PDFLib.PDFName;const filter=d.lookup(N.of("Filter")),filters=filter instanceof PDFLib.PDFArray?filter.asArray().map(nameOf):filter?[nameOf(filter)]:[];
if(d.lookup(N.of("ImageMask"))||d.lookup(N.of("Decode")))return null;const w=d.lookup(N.of("Width"))?.asNumber?.(),h=d.lookup(N.of("Height"))?.asNumber?.();if(!w||!h||w*h>40000000)return null;
const cs=nameOf(d.lookup(N.of("ColorSpace")));
if(filters.length===1&&filters[0]==="/DCTDecode"){if(cs!=="/DeviceRGB"&&cs!=="/DeviceGray")return null;return {w,h,bitmap:await createImageBitmap(new Blob([stream.contents],{type:"image/jpeg"}))};}
if(filters.length===1&&filters[0]==="/FlateDecode"&&!d.lookup(N.of("DecodeParms"))&&d.lookup(N.of("BitsPerComponent"))?.asNumber?.()===8&&(cs==="/DeviceRGB"||cs==="/DeviceGray")){const raw=await inflate(stream.contents),ch=cs==="/DeviceRGB"?3:1;if(raw.length<w*h*ch)return null;const rgba=new Uint8ClampedArray(w*h*4);for(let i=0,j=0;i<w*h;i++,j+=ch){rgba[i*4]=raw[j];rgba[i*4+1]=raw[ch===3?j+1:j];rgba[i*4+2]=raw[ch===3?j+2:j];rgba[i*4+3]=255;}return {w,h,bitmap:await createImageBitmap(new ImageData(rgba,w,h))};}
return null;}
async function compressPdf(){if(!globalThis.PDFLib)fail("PDF engine unavailable. Reload and try again.");if(typeof OffscreenCanvas!=="function"||typeof DecompressionStream!=="function")fail("This browser cannot compress PDF images. Try a recent Chrome or Edge.");
const f=job.files[0];if(!f||!f.size||f.size>50*1024*1024)fail("Choose one PDF up to 50 MB.");const target=Number(job.targetKb);if(!Number.isInteger(target)||target<20||target>50000)fail("Enter a target between 20 and 50000 KB.");const limit=target*1024;
const bytes=new Uint8Array(await f.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")fail("Input is not a PDF.");
const open=async()=>{try{return await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});}catch(e){fail(/encrypt/i.test(String(e&&e.message))?"Encrypted or password-protected PDFs are not supported.":"PDF could not be opened.");}};
progress("Reading PDF…","PDF पढ़ रहे हैं…");await breathe();let doc=await open();const count=doc.getPageCount();if(count<1||count>200)fail("Each PDF must contain 1–200 pages.");
// Plain re-save first: object streams alone may be enough.
let best=await doc.save({useObjectStreams:true,objectsPerTick:25});if(best.length<=limit){finish(best,"kaagazkit-compress-pdf.pdf",count);return;}
const images=[];for(const [ref,obj] of doc.context.enumerateIndirectObjects()){if(obj instanceof PDFLib.PDFRawStream&&nameOf(obj.dict.lookup(PDFLib.PDFName.of("Subtype")))==="/Image")images.push(ref);}
if(!images.length)fail("This PDF has no photos that can be compressed, so it cannot be made smaller here.");
for(const [n,[scale,quality]] of LEVELS.entries()){progress(`Compressing photos (step ${n+1} of ${LEVELS.length})…`,`फोटो कंप्रेस हो रही हैं (चरण ${n+1} / ${LEVELS.length})…`);await breathe();doc=await open();let changed=0;
for(const ref of images){const obj=doc.context.lookup(ref);if(!(obj instanceof PDFLib.PDFRawStream))continue;let img;try{img=await decodeImage(obj);}catch(e){img=null;}if(!img)continue;
try{const long=Math.max(img.w,img.h),s=Math.min(1,Math.max(scale,MIN_LONG_SIDE/long)),w=Math.max(1,Math.round(img.w*s)),h=Math.max(1,Math.round(img.h*s));const c=new OffscreenCanvas(w,h),ctx=c.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,w,h);ctx.drawImage(img.bitmap,0,0,w,h);
const jpg=new Uint8Array(await (await c.convertToBlob({type:"image/jpeg",quality})).arrayBuffer());if(jpg.length>=obj.contents.length)continue;
const N=PDFLib.PDFName,dict={Type:"XObject",Subtype:"Image",Width:w,Height:h,ColorSpace:"DeviceRGB",BitsPerComponent:8,Filter:"DCTDecode"};const next=doc.context.stream(jpg,dict),smask=obj.dict.get(N.of("SMask"));if(smask)next.dict.set(N.of("SMask"),smask);const intent=obj.dict.get(N.of("Intent"));if(intent)next.dict.set(N.of("Intent"),intent);doc.context.assign(ref,next);changed++;}finally{img.bitmap.close();}}
const out=await doc.save({useObjectStreams:true,objectsPerTick:25});if(out.length<best.length)best=out;if(best.length<=limit){finish(best,"kaagazkit-compress-pdf.pdf",count);return;}if(!changed&&n>1)break;}
fail("Could not reach the target without making pages unreadable. Choose a larger target.");}


/* ---- Unlock PDF: Standard security handler (RC4 40/128, AES-128, AES-256 R5/R6), decrypted in place ---- */
const PAD=Uint8Array.from([0x28,0xBF,0x4E,0x5E,0x4E,0x75,0x8A,0x41,0x64,0x00,0x4E,0x56,0xFF,0xFA,0x01,0x08,0x2E,0x2E,0x00,0xB6,0xD0,0x68,0x3E,0x80,0x2F,0x0C,0xA9,0xFE,0x64,0x53,0x69,0x7A]);
function md5(data){const K=new Uint32Array(64),S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];for(let i=0;i<64;i++)K[i]=Math.floor(Math.abs(Math.sin(i+1))*4294967296);
const len=data.length,n=((len+8)>>>6)+1,m=new Uint32Array(n*16);for(let i=0;i<len;i++)m[i>>2]|=data[i]<<((i%4)*8);m[len>>2]|=0x80<<((len%4)*8);m[n*16-2]=(len*8)>>>0;m[n*16-1]=Math.floor(len/536870912);
let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;for(let o=0;o<m.length;o+=16){let a=a0,b=b0,c=c0,d=d0;for(let i=0;i<64;i++){let f,g;if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16;}else if(i<48){f=b^c^d;g=(3*i+5)%16;}else{f=c^(b|~d);g=(7*i)%16;}const t=d;d=c;c=b;const x=(a+f+K[i]+m[o+g])>>>0;b=(b+((x<<S[i])|(x>>>(32-S[i]))))>>>0;a=t;}a0=(a0+a)>>>0;b0=(b0+b)>>>0;c0=(c0+c)>>>0;d0=(d0+d)>>>0;}
const out=new Uint8Array(16);[a0,b0,c0,d0].forEach((v,i)=>{for(let j=0;j<4;j++)out[i*4+j]=(v>>>(8*j))&255;});return out;}
function rc4(key,data){const s=new Uint8Array(256);for(let i=0;i<256;i++)s[i]=i;for(let i=0,j=0;i<256;i++){j=(j+s[i]+key[i%key.length])&255;[s[i],s[j]]=[s[j],s[i]];}const out=new Uint8Array(data.length);for(let k=0,i=0,j=0;k<data.length;k++){i=(i+1)&255;j=(j+s[i])&255;[s[i],s[j]]=[s[j],s[i]];out[k]=data[k]^s[(s[i]+s[j])&255];}return out;}
const cat=(...a)=>{const out=new Uint8Array(a.reduce((n,x)=>n+x.length,0));let o=0;for(const x of a){out.set(x,o);o+=x.length;}return out;};
const same=(a,b,n)=>{for(let i=0;i<n;i++)if(a[i]!==b[i])return false;return true;};
async function sha(name,data){return new Uint8Array(await crypto.subtle.digest(name,data));}
async function aesKey(raw){return crypto.subtle.importKey("raw",raw,{name:"AES-CBC"},false,["encrypt","decrypt"]);}
async function aesDecrypt(raw,data){/* IV is the first block; PKCS#7 padding */if(data.length<32||data.length%16)throw new Error("bad");return new Uint8Array(await crypto.subtle.decrypt({name:"AES-CBC",iv:data.subarray(0,16)},await aesKey(raw),data.subarray(16)));}
async function aesNoPad(raw,iv,data,decrypt){const key=await aesKey(raw);if(!decrypt)return new Uint8Array(await crypto.subtle.encrypt({name:"AES-CBC",iv},key,data)).subarray(0,data.length);
/* WebCrypto always expects padding: append a block that decrypts to a full padding block. */const last=data.length?data.subarray(data.length-16):iv,extra=new Uint8Array(await crypto.subtle.encrypt({name:"AES-CBC",iv:last},key,new Uint8Array(16).fill(16))).subarray(0,16);return new Uint8Array(await crypto.subtle.decrypt({name:"AES-CBC",iv},key,cat(data,extra)));}
async function hash2B(pw,salt,udata,r){let k=await sha("SHA-256",cat(pw,salt,udata));if(r<6)return k;for(let i=0;;i++){const k1=cat(pw,k,udata),rep=new Uint8Array(k1.length*64);for(let j=0;j<64;j++)rep.set(k1,j*k1.length);const e=await aesNoPad(k.subarray(0,16),k.subarray(16,32),rep,false);let sum=0;for(let j=0;j<16;j++)sum+=e[j];k=await sha(["SHA-256","SHA-384","SHA-512"][sum%3],e);if(i>=63&&e[e.length-1]<=i-31)break;}return k.subarray(0,32);}
/* Tiny PDF lexer working on a latin1 string (1 char = 1 byte). */
const WS="\x00\t\n\f\r ",DELIM="()<>[]{}/%";
function latin1(bytes){let s="";for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+32768));return s;}
function toBytes(s){const b=new Uint8Array(s.length);for(let i=0;i<s.length;i++)b[i]=s.charCodeAt(i)&255;return b;}
function readLiteral(s,i){/* s[i]==="(" ; returns [bytes,end] */const out=[];let depth=1;i++;while(i<s.length){const c=s[i];if(c==="\\"){const n=s[i+1];const map={n:10,r:13,t:9,b:8,f:12,"(":40,")":41,"\\":92};if(n in map){out.push(map[n]);i+=2;}else if(n>="0"&&n<="7"){let o="";let j=i+1;while(j<i+4&&s[j]>="0"&&s[j]<="7")o+=s[j++];out.push(parseInt(o,8)&255);i=j;}else if(n==="\r"){i+=s[i+2]==="\n"?3:2;}else if(n==="\n"){i+=2;}else{i++;}continue;}if(c==="(")depth++;else if(c===")"){depth--;if(!depth)return [Uint8Array.from(out),i+1];}out.push(c.charCodeAt(0)&255);i++;}throw new Error("bad");}
function readHex(s,i){const end=s.indexOf(">",i);if(end<0)throw new Error("bad");let h=s.slice(i+1,end).replace(/[^0-9A-Fa-f]/g,"");if(h.length%2)h+="0";const b=new Uint8Array(h.length/2);for(let k=0;k<b.length;k++)b[k]=parseInt(h.substr(k*2,2),16);return [b,end+1];}
const hex=b=>"<"+Array.from(b,x=>x.toString(16).padStart(2,"0")).join("")+">";
function parseValue(s,i){/* minimal object parser for the Encrypt dictionary */const skip=()=>{while(i<s.length){if(WS.includes(s[i]))i++;else if(s[i]==="%"){while(i<s.length&&s[i]!=="\n"&&s[i]!=="\r")i++;}else break;}};skip();const c=s[i];
if(s.startsWith("<<",i)){i+=2;const d={};for(;;){skip();if(s.startsWith(">>",i))return [d,i+2];const [k,j]=parseValue(s,i);const [v,e]=parseValue(s,j);d[k]=v;i=e;}}
if(c==="["){i++;const a=[];for(;;){skip();if(s[i]==="]")return [a,i+1];const [v,e]=parseValue(s,i);a.push(v);i=e;}}
if(c==="(")return readLiteral(s,i);if(c==="<")return readHex(s,i);
if(c==="/"){let j=i+1;while(j<s.length&&!WS.includes(s[j])&&!DELIM.includes(s[j]))j++;return [s.slice(i,j),j];}
let j=i;while(j<s.length&&!WS.includes(s[j])&&!DELIM.includes(s[j]))j++;const tok=s.slice(i,j);if(/^[+-]?\d+$/.test(tok)){const m=/^\s+(\d+)\s+R(?=[\s\/\[\]<>()%]|$)/.exec(s.slice(j,j+40));if(m)return [{ref:Number(tok),gen:Number(m[1])},j+m[0].length];}return [/^[+-]?[\d.]+$/.test(tok)?Number(tok):tok==="true"?true:tok==="false"?false:tok,j];}
function findObject(s,num,gen){const re=new RegExp("(?:^|[\\s>])"+num+"\\s+"+gen+"\\s+obj\\b","g");let m,last=-1;while((m=re.exec(s)))last=m.index+m[0].length;return last;}
async function securityKey(s,enc,id,password){const R=enc["/R"],V=enc["/V"],O=enc["/O"],U=enc["/U"];if(enc["/Filter"]!=="/Standard")fail("This PDF uses certificate or custom encryption, which is not supported.");if(!(O instanceof Uint8Array)||!(U instanceof Uint8Array))fail("PDF could not be opened.");
if(R>=5){const pw=new TextEncoder().encode(password.normalize("NFKC")).subarray(0,127);if((await hash2B(pw,U.subarray(32,40),new Uint8Array(0),R)).every((x,i)=>x===U[i]))return {aes:256,key:await aesNoPad(await hash2B(pw,U.subarray(40,48),new Uint8Array(0),R),new Uint8Array(16),enc["/UE"],true)};
const u48=U.subarray(0,48);if((await hash2B(pw,O.subarray(32,40),u48,R)).every((x,i)=>x===O[i]))return {aes:256,key:await aesNoPad(await hash2B(pw,O.subarray(40,48),u48,R),new Uint8Array(16),enc["/OE"],true)};return null;}
const n=V===1?5:Math.max(5,Math.min(16,(enc["/Length"]||40)/8)),P=enc["/P"]|0,pb=Uint8Array.from([P&255,(P>>8)&255,(P>>16)&255,(P>>>24)&255]),meta=enc["/EncryptMetadata"]===false&&R>=4?Uint8Array.from([255,255,255,255]):new Uint8Array(0);
const keyFor=pwBytes=>{const padded=cat(pwBytes.subarray(0,32),PAD).subarray(0,32);let k=md5(cat(padded,O.subarray(0,32),pb,id,meta)).subarray(0,n);if(R>=3)for(let i=0;i<50;i++)k=md5(k).subarray(0,n);return k;};
const userOk=k=>{if(R===2)return same(rc4(k,PAD),U,32);let x=rc4(k,md5(cat(PAD,id)));for(let i=1;i<=19;i++)x=rc4(k.map(b=>b^i),x);return same(x,U,16);};
const pwb=toBytes(Array.from(password,ch=>ch.charCodeAt(0)<256?ch:"?").join(""));let k=keyFor(pwb);if(userOk(k))return {aes:0,key:k,R};
/* Owner password: recover the user password from /O (Algorithm 7). */let ok=md5(cat(pwb.subarray(0,32),PAD).subarray(0,32));if(R>=3)for(let i=0;i<50;i++)ok=md5(ok);ok=ok.subarray(0,n);let upw=O.subarray(0,32);if(R===2)upw=rc4(ok,upw);else for(let i=19;i>=0;i--)upw=rc4(ok.map(b=>b^i),upw);k=keyFor(upw);return userOk(k)?{aes:0,key:k,R}:null;}
/* Lock PDF: standard security handler, AES-256 (V5/R6, PDF 2.0 and Acrobat X+). */
async function lockPdf(){const f=job.files[0];if(!f||!f.size||f.size>50*1024*1024)fail("Choose one PDF up to 50 MB.");const pw=String(job.password||"");if([...pw].length<4||[...pw].length>32)fail("Use a password of 4 to 32 characters.");if(pw!==String(job.confirm||""))fail("The two passwords do not match.");
if(!crypto?.subtle||!crypto.getRandomValues)fail("This browser cannot lock PDFs. Try a recent Chrome or Edge.");progress("Reading PDF…","PDF पढ़ रहे हैं…");await breathe();const bytes=new Uint8Array(await f.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")fail("Input is not a PDF.");
const L=PDFLib;let doc;try{doc=await L.PDFDocument.load(bytes,{updateMetadata:false});}catch(e){fail(/encrypt/i.test(String(e&&e.message))?"This PDF already has a password. Unlock it first, then lock it with the new password.":"PDF could not be opened.");}
const ctx=doc.context,rand=n=>crypto.getRandomValues(new Uint8Array(n)),zero=new Uint8Array(16),enc8=t=>new TextEncoder().encode(t.normalize("NFKC")).subarray(0,127);
progress("Creating password keys…","पासवर्ड कुंजी बना रहे हैं…");await breathe();
const fileKey=rand(32),upw=enc8(pw),opw=enc8([...rand(24)].map(b=>b.toString(16).padStart(2,"0")).join(""));
const uvs=rand(8),uks=rand(8),U=cat(await hash2B(upw,uvs,new Uint8Array(0),6),uvs,uks),UE=await aesNoPad(await hash2B(upw,uks,new Uint8Array(0),6),zero,fileKey,false);
const ovs=rand(8),oks=rand(8),O=cat(await hash2B(opw,ovs,U,6),ovs,oks),OE=await aesNoPad(await hash2B(opw,oks,U,6),zero,fileKey,false);
/* Permissions: printing always; copying, editing, comments and page assembly only when allowed. */let P=-4;if(!job.allowEdit)P&=~(8|16|32|1024);
const perms=new Uint8Array(16);new DataView(perms.buffer).setInt32(0,P,true);perms.fill(255,4,8);perms.set([84,97,100,98],8);perms.set(rand(4),12);const Perms=await aesNoPad(fileKey,zero,perms,false);
const key=await aesKey(fileKey);const seal=async data=>{const iv=rand(16);return cat(iv,new Uint8Array(await crypto.subtle.encrypt({name:"AES-CBC",iv},key,data)));};
const hex=b=>L.PDFHexString.of([...b].map(x=>x.toString(16).padStart(2,"0")).join(""));
const T=L.PDFName.of("Type");
async function walk(o){if(o instanceof L.PDFString||o instanceof L.PDFHexString)return hex(await seal(o.asBytes()));
if(o instanceof L.PDFArray){for(let i=0;i<o.size();i++){const v=o.get(i),w=await walk(v);if(w!==v)o.set(i,w);}return o;}
if(o instanceof L.PDFDict){for(const [k,v] of o.entries()){const w=await walk(v);if(w!==v)o.set(k,w);}return o;}return o;}
const objects=ctx.enumerateIndirectObjects();let done=0;
for(const [ref,obj] of objects){const type=obj instanceof L.PDFDict?obj.get(T):obj instanceof L.PDFStream?obj.dict.get(T):null;
if(type===L.PDFName.of("XRef")||type===L.PDFName.of("ObjStm")){ctx.delete(ref);continue;}
if(obj instanceof L.PDFStream){await walk(obj.dict);const data=await seal(obj.getContents());obj.dict.set(L.PDFName.of("Length"),L.PDFNumber.of(data.length));ctx.assign(ref,L.PDFRawStream.of(obj.dict,data));}
else{const w=await walk(obj);if(w!==obj)ctx.assign(ref,w);}
if(++done%200===0){progress(`Encrypting… ${Math.round(100*done/objects.length)}%`,`लॉक कर रहे हैं… ${Math.round(100*done/objects.length)}%`);await breathe();}}
const ids=ctx.trailerInfo.ID;let first=null;if(ids instanceof L.PDFArray&&ids.size()===2){const a=ids.get(0);if(a instanceof L.PDFHexString||a instanceof L.PDFString)first=a;}
const id1=first||hex(rand(16));ctx.trailerInfo.ID=ctx.obj([id1,hex(rand(16))]);
const cf=ctx.obj({StdCF:ctx.obj({AuthEvent:"DocOpen",CFM:"AESV3",Length:32})});
const encDict=ctx.obj({Filter:"Standard",V:5,R:6,Length:256,CF:cf,StmF:"StdCF",StrF:"StdCF",P,EncryptMetadata:true});
encDict.set(L.PDFName.of("O"),hex(O));encDict.set(L.PDFName.of("U"),hex(U));encDict.set(L.PDFName.of("OE"),hex(OE));encDict.set(L.PDFName.of("UE"),hex(UE));encDict.set(L.PDFName.of("Perms"),hex(Perms));
ctx.trailerInfo.Encrypt=ctx.register(encDict);
doc.catalog.set(L.PDFName.of("Extensions"),ctx.obj({ADBE:ctx.obj({BaseVersion:L.PDFName.of("1.7"),ExtensionLevel:8})}));
progress("Saving locked PDF…","लॉक की हुई PDF सेव कर रहे हैं…");await breathe();
const out=await doc.save({useObjectStreams:false,updateFieldAppearances:false,addDefaultPage:false});const name=(f.name||"document.pdf").replace(/\.pdf$/i,"")+"-locked.pdf";
postMessage({type:"done",bytes:out,name,pages:doc.getPageCount(),note:job.allowEdit?["Anyone with the password can open, print, copy and edit it.","पासवर्ड वाला कोई भी इसे खोल, प्रिंट, कॉपी और बदल सकता है।"]:["Opening needs the password. Copying and editing are marked as not allowed; some apps ignore this.","खोलने के लिए पासवर्ड चाहिए। कॉपी और बदलाव की अनुमति नहीं दी गई है; कुछ ऐप यह नियम नहीं मानते।"]},[out.buffer]);}
/* Edit PDF: draw the user's text pictures, white boxes and highlights on top of the original pages. */
async function overlayPdf(){const f=job.files[0];if(!f||!f.size||f.size>50*1024*1024)fail("Choose one PDF up to 50 MB.");const edits=Array.isArray(job.edits)?job.edits:[];if(!edits.length)fail("Make at least one change on the page first.");if(edits.length>1000)fail("Too many changes. Save and continue in a second round.");
progress("Reading PDF…","PDF पढ़ रहे हैं…");await breathe();let doc;try{doc=await PDFLib.PDFDocument.load(new Uint8Array(await f.arrayBuffer()),{updateMetadata:false});}catch(e){fail(/encrypt/i.test(String(e&&e.message))?"This PDF has a password. Unlock it first, then edit it.":"PDF could not be opened.");}
const pages=doc.getPages(),num=v=>Number.isFinite(v)&&Math.abs(v)<1e6;progress("Adding your changes…","आपके बदलाव जोड़ रहे हैं…");
for(const e of edits){const p=pages[(e&&e.page)-1];if(!p||![e.x,e.y,e.w,e.h].every(num)||e.w<0||e.h<0)fail("A change could not be placed. Reload and try again.");
if(e.kind==="white")p.drawRectangle({x:e.x,y:e.y,width:e.w,height:e.h,color:PDFLib.rgb(1,1,1),borderWidth:0});
else if(e.kind==="mark")p.drawRectangle({x:e.x,y:e.y,width:e.w,height:e.h,color:PDFLib.rgb(1,.89,.16),opacity:.4,borderWidth:0});
else if(e.kind==="text"&&e.png instanceof Uint8Array&&e.png.length<8e6){const img=await doc.embedPng(e.png);p.drawImage(img,{x:e.x,y:e.y,width:e.w,height:e.h,rotate:PDFLib.degrees(Number(e.rotate)||0)});}
else fail("A change could not be placed. Reload and try again.");}
progress("Saving PDF…","PDF सेव कर रहे हैं…");await breathe();const out=await doc.save({useObjectStreams:true,updateFieldAppearances:false});
postMessage({type:"done",bytes:out,name:(f.name||"document.pdf").replace(/\.pdf$/i,"")+"-edited.pdf",pages:doc.getPageCount(),note:[`${edits.length} change${edits.length===1?"":"s"} added. The original text stays in the file under white boxes.`,`${edits.length} बदलाव जोड़े गए। सफेद बॉक्स के नीचे का मूल टेक्स्ट फाइल में बना रहता है।`]},[out.buffer]);}
async function unlockPdf(){const f=job.files[0];if(!f||!f.size||f.size>50*1024*1024)fail("Choose one PDF up to 50 MB.");const bytes=new Uint8Array(await f.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")fail("Input is not a PDF.");
if(!crypto?.subtle)fail("This browser cannot unlock PDFs. Try a recent Chrome or Edge.");progress("Reading PDF…","PDF पढ़ रहे हैं…");await breathe();const s=latin1(bytes);
const encRefs=[...s.matchAll(/\/Encrypt\s+(\d+)\s+(\d+)\s+R/g)];if(!encRefs.length)fail("This PDF is not password protected.");const encNum=Number(encRefs.at(-1)[1]),encGen=Number(encRefs.at(-1)[2]);const at=findObject(s,encNum,encGen);if(at<0)fail("PDF could not be opened.");
let enc;try{[enc]=parseValue(s,at);}catch(e){fail("PDF could not be opened.");}const idm=[...s.matchAll(/\/ID\s*\[\s*[<(]/g)].at(-1);let id=new Uint8Array(0);if(idm){const p=idm.index+idm[0].length-1;id=(s[p]==="<"?readHex(s,p):readLiteral(s,p))[0];}
const V=enc["/V"],R=enc["/R"];if(![1,2,4,5].includes(V)||![2,3,4,5,6].includes(R))fail("This PDF uses an encryption type that is not supported.");
progress("Checking password…","पासवर्ड जांच रहे हैं…");await breathe();let sec=await securityKey(s,enc,id,"");const usedEmpty=!!sec;if(!sec)sec=await securityKey(s,enc,id,job.password||"");if(!sec)fail("Wrong password. Check capital letters and try again.");
let method=V<4?"rc4":"aesv2";if(V>=4){const cf=enc["/CF"]||{},name=enc["/StmF"]||"/Identity",filt=cf[name];method=name==="/Identity"?"none":filt?.["/CFM"]==="/AESV3"?"aesv3":filt?.["/CFM"]==="/AESV2"?"aesv2":filt?.["/CFM"]==="/V2"?"rc4":filt?.["/CFM"]==="/None"?"none":"unknown";if(method==="unknown")fail("This PDF uses an encryption type that is not supported.");if((enc["/StrF"]||name)!==name)fail("This PDF uses an encryption type that is not supported.");}
const metaPlain=enc["/EncryptMetadata"]===false;
const objKey=(num,gen)=>{if(sec.aes===256)return sec.key;const salt=method==="aesv2"?Uint8Array.from([0x73,0x41,0x6c,0x54]):new Uint8Array(0);return md5(cat(sec.key,Uint8Array.from([num&255,(num>>8)&255,(num>>16)&255,gen&255,(gen>>8)&255]),salt)).subarray(0,Math.min(sec.key.length+5,16));};
const decrypt=async(key,data)=>{if(method==="none")return data;if(method==="rc4")return rc4(key,data);if(data.length<32)return new Uint8Array(0);try{return await aesDecrypt(key,data);}catch(e){fail("Some encrypted data in this PDF is damaged and could not be unlocked.");}};
progress("Unlocking…","अनलॉक हो रहा है…");await breathe();const parts=[];let last=0,count=0;const re=/(\d+)\s+(\d+)\s+obj\b/g;let m;
while((m=re.exec(s))){const num=Number(m[1]),gen=Number(m[2]);if(m.index>0&&!WS.includes(s[m.index-1])&&s[m.index-1]!==">")continue;let i=m.index+m[0].length;if(num===encNum&&gen===encGen){continue;}
const key=objKey(num,gen),body=[];let dictText="";let depth=0,end=-1,isStream=false;
while(i<s.length){const c=s[i];if(c==="%"){const j=s.slice(i).search(/[\r\n]/);i=j<0?s.length:i+j;continue;}if(c==="("){const [b,e]=readLiteral(s,i);body.push(hex(await decrypt(key,b)));i=e;continue;}if(c==="<"&&s[i+1]!=="<"){const [b,e]=readHex(s,i);body.push(hex(await decrypt(key,b)));i=e;continue;}if(c==="<"){depth++;body.push("<<");i+=2;continue;}if(c===">"&&s[i+1]===">"){depth--;body.push(">>");i+=2;continue;}
if(s.startsWith("endobj",i)&&depth<=0){end=i;break;}if(s.startsWith("stream",i)&&depth<=0&&!s.startsWith("streamx",i)){isStream=true;end=i;break;}body.push(c);i++;}
if(end<0)break;let text=body.join("");if(!isStream){parts.push(s.slice(last,m.index+m[0].length),text);last=end;re.lastIndex=end;count++;continue;}
let p=end+6;if(s[p]==="\r")p++;if(s[p]==="\n")p++;const dict=text;let length=null;const lm=/\/Length\s+(\d+)(?:\s+(\d+)\s+R)?/.exec(dict);if(lm){if(lm[2]===undefined)length=Number(lm[1]);else{const at2=findObject(s,Number(lm[1]),Number(lm[2]));if(at2>0){const v=/^\s*(\d+)/.exec(s.slice(at2,at2+40));if(v)length=Number(v[1]);}}}
const endsAt=q=>{while(q<s.length&&WS.includes(s[q]))q++;return s.startsWith("endstream",q);};if(length===null||p+length>s.length||!endsAt(p+length)){const e2=s.indexOf("endstream",p);if(e2<0)fail("PDF could not be opened.");length=e2-p;while(length>0&&(s[p+length-1]==="\n"||s[p+length-1]==="\r"))length--;}
const raw=bytes.subarray(p,p+length),plain=/\/Type\s*\/XRef\b/.test(dict)||(metaPlain&&/\/Type\s*\/Metadata\b/.test(dict))?raw:await decrypt(key,raw);
const newDict=dict.replace(/\/Length\s+\d+(?:\s+\d+\s+R)?/,"/Length "+plain.length);parts.push(s.slice(last,m.index+m[0].length),newDict,"stream\n",plain,"\nendstream");const after=s.indexOf("endstream",p+length);last=after+9;re.lastIndex=last;count++;if(count%200===0){progress(`Unlocking… ${count} objects`,`अनलॉक हो रहा है… ${count} ऑब्जेक्ट`);await breathe();}}
parts.push(s.slice(last));const rebuilt=cat(...parts.map(x=>typeof x==="string"?toBytes(x):x));
progress("Saving PDF…","PDF सेव हो रही है…");await breathe();let doc;try{doc=await PDFLib.PDFDocument.load(rebuilt,{ignoreEncryption:true,throwOnInvalidObject:false,updateMetadata:false});}catch(e){fail("PDF could not be opened.");}
const encRef=doc.context.trailerInfo.Encrypt;doc.context.trailerInfo.Encrypt=undefined;if(encRef instanceof PDFLib.PDFRef)doc.context.delete(encRef);const out=await doc.save({useObjectStreams:false,objectsPerTick:25});
try{await PDFLib.PDFDocument.load(out,{ignoreEncryption:false,throwOnInvalidObject:false,updateMetadata:false});}catch(e){fail("PDF could not be opened.");}postMessage({type:"done",bytes:out,name:"kaagazkit-unlocked.pdf",pages:doc.getPageCount(),note:usedEmpty?["Restrictions removed: this PDF already opened without a password.","प्रतिबंध हटाए गए: यह PDF पहले से बिना पासवर्ड के खुलती थी।"]:["Password removed. Keep this unlocked copy safe.","पासवर्ड हटा दिया गया। अनलॉक कॉपी सुरक्षित रखें।"]},[out.buffer]);}


async function signPdf(){if(!globalThis.PDFLib)fail("PDF engine unavailable. Reload and try again.");const f=job.files[0];if(!f||!f.size||f.size>50*1024*1024)fail("Choose one PDF up to 50 MB.");if(!(job.signature instanceof Uint8Array)||!job.signature.length)fail("Choose a signature photo.");
if(!["last","first","all"].includes(job.sigPages)||!["br","bl","bc","tr"].includes(job.sigPlace)||![15,25,35].includes(job.sigSize))fail("Invalid PDF operation.");const bytes=new Uint8Array(await f.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")fail("Input is not a PDF.");
progress("Reading PDF…","PDF पढ़ रहे हैं…");await breathe();let doc;try{doc=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});}catch(e){fail(/encrypt/i.test(String(e&&e.message))?"Encrypted or password-protected PDFs are not supported.":"PDF could not be opened.");}
const pages=doc.getPages();if(pages.length<1||pages.length>200)fail("Each PDF must contain 1–200 pages.");const img=await doc.embedPng(job.signature),chosen=job.sigPages==="all"?pages:[job.sigPages==="first"?pages[0]:pages[pages.length-1]];
for(const p of chosen){const v=visiblePage(p),w=v.w*job.sigSize/100,h=w*job.sigH/job.sigW,m=Math.min(v.w,v.h)*.06;if(h>v.h*.4)fail("Page too small for this signature size.");const x=job.sigPlace==="bl"?m:job.sigPlace==="bc"?(v.w-w)/2:v.w-m-w,y=job.sigPlace==="tr"?v.h-m-h:m;p.drawImage(img,{...v.point(x,y),width:w,height:h,rotate:PDFLib.degrees(v.r)});}
progress("Saving PDF…","PDF सेव हो रही है…");await breathe();const out=await doc.save({objectsPerTick:25});postMessage({type:"done",bytes:out,name:"kaagazkit-signed.pdf",pages:pages.length,note:[`Signature added to ${chosen.length} ${chosen.length===1?"page":"pages"}. This is a picture of a signature, not a certified digital signature.`,`${chosen.length} पेज पर हस्ताक्षर लगाया गया। यह हस्ताक्षर की तस्वीर है, प्रमाणित डिजिटल हस्ताक्षर नहीं।`]},[out.buffer]);}

self.onmessage=async e=>{try{job=e.data;tool=job.tool;if(!Array.isArray(job.files)||!["sign-pdf","unlock-pdf","lock-pdf","edit-pdf","compress-pdf","merge-pdf","split-pdf","remove-pdf-pages","rotate-pdf","reorder-pdf","watermark-pdf","number-pdf"].includes(tool))fail("Invalid PDF operation.");if(tool==="sign-pdf")await signPdf();else if(tool==="unlock-pdf")await unlockPdf();else if(tool==="lock-pdf")await lockPdf();else if(tool==="edit-pdf")await overlayPdf();else if(tool==="compress-pdf")await compressPdf();else if(tool==="merge-pdf"||tool==="split-pdf")await editPdf();else await transformPdf();}catch(err){postMessage({type:"error",message:err.message||"Unable to process input."});}};
