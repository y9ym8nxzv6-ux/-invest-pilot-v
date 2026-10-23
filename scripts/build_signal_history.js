'use strict';
const fs=require('fs');
require('../signals.js');
function update(previous, analysis, history){
  const stocks={};
  const date=new Date(Date.parse(analysis.generated_at)+9*3600000).toISOString().slice(0,10);
  if(previous.generated_at && previous.generated_at>analysis.generated_at)throw Error('Older snapshot');
  for(const x of analysis.stocks){
    const code=String(x.code), key=IPSignals.classify(x).key, old=previous.stocks?.[code];
    const same=old?.key===key;
    const entry=same?{...old}:{key,since:date,initial:!old,price_date:null};
    entry.return_pct=null; entry.as_of=null;
    const prices=history.stocks?.[code]?.closes||[];
    const points=history.dates.map((d,i)=>({date:String(d).replace(/(\d{4})(\d{2})(\d{2})/,'$1-$2-$3'),close:prices[i]})).filter(p=>Number.isFinite(p.close)&&p.close>0);
    const last=points.at(-1);
    if(last){
      if(!same)entry.price_date=last.date;
      if(!entry.price_date)entry.price_date=points.filter(p=>p.date<=entry.since).at(-1)?.date||null;
      const start=points.find(p=>p.date===entry.price_date);
      if(start&&last.date>=entry.price_date){entry.return_pct=last.close/start.close-1;entry.as_of=last.date;}
    }
    stocks[code]=entry;
  }
  return {generated_at:analysis.generated_at,stocks};
}
module.exports={update};
if(require.main===module){
  const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
  const target='data/signal-history.json';
  const previous=fs.existsSync(target)?read(target):{stocks:{}};
  const result=update(previous,read(process.argv[2]||'data/all-analysis.json'),read(process.argv[3]||'data/backtest-history.json'));
  fs.writeFileSync(target,JSON.stringify(result));
  console.log('Signal histories:',Object.keys(result.stocks).length);
}
