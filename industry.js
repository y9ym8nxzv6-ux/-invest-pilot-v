'use strict';
/*
 Industry comparison of cached fundamentals; the cohort is NOT the entire JPX industry.
 References are drawn only from stocks whose fundamentals were successfully fetched.
 Exclude the subject from the peer average, so its own data cannot distort its comparison.
*/
const IPIndustry=(()=>{
  const METRICS=[
    {key:'revenueGrowth',label:'売上成長率',unit:'%',direction:1,min:-1,max:5,scale:.06},
    {key:'earningsGrowth',label:'利益成長率',unit:'%',direction:1,min:-1,max:5,scale:.12},
    {key:'returnOnEquity',label:'ROE',unit:'%',direction:1,min:-1,max:2,scale:.045},
    {key:'operatingMargins',label:'営業利益率',unit:'%',direction:1,min:-1,max:1,scale:.035},
    {key:'trailingPE',label:'PER',unit:'倍',direction:-1,min:0,max:150,scale:8}
  ];
  const SYMBOLS=[{symbol:'✕',label:'同業比較で弱め',kind:'negative',points:-2},
    {symbol:'△',label:'同業比較でやや弱い',kind:'negative',points:-1},
    {symbol:'－',label:'同業平均並み',kind:'neutral',points:0},
    {symbol:'○',label:'同業比較でやや上',kind:'positive',points:1},
    {symbol:'◎',label:'同業比較で強い',kind:'positive',points:2},
    {symbol:'⭐',label:'同業比較で際立つ',kind:'excellent',points:3}];
  const has=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n));
  const valid=(m,n)=>has(n)&&Number(n)>=m.min&&(m.key!=='trailingPE'||Number(n)>0)&&Number(n)<=m.max;
  function make(stocks,listed){
    const cohort=new Map(),industryByCode=new Map();
    const names=new Map();
    for(const s of listed||[]){
      const code=String(s.code||'');
      if(code)names.set(code,String(s.sector33||'').trim());
    }
    for(const [code,stock] of stocks instanceof Map?stocks.entries():Object.entries(stocks||{})){
      const sector=String(stock.sector33||names.get(String(code))||'').trim();
      industryByCode.set(String(code),sector);
      if(!sector||(!Number.isFinite(Number(stock.metrics_available))||Number(stock.metrics_available)<2))continue;
      let sample=cohort.get(sector);
      if(!sample){sample={members:new Set(),values:Object.fromEntries(METRICS.map(m=>[m.key,[]]))};cohort.set(sector,sample);}
      sample.members.add(String(code));
      for(const m of METRICS){
        if(valid(m,stock[m.key]))sample.values[m.key].push({code:String(code),value:Number(stock[m.key])});
      }
    }
    return {cohort,industryByCode};
  }
  function category(delta,z,n,positiveRank){
    if(delta<=-1.2)return SYMBOLS[0];
    if(delta<=-.4)return SYMBOLS[1];
    if(delta<.4)return SYMBOLS[2];
    if(delta<1.1)return SYMBOLS[3];
    if(delta<2.1)return SYMBOLS[4];
    return n>=9&&positiveRank>=.9?SYMBOLS[5]:SYMBOLS[4];
  }
  function gradeMetric(m,own,peers){
    const vals=peers.map(x=>x.value);
    if(!valid(m,own)||vals.length<3)return {metric:m.key,value:has(own)?Number(own):null,average:null,n:vals.length,
      symbol:'－',grade:'比較対象不足',kind:'neutral',points:0,comparable:false};
    const mean=vals.reduce((a,b)=>a+b,0)/vals.length;
    const variance=vals.reduce((a,b)=>a+(b-mean)**2,0)/vals.length;
    const sd=Math.sqrt(variance);
    const raw=(Number(own)-mean)*m.direction;
    const effectiveScale=Math.max(m.scale,sd);
    const standardized=raw/effectiveScale;
    const goodRank=vals.filter(v=>(Number(own)-v)*m.direction>0).length/vals.length;
    const g=category(raw/effectiveScale,standardized,vals.length,goodRank);
    const slight=Math.max(m.key==='trailingPE'?1.5:.007,m.scale*.1);
    const color=raw>slight?'positive':raw<-slight?'negative':'neutral';
    return {metric:m.key,value:Number(own),average:mean,n:vals.length,
      symbol:g.symbol,grade:g.label,kind:color,points:g.points,comparable:true,
      delta:raw,relativeStrength:standardized};
  }
  function compare(code,stock,model){
    const id=String(code),sector=model?.industryByCode?.get(id)||String(stock?.sector33||'').trim();
    const values=model?.cohort?.get(sector);
    const metrics=METRICS.map(m=>gradeMetric(m,stock?.[m.key],
      (values?.values[m.key]||[]).filter(x=>x.code!==id)));
    const usable=metrics.filter(x=>x.comparable);
    const members=values?.members.size||0;
    if(usable.length<3){
      return {sector:sector||'業種不明',industrySize:members,sampleSource:'取得可能なTOP100銘柄の同業企業',metrics,
        symbol:'－',label:'比較データ不足',kind:'neutral',comparable:false,used:usable.length};
    }
    const avg=usable.reduce((sum,x)=>sum+x.points,0)/usable.length;
    const peersMin=Math.min(...usable.map(x=>x.n));
    let grade;
    if(avg<=-1.05)grade=SYMBOLS[0];
    else if(avg<=-.4)grade=SYMBOLS[1];
    else if(avg<.4)grade=SYMBOLS[2];
    else if(avg<1.08)grade=SYMBOLS[3];
    else if(avg<2.15)grade=SYMBOLS[4];
    else if(peersMin>=9&&usable.length>=4&&usable.filter(x=>x.points>=2).length>=3)grade=SYMBOLS[5];
    else grade=SYMBOLS[4];
    return {sector,industrySize:members,sampleSource:'取得可能なTOP100銘柄の同業企業',metrics,
      symbol:grade.symbol,label:grade.label,kind:grade.points>0?'positive':grade.points<0?'negative':'neutral',
      comparable:true,used:usable.length,minimumPeers:peersMin};
  }
  return {METRICS,make,compare,valid,gradeMetric};
})();
globalThis.IPIndustry=IPIndustry;
