'use strict';
const $=id=>document.getElementById(id),num=Number.isFinite;
let rows=[],limit=20,stamp='',ready=false;
const fields={revenueGrowth:'売上成長率',earningsGrowth:'利益成長率',returnOnEquity:'ROE',operatingMargins:'営業利益率',trailingPE:'実績PER'};
function value(x,k){const v=x[k];return num(v)&&(k!=='trailingPE'||v>0)&&(k!=='reference_score'||x.metrics_available>=2)?v:null}
function fmt(v,pe){return v===null?'—':(pe?v:v*100).toFixed(1)+(pe?'倍':'%')}
function node(tag,t){const e=document.createElement(tag);e.textContent=t;return e}
function render(){if(!ready)return;const q=$('query').value.normalize('NFKC').toLowerCase().trim(),k=$('order').value;
const found=rows.filter(x=>(x.code+' '+x.company).normalize('NFKC').toLowerCase().includes(q)).sort((a,b)=>{let x=value(a,k),y=value(b,k);return x===null?Number(y!==null):y===null?-1:k==='trailingPE'?x-y:y-x});
$('status').textContent=found.length+'件 ／ 対象 '+rows.length+'銘柄 · データ更新 '+stamp;
$('cards').replaceChildren();for(const x of found.slice(0,limit)){const el=node('article','');el.append(node('small',x.code+' ／ '+(x.sector||'業種未取得')),node('h2',x.company),node('b',value(x,'reference_score')===null?'評価なし':'財務評価 '+x.reference_score+'点 · '+x.reference_label));const dl=node('dl','');for(const [key,title] of Object.entries(fields)){const block=node('div','');block.append(node('dt',title),node('dd',fmt(value(x,key),key==='trailingPE')));dl.append(block)}el.append(dl);
const peers=rows.filter(y=>x.sector&&y.sector===x.sector&&x.code!==y.code).map(y=>value(y,'trailingPE')).filter(num);el.append(node('small','同業他社の平均PER '+(peers.length?fmt(peers.reduce((a,b)=>a+b,0)/peers.length,true)+'（'+peers.length+'社）':'—')+' ／ 採点 '+(x.metrics_available||0)+'/5指標'+(x.is_cached?' ／ 前回取得値':'' )+' ／ 取得日 '+(x.last_success_at||'不明').slice(0,10)));$('cards').append(el)}
if(!found.length)$('cards').append(node('p','対象内に該当する銘柄がありません。'));$('more').hidden=found.length<=limit}
async function json(path){const r=await fetch('./data/'+path+'.json',{cache:'no-cache'});if(!r.ok)throw Error();return r.json()}
async function start(){try{const [f,a]=await Promise.all([json('fundamentals'),json('all-analysis').catch(()=>({stocks:[]}))]);const sectors=new Map(a.stocks.map(x=>[String(x.code),x.sector33]));rows=Object.values(f.stocks).map(x=>({...x,sector:sectors.get(String(x.code))}));stamp=f.generated_at.slice(0,10);ready=true;render()}catch{$('status').textContent='データを読み込めません。ページを再読み込みしてください。'}}
$('query').oninput=$('order').onchange=()=>{limit=20;render()};$('more').onclick=()=>{limit+=20;render()};start();
