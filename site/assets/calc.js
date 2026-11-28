/* Money and everyday calculators (FD, RD, SIP, EMI, GST, percentage). Pure functions; runs on the device. */
(function(root){
"use strict";
const fin=x=>Number.isFinite(x);
const r2=x=>Math.round(x*100)/100;
/* Fixed deposit. months may be fractional of a year; n = compounding periods per year (0 = simple interest). */
function fd(principal,ratePct,months,n){const t=months/12,r=ratePct/100;const maturity=n?principal*Math.pow(1+r/n,n*t):principal*(1+r*t);return {maturity:r2(maturity),interest:r2(maturity-principal),invested:r2(principal)};}
/* Recurring deposit, Indian bank convention: each instalment paid at the start of its month,
   compounded quarterly for the months it stays deposited. */
function rd(monthly,ratePct,months){const r=ratePct/100;let maturity=0;for(let k=months;k>=1;k--)maturity+=monthly*Math.pow(1+r/4,k/3);return {maturity:r2(maturity),invested:r2(monthly*months),interest:r2(maturity-monthly*months)};}
/* SIP: monthly investment at the start of each month, expected yearly return compounded monthly. Optional yearly step-up %. */
function sip(monthly,ratePct,years,stepUpPct=0){const i=ratePct/100/12;let value=0,invested=0,amount=monthly;const rows=[];for(let y=1;y<=years;y++){for(let m=0;m<12;m++){value=(value+amount)*(1+i);invested+=amount;}rows.push({year:y,invested:r2(invested),value:r2(value)});amount*=1+stepUpPct/100;}return {maturity:r2(value),invested:r2(invested),gain:r2(value-invested),rows};}
/* Loan EMI with a yearly summary. */
function emi(principal,ratePct,months){const i=ratePct/100/12;const e=i?principal*i*Math.pow(1+i,months)/(Math.pow(1+i,months)-1):principal/months;let bal=principal;const rows=[];let yp=0,yi=0;for(let m=1;m<=months;m++){const int=bal*i,pr=Math.min(bal,e-int);bal-=pr;yp+=pr;yi+=int;if(m%12===0||m===months){rows.push({year:Math.ceil(m/12),principal:r2(yp),interest:r2(yi),balance:r2(Math.max(0,bal))});yp=yi=0;}}return {emi:r2(e),total:r2(e*months),interest:r2(e*months-principal),rows};}
/* GST: add to a price, or take out of a GST-inclusive price. Intra-state splits equally into CGST and SGST. */
function gst(amount,ratePct,inclusive){const base=inclusive?amount/(1+ratePct/100):amount;const tax=base*ratePct/100;return {base:r2(base),tax:r2(tax),half:r2(tax/2),total:r2(base+tax)};}
function percent(kind,a,b){if(kind==="of")return r2(a*b/100);if(kind==="is")return b?r2(a/b*100):NaN;if(kind==="change")return a?r2((b-a)/a*100):NaN;return NaN;}
/* Indian digit grouping: 12,34,567.89 */
function inr(x){if(!fin(x))return "—";return "₹"+x.toLocaleString("en-IN",{maximumFractionDigits:2,minimumFractionDigits:x%1?2:0});}
const api={fd,rd,sip,emi,gst,percent,inr};
root.SmartCalc=api;
if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
