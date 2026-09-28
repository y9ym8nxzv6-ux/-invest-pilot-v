'use strict';

const fs=require('fs');
const path=require('path');
require(path.join(__dirname,'..','core.js'));
const IPCore=globalThis.IPCore;
if(!IPCore)throw new Error('IPCore unavailable');

const ROOT=path.resolve(__dirname,'..');
const TEMP='/tmp/invest-pilot-optimizer-history.json';
const FALLBACK=path.join(ROOT,'data','backtest-history.json');
const OUT=path.join(ROOT,'data','strategy-config.json');
const DAYS=[10,20,40,60,100];

function median(v){
  const a=[...v].sort((x,y)=>x-y);
  if(!a.length)return 0;
  const m=Math.floor(a.length/2);
  return a.length%2?a[m]:(a[m-1]+a[m])/2;
}
function stdev(v){
  if(v.length<2)return 0;
  const m=v.reduce((a,b)=>a+b,0)/v.length;
  return Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length);
}
function annualize(totalReturn,tradingDays){
  const base=Math.max(0.0001,1+Number(totalReturn||0));
  return Math.pow(base,252/Math.max(1,tradingDays))-1;
}
function toMap(hist,startIdx=0,endIdx=null){
  const dates=hist.dates||[];
  const end=endIdx==null?dates.length:Math.min(dates.length,endIdx);
  const map=new Map();
  for(const [code,s] of Object.entries(hist.stocks||{})){
    const closes=s.closes||[],pts=[];
    for(let i=Math.max(0,startIdx);i<end&&i<closes.length;i++){
      const cl=Number(closes[i]);
      if(Number.isFinite(cl)&&cl>0)pts.push([Number(dates[i]),cl,null]);
    }
    if(pts.length>=275)map.set(code,{code,company:s.company||code,market:s.market||'',sector33:s.sector33||'',points:pts});
  }
  return map;
}
function windows(hist){
  const n=(hist.dates||[]).length;
  if(n>=1100){
    const len=Math.min(850,n);
    return [
      {name:'前半',start:0,end:len},
      {name:'中盤',start:Math.floor((n-len)/2),end:Math.floor((n-len)/2)+len},
      {name:'直近',start:n-len,end:n}
    ];
  }
  if(n>=800){
    const len=450;
    return [
      {name:'前半',start:0,end:len},
      {name:'中盤',start:Math.floor((n-len)/2),end:Math.floor((n-len)/2)+len},
      {name:'直近',start:n-len,end:n}
    ];
  }
  const len=Math.min(n,Math.max(300,Math.floor(n*.7)));
  return [{name:'全期間',start:0,end:n},{name:'直近',start:Math.max(0,n-len),end:n}];
}
function evaluate(hist,rebalanceDays){
  const rows=[];
  for(const w of windows(hist)){
    const map=toMap(hist,w.start,w.end);
    if(map.size<50)continue;
    try{
      const d=IPCore.runBacktest(map,{
        mode:'all',capital:1000000,risk:'mid',lot:1,topN:10,
        rebalanceDays,costBps:10,reserve:.10,theme:{}
      });
      const held=Math.max(rebalanceDays,d.periods*rebalanceDays);
      rows.push({
        window:w.name,
        annual_return:annualize(d.total_return,held),
        annual_benchmark:annualize(d.benchmark_return,held),
        excess_return:annualize(d.total_return,held)-annualize(d.benchmark_return,held),
        max_drawdown:Number(d.max_drawdown)||0,
        total_return:Number(d.total_return)||0,
        periods:Number(d.periods)||0
      });
    }catch(e){
      rows.push({window:w.name,error:e.message});
    }
  }
  const ok=rows.filter(x=>!x.error);
  if(!ok.length)return {days:rebalanceDays,robust_score:-999,windows:rows};

  const anns=ok.map(x=>x.annual_return),excess=ok.map(x=>x.excess_return),dds=ok.map(x=>x.max_drawdown);
  const med=median(anns),medEx=median(excess),worst=Math.min(...anns),worstDD=Math.min(...dds),sd=stdev(anns);
  const positive=anns.filter(x=>x>0).length;
  const minPeriods=Math.min(...ok.map(x=>x.periods));
  // 高リターン一本勝負ではなく、複数期間の安定性と最大下落を重視。
  // 売買サイクルが少ない設定は偶然の影響が大きいので強く減点する。
  const samplePenalty=minPeriods>=6?0:(6-minPeriods)*12;
  const robust=
    60*Math.tanh(med/0.30)+
    20*Math.tanh(medEx/0.20)+
    10*Math.tanh(worst/0.25)-
    25*Math.min(1,Math.abs(worstDD))-
    10*Math.min(1,sd)-
    samplePenalty;

  return {
    days:rebalanceDays,
    robust_score:Number(robust.toFixed(2)),
    median_annual_return:Number(med.toFixed(6)),
    worst_annual_return:Number(worst.toFixed(6)),
    median_excess_return:Number(medEx.toFixed(6)),
    worst_max_drawdown:Number(worstDD.toFixed(6)),
    return_dispersion:Number(sd.toFixed(6)),
    positive_windows:positive,
    window_count:ok.length,
    min_periods_per_window:minPeriods,
    sample_penalty:samplePenalty,
    eligible:minPeriods>=5,
    windows:rows
  };
}
function confidence(x){
  if((x.min_periods_per_window||0)>=8&&x.window_count>=3&&x.positive_windows===x.window_count&&x.return_dispersion<=0.25&&x.worst_max_drawdown>=-0.30)return '高め';
  if((x.min_periods_per_window||0)>=5&&x.positive_windows>=Math.max(2,x.window_count-1)&&x.return_dispersion<=0.45)return '標準';
  return '低め';
}

const input=fs.existsSync(TEMP)?TEMP:FALLBACK;
const hist=JSON.parse(fs.readFileSync(input,'utf8'));
const evaluations=DAYS.map(d=>evaluate(hist,d)).sort((a,b)=>b.robust_score-a.robust_score);
const eligible=evaluations.filter(x=>x.eligible);
const best=eligible[0]||evaluations.find(x=>x.days===20)||evaluations[0];
let previous=null;
try{previous=JSON.parse(fs.readFileSync(OUT,'utf8'))}catch{}

let selected=best;
const previousDays=Number(previous?.recommended_days);
if(!Number.isFinite(previousDays)&&confidence(best)==='低め'){
  selected=evaluations.find(x=>x.days===20)||best;
}
const previousEval=evaluations.find(x=>x.days===previousDays);
const changeThreshold=3.0;
// 微差では設定を変えない。日々のノイズで推奨が往復するのを防ぐ。
if(previousEval&&best.days!==previousDays&&best.robust_score-previousEval.robust_score<changeThreshold){
  selected=previousEval;
}

const changed=previousDays&&previousDays!==selected.days;
const history=Array.isArray(previous?.change_history)?previous.change_history.slice(-19):[];
if(changed){
  history.push({
    changed_at:new Date().toISOString(),
    from_days:previousDays,
    to_days:selected.days,
    previous_score:previousEval?.robust_score??null,
    new_score:selected.robust_score
  });
}

const payload={
  generated_at:new Date().toISOString(),
  optimizer_version:1,
  recommended_days:selected.days,
  previous_recommended_days:Number.isFinite(previousDays)?previousDays:null,
  changed:Boolean(changed),
  confidence:confidence(selected),
  change_threshold:changeThreshold,
  method:'過去5年のデータを複数期間に分け、10/20/40/60/100営業日をコスト込みで比較。利益・対ベンチマーク・最大下落・期間ごとのばらつき・検証回数を総合評価し、検証回数不足や微差では設定を変更しない。',
  note:'過去データに基づく自動最適化であり、将来の成績を保証するものではありません。',
  evaluations:evaluations.sort((a,b)=>a.days-b.days),
  change_history:history
};

fs.writeFileSync(OUT,JSON.stringify(payload,null,2));
console.log('strategy optimized',JSON.stringify({
  recommended_days:payload.recommended_days,
  confidence:payload.confidence,
  changed:payload.changed,
  scores:Object.fromEntries(payload.evaluations.map(x=>[x.days,x.robust_score]))
}));
