'use strict';
const POS={'上方修正':4,'最高益':4,'過去最高':4,'増益':2,'増収':2,'増配':3,'自社株買い':3,'大型受注':4,'受注':2,'業務提携':2,'黒字転換':4,'上振れ':3};
const NEG={'下方修正':-5,'赤字転落':-5,'赤字':-4,'減益':-3,'減収':-2,'不正':-5,'行政処分':-5,'希薄化':-3,'公募増資':-4,'債務超過':-6,'継続企業':-5,'不祥事':-5,'下振れ':-3};
const strip=s=>String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/\s+/g,' ').trim();
const relays=url=>[url,'https://corsproxy.io/?url='+encodeURIComponent(url),'https://api.allorigins.win/raw?url='+encodeURIComponent(url),'https://cors.isomorphic-git.org/'+url];
async function fetchAny(url){
  let last='';
  for(const u of relays(url)){
    const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),18000);
    try{const r=await fetch(u,{cache:'no-store',signal:ctl.signal});clearTimeout(t);if(!r.ok)throw new Error('HTTP '+r.status);const text=await r.text();if(text.length<30)throw new Error('empty');return text}catch(e){clearTimeout(t);last=e.message||String(e)}
  }
  throw new Error(last||'取得失敗');
}
function classify(text){let score=0,pos=[],neg=[];for(const[k,v]of Object.entries(POS))if(text.includes(k)){score+=v;pos.push(k)}for(const[k,v]of Object.entries(NEG))if(text.includes(k)){score+=v;neg.push(k)}return{score:Math.max(-18,Math.min(18,score)),positive:[...new Set(pos)],negative:[...new Set(neg)]}}
function links(html){
  const out=[];const re=/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))&&out.length<8)out.push({url:m[1].replace(/&amp;/g,'&'),title:strip(m[2])});
  return out;
}
self.onmessage=async e=>{
  const {id,code,company}=e.data||{};if(!id||!code)return;
  try{
    const q=encodeURIComponent(`${code} ${company||''} 決算 上方修正 下方修正 最新ニュース`);
    const url='https://html.duckduckgo.com/html/?q='+q;
    const html=await fetchAny(url),text=strip(html),sig=classify(text);
    self.postMessage({id,ok:true,code,company,sig,results:links(html),finishedAt:Date.now()});
  }catch(err){self.postMessage({id,ok:false,code,company,error:err.message||String(err),finishedAt:Date.now()})}
};
