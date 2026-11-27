const fs=require('node:fs'),path=require('node:path');
const root=__dirname,out=path.join(root,'preview'),nm=path.join(root,'node_modules'),dest=path.join(out,'vendor');
fs.rmSync(out,{recursive:true,force:true});fs.mkdirSync(dest,{recursive:true});
for(const name of ['index.html','extract.mjs','style.css'])fs.copyFileSync(path.join(root,name),path.join(out,name));
function copy(src,target){const to=path.join(dest,target);fs.mkdirSync(path.dirname(to),{recursive:true});fs.cpSync(path.join(nm,src),to,{recursive:true});}
for(const name of ['pdf.mjs','pdf.worker.mjs','pdf.renderer.mjs']){const src='pdfjs-dist/legacy/build/'+name;if(fs.existsSync(path.join(nm,src)))copy(src,'pdf/'+name);else if(name!=='pdf.renderer.mjs')throw Error(src);}
for(const name of ['cmaps','standard_fonts','wasm','iccs'])if(fs.existsSync(path.join(nm,'pdfjs-dist',name)))copy('pdfjs-dist/'+name,'pdf/'+name);
for(const name of ['tesseract.min.js','worker.min.js'])copy('tesseract.js/dist/'+name,'ocr/'+name);
for(const name of fs.readdirSync(path.join(nm,'tesseract.js-core')))if(/^tesseract-core(?:-simd|-relaxedsimd)?-lstm\.wasm\.js$/.test(name))copy('tesseract.js-core/'+name,'ocr/core/'+name);
for(const lang of ['eng','hin'])copy('@tesseract.js-data/'+lang+'/4.0.0_best_int/'+lang+'.traineddata.gz','ocr/lang/'+lang+'.traineddata.gz');
for(const name of ['pdfjs-dist','tesseract.js','tesseract.js-core','@tesseract.js-data/eng','@tesseract.js-data/hin']){
const source=path.join(nm,name);const licenses=fs.readdirSync(source).filter(x=>/^(license|notice|copying)/i.test(x));for(const file of licenses)copy(name+'/'+file,'licenses/'+name+'/'+file);}
let sizes=[];function walk(p){for(const x of fs.readdirSync(p,{withFileTypes:true})){const full=path.join(p,x.name);if(x.isDirectory())walk(full);else sizes.push({file:path.relative(out,full),bytes:fs.statSync(full).size});}}walk(out);
console.log(JSON.stringify(sizes,null,2));const ocrBytes=sizes.filter(x=>x.file.startsWith('vendor/ocr/')).reduce((a,x)=>a+x.bytes,0);console.log('OCR_ASSETS_BYTES',ocrBytes);if(ocrBytes>17*1024*1024)throw Error('OCR asset budget exceeded');console.log('PDF_ASSETS_BYTES',sizes.filter(x=>x.file.startsWith('vendor/pdf/')).reduce((a,x)=>a+x.bytes,0));if(sizes.some(x=>x.bytes>25*1024*1024))throw Error('Asset exceeds 25 MiB preview limit');
