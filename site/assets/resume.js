/* Resume and job biodata maker: draws one A4 page (150 dpi) on a canvas. Runs on the device. */
(function(root){
"use strict";
const W=1240,H=1754,M=90,FONT='"Noto Sans Devanagari","Nirmala UI","Mangal","Noto Sans","Segoe UI",Arial,sans-serif';
const labels={
en:{resume:"RESUME",biodata:"BIO-DATA",post:"Post applied for",objective:"Career objective",education:"Education",experience:"Work experience",skills:"Skills",languages:"Languages known",personal:"Personal details",name:"Name",father:"Father's / Husband's name",dob:"Date of birth",gender:"Gender",address:"Address",phone:"Mobile",email:"Email",declaration:"Declaration",declText:"I hereby declare that the information given above is true to the best of my knowledge and belief.",place:"Place",date:"Date",signature:"Signature",qual:"Qualification",board:"Board / University",year:"Year",marks:"Marks / Grade"},
hi:{resume:"रिज्यूमे",biodata:"बायोडाटा",post:"आवेदित पद",objective:"करियर उद्देश्य",education:"शैक्षिक योग्यता",experience:"कार्य अनुभव",skills:"कौशल",languages:"भाषाओं का ज्ञान",personal:"व्यक्तिगत विवरण",name:"नाम",father:"पिता / पति का नाम",dob:"जन्म तिथि",gender:"लिंग",address:"पता",phone:"मोबाइल",email:"ईमेल",declaration:"घोषणा",declText:"मैं घोषणा करता/करती हूं कि ऊपर दी गई सभी जानकारी मेरी जानकारी और विश्वास के अनुसार सत्य है।",place:"स्थान",date:"दिनांक",signature:"हस्ताक्षर",qual:"योग्यता",board:"बोर्ड / विश्वविद्यालय",year:"वर्ष",marks:"अंक / ग्रेड"}};
function lines(t){return String(t||"").split(/\r?\n/).map(s=>s.trim()).filter(Boolean);}
function wrap(ctx,text,width){const out=[];for(const para of String(text).split(/\n/)){let line="";for(const word of para.split(/\s+/).filter(Boolean)){const test=line?line+" "+word:word;if(ctx.measureText(test).width<=width||!line){line=test;/* break a single very long word */while(ctx.measureText(line).width>width&&line.length>1){let cut=line.length-1;while(cut>1&&ctx.measureText(line.slice(0,cut)).width>width)cut--;out.push(line.slice(0,cut));line=line.slice(cut);}}else{out.push(line);line=word;}}out.push(line);}return out;}
function layout(ctx,d,photo,scale,draw){
  const L=labels[d.lang==="hi"?"hi":"en"],accent=d.kind==="biodata"?"#1f2937":"#0f5f57",s=n=>Math.round(n*scale);
  let y=M,photoBottom=0;const right=W-M,width=right-M;
  const font=(size,bold)=>{ctx.font=`${bold?"700 ":""}${s(size)}px ${FONT}`;};
  const text=(t,x,yy,color="#111827",align="left")=>{if(draw){ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(t,x,yy);}};
  const para=(t,size,maxW,x=M,color="#1f2937",gap=1.45)=>{font(size);for(const ln of wrap(ctx,t,maxW)){y+=s(size*gap);text(ln,x,y,color);}};
  const heading=t=>{y+=s(26);font(24,true);y+=s(24);text(d.lang==="hi"?t:t.toUpperCase(),M,y,accent);y+=s(10);/* keep the rule clear of the photo */const ruleW=y<photoBottom?width-photoW-s(30):width;if(draw){ctx.fillStyle=accent;ctx.fillRect(M,y,ruleW,Math.max(2,s(3)));}y+=s(4);};
  const items=(list,size,maxW,color,sep="   |   ")=>{font(size);let line="";const out=[];for(const it of list){const test=line?line+sep+it:it;if(!line||ctx.measureText(test).width<=maxW)line=test;else{out.push(line);line=it;}}if(line)out.push(line);for(const ln of out){y+=s(size*1.6);text(ln,M,y,color);}};
  const photoW=s(170),photoH=s(215),hasPhoto=!!photo;
  if(draw){ctx.fillStyle="#ffffff";ctx.fillRect(0,0,W,H);}
  if(d.kind==="biodata"){
    font(40,true);y+=s(40);text(L.biodata,W/2,y,"#111827","center");y+=s(14);if(draw){ctx.fillStyle="#111827";ctx.fillRect(W/2-s(120),y,s(240),s(3));}y+=s(20);
    const top=y;if(hasPhoto)photoBottom=top+photoH+s(8);if(hasPhoto&&draw){ctx.drawImage(photo,right-photoW,top,photoW,photoH);ctx.strokeStyle="#374151";ctx.lineWidth=2;ctx.strokeRect(right-photoW,top,photoW,photoH);}
    if(d.post){font(24,true);y+=s(34);text(`${L.post}: ${d.post}`,M,y);}
    heading(L.personal);
    const rows=[[L.name,d.name],[L.father,d.father],[L.dob,d.dob],[L.gender,d.gender],[L.phone,d.phone],[L.email,d.email],[L.address,d.address],[L.languages,d.languages]].filter(r=>r[1]);
    const keyW=s(330),valX=M+keyW+s(20);
    for(const [k,v] of rows){const valW=(hasPhoto&&y<top+photoH+s(10)?right-photoW-s(30):right)-valX;font(23,true);const ky=y+s(36);text(k,M,ky,"#374151");text(":",M+keyW,ky,"#374151");font(23);const ls=wrap(ctx,v,valW);ls.forEach((ln,i)=>{y+=s(i?32:36);text(ln,valX,y);});}
    if(hasPhoto)y=Math.max(y,top+photoH);
  }else{
    const textW=hasPhoto?width-photoW-s(30):width;const top=y;if(hasPhoto)photoBottom=top+photoH+s(8);
    if(hasPhoto&&draw){ctx.drawImage(photo,right-photoW,top,photoW,photoH);ctx.strokeStyle="#d1d5db";ctx.lineWidth=2;ctx.strokeRect(right-photoW,top,photoW,photoH);}
    font(50,true);for(const ln of wrap(ctx,d.name||"",textW)){y+=s(58);text(ln,M,y,"#111827");}
    if(d.post){font(27);y+=s(42);text(d.post,M,y,accent);}
    const contact=[d.phone,d.email].filter(Boolean);if(contact.length){y+=s(6);items(contact,22,textW,"#374151");}
    if(d.address)para(d.address,22,textW,M,"#374151",1.5);
    const personal=[[L.dob,d.dob],[L.father,d.father],[L.gender,d.gender]].filter(r=>r[1]).map(r=>`${r[0]}: ${r[1]}`);if(personal.length)items(personal,21,textW,"#4b5563");
    if(hasPhoto)y=Math.max(y,top+photoH);
    if(d.objective){heading(L.objective);para(d.objective,23,width);}
  }
  const edu=lines(d.education);
  if(edu.length){heading(L.education);
    if(edu.some(l=>l.includes("|"))){const cols=[0.34,0.33,0.13,0.20].map(f=>f*width),head=[L.qual,L.board,L.year,L.marks];const row=(cells,bold)=>{font(21,bold);const wrapped=cells.map((c,i)=>wrap(ctx,c||"",cols[i]-s(20)));const h=Math.max(...wrapped.map(w=>w.length))*s(30)+s(18);if(draw){ctx.strokeStyle="#9ca3af";ctx.lineWidth=1.5;let x=M;cols.forEach(cw=>{ctx.strokeRect(x,y+s(10),cw,h);x+=cw;});if(bold){ctx.fillStyle="#f3f4f6";ctx.fillRect(M+1,y+s(10)+1,width-2,h-2);}}let x=M;wrapped.forEach((w,i)=>{w.forEach((ln,j)=>text(ln,x+s(10),y+s(10)+s(32)+j*s(30),"#111827"));x+=cols[i];});y+=h;};row(head,true);for(const l of edu)row(l.split("|").map(c=>c.trim()).slice(0,4),false);y+=s(6);}
    else for(const l of edu)para("•  "+l,23,width);}
  const exp=lines(d.experience);if(exp.length){heading(L.experience);for(const l of exp)para("•  "+l,23,width);}
  if(d.skills){heading(L.skills);para(String(d.skills).split(/[,\n]/).map(x=>x.trim()).filter(Boolean).join("  •  "),23,width);}
  if(d.kind!=="biodata"&&d.languages){heading(L.languages);para(d.languages,23,width);}
  heading(L.declaration);para(L.declText,22,width);
  font(22);y+=s(70);const sigY=y;text(`${L.place}: ${d.place||""}`,M,sigY,"#111827");text(`${L.date}: ${d.date||""}`,M,sigY+s(38),"#111827");
  font(22,true);text(`(${d.name||L.signature})`,right,sigY+s(38),"#111827","right");font(20);text(L.signature,right,sigY,"#4b5563","right");
  return sigY+s(38)+s(30);
}
/* Fit everything on one A4 page: shrink text step by step, then fail if it is still too long. */
function render(canvas,d,photo){const ctx=canvas.getContext("2d");canvas.width=W;canvas.height=H;ctx.textBaseline="alphabetic";for(let scale=1;scale>=0.66;scale-=0.06){if(layout(ctx,d,photo,scale,false)<=H-M/2){layout(ctx,d,photo,scale,true);return {scale:Math.round(scale*100)/100};}}throw new Error("Too much text for one A4 page. Shorten the objective, education or experience.");}
root.SmartResume={render,labels,W,H};
})(typeof globalThis!=="undefined"?globalThis:this);
