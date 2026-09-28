'use strict';
const POS={'上方修正':4,'最高益':4,'過去最高':4,'増益':2,'増収':2,'増配':3,'自社株買い':3,'大型受注':4,'受注':2,'業務提携':2,'黒字転換':4,'上振れ':3};
const NEG={'下方修正':-5,'赤字転落':-5,'赤字':-4,'減益':-3,'減収':-2,'不正':-5,'行政処分':-5,'希薄化':-3,'公募増資':-4,'債務超過':-6,'継続企業':-5,'不祥事':-5,'下振れ':-3};

const decode=s=>String(s||'')
  .replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n));
const strip=s=>decode(String(s||'')
  .replace(/<script[\s\S]*?<\/script>/gi,' ')
  .replace(/<style[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ')
).replace(/\s+/g,' ').trim();

const relayUrls=url=>[
  url,
  'https://corsproxy.io/?url='+encodeURIComponent(url),
  'https://api.allorigins.win/raw?url='+encodeURIComponent(url),
  'https://cors.isomorphic-git.org/'+url
];

async function fetchAny(url,timeout=12000){
  let last='';
  for(const u of relayUrls(url)){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
    try{
      const r=await fetch(u,{cache:'no-store',signal:ctl.signal,headers:{'Accept':'text/html,application/rss+xml,application/xml,text/plain,*/*'}});
      clearTimeout(timer);
      if(!r.ok)throw new Error('HTTP '+r.status);
      const text=await r.text();
      if(text.length<30)throw new Error('empty');
      return text;
    }catch(e){clearTimeout(timer);last=e.message||String(e)}
  }
  throw new Error(last||'取得失敗');
}
function classify(text){
  let score=0,pos=[],neg=[];
  for(const[k,v]of Object.entries(POS))if(text.includes(k)){score+=v;pos.push(k)}
  for(const[k,v]of Object.entries(NEG))if(text.includes(k)){score+=v;neg.push(k)}
  score=Math.max(-18,Math.min(18,score));
  const evaluation=score>=8?'強いプラス材料':score>=3?'プラス材料優勢':score<=-8?'強いマイナス材料':score<=-3?'マイナス材料優勢':'中立';
  return{score,positive:[...new Set(pos)],negative:[...new Set(neg)],evaluation};
}
function parseRss(xml){
  const out=[];const re=/<item>([\s\S]*?)<\/item>/gi;let m;
  while((m=re.exec(xml))&&out.length<10){
    const b=m[1],tm=b.match(/<title>([\s\S]*?)<\/title>/i),lm=b.match(/<link>([\s\S]*?)<\/link>/i),pm=b.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const title=strip(tm?tm[1]:'');
    if(title)out.push({title,url:strip(lm?lm[1]:''),published:strip(pm?pm[1]:'')});
  }
  return out;
}
function parseDuck(html){
  const out=[];const re=/<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;let m;
  while((m=re.exec(html))&&out.length<8)out.push({url:decode(m[1]),title:strip(m[2]),published:''});
  return out;
}
async function liveSearch(code,company){
  const terms=code+' '+(company||'')+' 株 決算 上方修正 下方修正 増配 自社株買い';
  const rss='https://news.google.com/rss/search?q='+encodeURIComponent(terms)+'&hl=ja&gl=JP&ceid=JP:ja';
  let results=[];
  try{results=parseRss(await fetchAny(rss,10000))}catch{}
  if(!results.length){
    const ddg='https://html.duckduckgo.com/html/?q='+encodeURIComponent(terms+' 最新ニュース');
    results=parseDuck(await fetchAny(ddg,12000));
  }
  const text=results.map(x=>x.title).join(' ');
  const sig=classify(text);
  return {sig,results,summary:{
    result_count:results.length,
    headline:results.length?results.slice(0,3).map(x=>x.title).join(' / '):'関連ニュースを取得できませんでした'
  }};
}
self.onmessage=async e=>{
  const {id,code,company}=e.data||{};if(!id||!code)return;
  try{
    const r=await liveSearch(code,company);
    self.postMessage({id,ok:true,code,company,...r,finishedAt:Date.now()});
  }catch(err){
    self.postMessage({id,ok:false,code,company,error:err.message||String(err),finishedAt:Date.now()});
  }
};
