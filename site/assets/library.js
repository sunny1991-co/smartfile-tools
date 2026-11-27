(()=>{"use strict";
const box=document.querySelector(".tool-search"),input=document.getElementById("tool-search"),clear=document.getElementById("clear-search"),status=document.getElementById("search-status");
if(!box||!input||!clear||!status)return;
const hi=document.documentElement.lang==="hi",groups=[...document.querySelectorAll(".tool-group")],cards=[...document.querySelectorAll(".tile")],nav=document.querySelector(".category-nav");
const normalize=s=>s.normalize("NFKC").toLowerCase().replace(/[०-९]/g,d=>String("०१२३४५६७८९".indexOf(d))).replace(/[-_]+/g," ").trim();
const index=cards.map(card=>[card,normalize(card.dataset.search||card.textContent)]);
function filter(){const terms=normalize(input.value).split(/\s+/).filter(Boolean);let count=0;for(const [card,haystack] of index){const show=terms.every(t=>haystack.includes(t));card.hidden=!show;if(show)count++;}for(const group of groups)group.hidden=![...group.querySelectorAll(".tile")].some(card=>!card.hidden);clear.hidden=!terms.length;if(nav)nav.hidden=!!terms.length;status.textContent=terms.length?(count?(hi?count+" टूल मिले":count+" tools found"):(hi?"कोई टूल नहीं मिला। दूसरा शब्द आजमाएं।":"No tools found. Try another word.")):"";}
input.addEventListener("input",filter);clear.addEventListener("click",()=>{input.value="";filter();input.focus();});input.addEventListener("keydown",e=>{if(e.key==="Escape"){input.value="";filter();}});box.hidden=false;filter();
})();