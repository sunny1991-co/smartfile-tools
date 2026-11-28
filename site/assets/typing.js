/* Typing speed test: Hindi (Remington/Kruti Dev keys or Unicode/Inscript) and English. Runs on the device. */
(function(root){
"use strict";
const passages={
hi:[
"डिजिटल भारत ने गांव और शहर के बीच की दूरी को काफी कम कर दिया है। आज किसान अपने मोबाइल फोन से फसल का भाव देख सकता है और छात्र घर बैठे परीक्षा का फॉर्म भर सकता है। बैंक का खाता खोलना, बिजली का बिल जमा करना और प्रमाण पत्र के लिए आवेदन करना अब पहले से आसान हो गया है। फिर भी हमें यह ध्यान रखना चाहिए कि हर नागरिक तक इंटरनेट की अच्छी सुविधा पहुंचे और लोग ऑनलाइन धोखाधड़ी से सावधान रहें। किसी अनजान व्यक्ति को अपना पासवर्ड या ओटीपी कभी नहीं बताना चाहिए।",
"शिक्षा किसी भी देश के विकास की नींव होती है। एक शिक्षित व्यक्ति न केवल अपना जीवन बेहतर बनाता है बल्कि समाज को भी सही दिशा देता है। सरकार ने प्राथमिक विद्यालयों में बच्चों के नामांकन को बढ़ाने के लिए कई योजनाएं चलाई हैं। मध्याह्न भोजन, निःशुल्क पुस्तकें और छात्रवृत्ति जैसी सुविधाओं से गरीब परिवारों के बच्चे भी पढ़ाई जारी रख पा रहे हैं। अब आवश्यकता इस बात की है कि शिक्षा की गुणवत्ता पर भी उतना ही ध्यान दिया जाए जितना संख्या पर।",
"पर्यावरण की रक्षा करना हम सभी का कर्तव्य है। तेजी से बढ़ते शहरों, कारखानों के धुएं और पेड़ों की कटाई के कारण हवा और पानी दोनों प्रदूषित हो रहे हैं। यदि हर व्यक्ति साल में कम से कम एक पेड़ लगाए और उसकी देखभाल करे तो स्थिति में बड़ा सुधार हो सकता है। प्लास्टिक की थैलियों के स्थान पर कपड़े के थैले का प्रयोग, पानी की बचत और सार्वजनिक परिवहन का उपयोग छोटे कदम हैं, लेकिन इनका प्रभाव बहुत बड़ा होता है।"
],
en:[
"Good typing is a skill that improves with steady practice rather than speed alone. Sit straight, keep your wrists relaxed and rest your fingers on the home row. Look at the screen instead of the keyboard and try to press each key with the correct finger. In the beginning your speed may fall, but accuracy will grow, and speed follows accuracy. Practise for fifteen minutes every day and note your result so that you can see your progress over a few weeks.",
"Many government and private offices now keep their records on computers, so clerks, data entry operators and assistants are often asked to pass a typing test. The test usually gives a printed or on-screen passage and a fixed time, such as ten minutes. Marks depend on the number of words typed and the number of mistakes. A missing word, an extra word or a spelling error is usually counted as a mistake, so read the instructions of your exam carefully.",
"A healthy routine helps students prepare better for competitive examinations. Wake up at a fixed time, plan the subjects for the day and take short breaks between long study sessions. Eat simple food, drink enough water and avoid using the phone late at night. Solving previous year papers under a time limit builds confidence and shows which topics need more attention. On the day of the exam, reach the centre early and keep your admit card and identity proof ready."
]};
const words=s=>String(s).trim().split(/\s+/u).filter(Boolean);
const norm=w=>w.normalize("NFC").replace(/[​-‍]/g,"");
/* Longest common subsequence of words, returning matched index pairs. */
function align(a,b){const n=a.length,m=b.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);const pairs=[];let i=0,j=0;while(i<n&&j<m){if(a[i]===b[j]){pairs.push([i,j]);i++;j++;}else if(dp[i+1][j]>=dp[i][j+1])i++;else j++;}return pairs;}
/* Mistakes: wrong, extra or skipped words (word-level comparison). */
function score(passage,typed,seconds){const exp=words(passage).map(norm),got=words(typed).map(norm).slice(0,2000);const pairs=align(exp.slice(0,Math.min(exp.length,got.length+50)),got);const correct=pairs.length;/* Each gap between matched words counts max(typed, expected) mistakes: a wrong word is one mistake, not two. After the last match only extra typed words count. */let mistakes=0,omitted=0,pe=-1,pg=-1;for(const [ei,gj] of pairs){const e=ei-pe-1,g=gj-pg-1;mistakes+=Math.max(e,g);omitted+=Math.max(0,e-g);pe=ei;pg=gj;}mistakes+=got.length-pg-1;const wrong=mistakes-omitted;const minutes=Math.max(seconds,6)/60;const gross=got.length/minutes,net=Math.max(0,(got.length-mistakes)/minutes);const accuracy=got.length?Math.round(1000*correct/(correct+mistakes))/10:0;
const list=[];let pi=0,prevE=-1;for(const [ei,gj] of pairs.concat([[exp.length,got.length]])){let k=prevE+1;while(pi<gj&&list.length<25){list.push({typed:got[pi],expected:k<ei?exp[k]:""});k++;pi++;}pi=gj+1;prevE=ei;}
return {typedWords:got.length,correct,wrong,omitted,mistakes,gross:Math.round(gross*10)/10,net:Math.round(net*10)/10,accuracy,minutes:Math.round(minutes*100)/100,keystrokes:Array.from(String(typed)).length,samples:list};}
root.SmartTyping={passages,score,words,align};
if(typeof module==="object"&&module.exports)module.exports=root.SmartTyping;
})(typeof globalThis!=="undefined"?globalThis:this);
