(function pwa(){
"use strict";
/* Offline cache and install button. The service worker only stores this site's own files. */
if(!("serviceWorker" in navigator))return;
const local=location.hostname==="127.0.0.1"||location.hostname==="localhost";
if(location.protocol!=="https:"&&!local)return;
window.addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>{});});
const hindi=document.documentElement.lang==="hi";let deferred=null;
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferred=e;const footer=document.querySelector("footer");if(!footer||document.getElementById("install-app"))return;
const b=document.createElement("button");b.type="button";b.id="install-app";b.className="button";b.textContent=hindi?"ऐप इंस्टॉल करें":"Install app";
b.addEventListener("click",async()=>{if(!deferred)return;deferred.prompt();try{await deferred.userChoice;}catch(_){}deferred=null;b.remove();});footer.prepend(b);});
window.addEventListener("appinstalled",()=>document.getElementById("install-app")?.remove());
})();
