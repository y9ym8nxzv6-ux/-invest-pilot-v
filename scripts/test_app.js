'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
require(path.join(root,'core.js'));
require(path.join(root,'signals.js'));

const core=globalThis.IPCore,signals=globalThis.IPSignals;
assert.ok(core&&signals,'Core and signals must be available');
const input=[
  {code:'AAA1',rank:7,technical_score:91,close:1000,is_semiconductor:true},
  {code:'BBB2',rank:43,technical_score:85,close:500,is_semiconductor:false},
  {code:'CCC3',rank:115,technical_score:80,close:250,is_semiconductor:true}
];
const excluded=core.decorateForCapital(input,100000,'mid',1,'exclude');
assert.equal(excluded.length,1);
assert.equal(excluded[0].rank,43,'Global rank must survive semiconductor filtering');
assert.equal(excluded[0].filtered_position,1,'Filtered order should be separate');
assert.ok(excluded[0].shares_by_budget>=0);
const semi=core.decorateForCapital(input,100000,'mid',1,'only');
assert.deepEqual(semi.map(x=>x.rank),[7,115],'Global order must remain after filtering');

const quoteSeries=[{close:950},{close:1050},{close:1020}];
const buyable=core.buildPurchasePlan({code:'TEST',rank:1,technical_score:95,close:1020,budget_yen:12000},
  {capital:100000,risk:'mid',lot:1,price:1020,history:quoteSeries});
assert.equal(buyable.shares,11,'Share calculation must respect per-stock cap');
assert.equal(buyable.estimated_total,11220);
assert.equal(buyable.min_price,950);
assert.equal(buyable.max_price,1050);
assert.equal(buyable.within_budget,true);

const overspend=core.buildPurchasePlan({code:'BIG1',technical_score:95,close:30000,budget_yen:20000},
  {capital:100000,lot:1,price:30000,history:[]});
assert.equal(overspend.shares,0,'A single share exceeding the allocation must show zero');
assert.equal(overspend.allocation_insufficient,true);
assert.equal(overspend.total_capital_insufficient,false);
assert.equal(overspend.min_required,30000);

const lotHundred=core.buildPurchasePlan({code:'LOT1',technical_score:90,close:1200,budget_yen:100000},
  {capital:100000,lot:100,price:1200});
assert.equal(lotHundred.shares,0,'100 share lot must be treated as indivisible');
assert.equal(lotHundred.min_required,120000);

const base={technical_score:92,trend_count:4,ret5:0.01,ret20:0.04,ret60:0.14,forecast20:null};
assert.equal(signals.classify(base).key,'strongbuy');
assert.notEqual(signals.classify({...base,ret20:null,ret5:null,ret60:null}).key,
 'strongbuy','Missing historical prices must not be treated as zero-return signals');
assert.equal(signals.classify({...base,ret20:0.21,ret5:0.08}).key,'wait');

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ui=fs.readFileSync(path.join(root,'ui.js'),'utf8');
for(const name of ['dailyAsOf','rankingTitle','researchCode','researchQuery',
 'stockAnalysisCard','favoriteList','compareList','stockCards','btRun']){
  assert.ok(html.includes('id="'+name+'"'),'Missing '+name+' in HTML');
}
for(const name of ['loadDailyQuotes','tenDayHistoryHtml','quoteStrip','quoteFeature',
 'quoteOf','purchasePlanHtml','showSelectedAnalysis','renderResearchResult']){
  assert.ok(ui.includes('function '+name+'('),'Missing '+name+' in UI');
}
console.log('APP UNIT TESTS PASS: filtered ranks, signal null-handling, share affordability, search/daily UI contracts');
