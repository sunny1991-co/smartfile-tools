/* Kruti Dev 010 <-> Unicode Hindi converter. Runs on the device; no network. */
(function(root){
"use strict";
const I="",R="";// placeholders: short-i matra and reph
const full={"क":"d","ख":"[k","ग":"x","घ":"?k","ङ":"³","च":"p","छ":"N","ज":"t","झ":">","ञ":"¥","ट":"V","ठ":"B","ड":"M","ढ":"<","ण":".k","त":"r","थ":"Fk","द":"n","ध":"/k","न":"u","प":"i","फ":"Q","ब":"c","भ":"Hk","म":"e","य":";","र":"j","ल":"y","ळ":"G","व":"o","श":"'k","ष":"\"k","स":"l","ह":"g"};
const half={"क":"D","ख":"[","ग":"X","घ":"?","च":"P","ज":"T","झ":"÷","ण":".","त":"R","थ":"F","ध":"/","न":"U","प":"I","फ":"¶","ब":"C","भ":"H","म":"E","य":"¸","ल":"Y","व":"O","श":"'","ष":"\"","स":"L"};
// Conjuncts with their own Kruti Dev glyphs (Unicode -> Kruti Dev).
const special=[["त्त्","Ù"],["त्त","Ùk"],["क्ष्","{"],["क्ष","{k"],["त्र्","«"],["त्र","="],["ज्ञ","K"],["श्र","J"],["क्र","Ø"],["फ्र","Ý"],["द्र","æ"],["ट्र","Vª"],["ड्र","Mª"],["ढ्र","<ª"],["छ्र","Nª"],["छ्य","Nî"],["ट्य","Vî"],["ठ्य","Bî"],["ड्य","Mî"],["ढ्य","<î"],["द्य","|"],["द्व","}"],["द्ध",")"],["द्द","í"],["दृ","–"],["ह्न","à"],["ह्य","á"],["हृ","â"],["ह्म","ã"],["ह्र","ºz"],["ह्","º"],["ट्ट","ê"],["ट्ठ","ë"],["ड्ड","ì"],["ड्ढ","ï"],["रु","#"],["रू",":"]];
const single={"अ":"v","आ":"vk","इ":"b","ई":"bZ","उ":"m","ऊ":"Å","ऋ":"_","ए":",","ऐ":",s","ओ":"vks","औ":"vkS","ऑ":"vkW","ा":"k","ी":"h","ु":"q","ू":"w","ृ":"`","े":"s","ै":"S","ो":"ks","ौ":"kS","ॉ":"kW","ॅ":"W","ं":"a","ँ":"¡","ः":"%","्":"~","़":"+","ऽ":"·","।":"A","॥":"AA","॰":"Œ","०":"å","१":"ƒ","२":"„","३":"…","४":"†","५":"‡","६":"ˆ","७":"‰","८":"Š","९":"‹","-":"&",".":"-",",":"]","?":"\\","(":"¼",")":"½","=":"¾","{":"¿","}":"À","‘":"^","’":"*","“":"Þ","”":"ß",":":"%",[I]:"f",[R]:"Z"};
const C="[क-ह]़?",H="्",M="[ा-ौॢॣ]";
const cons=/[क-ह]/;
function toKrutidev(text){
  let s=String(text).normalize("NFC").replace(/[क़-य़]/g,c=>c.normalize("NFD"));
  // Short-i matra is written before its whole consonant cluster (a leading reph stays outside).
  s=s.replace(new RegExp(`((?:${C}${H})*${C})ि`,"g"),(m,cl)=>cl.length>2&&cl.startsWith("र्")?"र्"+I+cl.slice(2):I+cl);
  // Reph (र् before a consonant) is written after the cluster and its vowel signs.
  s=s.replace(new RegExp(`(?<!${H})र्(${I}?)((?:${C}${H})*${C})(${M}*)`,"g"),"$1$2$3"+R);
  let out="";
  for(let i=0;i<s.length;){
    const sp=special.find(([u])=>s.startsWith(u,i));
    if(sp){out+=sp[1];i+=sp[0].length;continue;}
    const ch=s[i];
    if(cons.test(ch)){
      const nukta=s[i+1]==="़"?"+":"";let j=i+1+nukta.length;
      if(s[j]===H&&s[j+1]==="र"){out+=full[ch]+nukta+"z";i=j+2;continue;}
      if(s[j]===H){out+=(half[ch]?half[ch]+nukta:full[ch]+nukta+"~");i=j+1;continue;}
      out+=full[ch]+nukta;i=j;continue;
    }
    out+=ch in single?single[ch]:ch;i++;
  }
  return out;
}
// Kruti Dev -> Unicode table: every pair above reversed, plus common alternatives.
const back=new Map();
const add=(k,u)=>{if(!back.has(k))back.set(k,u);};
for(const [u,k] of special)add(k,u);
for(const [u,k] of Object.entries(single))if(u!==":")add(k,u);
for(const [u,k] of Object.entries(half))add(k,u+H);
for(const [u,k] of Object.entries(full))add(k,u);
[["z","्र"],["ª","्र"],["î","्य"],["—","कृ"],["ô","क्क"],["‚","ॉ"],["v‚","ऑ"],["±",R+"ं"],["Ê","ीं"],["Dr","क्त"]].forEach(([k,u])=>add(k,u));
const keys=[...back.keys()].sort((a,b)=>b.length-a.length);
function toUnicode(text){
  const s=String(text);let out="";
  for(let i=0;i<s.length;){
    const k=keys.find(k=>s.startsWith(k,i));
    if(k){out+=back.get(k);i+=k.length;}else{out+=s[i];i++;}
  }
  out=out.replace(/़्/g,"़्");
  out=out.replace(new RegExp(`${I}((?:${C}${H})*${C})`,"g"),"$1ि").replace(new RegExp(I,"g"),"ि");
  out=out.replace(new RegExp(`((?:${C}${H})*${C})((?:${M}|[ँं])*)${R}`,"g"),"र्$1$2").replace(new RegExp(R,"g"),"र्");
  return out.normalize("NFC");
}
// Characters Kruti Dev uses for Hindi letters: English letters and these symbols cannot be kept.
function unsupported(text){return /[A-Za-z'"\/;\[\]<>|~`_+#!@$^*&%]/.test(String(text));}
const api={toKrutidev,toUnicode,unsupported};
root.SmartKrutidev=api;
if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
