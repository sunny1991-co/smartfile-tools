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
/* Income tax, FY 2025-26 (AY 2026-27), resident individual. Normal-rate income only (no capital gains at special rates). */
const NEW_SLABS=[[400000,0],[800000,.05],[1200000,.10],[1600000,.15],[2000000,.20],[2400000,.25],[Infinity,.30]];
function oldSlabs(age){const ex=age==="80+"?500000:age==="60-79"?300000:250000;return ex>=500000?[[500000,0],[1000000,.20],[Infinity,.30]]:[[ex,0],[500000,.05],[1000000,.20],[Infinity,.30]];}
function slabTax(income,slabs){let tax=0,prev=0;for(const [upto,r] of slabs){if(income>prev)tax+=(Math.min(income,upto)-prev)*r;prev=upto;}return tax;}
function surchargeRate(income,regime){if(income>5e7&&regime==="old")return .37;if(income>2e7)return .25;if(income>1e7)return .15;if(income>5e6)return .10;return 0;}
/* Surcharge with marginal relief: tax + surcharge may not rise by more than the income above each threshold. */
function withSurcharge(income,tax,taxAt,regime){const rate=surchargeRate(income,regime);if(!rate)return {surcharge:0};let sc=tax*rate;for(const t of [5e6,1e7,2e7,5e7]){if(income>t&&surchargeRate(t+1,regime)===rate){const base=taxAt(t);const cap=base+base*surchargeRate(t,regime)+(income-t);if(tax+sc>cap)sc=Math.max(0,cap-tax);}}return {surcharge:sc};}
function incomeTax({salary=0,other=0,deductions=0,age="below-60"}){const out={};
  for(const regime of ["new","old"]){const std=salary>0?Math.min(salary,regime==="new"?75000:50000):0;const taxable=Math.max(0,salary-std+other-(regime==="old"?Math.min(deductions,salary+other):0));const slabs=regime==="new"?NEW_SLABS:oldSlabs(age);
    const taxAt=x=>slabTax(x,slabs);let tax=taxAt(taxable),rebate=0;
    if(regime==="new"){if(taxable<=1200000){rebate=Math.min(tax,60000);}else if(tax>taxable-1200000){rebate=tax-(taxable-1200000);}}
    else if(taxable<=500000){rebate=Math.min(tax,12500);}
    const afterRebate=tax-rebate;const {surcharge}=withSurcharge(taxable,afterRebate,taxAt,regime);const cess=(afterRebate+surcharge)*.04;const total=Math.round(afterRebate+surcharge+cess);
    out[regime]={standardDeduction:std,taxable:Math.round(taxable),slabTax:r2(tax),rebate:r2(rebate),surcharge:r2(surcharge),cess:r2(cess),total,monthly:Math.round(total/12)};}
  out.better=out.new.total<=out.old.total?"new":"old";out.saving=Math.abs(out.new.total-out.old.total);return out;}
/* BMI with the Asian-Indian cut-offs (Consensus guidelines for India) and the WHO global ones. */
function bmi(kg,cm){const m=cm/100,v=kg/(m*m);const india=v<18.5?"under":v<23?"normal":v<25?"over":"obese";const who=v<18.5?"under":v<25?"normal":v<30?"over":"obese";return {bmi:Math.round(v*10)/10,india,who,healthyMin:Math.round(18.5*m*m*10)/10,healthyMax:Math.round(22.9*m*m*10)/10};}
/* CGPA to percentage with common formulas; and back. */
const CGPA={cbse:{to:g=>g*9.5,from:p=>p/9.5},ten:{to:g=>g*10,from:p=>p/10},vtu:{to:g=>(g-0.75)*10,from:p=>p/10+0.75},mu:{to:g=>7.1*g+11,from:p=>(p-11)/7.1}};
function cgpa(kind,value,reverse,mult){const f=kind==="custom"?{to:g=>g*mult,from:p=>p/mult}:CGPA[kind];if(!f)return NaN;return r2(reverse?f.from(value):f.to(value));}
/* Amount in words, Indian system (crore, lakh, thousand), English and Hindi. */
const ONES=["","One","Two","Three","Four","Five","Six","Seven","Eight","Nine","Ten","Eleven","Twelve","Thirteen","Fourteen","Fifteen","Sixteen","Seventeen","Eighteen","Nineteen"],TENS=["","","Twenty","Thirty","Forty","Fifty","Sixty","Seventy","Eighty","Ninety"];
const HI="शून्य एक दो तीन चार पांच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानबे बानबे तिरानबे चौरानबे पचानबे छियानबे सत्तानबे अट्ठानबे निन्यानबे".split(" ");
function two(n,hi){if(hi)return HI[n];return n<20?ONES[n]:TENS[Math.floor(n/10)]+(n%10?" "+ONES[n%10]:"");}
function indian(n,hi){if(n===0)return hi?"शून्य":"Zero";const parts=[];const crore=Math.floor(n/1e7);n%=1e7;const lakh=Math.floor(n/1e5);n%=1e5;const th=Math.floor(n/1e3);n%=1e3;const h=Math.floor(n/100);n%=100;
  if(crore)parts.push(indian(crore,hi)+(hi?" करोड़":" Crore"));if(lakh)parts.push(two(lakh,hi)+(hi?" लाख":" Lakh"));if(th)parts.push(two(th,hi)+(hi?" हज़ार":" Thousand"));if(h)parts.push(two(h,hi)+(hi?" सौ":" Hundred"));if(n)parts.push(two(n,hi));return parts.join(" ");}
function words(amount,hi){const total=Math.round(amount*100);const rupees=Math.floor(total/100),paise=total%100;
  if(hi)return `${indian(rupees,true)} रुपये${paise?` ${HI[paise]} पैसे`:""} मात्र`;
  return `${indian(rupees,false)} Rupees${paise?` and ${two(paise,false)} Paise`:""} Only`;}
const api={fd,rd,sip,emi,gst,percent,inr,incomeTax,bmi,cgpa,words};
root.SmartCalc=api;
if(typeof module==="object"&&module.exports)module.exports=api;
})(typeof globalThis!=="undefined"?globalThis:this);
