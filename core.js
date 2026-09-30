'use strict';

const IPCore = (() => {
  const POS_TERMS = {'上方修正':4,'最高益':4,'過去最高':4,'増益':2,'増収':2,'増配':3,'自社株買い':3,'大型受注':4,'受注':2,'業務提携':2,'黒字転換':4,'上振れ':3};
  const NEG_TERMS = {'下方修正':-5,'赤字転落':-5,'赤字':-4,'減益':-3,'減収':-2,'不正':-5,'行政処分':-5,'希薄化':-3,'公募増資':-4,'債務超過':-6,'継続企業':-5,'不祥事':-5,'下振れ':-3};
  const SEMI_BASE = {
    chips:['285A','6526','6723','6963'],
    equipment_test:['6146','6227','6235','6298','6315','6323','6337','6387','6855','6857','6871','6875','7725','7729','7735','8035'],
    materials_components:['2760','3132','3436','3445','4004','4062','4063','4186','4369','6055','6266','6525','6590','6668','6728','6730','6920','6941','8155']
  };
  const DEMO = [
    {code:'6857',company:'アドバンテスト',market:'プライム',sector33:'電気機器',close:18520,ret20:.072,ret60:.184,ret120:.255,ret250:.481,trend_count:4,technical_score:91.4,is_semiconductor:true,adjustment_events:0},
    {code:'4063',company:'信越化学工業',market:'プライム',sector33:'化学',close:5120,ret20:.021,ret60:.112,ret120:.148,ret250:.218,trend_count:4,technical_score:84.2,is_semiconductor:true,adjustment_events:0},
    {code:'7011',company:'三菱重工業',market:'プライム',sector33:'機械',close:3820,ret20:.054,ret60:.091,ret120:.203,ret250:.341,trend_count:4,technical_score:88.7,is_semiconductor:false,adjustment_events:0},
    {code:'5803',company:'フジクラ',market:'プライム',sector33:'非鉄金属',close:14780,ret20:.083,ret60:.162,ret120:.295,ret250:.612,trend_count:4,technical_score:90.1,is_semiconductor:false,adjustment_events:0},
    {code:'7203',company:'トヨタ自動車',market:'プライム',sector33:'輸送用機器',close:3165,ret20:-.011,ret60:.045,ret120:.087,ret250:.122,trend_count:3,technical_score:69.8,is_semiconductor:false,adjustment_events:0},
    {code:'8035',company:'東京エレクトロン',market:'プライム',sector33:'電気機器',close:33850,ret20:.031,ret60:.152,ret120:.211,ret250:.294,trend_count:4,technical_score:86.5,is_semiconductor:true,adjustment_events:0}
  ];

  const normText = s => String(s ?? '').replace(/\s+/g,' ').trim();
  const cleanCode = s => String(s ?? '').trim().replace(/\.0$/,'').toUpperCase();
  const num = v => { const n = Number(String(v ?? '').replaceAll(',','').replaceAll('—','').trim()); return Number.isFinite(n) ? n : null; };
  const htmlDecode = s => String(s||'').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');
  const stripTags = s => normText(htmlDecode(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')));

  function parseJpDateLabel(text){
    text=normText(text); let m=text.match(/(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/); if(m)return {kind:'day',key:`${m[1]}-${String(+m[2]).padStart(2,'0')}-${String(+m[3]).padStart(2,'0')}`};
    m=text.match(/(20\d{2})年\s*(\d{1,2})月/); if(m)return {kind:'month',key:`${m[1]}-${String(+m[2]).padStart(2,'0')}`}; return null;
  }
  function parseDateInt(v, fallback=null){
    if(v===null||v===undefined||v==='') return fallback;
    let s=String(v).trim(); let m=s.match(/(20\d{2})[^0-9]?(\d{1,2})[^0-9]?(\d{1,2})/);
    if(!m && /^\d{8}$/.test(s)) m=[s,s.slice(0,4),s.slice(4,6),s.slice(6,8)];
    if(!m) return fallback; const y=+m[1],mo=+m[2],d=+m[3]; if(mo<1||mo>12||d<1||d>31)return fallback; return y*10000+mo*100+d;
  }
  function dateIntToISO(d){ if(!d)return ''; const s=String(d); return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`; }
  function inferDateFromName(name,fallback=null){ let m=String(name).match(/(20\d{2})[-_]?(\d{2})[-_]?(\d{2})/); if(!m)m=String(name).match(/(?:^|\D)(\d{2})(\d{2})(\d{2})(?:\D|$)/); if(!m)return fallback; let y=+m[1]; if(y<100)y+=2000; return y*10000+(+m[2])*100+(+m[3]); }

  function discoverLinks(html, baseUrl, target='prices'){
    let section=''; const out=[]; const re=/<(h[1-4]|a)\b([^>]*)>([\s\S]*?)<\/\1>/gi; let m;
    while((m=re.exec(html))){ const tag=m[1].toLowerCase(), attrs=m[2], label=stripTags(m[3]);
      if(tag!=='a'){
        if(target==='prices'){
          if(label==='株価データ'||(label.includes('株価データ')&&!label.includes('信用'))) section='prices';
          else if(section==='prices'&&(label.includes('信用取引')||label.includes('株式分割'))) section='other';
        } else {
          if(label.includes('株式分割・併合データ')) section='splits';
          else if(section==='splits'&&(label.includes('公開の趣旨')||label==='株価データ'||label.includes('信用取引'))) section='other';
        }
        continue;
      }
      if(section!==target) continue;
      const hm=attrs.match(/href\s*=\s*["']([^"']+)["']/i); if(!hm)continue;
      let kind,key;
      if(target==='prices'){ const p=parseJpDateLabel(label); if(!p)continue; ({kind,key}=p); }
      else { let mm=label.match(/^(20\d{2})年\s*(\d{1,2})月$/); if(mm){kind='month';key=`${mm[1]}-${String(+mm[2]).padStart(2,'0')}`;} else {mm=label.match(/^(20\d{2})年$/);if(!mm)continue;kind='year';key=mm[1];} }
      let url; try{url=new URL(htmlDecode(hm[1]),baseUrl).toString()}catch{continue}
      out.push({kind,key,label,url});
    }
    const seen=new Set(); return out.filter(x=>!seen.has(x.url)&&(seen.add(x.url),true));
  }
  function selectPriceLinks(links,months){
    const days=links.filter(x=>x.kind==='day').sort((a,b)=>a.key.localeCompare(b.key));
    const mons=links.filter(x=>x.kind==='month').sort((a,b)=>a.key.localeCompare(b.key)).slice(-months);
    const combined=[...mons,...days].sort((a,b)=>a.key.localeCompare(b.key)); const seen=new Set(); return combined.filter(x=>!seen.has(x.url)&&(seen.add(x.url),true));
  }
  function monthOrdinal(key){const m=String(key).match(/(\d{4})-(\d{2})/);return m?(+m[1])*12+(+m[2])-1:0}
  function selectSplitLinks(links,months,now=new Date()){
    const cutoff=(now.getFullYear()*12+now.getMonth())-(months+1); const cy=now.getFullYear();
    return links.filter(x=>x.kind==='month'?monthOrdinal(x.key)>=cutoff:(+x.key>=Math.floor(cutoff/12)&&+x.key<cy)).sort((a,b)=>a.key.localeCompare(b.key));
  }
  function parseRatioText(value){ const t=normText(value); const m=t.match(/(\d+(?:\.\d+)?)\s*[:：]\s*(\d+(?:\.\d+)?)/); if(!m)return null; const old=+m[1],neu=+m[2]; if(!(old>0&&neu>0)||Math.abs(old-neu)<1e-12)return null; const type=(t.includes('併合')||old>neu)?'consolidation':(t.includes('分割')||neu>old)?'split':null; return type?{old,new:neu,type,factor:old/neu,raw:t}:null; }

  function parseCSVLine(line,sep=','){
    const out=[]; let cur='',q=false;
    for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}else if(ch===sep&&!q){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out;
  }
  function findCol(headers,cands){ const hs=headers.map(x=>normText(x).toLowerCase()); for(const c of cands){const i=hs.indexOf(c.toLowerCase());if(i>=0)return i;} for(let i=0;i<hs.length;i++)if(cands.some(c=>hs[i].includes(c.toLowerCase())))return i; return -1; }
  function decodeBytes(bytes){
    let utf='',sj=''; try{utf=new TextDecoder('utf-8',{fatal:false}).decode(bytes)}catch{} try{sj=new TextDecoder('shift_jis',{fatal:false}).decode(bytes)}catch{}
    const score=t=>(t.match(/�/g)||[]).length*10-(t.match(/[日年月銘柄終値出来高市場]/g)||[]).length; return score(sj)<score(utf)?sj:utf;
  }
  function parseDelimitedText(text,defaultDate=null,source=''){
    const lines=String(text).split(/\r?\n/).filter(x=>x.trim()&&!x.trim().startsWith('!')); if(lines.length<2)return [];
    const sep=(lines[0].split('\t').length>lines[0].split(',').length)?'\t':','; const headers=parseCSVLine(lines[0],sep).map(normText);
    const ci=findCol(headers,['code','コード','銘柄コード','証券コード']); const di=findCol(headers,['date','日付','年月日','取引日']); const xi=findCol(headers,['close','終値','終値(円)','終値 円','closing']);
    const vi=findCol(headers,['volume','出来高','売買高']); const vali=findCol(headers,['value','売買代金','turnover']); const ni=findCol(headers,['company','会社名','銘柄名','銘柄名称','name']); const mi=findCol(headers,['market','市場区分','市場']); const si=findCol(headers,['sector33','33業種区分','業種','業種名']);
    if(ci<0||xi<0)return []; const out=[];
    for(let li=1;li<lines.length;li++){const r=parseCSVLine(lines[li],sep); if(r.length<=Math.max(ci,xi))continue; const code=cleanCode(r[ci]); const close=num(r[xi]); const date=di>=0?parseDateInt(r[di],defaultDate):defaultDate; if(!code||!date||!(close>0))continue; const volume=vi>=0?num(r[vi]):null, value=vali>=0?num(r[vali]):null; out.push({code,date,close,volume,value,company:ni>=0?normText(r[ni]):'',market:mi>=0?normText(r[mi]):'',sector33:si>=0?normText(r[si]):'',source}); }
    return out;
  }
  function parseSplitDelimitedText(text,source=''){
    const lines=String(text).split(/\r?\n/).filter(x=>x.trim()&&!x.trim().startsWith('!')); if(lines.length<2)return [];
    const sep=(lines[0].split('\t').length>lines[0].split(',').length)?'\t':','; const headers=parseCSVLine(lines[0],sep).map(normText);
    const ci=findCol(headers,['code','コード','銘柄コード','証券コード']); const di=findCol(headers,['権利落ち日','権利落日','ex-rights date','ex_date','効力発生日']); const ri=findCol(headers,['分割比率','割当率','split ratio','ratio']); if(ci<0||di<0)return [];
    const out=[];
    for(let li=1;li<lines.length;li++){const r=parseCSVLine(lines[li],sep); const code=cleanCode(r[ci]);const date=parseDateInt(r[di]);if(!code||!date)continue; let p=null; const cand=[]; if(ri>=0)cand.push(r[ri]); cand.push(...r); for(const v of cand){p=parseRatioText(v);if(p)break;} if(p)out.push({code,ex_date:date,event_type:p.type,ratio_old:p.old,ratio_new:p.new,price_factor:p.factor,raw_text:p.raw,source}); }
    return out;
  }
  function appendRows(priceMap,rows){
    for(const r of rows){let x=priceMap.get(r.code);if(!x){x={code:r.code,company:r.company||'',market:r.market||'',sector33:r.sector33||'',points:[]};priceMap.set(r.code,x)} if(!x.company&&r.company)x.company=r.company;if(!x.market&&r.market)x.market=r.market;if(!x.sector33&&r.sector33)x.sector33=r.sector33; const val=(r.value!=null&&r.value>0)?r.value:((r.volume!=null&&r.volume>0)?r.volume*r.close:null); x.points.push([r.date,r.close,val]);}
  }
  function normalizePriceMap(priceMap,maxPoints=700){
    for(const [code,x] of priceMap){x.points.sort((a,b)=>a[0]-b[0]);const ded=[];for(const p of x.points){if(ded.length&&ded[ded.length-1][0]===p[0])ded[ded.length-1]=p;else ded.push(p)}x.points=ded.slice(-maxPoints);if(x.points.length<6)priceMap.delete(code)} return priceMap;
  }
  function applyCorporateActions(priceMap,actions){
    const by=new Map(); for(const a of actions){if(!by.has(a.code))by.set(a.code,[]);by.get(a.code).push(a)}
    for(const [code,events] of by){const x=priceMap.get(code);if(!x)continue;events.sort((a,b)=>a.ex_date-b.ex_date);for(const p of x.points){let factor=1;for(const e of events)if(p[0]<e.ex_date)factor*=e.price_factor;p[1]*=factor;}x.adjustment_events=events.length;} return priceMap;
  }
  function percentileRanks(obj){const vals=Object.entries(obj).filter(([,v])=>Number.isFinite(v)).sort((a,b)=>a[1]-b[1]);const out={};Object.keys(obj).forEach(k=>out[k]=.5); if(vals.length<=1)return out;vals.forEach(([k],i)=>out[k]=i/(vals.length-1));return out;}
  function isCommonEquity(code,company=''){ if(!/^\d{3}[0-9A-Z]$/.test(code))return false; const n=String(company).toUpperCase(); const bad=['ETF','ETN','REIT','投資法人','上場投信','インバース','レバレッジ','ブル','ベア','NEXT FUNDS','ISHARES']; return !bad.some(k=>n.includes(k)); }
  function semiSet(extra=[],exclude=[]){const s=new Set(Object.values(SEMI_BASE).flat().map(cleanCode));extra.map(cleanCode).filter(Boolean).forEach(x=>s.add(x));exclude.map(cleanCode).filter(Boolean).forEach(x=>s.delete(x));return s;}
  function semiconductorInfo(code,company='',theme={}){const set=semiSet(theme.extra||[],theme.exclude||[]); const key=cleanCode(code);const kw=/半導体|SEMICONDUCTOR/i.test(company||''); let category='';for(const [k,v] of Object.entries(SEMI_BASE))if(v.includes(key))category=k;if(set.has(key)||kw)return {is_semiconductor:true,category:category||'keyword'};return {is_semiconductor:false,category:''};}
  function modeOK(item,mode){return mode==='all'||(mode==='exclude'?!item.is_semiconductor:item.is_semiconductor)}
  function buildRawMetrics(priceMap,atDate=null,theme={}){
    const raw=[];
    for(const [code,x] of priceMap){if(!isCommonEquity(code,x.company))continue;let pts=x.points;let idx=pts.length-1;if(atDate){idx=upperBoundDate(pts,atDate);if(idx<0)continue} if(idx<250)continue;const c=pts[idx][1];if(!(c>0))continue;const ret=n=>pts[idx-n]?.[1]>0?c/pts[idx-n][1]-1:null;const avg=n=>{let s=0,k=0;for(let i=Math.max(0,idx-n+1);i<=idx;i++){const v=pts[i][1];if(v>0){s+=v;k++}}return k?s/k:null};const trend=[20,60,120,250].reduce((a,n)=>a+(avg(n)!=null&&c>avg(n)?1:0),0);let vals=[];for(let i=Math.max(0,idx-19);i<=idx;i++){if(pts[i][2]>0)vals.push(pts[i][2])}const avgValue=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0;const semi=semiconductorInfo(code,x.company,theme);raw.push({code,company:x.company||code,market:x.market||'',sector33:x.sector33||'',close:c,ret5:ret(5),ret20:ret(20),ret60:ret(60),ret120:ret(120),ret250:ret(250),trend_count:trend,avg_value:avgValue,adjustment_events:x.adjustment_events||0,...semi});}
    return raw;
  }
  function rankMetrics(raw){
    const metrics=['ret20','ret60','ret120','ret250','avg_value'];const ranks={};for(const m of metrics){const o={};raw.forEach(x=>o[x.code]=x[m]);ranks[m]=percentileRanks(o)}
    for(const x of raw){let score=100*(.28*ranks.ret20[x.code]+.28*ranks.ret60[x.code]+.18*ranks.ret120[x.code]+.12*ranks.ret250[x.code]+.10*(x.trend_count/4)+.04*ranks.avg_value[x.code]); if(x.ret20>.40)score-=Math.min(10,(x.ret20-.40)*20); if(x.ret20<-.20)score-=4;x.technical_score=Math.max(0,Math.min(100,score));}
    return raw.sort((a,b)=>b.technical_score-a.technical_score);
  }
  function scorePriceMap(priceMap,theme={}){return rankMetrics(buildRawMetrics(priceMap,null,theme));}
  function upperBoundDate(points,date){let lo=0,hi=points.length-1,ans=-1;while(lo<=hi){const m=(lo+hi)>>1;if(points[m][0]<=date){ans=m;lo=m+1}else hi=m-1}return ans;}
  function singleLimitPct(capital,risk='mid'){let b=capital<300000?15:capital<1e6?12:capital<5e6?8:6;if(risk==='low')b*=.75;if(risk==='high')b*=1.25;return Math.max(4,Math.min(18,b));}
  function budgetFor(score,capital,risk,rank){const lim=capital*singleLimitPct(capital,risk)/100,dec=Math.max(.45,1-Math.max(0,rank-1)*.045),mult=Math.max(.45,Math.min(1,score/88)),raw=lim*dec*mult,step=capital<1e6?1000:10000;return Math.max(0,Math.floor(raw/step)*step)}
  function decorateForCapital(items,capital=100000,risk='mid',lot=1,mode='all'){return items.filter(x=>modeOK(x,mode)).slice(0,100).map((x,i)=>{const globalRank=Number.isFinite(Number(x.rank))&&Number(x.rank)>0?Number(x.rank):i+1;const budget=budgetFor(x.technical_score,capital,risk,i+1);const shares=x.close>0?Math.floor(budget/(x.close*lot))*lot:0;return {...x,rank:globalRank,filtered_position:i+1,budget_yen:budget,shares_by_budget:shares}})}
  function buildPurchasePlan(stock,{capital=100000,risk='mid',lot=1,price=null,history=[]}={}){
    const totalCapital=Math.max(0,Number(capital)||0);
    const unit=Math.max(1,Math.floor(Number(lot)||1));
    const effectivePrice=Number(price)>0?Number(price):Number(stock?.close);
    const rank=Math.max(1,Math.min(100,Number(stock?.filtered_position)||Number(stock?.rank)||1));
    const score=Number(stock?.technical_score)||0;
    const budget=Number.isFinite(Number(stock?.budget_yen))&&Number(stock?.budget_yen)>=0
      ? Number(stock.budget_yen):budgetFor(score,totalCapital,risk,rank);
    const minRequired=effectivePrice>0?effectivePrice*unit:null;
    const shares=minRequired>0?Math.max(0,Math.floor((budget+1e-7)/minRequired))*unit:0;
    const total=shares>0?shares*effectivePrice:0;
    const valid=(Array.isArray(history)?history:[]).map(x=>Number(x?.close))
      .filter(x=>Number.isFinite(x)&&x>0).slice(-10);
    return {
      price:effectivePrice>0?effectivePrice:null,
      min_price:valid.length>=2?Math.min(...valid):null,
      max_price:valid.length>=2?Math.max(...valid):null,
      count:valid.length,
      budget_yen:budget,capital_yen:totalCapital,lot:unit,
      shares,estimated_total:total,min_required:minRequired,
      total_capital_insufficient:minRequired!==null&&minRequired>totalCapital,
      allocation_insufficient:minRequired!==null&&minRequired>budget,
      within_budget:shares>0&&total<=budget+1e-5
    };
  }
  function maxDrawdown(vals){let peak=-Infinity,mdd=0;for(const v of vals){peak=Math.max(peak,v);if(peak>0)mdd=Math.min(mdd,v/peak-1)}return mdd}
  function runBacktest(priceMap,{mode='all',capital=100000,risk='mid',lot=1,topN=10,rebalanceDays=20,costBps=10,reserve=.10,theme={}}={}){
    const dates=[...new Set([...priceMap.values()].flatMap(x=>x.points.map(p=>p[0])))].sort((a,b)=>a-b); if(dates.length<275)throw new Error('履歴が短すぎます。24か月履歴を取得してください。');
    const cost=costBps/10000;let cap=capital,bench=1;const curve=[{date:dateIntToISO(dates[250]),strategy:1,benchmark:1}];let periods=0,skipped=0,semiCount=0;
    for(let di=250;di+rebalanceDays<dates.length;di+=rebalanceDays){const d0=dates[di],d1=dates[Math.min(di+rebalanceDays,dates.length-1)];const ranked=rankMetrics(buildRawMetrics(priceMap,d0,theme)).filter(x=>modeOK(x,mode));if(ranked.length<3)continue;const available=cap*(1-reserve),slot=Math.min(available/topN,cap*singleLimitPct(cap,risk)/100);let cash=cap,positions=[],picked=0;
      for(const x of ranked){if(picked>=topN)break;const qty=Math.floor(slot/(x.close*lot))*lot;if(qty<lot){skipped++;continue}const buy=qty*x.close*(1+cost);if(buy>cash)continue;const series=priceMap.get(x.code).points,ei=upperBoundDate(series,d1);if(ei<0)continue;const exit=series[ei][1];if(!(exit>0))continue;cash-=buy;positions.push({qty,exit,is_semiconductor:x.is_semiconductor});picked++;}
      let end=cash;for(const p of positions)end+=p.qty*p.exit*(1-cost);if(positions.length===0)continue;semiCount+=positions.filter(x=>x.is_semiconductor).length;
      const universeR=[];for(const x of ranked.slice(0,Math.min(80,ranked.length))){const s=priceMap.get(x.code).points,ei=upperBoundDate(s,d1);if(ei>=0&&s[ei][1]>0)universeR.push(s[ei][1]/x.close-1)}const br=universeR.length?universeR.reduce((a,b)=>a+b,0)/universeR.length:0;bench*=1+br;cap=end;periods++;curve.push({date:dateIntToISO(d1),strategy:cap/capital,benchmark:bench});}
    if(!periods)throw new Error('売買可能な検証期間がありません。履歴または資金額を増やしてください。');const vals=curve.map(x=>x.strategy);return {periods,ending_capital:cap,total_return:cap/capital-1,max_drawdown:maxDrawdown(vals),benchmark_return:bench-1,curve,skipped_unaffordable:skipped,avg_semiconductor_selected:semiCount/periods,start_date:curve[0].date,end_date:curve.at(-1).date};
  }
  function classifyText(text){let score=0,pos=[],neg=[];for(const [k,v] of Object.entries(POS_TERMS))if(text.includes(k)){score+=v;pos.push(k)}for(const [k,v] of Object.entries(NEG_TERMS))if(text.includes(k)){score+=v;neg.push(k)}return {score:Math.max(-18,Math.min(18,score)),positive:[...new Set(pos)],negative:[...new Set(neg)]};}
  async function parseArchiveBuffer(buffer,link,isSplit=false,ZipImpl=globalThis.JSZip){ if(!ZipImpl)throw new Error('JSZip unavailable'); const u8=new Uint8Array(buffer); const out=[]; if(u8[0]===0x50&&u8[1]===0x4b){ const zip=await ZipImpl.loadAsync(buffer); const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir&&/\.(csv|txt)$/i.test(n)).sort(); for(const name of names){ const bytes=await zip.files[name].async('uint8array'); const text=decodeBytes(bytes); const def=inferDateFromName(name,link?.kind==='day'?parseDateInt(link.key):null); out.push(...(isSplit?parseSplitDelimitedText(text,(link?.url||'')+'#'+name):parseDelimitedText(text,def,(link?.url||'')+'#'+name))); } } else { const text=decodeBytes(u8),def=inferDateFromName(link?.label||'',link?.kind==='day'?parseDateInt(link.key):null); out.push(...(isSplit?parseSplitDelimitedText(text,link?.url||''):parseDelimitedText(text,def,link?.url||''))); } return out; }
  return {POS_TERMS,NEG_TERMS,SEMI_BASE,DEMO,normText,cleanCode,num,htmlDecode,stripTags,parseJpDateLabel,parseDateInt,dateIntToISO,inferDateFromName,discoverLinks,selectPriceLinks,selectSplitLinks,parseRatioText,parseCSVLine,decodeBytes,parseDelimitedText,parseSplitDelimitedText,appendRows,normalizePriceMap,applyCorporateActions,semiconductorInfo,modeOK,scorePriceMap,rankMetrics,buildRawMetrics,singleLimitPct,budgetFor,decorateForCapital,buildPurchasePlan,runBacktest,classifyText,parseArchiveBuffer,upperBoundDate};
})();
if(typeof globalThis!=='undefined')globalThis.IPCore=IPCore;

