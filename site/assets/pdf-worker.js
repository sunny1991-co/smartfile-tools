"use strict";
importScripts("/assets/vendor/pdf-lib.min.js");
let job,tool;
const fail=s=>{throw new Error(s);};
const breathe=()=>new Promise(resolve=>setTimeout(resolve,0));
const progress=(en,hi)=>postMessage({type:"progress",en,hi});
const finish=(bytes,name,pages)=>postMessage({type:"done",bytes,name,pages},[bytes.buffer]);
function pageIndices(raw,count){const out=[],seen=new Set();for(const token of raw.split(",")){const m=/^\s*(\d+)(?:\s*-\s*(\d+))?\s*$/.exec(token);if(!m)fail("Enter page numbers or ranges such as 1,3-5.");const a=Number(m[1]),b=Number(m[2]||m[1]);if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<1||b<a||b>count)fail("Page range must be within 1–"+count+".");for(let n=a;n<=b;n++){if(seen.has(n))fail("Duplicate pages are not supported.");seen.add(n);out.push(n-1);}}return out;}
async function editPdf(){if(!globalThis.PDFLib)fail("PDF engine unavailable. Reload and try again.");const fs=job.files,merge=tool==="merge-pdf";if((merge&&(fs.length<2||fs.length>10))||(!merge&&fs.length!==1)||fs.reduce((s,f)=>s+f.size,0)>50*1024*1024)fail("Choose the supported number of PDFs, up to 50 MB total.");const out=await PDFLib.PDFDocument.create();let total=0;for(let i=0;i<fs.length;i++){const f=fs[i];if(!f.size)fail("Empty PDF.");const bytes=new Uint8Array(await f.arrayBuffer());if(new TextDecoder().decode(bytes.slice(0,5))!=="%PDF-")fail("Input is not a PDF.");progress("Reading PDF "+(i+1)+" of "+fs.length+"…","PDF "+(i+1)+" / "+fs.length+" पढ़ रहे हैं…");await breathe();let doc;try{doc=await PDFLib.PDFDocument.load(bytes,{ignoreEncryption:false,throwOnInvalidObject:true,updateMetadata:false});}catch(e){fail("Cannot read PDF. Encrypted or damaged PDFs are not supported.");}const count=doc.getPageCount();if(!count||count>200)fail("Each PDF must contain 1–200 pages.");const indices=merge?doc.getPageIndices():pageIndices(job.pages,count);total+=indices.length;if(total>200)fail("Output must not exceed 200 pages.");const copied=await out.copyPages(doc,indices);for(const p of copied)out.addPage(p);await breathe();}progress("Saving PDF…","PDF सेव हो रही है…");await breathe();const bytes=await out.save({objectsPerTick:25});finish(bytes,merge?"smartfile-merged.pdf":"smartfile-extracted.pdf",total);}
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
progress("Saving PDF…","PDF सेव हो रही है…");await breathe();const output=await out.save({objectsPerTick:25});finish(output,"smartfile-"+tool+".pdf",indices.length);
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
let best=await doc.save({useObjectStreams:true,objectsPerTick:25});if(best.length<=limit){finish(best,"smartfile-compress-pdf.pdf",count);return;}
const images=[];for(const [ref,obj] of doc.context.enumerateIndirectObjects()){if(obj instanceof PDFLib.PDFRawStream&&nameOf(obj.dict.lookup(PDFLib.PDFName.of("Subtype")))==="/Image")images.push(ref);}
if(!images.length)fail("This PDF has no photos that can be compressed, so it cannot be made smaller here.");
for(const [n,[scale,quality]] of LEVELS.entries()){progress(`Compressing photos (step ${n+1} of ${LEVELS.length})…`,`फोटो कंप्रेस हो रही हैं (चरण ${n+1} / ${LEVELS.length})…`);await breathe();doc=await open();let changed=0;
for(const ref of images){const obj=doc.context.lookup(ref);if(!(obj instanceof PDFLib.PDFRawStream))continue;let img;try{img=await decodeImage(obj);}catch(e){img=null;}if(!img)continue;
try{const long=Math.max(img.w,img.h),s=Math.min(1,Math.max(scale,MIN_LONG_SIDE/long)),w=Math.max(1,Math.round(img.w*s)),h=Math.max(1,Math.round(img.h*s));const c=new OffscreenCanvas(w,h),ctx=c.getContext("2d");ctx.fillStyle="white";ctx.fillRect(0,0,w,h);ctx.drawImage(img.bitmap,0,0,w,h);
const jpg=new Uint8Array(await (await c.convertToBlob({type:"image/jpeg",quality})).arrayBuffer());if(jpg.length>=obj.contents.length)continue;
const N=PDFLib.PDFName,dict={Type:"XObject",Subtype:"Image",Width:w,Height:h,ColorSpace:"DeviceRGB",BitsPerComponent:8,Filter:"DCTDecode"};const next=doc.context.stream(jpg,dict),smask=obj.dict.get(N.of("SMask"));if(smask)next.dict.set(N.of("SMask"),smask);const intent=obj.dict.get(N.of("Intent"));if(intent)next.dict.set(N.of("Intent"),intent);doc.context.assign(ref,next);changed++;}finally{img.bitmap.close();}}
const out=await doc.save({useObjectStreams:true,objectsPerTick:25});if(out.length<best.length)best=out;if(best.length<=limit){finish(best,"smartfile-compress-pdf.pdf",count);return;}if(!changed&&n>1)break;}
fail("Could not reach the target without making pages unreadable. Choose a larger target.");}

self.onmessage=async e=>{try{job=e.data;tool=job.tool;if(!Array.isArray(job.files)||!["compress-pdf","merge-pdf","split-pdf","remove-pdf-pages","rotate-pdf","reorder-pdf","watermark-pdf","number-pdf"].includes(tool))fail("Invalid PDF operation.");if(tool==="compress-pdf")await compressPdf();else if(tool==="merge-pdf"||tool==="split-pdf")await editPdf();else await transformPdf();}catch(err){postMessage({type:"error",message:err.message||"Unable to process input."});}};
