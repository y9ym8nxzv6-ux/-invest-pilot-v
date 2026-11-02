'use strict';
const $=id=>document.getElementById(id),num=Number.isFinite;
let rows=[],limit=20,stamp='',ready=false;
const fields={revenueGrowth:'売上成長率',earningsGrowth:'利益成長率',returnOnEquity:'ROE',operatingMargins:'営業利益率',trailingPE:'実績PER'};
function value(x,k){const v=x[k];return num(v)&&(k!=='trailingPE'||v>0)&&(k!=='reference_score'||x.metrics_available>=2)?v:null}
function fmt(v,pe){return v===null?'—':(pe?v:v*100).toFixed(1)+(pe?'倍':'%')}
function node(tag,t){const e=document.createElement(tag);e.textContent=t;return e}
function saved(){try{const v=JSON.parse(localStorage.getItem('fund-stars')||'[]');return new Set(Array.isArray(v)?v:[])}catch{return new Set()}}
const stars=saved(), picks=new Set();let onlyStars=false;
function button(label,pressed,fn){const b=node('button',label);b.setAttribute('aria-pressed',String(pressed));b.onclick=fn;return b}
function comparison(){
 const box=$('compare');box.replaceChildren();if(!picks.size)return;
 box.append(node('h2','銘柄を比較（'+picks.size+'/3）'));const table=node('table',''),items=rows.filter(x=>picks.has(x.code)),tr=node('tr','');tr.append(node('th','指標'));items.forEach(x=>tr.append(node('th',x.company)));table.append(tr);
 for(const [key,label] of Object.entries(fields)){const r=node('tr','');r.append(node('th',label));items.forEach(x=>r.append(node('td',fmt(value(x,key),key==='trailingPE'))));table.append(r)}box.append(table,button('比較をクリア',false,()=>{picks.clear();render()}));
}
function words(x){const explain=(k,n)=>{const v=value(x,k);return v===null?n+'は未取得':v===0?n+'は横ばい':n+'は'+fmt(Math.abs(v),false)+(v>0?'増':'減')};return explain('revenueGrowth','売上')+'、'+explain('earningsGrowth','利益')+'。'}
function render(){if(!ready)return;const q=$('query').value.normalize('NFKC').toLowerCase().trim(),k=$('order').value;
const found=rows.filter(x=>(!onlyStars||stars.has(x.code))&&(!$('sector').value||x.sector===$('sector').value)&&(x.code+' '+x.company).normalize('NFKC').toLowerCase().includes(q)).sort((a,b)=>{let x=value(a,k),y=value(b,k);return x===null?Number(y!==null):y===null?-1:k==='trailingPE'?x-y:y-x});
$('status').textContent=found.length+'件 ／ 対象 '+rows.length+'銘柄 · データ更新 '+stamp;
comparison();$('cards').replaceChildren();for(const x of found.slice(0,limit)){const el=node('article','');el.append(node('small',x.code+' ／ '+(x.sector||'業種未取得')),node('h2',x.company),node('b',value(x,'reference_score')===null?'評価なし':'財務評価 '+x.reference_score+'点 · '+x.reference_label));el.append(node('p',words(x)));const dl=node('dl','');for(const [key,title] of Object.entries(fields)){const block=node('div','');const metric=node('dd',fmt(value(x,key),key==='trailingPE'));if(key.endsWith('Growth')&&value(x,key)!==null)metric.className=x[key]>0?'up':x[key]<0?'down':'';block.append(node('dt',title),metric);dl.append(block)}el.append(dl);
const peers=rows.filter(y=>x.sector&&y.sector===x.sector&&x.code!==y.code).map(y=>value(y,'trailingPE')).filter(num);el.append(node('small','同業他社の平均PER '+(peers.length?fmt(peers.reduce((a,b)=>a+b,0)/peers.length,true)+'（'+peers.length+'社）':'—')+' ／ 採点 '+(x.metrics_available||0)+'/5指標'+(x.is_cached?' ／ 前回取得値':'' )+' ／ 取得日 '+(x.last_success_at||'不明').slice(0,10)));const star=button(stars.has(x.code)?'★ 保存済み':'☆ お気に入り',stars.has(x.code),()=>{stars.has(x.code)?stars.delete(x.code):stars.add(x.code);try{localStorage.setItem('fund-stars',JSON.stringify([...stars]))}catch{}render()});
 const pick=button(picks.has(x.code)?'比較から外す':'比較に追加',picks.has(x.code),()=>{if(picks.has(x.code))picks.delete(x.code);else if(picks.size<3)picks.add(x.code);render()});pick.disabled=!picks.has(x.code)&&picks.size>=3;el.append(star,pick);$('cards').append(el)}
if(!found.length)$('cards').append(node('p','対象内に該当する銘柄がありません。'));$('more').hidden=found.length<=limit}
async function json(path){const r=await fetch('./data/'+path+'.json',{cache:'no-cache'});if(!r.ok)throw Error();return r.json()}
async function start(){try{const [f,a]=await Promise.all([json('fundamentals'),json('all-analysis').catch(()=>({stocks:[]}))]);const sectors=new Map(a.stocks.map(x=>[String(x.code),x.sector33]));rows=Object.values(f.stocks).map(x=>({...x,sector:sectors.get(String(x.code))}));for(const sector of [...new Set(rows.map(x=>x.sector).filter(Boolean))].sort()){const opt=node('option',sector);opt.value=sector;$('sector').append(opt)}stamp=f.generated_at.slice(0,10);ready=true;render()}catch{$('status').textContent='データを読み込めません。ページを再読み込みしてください。'}}
$('favorites').onclick=()=>{onlyStars=!onlyStars;$('favorites').setAttribute('aria-pressed',String(onlyStars));limit=20;render()};
$('sector').onchange=$('query').oninput=$('order').onchange=()=>{limit=20;render()};$('more').onclick=()=>{limit+=20;render()};start();
