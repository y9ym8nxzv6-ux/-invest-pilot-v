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
 'quoteOf','showSelectedAnalysis','renderResearchResult']){
  assert.ok(ui.includes('function '+name+'('),'Missing '+name+' in UI');
}
console.log('APP UNIT TESTS PASS: filtered ranks, signal null-handling, search/daily UI contracts');
