'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
require(path.join(root,'core.js'));
require(path.join(root,'signals.js'));
require(path.join(root,'industry.js'));
const industry=globalThis.IPIndustry;
assert.ok(industry,'Industry module must be available');

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

const basketUniverse=[
 {code:'A',company:'A',rank:1,technical_score:95,trend_count:4,close:1000,sector33:'銀行業',eligible:true,signal:'🟢 買い候補'},
 {code:'B',company:'B',rank:2,technical_score:94,trend_count:4,close:2000,sector33:'卸売業',eligible:true,signal:'🟢 買い候補'},
 {code:'C',company:'C',rank:3,technical_score:93,trend_count:4,close:500,sector33:'電気機器',eligible:true,signal:'🟢 買い候補'},
 {code:'D',company:'D',rank:4,technical_score:92,trend_count:4,close:1200,sector33:'医薬品',eligible:true,signal:'🟢 買い候補'},
 {code:'E',company:'E',rank:5,technical_score:91,trend_count:4,close:600,sector33:'食品',eligible:true,signal:'🟢 買い候補'},
 {code:'F',company:'F',rank:6,technical_score:90,trend_count:4,close:500,sector33:'銀行業',eligible:true,signal:'🟢 買い候補'}
];
const fiveBasket=core.buildFiveStockPlan(basketUniverse,{capital:200000,lot:1,reserve:.10});
assert.equal(fiveBasket.count,5);
assert.equal(fiveBasket.positions.length,5);
assert.ok(fiveBasket.diversified);
assert.ok(fiveBasket.committed<=200000);
assert.ok(fiveBasket.remaining>=20000);
assert.ok(fiveBasket.positions.every(x=>x.estimated_total<=30000.01));
assert.ok(fiveBasket.positions.every(x=>x.shares*x.price===x.estimated_total));

const weakExpansion=core.buildFiveStockPlan([
 basketUniverse[0],
 {...basketUniverse[1],technical_score:94},
 {...basketUniverse[2],technical_score:72}
],{capital:200000,lot:1});
assert.equal(weakExpansion.count,2,'Do not fill five slots with weak signals');
assert.ok(weakExpansion.remaining>100000);
assert.match(weakExpansion.status,/2銘柄/);

const sectorOnly=core.buildFiveStockPlan([
 ...basketUniverse.slice(0,5).map((x,i)=>({...x,sector33:'銀行業',technical_score:95-i}))
],{capital:200000,lot:1});
assert.ok(sectorOnly.count<=2,'Never add three names from one correlated sector proxy');
assert.equal(sectorOnly.diversified,false);

const expensiveOnly=core.buildFiveStockPlan([
 {...basketUniverse[0],code:'EXP',close:50000}
],{capital:200000,lot:1});
assert.equal(expensiveOnly.count,0,'One share over per-name cap cannot be purchased');
assert.ok(expensiveOnly.expensive_skipped>=1);

const base={technical_score:92,trend_count:4,ret5:0.01,ret20:0.04,ret60:0.14,forecast20:null};
assert.equal(signals.classify(base).key,'strongbuy');
assert.notEqual(signals.classify({...base,ret20:null,ret5:null,ret60:null}).key,
 'strongbuy','Missing historical prices must not be treated as zero-return signals');
assert.equal(signals.classify({...base,ret20:0.21,ret5:0.08}).key,'wait');

const sectorSample=new Map([
 ['A',{code:'A',sector33:'銀行業',metrics_available:5,revenueGrowth:.25,earningsGrowth:.22,returnOnEquity:.20,operatingMargins:.30,trailingPE:10}],
 ['B',{code:'B',sector33:'銀行業',metrics_available:5,revenueGrowth:.05,earningsGrowth:.10,returnOnEquity:.07,operatingMargins:.12,trailingPE:15}],
 ['C',{code:'C',sector33:'銀行業',metrics_available:5,revenueGrowth:.03,earningsGrowth:.02,returnOnEquity:.08,operatingMargins:.11,trailingPE:20}],
 ['D',{code:'D',sector33:'銀行業',metrics_available:5,revenueGrowth:.01,earningsGrowth:.01,returnOnEquity:.05,operatingMargins:.09,trailingPE:25}],
 ['SOLO',{code:'SOLO',sector33:'陸運業',metrics_available:5,revenueGrowth:.12,earningsGrowth:.12,returnOnEquity:.14,operatingMargins:.11,trailingPE:14}]
]);
const industryModel=industry.make(sectorSample,[]);
const bankA=industry.compare('A',sectorSample.get('A'),industryModel);
assert.equal(bankA.sector,'銀行業');
assert.equal(bankA.metrics.find(x=>x.metric==='trailingPE').average,20,'PER industry peer average excludes self');
assert.equal(bankA.metrics.find(x=>x.metric==='trailingPE').n,3);
assert.equal(bankA.metrics.find(x=>x.metric==='trailingPE').kind,'positive','Lower positive PER is greener');
assert.equal(bankA.metrics.find(x=>x.metric==='revenueGrowth').kind,'positive');
assert.equal(bankA.comparable,true);
assert.notEqual(bankA.symbol,'⭐','Do not hand out stars on three comparisons');
const bankD=industry.compare('D',sectorSample.get('D'),industryModel);
assert.equal(bankD.metrics.find(x=>x.metric==='trailingPE').kind,'negative');
const solo=industry.compare('SOLO',sectorSample.get('SOLO'),industryModel);
assert.equal(solo.comparable,false,'Insufficient industry sample blocks relative judgment');
assert.equal(solo.symbol,'－');
const withInvalid=industry.make(new Map([...sectorSample,['BAD',{
 code:'BAD',sector33:'銀行業',metrics_available:5,trailingPE:-7
}]]),[]);
assert.equal(industry.compare('A',sectorSample.get('A'),withInvalid).metrics.find(x=>x.metric==='trailingPE').n,3,
 'Invalid/negative PEs must not contaminate industry average');
assert.ok(industry.METRICS.length===5);

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ui=fs.readFileSync(path.join(root,'ui.js'),'utf8');
for(const name of ['dailyAsOf','rankingTitle','researchCode','researchQuery',
 'stockAnalysisCard','favoriteList','compareList','stockCards','btRun']){
  assert.ok(html.includes('id="'+name+'"'),'Missing '+name+' in HTML');
}
assert.ok(html.includes('src="industry.js"'));
for(const name of ['loadDailyQuotes','tenDayHistoryHtml','quoteStrip','quoteFeature',
 'quoteOf','fundamentalHtml','purchasePlanHtml','renderFiveStockBasket','showSelectedAnalysis','renderResearchResult']){
  assert.ok(ui.includes('function '+name+'('),'Missing '+name+' in UI');
}
console.log('APP UNIT TESTS PASS: filtered ranks, signal null-handling, share affordability, five-stock allocation, sector comparisons, search/daily UI contracts');
