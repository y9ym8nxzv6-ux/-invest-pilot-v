if(typeof document!=='undefined'){
  const $=id=>document.getElementById(id); const state={priceMap:null,ranked:IPCore.DEMO.slice(),snapshot:null,months:0,actions:[],busy:false,cloudResearch:null,visibleCount:20,waitTimer:null,waitShowTimer:null,waitEnd:0,signalFilter:'all',researchPromise:null,historyPromise:null,stockMaster:null,stockMasterPromise:null,selectedStock:null,allAnalysis:null,allAnalysisPromise:null,analysisUniverseCount:0,compareCodes:[],strategyConfig:null,strategyConfigPromise:null,fundamentals:null,fundamentalsPromise:null,dailyQuotes:null,dailyPromise:null,dailyUpdatedAt:null,dailyError:false};
  const settings={
    get auto(){return localStorage.getItem('ip7_auto')!=='0'}, set auto(v){localStorage.setItem('ip7_auto',v?'1':'0')},
    get source(){return localStorage.getItem('ip7_source')||'https://softhompo.a.la9.jp/Data/StockData.html'}, set source(v){localStorage.setItem('ip7_source',v)},
    get relay(){return localStorage.getItem('ip7_relay')||'auto'}, set relay(v){localStorage.setItem('ip7_relay',v)},
    get theme(){return {extra:(localStorage.getItem('ip7_semi_extra')||'').split(',').map(x=>x.trim()).filter(Boolean),exclude:(localStorage.getItem('ip7_semi_exclude')||'').split(',').map(x=>x.trim()).filter(Boolean)}}
  };
  const hasNumber=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n)); const yen=n=>hasNumber(n)?Math.round(Number(n)).toLocaleString('ja-JP')+'円':'—'; const pct=n=>hasNumber(n)?(Number(n)*100).toFixed(1)+'%':'—'; const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeHref=value=>{try{const u=new URL(String(value||''),'https://duckduckgo.com');return ['https:','http:'].includes(u.protocol)?u.href:'#'}catch{return '#'}};
  const researchJobs=new Map();
  let researchWorker=null;
  const normSearch=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'').trim();
  function quoteOf(code){const q=state.dailyQuotes?.get(String(code))||null;if(!q?.price_date)return null;const day=Date.parse(q.price_date+'T00:00:00+09:00');return Number.isFinite(day)&&Date.now()-day<=10*86400000?q:null}
  function moneyWithDecimals(n){return hasNumber(n)?Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円':'—'}
  function signedYen(n){if(!hasNumber(n))return '—';const v=Number(n);return (v>0?'+':v<0?'−':'±')+Math.abs(v).toLocaleString('ja-JP',{maximumFractionDigits:2})+'円'}
  function signedPct(n){if(!hasNumber(n))return '—';const v=Number(n);return (v>0?'+':'')+(v*100).toFixed(2)+'%'}
  function changeColor(n){return !hasNumber(n)?'quote-flat':Number(n)>0?'quote-positive':Number(n)<0?'quote-negative':'quote-flat'}
  function quoteDate(date){return /^\d{4}-\d{2}-\d{2}$/.test(String(date||''))?String(date).replaceAll('-','/'):'基準日不明'}
  function quoteStrip(code){
    const q=quoteOf(code);
    if(!q)return '<div class="quote-strip"><span class="quote-empty">前営業日比：未取得</span><span class="quote-date">解析時の参考価格を表示</span></div>';
    return '<div class="quote-strip"><span class="quote-change '+changeColor(q.change_pct)+'">前営業日比 '+signedYen(q.change_yen)+'（'+signedPct(q.change_pct)+'）</span><span class="quote-date">終値 '+quoteDate(q.price_date)+'</span></div>';
  }
  function quoteFeature(code){
    const q=quoteOf(code);
    if(!q)return '<div class="quote-feature"><b>前営業日比</b><span class="quote-date">終値データを取得できませんでした。最新データを再読込すると更新される場合があります。</span></div>';
    return '<div class="quote-feature"><div class="small">'+quoteDate(q.price_date)+' 終値 '+moneyWithDecimals(q.close)+'</div><b class="quote-change '+changeColor(q.change_pct)+'">'+signedYen(q.change_yen)+'（'+signedPct(q.change_pct)+'）</b><span class="quote-date">前営業日の終値 '+moneyWithDecimals(q.previous_close)+' からの変化。リアルタイムではありません。</span></div>';
  }
  function purchasePlanFor(x){
    const capital=Number($('capital')?.value)||100000;
    const risk=$('risk')?.value||'mid';
    const lot=Number($('lotMode')?.value)||1;
    const q=quoteOf(x.code);
    const slot=Math.min(capital*IPCore.singleLimitPct(capital,risk)/100,capital*.90/5);
    return IPCore.buildPurchasePlan({...x,budget_yen:slot},{capital,risk,lot,price:q?.close||x.close,history:q?.daily_history||[]});
  }
  function purchasePlanHtml(x,compact=false){
    const p=purchasePlanFor(x);
    if(!p.price)return '<div class="purchase-plan"><div class="plan-heading">購入株数の試算</div><div class="plan-note">株価を取得できません。現時点では株数を計算できません。</div></div>';
    const range=p.count>=2?moneyWithDecimals(p.min_price)+'〜'+moneyWithDecimals(p.max_price):'価格帯データなし';
    const basis='直近終値 '+moneyWithDecimals(p.price);
    const unitText=p.lot===100?'100株単位':'1株単位';
    const main=p.shares>0
      ? '<div class="plan-result"><strong>'+p.shares.toLocaleString('ja-JP')+'株</strong><span>'+basis+' × '+p.shares+'株 = <b>'+moneyWithDecimals(p.estimated_total)+'</b></span></div>'
      : '<div class="plan-result plan-blocked"><strong>0株（枠内では購入不可）</strong><span>最小'+p.lot+'株の必要額 '+moneyWithDecimals(p.min_required)+'</span></div>';
    const why=p.shares>0
      ? '概算購入額 '+moneyWithDecimals(p.estimated_total)+' / 配分枠 '+moneyWithDecimals(p.budget_yen)+'（手数料別）'
      : (p.total_capital_insufficient?'運用資金 '+moneyWithDecimals(p.capital_yen)+'より最低購入額が高い状態です。':
          '運用資金全体では買える可能性がありますが、1銘柄の配分枠 '+moneyWithDecimals(p.budget_yen)+'を超えます。');
    const note='<div class="plan-note">'+why+' · '+unitText+'。直近の値幅は過去の終値範囲で、指値の推奨価格ではありません。</div>';
    return '<div class="purchase-plan'+(compact?' compact':'')+'"><div class="plan-heading">価格帯と購入可能株数 <span>最大5銘柄の配分枠で試算</span></div>'+
      '<div class="plan-range"><span>直近10営業日の終値範囲</span><b>'+range+'</b></div>'+main+note+'</div>';
  }
  function tenDayHistoryHtml(code){
    const q=quoteOf(code),hist=Array.isArray(q?.daily_history)?q.daily_history:[];
    if(hist.length<2)return '<div class="daily-note">直近10営業日の履歴はまだ利用できません。</div>';
    const values=hist.map(x=>Number(x.close));
    const lo=Math.min(...values),hi=Math.max(...values),span=Math.max(0.01,hi-lo);
    const points=values.map((v,i)=>{const x=10+i*320/Math.max(1,values.length-1),y=86-76*(v-lo)/span;return x.toFixed(1)+','+y.toFixed(1)}).join(' ');
    const stroke=Number(hist.at(-1).close)>=Number(hist[0].close)?'#4bd78a':'#ff7777';
    const svg='<svg class="daily-chart" viewBox="0 0 340 100" role="img" aria-label="直近10営業日の終値推移"><line x1="10" y1="88" x2="330" y2="88" stroke="#395078" stroke-width="1"/><polyline points="'+points+'" fill="none" stroke="'+stroke+'" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    const rows=hist.map(x=>'<div class="daily-session"><span>'+quoteDate(x.date).slice(5)+'</span><span>'+moneyWithDecimals(x.close)+'</span><strong class="'+changeColor(x.change_pct)+'">'+signedPct(x.change_pct)+'</strong></div>').join('');
    return '<details class="daily-detail" open><summary>直近'+hist.length+'営業日：終値の推移</summary>'+svg+'<div class="daily-table">'+rows+'</div><div class="daily-note">終値と前営業日比。日付は取引日で、土日・休場日は含みません。株式分割等では単純な前日比が大きく変化することがあります。</div></details>';
  }
  function showDailyStatus(){
    const el=$('dailyAsOf');if(!el)return;
    if(!state.dailyQuotes){el.textContent='前営業日比：終値データを読み込み中…';return}
    const dates=[...state.dailyQuotes.values()].map(x=>x.price_date).filter(Boolean);
    const latest=dates.length?dates.sort().at(-1):null;
    const time=latest?Date.parse(latest+'T00:00:00+09:00'):NaN;
    const stale=Number.isFinite(time)&&Date.now()-time>7*86400000;
    el.textContent='終値・前営業日比：'+(latest?quoteDate(latest):'基準日不明')+'時点'+(stale?'（更新が遅れています）':'')+'（リアルタイムではありません） · '+state.dailyQuotes.size.toLocaleString('ja-JP')+'銘柄';
  }
  async function loadDailyQuotes(force=false){
    if(state.dailyQuotes&&!force)return state.dailyQuotes;
    if(state.dailyPromise)return state.dailyPromise;
    state.dailyPromise=(async()=>{
      const r=await fetch('./data/daily-changes.json?ts='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('前営業日比データ未生成');
      const d=await r.json(),map=new Map(Object.entries(d.stocks||{}));
      if(map.size<2500)throw new Error('前営業日比データの件数不足');
      state.dailyQuotes=map;state.dailyUpdatedAt=d.generated_at||null;state.dailyError=false;
      showDailyStatus();renderRows();
      if(state.selectedStock)showSelectedAnalysis(state.selectedStock.code);
      renderCompare().catch(()=>{});renderFavorites();
      return map;
    })();
    try{return await state.dailyPromise}catch(e){state.dailyError=true;renderFiveStockBasket();throw e}finally{state.dailyPromise=null}
  }

  function formatAge(ts){
    const ms=Date.now()-Number(ts||0);
    if(!Number.isFinite(ms)||ms<0)return '更新時刻不明';
    const min=Math.floor(ms/60000);
    if(min<60)return min<=1?'たった今':min+'分前';
    const hr=Math.floor(min/60);
    if(hr<24)return hr+'時間前';
    return Math.floor(hr/24)+'日前';
  }
  function renderDataHealth(){
    const el=$('dataHealthText'),dot=$('dataHealthDot');
    if(!el||!dot)return;
    const ts=state.snapshot?.updatedAt||0;
    const hours=ts?(Date.now()-ts)/3600000:999;
    dot.className='health-dot'+(hours<=36?'':hours<=72?' warn':' bad');
    const count=state.analysisUniverseCount||Number(($('scoreCount')?.textContent||'').replace(/,/g,''))||0;
    el.textContent=ts?`最終解析 ${formatAge(ts)} · ${count?count.toLocaleString('ja-JP')+'銘柄を分析':''}`:'解析データを読み込み中…';
  }
  function getCompareCodes(){
    try{
      const v=JSON.parse(localStorage.getItem('ip7_compare')||'[]');
      return Array.isArray(v)?v.map(String).slice(0,3):[];
    }catch{return []}
  }
  function saveCompareCodes(v){
    state.compareCodes=[...new Set(v.map(String))].slice(0,3);
    localStorage.setItem('ip7_compare',JSON.stringify(state.compareCodes));
  }
  function updateCompareButton(){
    const b=$('compareAddBtn'),s=state.selectedStock;
    if(!b)return;
    if(!s){b.style.display='none';return}
    b.style.display='block';
    const on=getCompareCodes().includes(String(s.code));
    b.textContent=on?'✓ 比較に追加済み':'＋ 比較に追加';
  }
  async function addSelectedToCompare(){
    const s=state.selectedStock;if(!s)return;
    let codes=getCompareCodes(),code=String(s.code);
    if(codes.includes(code)){
      switchPane('compare');await renderCompare();return;
    }
    if(codes.length>=3)codes.shift();
    codes.push(code);saveCompareCodes(codes);updateCompareButton();
    switchPane('compare');await renderCompare();
  }
  async function renderCompare(){
    const box=$('compareList');if(!box)return;
    const codes=getCompareCodes();state.compareCodes=codes;
    if(!codes.length){box.innerHTML='<div class="empty-soft">まだ比較する銘柄がありません。銘柄詳細から「＋ 比較に追加」を押してください。</div>';return}
    try{await loadAllAnalysis()}catch{}
    box.innerHTML=codes.map(code=>{
      const a=state.allAnalysis?.get(String(code))||state.ranked.find(x=>String(x.code)===String(code));
      const master=state.stockMaster?.find(x=>String(x.code)===String(code));
      if(!a)return `<div class="compare-card"><div class="head"><div><div class="title">${esc(master?.company||code)}</div><div class="sub">${esc(code)} · 分析データなし</div></div><button class="compare-remove" data-compare-remove="${esc(code)}">×</button></div></div>`;
      const sig=(globalThis.IPSignals&&IPSignals.classify)?IPSignals.classify(a):{label:'🔵 監視',reason:'条件確認中'};
      const f=a.forecast20;
      return `<div class="compare-card">
        <div class="head"><div><div class="title">#${esc(a.rank)} ${esc(a.company||master?.company||code)}</div><div class="sub">${esc(code)} · ${esc(a.sector33||a.market||'')}</div></div><button class="compare-remove" data-compare-remove="${esc(code)}">×</button></div>
        <div class="analysis-judge">${esc(sig.label)} · 総合点 ${Number(a.technical_score).toFixed(1)}</div>
        <div class="analysis-reason">${esc(sig.reason)}</div>
        ${quoteStrip(code)}
        ${purchasePlanHtml(a,true)}
        ${fundamentalHtml(code,true)}
        <div class="compare-grid">
          <div class="compare-cell"><div class="k">過去20日</div><div class="v ${a.ret20>=0?'good':'bad'}">${pct(a.ret20)}</div></div>
          <div class="compare-cell"><div class="k">過去60日</div><div class="v ${a.ret60>=0?'good':'bad'}">${pct(a.ret60)}</div></div>
          <div class="compare-cell"><div class="k">過去120日</div><div class="v ${a.ret120>=0?'good':'bad'}">${pct(a.ret120)}</div></div>
          <div class="compare-cell"><div class="k">過去250日</div><div class="v ${a.ret250>=0?'good':'bad'}">${pct(a.ret250)}</div></div>
          <div class="compare-cell"><div class="k">20営業日後</div><div class="v">${f?pct(f.median):'—'}</div></div>
          <div class="compare-cell"><div class="k">類似局面 上昇割合</div><div class="v">${f?Math.round((Number(f.up_rate)||0)*100)+'%':'—'}</div></div>
        </div>
      </div>`;
    }).join('');
    box.querySelectorAll('[data-compare-remove]').forEach(b=>b.onclick=()=>{saveCompareCodes(getCompareCodes().filter(x=>x!==String(b.dataset.compareRemove)));renderCompare();updateCompareButton()});
  }
  async function renderFavoriteChanges(){
    const box=$('favoriteChanges');if(!box)return;
    const fav=getFavorites();
    if(!fav.length){box.innerHTML='<div class="empty-soft">お気に入りを登録すると、評価や順位の変化をここに表示します。</div>';return}
    try{await loadAllAnalysis()}catch{}
    let prev={};try{prev=JSON.parse(localStorage.getItem('ip7_favorite_state')||'{}')}catch{}
    const next={},items=[];
    for(const f of fav){
      const a=state.allAnalysis?.get(String(f.code));if(!a)continue;
      const sig=(globalThis.IPSignals&&IPSignals.classify)?IPSignals.classify(a):{key:'watch',label:'🔵 監視'};
      next[f.code]={rank:Number(a.rank),score:Number(a.technical_score),signal:sig.key,label:sig.label};
      const p=prev[f.code];
      if(p){
        const rankDiff=Number(p.rank)-Number(a.rank);
        const scoreDiff=Number(a.technical_score)-Number(p.score||0);
        if(p.signal!==sig.key||Math.abs(rankDiff)>=10||Math.abs(scoreDiff)>=3){
          const parts=[];
          if(p.signal!==sig.key)parts.push(`${p.label||'前回評価'} → ${sig.label}`);
          if(Math.abs(rankDiff)>=10)parts.push(`順位 ${rankDiff>0?'+':''}${rankDiff}`);
          if(Math.abs(scoreDiff)>=3)parts.push(`点数 ${scoreDiff>0?'+':''}${scoreDiff.toFixed(1)}`);
          items.push(`<div class="change-item" data-change-code="${esc(f.code)}"><b>${esc(a.company||f.company||f.code)}</b><br>${esc(parts.join(' · '))}</div>`);
        }
      }else{
        items.push(`<div class="change-item" data-change-code="${esc(f.code)}"><b>${esc(a.company||f.company||f.code)}</b><br>現在 ${esc(sig.label)} · #${esc(a.rank)} · ${Number(a.technical_score).toFixed(1)}点</div>`);
      }
    }
    localStorage.setItem('ip7_favorite_state',JSON.stringify(next));
    box.innerHTML=items.length?items.join(''):'<div class="empty-soft">前回から大きな評価変化はありません。</div>';
    box.querySelectorAll('[data-change-code]').forEach(el=>el.onclick=()=>{switchPane('research');openStockByCode(el.dataset.changeCode)});
  }
  async function homeSearch(){
    const q=$('homeSearch')?.value.trim();if(!q)return;
    switchPane('research');
    $('researchQuery').value=q;
    await resolveSearch();
  }
  async function loadStockMaster(){
    if(state.stockMaster)return state.stockMaster;
    if(state.stockMasterPromise)return state.stockMasterPromise;
    state.stockMasterPromise=(async()=>{
      const r=await fetch('./data/stock-master.json?ts='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('銘柄マスター未生成');
      const d=await r.json();
      state.stockMaster=Array.isArray(d.stocks)?d.stocks:[];
      if(!state.stockMaster.length)throw new Error('銘柄マスターが空です');
      return state.stockMaster;
    })();
    try{return await state.stockMasterPromise}finally{state.stockMasterPromise=null}
  }
  async function loadAllAnalysis(){
    if(state.allAnalysis)return state.allAnalysis;
    if(state.allAnalysisPromise)return state.allAnalysisPromise;
    state.allAnalysisPromise=(async()=>{
      const r=await fetch('./data/all-analysis.json?ts='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('全銘柄分析データ未生成');
      const d=await r.json();
      state.analysisUniverseCount=Number(d.universe_count)||0;
      const map=new Map();
      for(const x of (d.stocks||[]))map.set(String(x.code),x);
      if(!map.size)throw new Error('全銘柄分析データが空です');
      state.allAnalysis=map;
      renderDataHealth();
      setTimeout(()=>renderFavoriteChanges().catch(()=>{}),0);
      setTimeout(()=>renderCompare().catch(()=>{}),0);
      return map;
    })();
    try{return await state.allAnalysisPromise}finally{state.allAnalysisPromise=null}
  }
  function signalClass(key){
    return key==='strongbuy'?'strongbuy':key==='buy'?'buy':key==='strongsell'?'strongsell':key==='avoid'?'avoid':key==='wait'?'wait':'watch';
  }
  function renderAnalysisCard(a){
    const box=$('stockAnalysisCard');
    if(!a){box.classList.remove('show');box.innerHTML='';return}
    const sig=(globalThis.IPSignals&&IPSignals.classify)?IPSignals.classify(a):{key:'watch',label:'🔵 監視',reason:'条件確認中'};
    const cls=signalClass(sig.key);
    const total=state.analysisUniverseCount||'全解析銘柄';
    const fc=a.forecast20;
    const outlook=fc
      ? `<div class="analysis-cell"><div class="k">20営業日後の参考</div><div class="v">${pct(fc.range_low)}〜${pct(fc.range_high)}</div></div><div class="analysis-cell"><div class="k">類似局面の上昇割合</div><div class="v">${Math.round((Number(fc.up_rate)||0)*100)}%</div></div>`
      : `<div class="analysis-cell"><div class="k">20営業日後の参考</div><div class="v">データ不足</div></div><div class="analysis-cell"><div class="k">現在値</div><div class="v">${yen(a.close)}</div></div>`;
    box.classList.add('show');
    box.innerHTML=`
      <div class="analysis-head">
        <div>
          <div class="analysis-rank">国内株 総合順位</div>
          <div class="analysis-score">#${esc(a.rank)} <span style="font-size:13px;color:var(--muted)">/ ${esc(total)}</span></div>
        </div>
        <div class="signal-pill ${cls}">${sig.label}</div>
      </div>
      <div class="analysis-judge">総合点 ${Number(a.technical_score).toFixed(1)} / 100</div>
      ${quoteFeature(a.code)}
      ${purchasePlanHtml(a)}
      <div class="analysis-reason"><b>この評価の理由：</b> ${esc(sig.reason)}</div>
      <div class="analysis-grid">
        <div class="analysis-cell"><div class="k">過去20日</div><div class="v ${a.ret20>=0?'good':'bad'}">${pct(a.ret20)}</div></div>
        <div class="analysis-cell"><div class="k">過去60日</div><div class="v ${a.ret60>=0?'good':'bad'}">${pct(a.ret60)}</div></div>
        <div class="analysis-cell"><div class="k">過去120日</div><div class="v ${a.ret120>=0?'good':'bad'}">${pct(a.ret120)}</div></div>
        <div class="analysis-cell"><div class="k">過去250日</div><div class="v ${a.ret250>=0?'good':'bad'}">${pct(a.ret250)}</div></div>
        ${outlook}
      </div>
      ${tenDayHistoryHtml(a.code)}
      ${fundamentalHtml(a.code,false)}
      <div class="explain-box"><b>総合点とは？</b><br>過去の値動き、上昇トレンド、売買代金を国内株で比較したモメンタム中心の相対評価です。業績参考は順位に入れていません。100点に近いほど現在の条件が強いことを示しますが、将来の上昇率を保証する点数ではありません。</div>`;
  }
  async function showSelectedAnalysis(code){
    const fallback=state.ranked.find(x=>String(x.code)===String(code));
    if(fallback)renderAnalysisCard(fallback);
    else{
      $('stockAnalysisCard').classList.add('show');
      $('stockAnalysisCard').innerHTML='<div class="small">株価データの分析結果を読み込み中…</div>';
    }
    try{
      const map=await loadAllAnalysis();
      const a=map.get(String(code));
      if(a)renderAnalysisCard(a);
      else $('stockAnalysisCard').innerHTML='<div class="small">この銘柄は履歴不足のため、現在は総合分析の対象外です。</div>';
    }catch(e){
      if(!fallback)$('stockAnalysisCard').innerHTML='<div class="small">全銘柄分析を更新中です。少し待って再度開いてください。</div>';
    }
  }
  function searchStocks(query,limit=10){
    const q=normSearch(query);
    if(!q)return [];
    const src=state.stockMaster||[];
    return src.map(s=>{
      const code=normSearch(s.code),name=normSearch(s.company);
      let score=99;
      if(code===q)score=0;
      else if(name===q)score=1;
      else if(code.startsWith(q))score=2;
      else if(name.startsWith(q))score=3;
      else if(name.includes(q))score=4;
      else if(code.includes(q))score=5;
      return {s,score};
    }).filter(x=>x.score<99).sort((a,b)=>a.score-b.score||String(a.s.code).localeCompare(String(b.s.code))).slice(0,limit).map(x=>x.s);
  }
  function isTop100(code){
    const a=state.allAnalysis?.get(String(code));
    if(a)return Number(a.rank)<=100;
    const x=state.ranked.find(y=>String(y.code)===String(code));
    return !!(x&&Number(x.rank)<=100);
  }
  function getFavorites(){
    try{const x=JSON.parse(localStorage.getItem('ip7_favorites')||'[]');return Array.isArray(x)?x:[]}catch{return []}
  }
  function saveFavorites(items){localStorage.setItem('ip7_favorites',JSON.stringify(items.slice(0,100)))}
  function isFavorite(code){return getFavorites().some(x=>String(x.code)===String(code))}
  function toggleFavorite(){
    const s=state.selectedStock;if(!s)return;
    let fav=getFavorites();
    const i=fav.findIndex(x=>String(x.code)===String(s.code));
    if(i>=0)fav.splice(i,1);
    else fav.unshift({code:s.code,company:s.company||'',market:s.market||'',sector33:s.sector33||''});
    saveFavorites(fav);renderFavorites();updateFavoriteButton();renderFavoriteChanges().catch(()=>{});
  }
  function updateFavoriteButton(){
    const b=$('favoriteBtn'),s=state.selectedStock;if(!b)return;
    if(!s||isTop100(s.code)){b.style.display='none';return}
    b.style.display='block';
    b.textContent=isFavorite(s.code)?'★ お気に入り登録済み（解除）':'☆ お気に入りに保存';
  }
  function renderFavorites(){
    const fav=getFavorites();$('favoriteCount').textContent=fav.length;
    $('favoriteList').innerHTML=fav.length?fav.map(s=>`<div class="favorite-item">
      <div class="favorite-open" data-fav-open="${esc(s.code)}"><div class="nm">${esc(s.company||s.code)}</div><div class="sub">${esc(s.code)} · ${esc(s.sector33||s.market||'')} · 前営業日比 <span class="${changeColor(quoteOf(s.code)?.change_pct)}">${signedPct(quoteOf(s.code)?.change_pct)}</span></div></div>
      <button class="favorite-remove" data-fav-remove="${esc(s.code)}" aria-label="削除">×</button>
    </div>`).join(''):'<div class="small">まだ登録されていません。</div>';
    document.querySelectorAll('[data-fav-open]').forEach(el=>el.onclick=()=>openStockByCode(el.dataset.favOpen));
    document.querySelectorAll('[data-fav-remove]').forEach(el=>el.onclick=e=>{e.stopPropagation();saveFavorites(getFavorites().filter(x=>String(x.code)!==String(el.dataset.favRemove)));renderFavorites();updateFavoriteButton()});
  }
  function renderSearchSuggestions(list){
    const box=$('searchSuggestions');
    if(!list.length){box.classList.remove('show');box.innerHTML='';return}
    box.innerHTML=list.map(s=>`<div class="search-hit" data-stock-code="${esc(s.code)}"><div class="nm">${esc(s.company||s.code)}</div><div class="sub">${esc(s.code)} · ${esc(s.sector33||s.market||'')}</div></div>`).join('');
    box.classList.add('show');
    box.querySelectorAll('[data-stock-code]').forEach(el=>el.onclick=()=>openStockByCode(el.dataset.stockCode));
  }
  async function openStockByCode(code){
    let s=(state.stockMaster||[]).find(x=>String(x.code)===String(code));
    if(!s){
      const ranked=state.ranked.find(x=>String(x.code)===String(code));
      if(ranked)s={code:ranked.code,company:ranked.company,market:ranked.market||'',sector33:ranked.sector33||''};
    }
    if(!s){
      try{await loadStockMaster();s=state.stockMaster.find(x=>String(x.code)===String(code))}catch{}
    }
    if(!s)return;
    selectStock(s,true);
  }
  function selectStock(s,doResearch=true){
    state.selectedStock=s;
    $('researchCode').value=s.code||'';
    $('researchCompany').value=s.company||'';
    $('researchQuery').value=(s.code||'')+' '+(s.company||'');
    $('searchSuggestions').classList.remove('show');
    $('selectedStockInfo').classList.add('show');
    $('selectedStockInfo').innerHTML=`<div class="nm">${esc(s.company||s.code)}</div><div class="sub">証券コード ${esc(s.code)} · ${esc(s.sector33||s.market||'')}</div>`;
    showSelectedAnalysis(s.code);
    updateFavoriteButton();
    updateCompareButton();
    if(doResearch)runResearch();
  }
  async function resolveSearch(){
    const q=$('researchQuery').value.trim();
    if(!q){$('researchSummary').textContent='証券コードか会社名を入力してください。';return}
    try{
      await loadStockMaster();
      const codeInInput=q.match(/^([0-9A-Z]{4})(?:\s|$)/i)?.[1];
      const list=searchStocks(codeInInput||q,10);
      if(!list.length){$('researchSummary').textContent='該当する銘柄が見つかりません。';renderSearchSuggestions([]);return}
      const nq=normSearch(q);
      const exact=list.find(s=>normSearch(s.code)===nq||normSearch(s.company)===nq);
      selectStock(exact||list[0],true);
    }catch(e){
      $('researchSummary').textContent='銘柄一覧を読み込めませんでした。少し待って再読み込みしてください。';
    }
  }
  function materialEvaluation(score){
    score=Number(score)||0;
    if(score>=8)return {label:'🟢 強いプラス材料',cls:'good'};
    if(score>=3)return {label:'🟢 プラス材料優勢',cls:'good'};
    if(score<=-8)return {label:'🔴 強いマイナス材料',cls:'bad'};
    if(score<=-3)return {label:'🔴 マイナス材料優勢',cls:'bad'};
    return {label:'⚪ 中立',cls:'warn'};
  }
  function normalizeResearch(d){
    const sig=d?.sig||{};
    return {
      score:Number(d?.score??sig.score)||0,
      positive:d?.positive||sig.positive||[],
      negative:d?.negative||sig.negative||[],
      results:d?.results||[],
      summary:d?.summary||null
    };
  }
  function renderResearchResult(d,sourceLabel='調査結果'){
    const n=normalizeResearch(d),ev=materialEvaluation(n.score);
    $('researchSummary').innerHTML=n.results.length?`<b class="${ev.cls}">${ev.label}</b>　材料スコア <b class="${n.score>3?'good':n.score<-3?'bad':'warn'}">${n.score>0?'+':''}${n.score}</b><br><span class="small">${esc(sourceLabel)} · プラス: ${esc(n.positive.join('・')||'なし')} / 注意: ${esc(n.negative.join('・')||'なし')} · ニュース見出しの語句による機械評価（決算原本未確認）</span>`:'<span class="small">関連ニュースが取得できないため、材料評価は未判定です。</span>';
    $('researchResults').innerHTML=n.results.length?n.results.map(x=>`<div class="research-item"><a target="_blank" rel="noopener" href="${esc(safeHref(x.url))}">${esc(x.title||'')}</a><div class="meta">${esc(x.published||'')}</div></div>`).join(''):'<div class="small">関連ニュースはまだ取得できていません。</div>';
    $('liveResearchBtn').style.display=n.results.length?'none':'block';
  }
  async function liveResearch(){
    const code=$('researchCode').value.trim(),company=$('researchCompany').value.trim();
    if(!code)return;
    const b=$('liveResearchBtn');
    b.disabled=true;b.textContent='調査中…';
    startWait('今すぐニュースを調査中',25);
    const id=crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();
    researchJobs.set(id,{code,company});
    ensureResearchWorker().postMessage({id,code,company});
  }
  function ensureResearchWorker(){
    if(researchWorker)return researchWorker;
    researchWorker=new Worker('./research-worker.js');
    researchWorker.onmessage=e=>{
      const d=e.data||{}; researchJobs.delete(d.id); stopWait();
      const b=$('liveResearchBtn'); if(b){b.disabled=false;b.textContent='今すぐ調べて評価'}
      if(d.code){try{localStorage.setItem('ip7_research_'+d.code,JSON.stringify(d))}catch{}}
      if($('researchCode').value.trim()!==String(d.code||''))return;
      if(!d.ok){
        $('researchSummary').textContent='追加調査に失敗しました。通信状況を確認して、もう一度押してください。';
        if(b)b.style.display='block';
        return;
      }
      renderResearchResult(d,'今すぐ追加調査');
      if(!(d.results||[]).length&&b){
        b.style.display='block';
        b.textContent='もう一度調べる';
      }
    };
    return researchWorker;
  }
  function formatWait(sec){
    sec=Math.max(0,sec);
    return sec>60?`残り 約${Math.ceil(sec/60)}分`:`残り ${Math.ceil(sec)}秒`;
  }
  function startWait(label,estimatedSec){
    clearInterval(state.waitTimer);
    clearTimeout(state.waitShowTimer);
    state.waitEnd=Date.now()+estimatedSec*1000;
    $('waitLabel').textContent=label;
    const tick=()=>{
      const sec=Math.max(0,(state.waitEnd-Date.now())/1000);
      $('waitEta').textContent=sec>0?formatWait(sec):'まもなく完了';
    };
    tick();
    state.waitShowTimer=setTimeout(()=>{
      $('waitBox').classList.add('show');
      state.waitTimer=setInterval(tick,1000);
    },1200);
  }
  function stopWait(){
    clearInterval(state.waitTimer); state.waitTimer=null;
    clearTimeout(state.waitShowTimer); state.waitShowTimer=null;
    $('waitBox').classList.remove('show');
  }
  function setProgress(p,msg){$('progressBar').style.width=Math.max(0,Math.min(100,p))+'%';if(msg)$('topMessage').textContent=msg}
  function relayUrls(url){const mode=settings.relay;const all={direct:url,allorigins:'https://api.allorigins.win/raw?url='+encodeURIComponent(url),corsproxy:'https://corsproxy.io/?url='+encodeURIComponent(url),isomorphic:'https://cors.isomorphic-git.org/'+url}; if(mode!=='auto')return [all[mode]||url];return [all.direct,all.corsproxy,all.allorigins,all.isomorphic]}
  async function fetchAny(url,{binary=false,timeout=30000,useCache=true}={}){
    if(useCache){const c=await idbGet('files',url).catch(()=>null);if(c&&c.buffer&&Date.now()-(c.savedAt||0)<1000*60*60*24*45)return binary?c.buffer:new TextDecoder().decode(c.buffer)}
    let last='';for(const u of relayUrls(url)){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeout);try{const r=await fetch(u,{cache:'no-store',signal:ctrl.signal,headers:{'Accept':binary?'application/octet-stream,*/*':'text/html,text/plain,*/*'}});clearTimeout(timer);if(!r.ok)throw new Error('HTTP '+r.status);const buf=await r.arrayBuffer();if(buf.byteLength<20)throw new Error('empty response'); if(useCache)await idbPut('files',{key:url,buffer:buf,savedAt:Date.now()}).catch(()=>{});return binary?buf:IPCore.decodeBytes(new Uint8Array(buf))}catch(e){clearTimeout(timer);last=e.message||String(e)}}throw new Error(`取得失敗: ${last}`)
  }
  function openDB(){return new Promise((res,rej)=>{const q=indexedDB.open('invest-pilot-v7',1);q.onupgradeneeded=()=>{const d=q.result;if(!d.objectStoreNames.contains('files'))d.createObjectStore('files',{keyPath:'key'});if(!d.objectStoreNames.contains('snapshots'))d.createObjectStore('snapshots',{keyPath:'key'});};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
  async function idbGet(store,key){const d=await openDB();return new Promise((res,rej)=>{const tx=d.transaction(store,'readonly'),q=tx.objectStore(store).get(key);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)})}
  async function idbPut(store,val){const d=await openDB();return new Promise((res,rej)=>{const tx=d.transaction(store,'readwrite'),q=tx.objectStore(store).put(val);q.onsuccess=()=>res(val);q.onerror=()=>rej(q.error)})}
  async function idbClear(){const d=await openDB();for(const s of ['files','snapshots'])await new Promise((res,rej)=>{const tx=d.transaction(s,'readwrite'),q=tx.objectStore(s).clear();q.onsuccess=()=>res();q.onerror=()=>rej(q.error)})}

  async function parseArchive(buffer,link,priceMap,actions,isSplit=false){
    const u8=new Uint8Array(buffer);let isZip=u8[0]===0x50&&u8[1]===0x4b; if(isZip){const zip=await JSZip.loadAsync(buffer);const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir&&/\.(csv|txt)$/i.test(n)).sort();for(const name of names){const bytes=await zip.files[name].async('uint8array'),text=IPCore.decodeBytes(bytes),def=IPCore.inferDateFromName(name,link.kind==='day'?IPCore.parseDateInt(link.key):null);if(isSplit)actions.push(...IPCore.parseSplitDelimitedText(text,link.url+'#'+name));else IPCore.appendRows(priceMap,IPCore.parseDelimitedText(text,def,link.url+'#'+name));await breathe();}}
    else {const text=IPCore.decodeBytes(u8),def=IPCore.inferDateFromName(link.label,link.kind==='day'?IPCore.parseDateInt(link.key):null);if(isSplit)actions.push(...IPCore.parseSplitDelimitedText(text,link.url));else IPCore.appendRows(priceMap,IPCore.parseDelimitedText(text,def,link.url));}
  }
  const breathe=()=>new Promise(r=>setTimeout(r,0));
  async function loadCloudSnapshot(){
    startWait('最新データを読み込み中',15);
    $('topMessage').textContent='クラウドで解析済みのデータを取得中…';
    const r=await fetch('./data/latest-ranking.json?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('クラウドランキング未生成: HTTP '+r.status);
    const d=await r.json();
    const rows=Array.isArray(d.candidates)?d.candidates:(Array.isArray(d.top100)?d.top100:[]);
    if(!rows.length)throw new Error('クラウドランキングが空です');
    state.ranked=rows.slice(0,500);
    state.snapshot={key:'cloud',updatedAt:Date.parse(d.generated_at)||Date.now(),generatedAt:d.generated_at||null,months:0,asof:null,actionCount:0,ranked:state.ranked};
    state.months=0;
    renderStatus();renderRows();
    $('asof').textContent=d.generated_at?new Date(d.generated_at).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'CLOUD';
    $('cacheState').textContent='Cloud';
    $('scoreCount').textContent=(d.universe_count||state.ranked.length).toLocaleString('ja-JP');
    $('topMessage').textContent='最新の解析結果を表示中。重い全銘柄解析はクラウド側で処理済みです。';
    renderDataHealth();
    stopWait();
    prefetchCloudAssets();
    return d;
  }
  async function loadCloudResearch(){
    if(state.cloudResearch)return state.cloudResearch;
    if(state.researchPromise)return state.researchPromise;
    state.researchPromise=(async()=>{
      const r=await fetch('./data/research.json?ts='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('クラウド調査データ未生成');
      state.cloudResearch=await r.json();
      return state.cloudResearch;
    })();
    try{return await state.researchPromise}
    finally{state.researchPromise=null}
  }
  function strategyDaysLabel(days){
    const d=Number(days)||20;
    if(d===10)return '10営業日（約2週間）';
    if(d===20)return '20営業日（約1か月）';
    if(d===40)return '40営業日（約2か月）';
    if(d===60)return '60営業日（約3か月）';
    if(d===100)return '100営業日（約5か月）';
    return d+'営業日';
  }
  function renderStrategyConfig(){
    const d=state.strategyConfig;
    const title=$('strategyAutoTitle'),meta=$('strategyAutoMeta'),table=$('strategyAutoTable');
    if(!title||!meta||!table)return;
    if(!d){
      title.textContent='おすすめの見直し間隔を計算中…';
      meta.textContent='10・20・40・60・100営業日を複数期間で比較します。';
      table.innerHTML='';
      return;
    }
    const optimizedForFive=Number(d.optimizer_version)>=2&&Number(d.backtest_assumptions?.topN)===5;
    const rec=optimizedForFive?(Number(d.recommended_days)||20):20;
    if(!optimizedForFive){
      title.textContent='5銘柄向けの自動改善を再計算中';
      meta.textContent='以前の設定は10銘柄の検証値のため、5銘柄にそのまま当てはめません。再計算まで手動設定または暫定20営業日で表示します。';
      table.innerHTML='';
      return;
    }
    const changed=d.changed&&Number(d.previous_recommended_days)!==rec;
    title.textContent='自動おすすめ：'+strategyDaysLabel(rec);
    meta.textContent=(changed?('前回 '+strategyDaysLabel(d.previous_recommended_days)+' → 今回変更。'):'前回から変更なし。')+' 信頼度 '+(d.confidence||'—')+'。微差では設定を変えません。';
    const auto=$('btDays')&&$('btDays').querySelector('option[value="auto"]');
    if(auto)auto.textContent='自動（おすすめ：'+strategyDaysLabel(rec)+'）';
    const rows=(d.evaluations||[]).map(function(x){
      const cls=Number(x.days)===rec?' class="recommended"':'';
      const med=Number.isFinite(Number(x.median_annual_return))?pct(Number(x.median_annual_return)):'—';
      const dd=Number.isFinite(Number(x.worst_max_drawdown))?pct(Number(x.worst_max_drawdown)):'—';
      return '<tr'+cls+'><td>'+Number(x.days)+'日'+(Number(x.days)===rec?' ✓':'')+'</td><td>'+med+'</td><td>'+dd+'</td><td>'+Number(x.min_periods_per_window||0)+'回</td><td>'+Number(x.robust_score).toFixed(1)+'</td></tr>';
    }).join('');
    table.innerHTML='<table class="strategy-table"><thead><tr><th>見直し間隔</th><th>年率中央値</th><th>最大下落</th><th>最低検証回数</th><th>安定度</th></tr></thead><tbody>'+rows+'</tbody></table><div class="small" style="margin-top:8px">過去5年を複数期間に分けた比較です。安定度は利益・対ベンチマーク・最大下落・ばらつきをまとめた内部比較値です。</div>';
  }
  async function loadStrategyConfig(){
    if(state.strategyConfig)return state.strategyConfig;
    if(state.strategyConfigPromise)return state.strategyConfigPromise;
    state.strategyConfigPromise=(async()=>{
      const r=await fetch('./data/strategy-config.json?ts='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('自動改善データ未生成');
      state.strategyConfig=await r.json();
      renderStrategyConfig();
      return state.strategyConfig;
    })();
    try{return await state.strategyConfigPromise}finally{state.strategyConfigPromise=null}
  }
  function resolvedRebalanceDays(){
    const v=$('btDays')?$('btDays').value:'auto';
    if(v!=='auto')return Number(v)||20;
    if(Number(state.strategyConfig?.optimizer_version)!==2||Number(state.strategyConfig?.backtest_assumptions?.topN)!==5)return 20;
    return Number(state.strategyConfig?.recommended_days)||20;
  }
  function fundamentalLabelClass(key){
    return key==='good'?'good':key==='caution'?'bad':'warn';
  }
  function fundamentalHtml(code,compact=false){
    const f=state.fundamentals&&state.fundamentals.get(String(code));
    if(!f)return compact?'<div class="stock-reason">業績参考：データ未取得</div>':'<div class="explain-box"><b>業績参考</b><br>この銘柄は定期取得対象外、または業績データ取得前です。総合順位には影響しません。</div>';
    const cls=fundamentalLabelClass(f.reference_key);
    const score=hasNumber(f.reference_score)?Number(f.reference_score).toFixed(0)+'点':'—';
    const cachedNote=f.is_cached?' · 前回取得値 '+quoteDate(String(f.last_success_at||'').slice(0,10)):'';
    if(compact)return '<div class="stock-reason">業績参考：<b class="'+cls+'">'+esc(f.reference_label||'—')+'</b> '+score+esc(cachedNote)+'（順位には不使用）</div>';
    const cells=[
      ['売上成長',pct(f.revenueGrowth)],
      ['利益成長',pct(f.earningsGrowth)],
      ['ROE',pct(f.returnOnEquity)],
      ['営業利益率',pct(f.operatingMargins)],
      ['PER',hasNumber(f.trailingPE)?Number(f.trailingPE).toFixed(1)+'倍':'—']
    ].map(x=>'<div class="analysis-cell"><div class="k">'+x[0]+'</div><div class="v">'+x[1]+'</div></div>').join('');
    return '<div class="explain-box"><b>業績参考：<span class="'+cls+'">'+esc(f.reference_label||'—')+' '+score+'</span></b><br>モメンタム順位とは別枠の参考情報です。売上成長・利益成長・ROE・営業利益率・PERを見ています。'+esc(cachedNote)+'。資料の対象期は銘柄や指標で異なることがあります。</div><div class="analysis-grid">'+cells+'</div>';
  }
  async function loadFundamentals(){
    if(state.fundamentals)return state.fundamentals;
    if(state.fundamentalsPromise)return state.fundamentalsPromise;
    state.fundamentalsPromise=(async()=>{
      const r=await fetch('./data/fundamentals.json?ts='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('業績参考データ未生成');
      const d=await r.json();
      const map=new Map();
      for(const [code,x] of Object.entries(d.stocks||{}))map.set(String(code),x);
      state.fundamentals=map;
      renderRows();
      if(state.selectedStock)showSelectedAnalysis(state.selectedStock.code);
      renderCompare().catch(()=>{});
      return map;
    })();
    try{return await state.fundamentalsPromise}finally{state.fundamentalsPromise=null}
  }
  async function loadCloudHistory(){
    if(state.priceMap&&state.months>=24)return state.priceMap;
    if(state.historyPromise)return state.historyPromise;
    state.historyPromise=(async()=>{
      const r=await fetch('./data/backtest-history.json?ts='+Date.now(),{cache:'no-store'});
      if(!r.ok)throw new Error('クラウド履歴データ未生成');
      const d=await r.json();
      const dates=Array.isArray(d.dates)?d.dates:[];
      const map=new Map();
      for(const [code,s] of Object.entries(d.stocks||{})){
        const closes=Array.isArray(s.closes)?s.closes:[];
        const pts=[];
        for(let i=0;i<Math.min(dates.length,closes.length);i++){
          const cl=closes[i];
          if(Number.isFinite(Number(cl))&&Number(cl)>0)pts.push([Number(dates[i]),Number(cl),null]);
        }
        if(pts.length>=260)map.set(code,{code,company:s.company||code,market:s.market||'',sector33:s.sector33||'',points:pts});
      }
      if(map.size<50)throw new Error('クラウド履歴が不足しています');
      state.priceMap=map;
      state.months=24;
      return map;
    })();
    try{return await state.historyPromise}
    finally{state.historyPromise=null}
  }
  function prefetchCloudAssets(){
    // iPhoneの描画を優先。大きな履歴JSONは最後に読み込む。
    setTimeout(()=>{
      loadDailyQuotes().catch(()=>{if(!state.dailyQuotes&&$('dailyAsOf'))$('dailyAsOf').textContent='前営業日比：現在取得できません（ランキングは表示可能）';});
      loadStockMaster().catch(()=>{});
      loadAllAnalysis().catch(()=>{});
    },200);
    setTimeout(()=>{
      loadCloudResearch().catch(()=>{});
      loadStrategyConfig().catch(()=>{});
      loadFundamentals().catch(()=>{});
    },1500);
    setTimeout(()=>loadCloudHistory().catch(()=>{}),3500);
  }
  async function syncData(months=13){
    if(state.busy)return;state.busy=true;toggleBusy(true);startWait(months>=24?'長期データを取得・解析中':'データを取得・解析中',months>=24?240:180);setProgress(2,'価格データを確認中…');const started=Date.now();
    try{
      const page=await fetchAny(settings.source,{binary:false,useCache:false});setProgress(8,'ダウンロード対象を確認中…');const priceLinks=IPCore.selectPriceLinks(IPCore.discoverLinks(page,settings.source,'prices'),months);const splitLinks=IPCore.selectSplitLinks(IPCore.discoverLinks(page,settings.source,'splits'),months);if(!priceLinks.length)throw new Error('株価ZIP/CSVリンクを検出できませんでした');
      const priceMap=new Map(),actions=[];let done=0,total=priceLinks.length+splitLinks.length;
      for(const link of splitLinks){setProgress(8+74*(done/Math.max(1,total)),`分割・併合 ${link.label} を確認中…`);try{const b=await fetchAny(link.url,{binary:true,timeout:50000});await parseArchive(b,link,priceMap,actions,true)}catch(e){console.warn('split',link.label,e)}done++;}
      for(const link of priceLinks){setProgress(8+74*(done/Math.max(1,total)),`株価 ${link.label} を解析中…`);const b=await fetchAny(link.url,{binary:true,timeout:60000});await parseArchive(b,link,priceMap,actions,false);done++;await breathe();}
      setProgress(84,'株式分割・併合を補正中…');IPCore.normalizePriceMap(priceMap,Math.max(330,months*24+50));IPCore.applyCorporateActions(priceMap,actions);setProgress(90,'全銘柄を採点中…');const ranked=IPCore.scorePriceMap(priceMap,settings.theme);if(!ranked.length)throw new Error('採点可能な銘柄がありません');state.priceMap=priceMap;state.ranked=ranked;state.months=months;state.actions=actions;const asof=Math.max(...[...priceMap.values()].map(x=>x.points.at(-1)?.[0]||0));const snap={key:'latest',updatedAt:Date.now(),months,asof,actionCount:actions.length,ranked:ranked.slice(0,500)};await idbPut('snapshots',snap);localStorage.setItem('ip7_last_sync',String(Date.now()));state.snapshot=snap;renderStatus();renderRows();setProgress(100,`更新完了：${ranked.length.toLocaleString('ja-JP')}銘柄 / ${IPCore.dateIntToISO(asof)} / ${(Date.now()-started)/1000|0}秒`);setTimeout(()=>setProgress(0),1800);
    }catch(e){console.error(e);setProgress(0,'自動取得エラー：'+e.message+'　保存済みデータは維持しています。');throw e}finally{state.busy=false;toggleBusy(false);stopWait()}
  }
  function toggleBusy(v){['syncBtn','syncBtnBottom','btLoad24'].forEach(id=>{if($(id))$(id).disabled=v})}
  function renderStatus(){const s=state.snapshot;$('asof').textContent=s?.asof?IPCore.dateIntToISO(s.asof):(s?.updatedAt?new Date(s.updatedAt).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'読込前');$('scoreCount').textContent=(state.analysisUniverseCount||state.ranked?.length||0).toLocaleString('ja-JP');$('cacheState').textContent=s?'Cloud':'未同期';$('envState').textContent=navigator.standalone||matchMedia('(display-mode: standalone)').matches?'PWA':'Safari';renderDataHealth();}
  function forecastHtml(x){
    const f=x.forecast20;
    if(!f)return '<div class="forecast-box"><div class="forecast-title">過去の類似局面（20営業日後の参考）</div><div class="forecast-meta">類似パターンを計算中／データ不足</div></div>';
    const rangeClass=Number(f.range_high)>=0?'good':'bad';
    return '<div class="forecast-box">'+
      '<div class="forecast-title">過去の類似局面：20営業日後の値動き（将来予測ではありません）</div>'+
      '<div class="forecast-main"><div class="forecast-range '+rangeClass+'">'+pct(f.range_low)+' 〜 '+pct(f.range_high)+'</div>'+
      '<div class="forecast-up">類似例の上昇割合 '+(hasNumber(f.up_rate)?Math.round(Number(f.up_rate)*100)+'%':'—')+'</div></div>'+
      '<div class="forecast-meta">中央値 '+pct(f.median)+' · 類似 '+esc(f.samples)+'例 · 参考度目安 '+esc(f.confidence||'—')+'</div></div>';
  }
  function renderFiveStockBasket(){
    const status=$('basketStatus'),summary=$('basketSummary'),list=$('basketList');
    if(!status||!summary||!list)return;
    const money=Number($('capital')?.value)||200000;
    const note='<div class="basket-note">実際の発注価格と株数は証券会社で確認してください。配当・税金・手数料・約定価格の変動は計算に含みません。</div>';
    if(state.snapshot?.key!=='cloud'||!Array.isArray(state.ranked)||state.ranked.length<100){
      status.innerHTML='<strong>ランキングデータを読み込み中</strong><p>国内株の最新の総合順位が届くと、5銘柄の資金配分を試算します。</p>';
      list.innerHTML='';return;
    }
    if(!state.dailyQuotes){
      status.innerHTML=state.dailyError?'<strong>株価を取得できません</strong><p>誤った株数を出さないよう、購入シミュレーションを停止しています。「最新データを読み込む」から再取得してください。</p>':'<strong>終値データを確認中</strong><p>購入株数の試算は直近終値を使います。株価が読み込めていない間は、株数を出しません。</p>';
      list.innerHTML='';return;
    }
    const mode=$('semiMode').value;
    const risk=$('risk').value;
    const lot=Number($('lotMode').value)||1;
    const priced=state.ranked.filter(x=>IPCore.modeOK(x,mode)).map(x=>{
      const q=quoteOf(x.code);
      const ago=q?.price_date?Date.now()-Date.parse(q.price_date+'T00:00:00+09:00'):Infinity;
      if(!q||!Number.isFinite(ago)||ago>7*86400000)return {...x,eligible:false,close:NaN};
      const sig=IPSignals.classify(x);
      return {...x,close:Number(q.close),signal:sig.label,
        eligible:sig.key==='strongbuy'||sig.key==='buy'};
    });
    const p=IPCore.buildFiveStockPlan(priced,{capital:money,risk,lot,maxPositions:5,reserve:.10,scoreGap:10});
    status.innerHTML='<strong>'+esc(p.status)+'</strong><p>'+esc(p.reason)+
      ' 業種・テーマは'+p.unique_themes+'分類。買い判定が出ても、現時点での買付を指示するものではありません。</p>';
    const summaryCell=(k,v)=>'<div class="basket-metric"><div class="k">'+k+'</div><div class="v">'+v+'</div></div>';
    summary.innerHTML=summaryCell('試算対象',p.count+' / 5銘柄')+
      summaryCell('概算購入額',yen(p.committed))+
      summaryCell('残しておく現金',yen(p.remaining))+
      summaryCell('1銘柄の上限',yen(p.slot))+
      summaryCell('業種・テーマ分類',p.unique_themes+'分類')+
      summaryCell('買い判定の候補',p.qualifying_count+'銘柄');
    list.innerHTML=p.positions.map((x,i)=>
      '<div class="basket-item" role="button" tabindex="0" data-basket-code="'+esc(x.code)+'"><div><strong>'+(i+1)+'. '+esc(x.company)+'</strong><div class="basket-sub">'+
      esc(x.code)+' · 全市場 '+esc(x.rank)+'位 · '+esc(x.theme)+'<br>'+esc(x.signal)+
      ' · 終値 '+moneyWithDecimals(x.price)+' × '+x.shares+'株</div></div>'+
      '<div class="basket-cost">'+yen(x.estimated_total)+'<div class="basket-sub">'+
      ((x.estimated_total/(p.capital||1))*100).toFixed(1)+'% 配分</div></div></div>'
    ).join('')+(p.count<5?'<div class="basket-note">満たせなかった枠は「条件不足」扱いにしており、弱い銘柄で数合わせはしません。</div>':'')+note;
    list.querySelectorAll('[data-basket-code]').forEach(el=>{const open=()=>pickResearch(el.dataset.basketCode);el.onclick=open;el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}}});
  }

  function currentRows(){
    const capital=+$('capital').value||100000,risk=$('risk').value,lot=+$('lotMode').value||1,mode=$('semiMode').value;
    const priced=state.dailyQuotes?state.ranked.map(x=>{const q=quoteOf(x.code);return q?{...x,close:q.close}:x}):state.ranked;
    return IPCore.decorateForCapital(priced,capital,risk,lot,mode).slice(0,100);
  }
  function renderRows(resetVisible=false){
    if(resetVisible)state.visibleCount=20;
    const mode=$('semiMode').value;
    const heading=$('rankingTitle');
    if(heading)heading.textContent=mode==='all'?'国内株 総合ランキング TOP100':mode==='only'?'半導体 上位候補（最大100件）':'半導体を除いた上位候補（最大100件）';
    const rows=currentRows();
    const withSig=rows.map(x=>({...x,_sig:(globalThis.IPSignals&&IPSignals.classify)?IPSignals.classify(x):{key:'watch',label:'🔵 監視',reason:'条件確認中'}}));
    const counts={strongbuy:0,buy:0,wait:0,watch:0,avoid:0,strongsell:0};
    withSig.forEach(x=>counts[x._sig.key]=(counts[x._sig.key]||0)+1);
    $('allCount').textContent=withSig.length;
    $('strongBuyCount').textContent=counts.strongbuy||0;
    $('buyCount').textContent=counts.buy||0;
    $('waitCount').textContent=counts.wait||0;
    $('watchCount').textContent=counts.watch||0;
    $('avoidCount').textContent=counts.avoid||0;
    $('strongSellCount').textContent=counts.strongsell||0;
    const filtered=state.signalFilter==='all'?withSig:withSig.filter(x=>x._sig.key===state.signalFilter);
    const shown=filtered.slice(0,state.visibleCount);
    $('shownCount').textContent=`${shown.length} / ${filtered.length}件`;
    $('stockCards').innerHTML=shown.length?shown.map(x=>{
      const sig=x._sig;
      const sigClass=sig.key==='strongbuy'?'strongbuy':sig.key==='buy'?'buy':sig.key==='strongsell'?'strongsell':sig.key==='avoid'?'avoid':sig.key==='wait'?'wait':'watch';
      return `<article class="stock-card" data-code="${esc(x.code)}">
        <div class="stock-top">
          <div><div class="stock-title">#${x.rank} ${esc(x.company||x.code)}${x.is_semiconductor?'<span class="badge semi">半導体</span>':''}</div><div class="stock-code">${esc(x.code)} · ${esc(x.sector33||x.market||'')}</div></div>
          <div class="signal-pill ${sigClass}">${sig.label}</div>
        </div>
        ${quoteStrip(x.code)}
        <div class="stock-main">
          <div><div class="k">${quoteOf(x.code)?"直近の終値":"解析時の参考価格"}</div><div class="v">${moneyWithDecimals(x.close)}</div></div>
          <div><div class="k">モメンタム総合点</div><div class="v">${(+x.technical_score).toFixed(1)}</div></div>
        </div>
        ${purchasePlanHtml(x,true)}
        <div class="stock-reason">${esc(sig.reason)}</div>
        ${fundamentalHtml(x.code,true)}
        ${forecastHtml(x)}
        <div class="stock-details">
          <div>過去20日<b class="${x.ret20>=0?'up':'down'}">${pct(x.ret20)}</b></div>
          <div>過去60日<b class="${x.ret60>=0?'up':'down'}">${pct(x.ret60)}</b></div>
          <div>過去120日<b class="${x.ret120>=0?'up':'down'}">${pct(x.ret120)}</b></div>
          <div>過去250日<b class="${x.ret250>=0?'up':'down'}">${pct(x.ret250)}</b></div>
        </div>
      </article>`;
    }).join(''):'<div class="simple-note">この条件では候補がありません。</div>';
    document.querySelectorAll('.stock-card[data-code]').forEach(el=>el.onclick=()=>pickResearch(el.dataset.code));
    $('moreBtn').style.display=state.visibleCount<filtered.length?'block':'none';
    renderFiveStockBasket();
    saveBasicSettings();
  }
  function saveBasicSettings(){localStorage.setItem('ip7_capital',$('capital').value);localStorage.setItem('ip7_risk',$('risk').value);localStorage.setItem('ip7_semi',$('semiMode').value);localStorage.setItem('ip7_lot',$('lotMode').value)}
  function pickResearch(code){const x=state.ranked.find(y=>y.code===code);switchPane('research');if(x)selectStock({code:x.code,company:x.company,market:x.market||'',sector33:x.sector33||''},true);else openStockByCode(code)}
  function switchPane(id){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.pane===id));document.querySelectorAll('.pane').forEach(x=>x.classList.toggle('active',x.id===id));}
  async function ensureHistory(){if(state.priceMap&&state.months>=24)return;await loadCloudHistory()}
  async function runBT(modeOverride=null){
    const b=$('btRun');b.disabled=true;startWait('過去成績を計算中',8);$('btMsg').textContent='過去データで計算中…';
    try{
      await Promise.all([ensureHistory(13),loadStrategyConfig().catch(()=>null)]);
      const days=resolvedRebalanceDays();
      const opts={mode:modeOverride||$('btSemi').value,capital:+$('btCapital').value||100000,risk:$('risk').value,lot:+$('btLot').value||1,topN:+$('btTop').value||10,rebalanceDays:days,costBps:+$('btCost').value||10,reserve:.10,theme:settings.theme};
      const d=IPCore.runBacktest(state.priceMap,opts);
      renderBT(d);
      $('btMsg').textContent=d.start_date+'〜'+d.end_date+' / 見直し '+strategyDaysLabel(days)+' / '+d.periods+'期間 / 買えず見送り '+d.skipped_unaffordable+'回';
    }catch(e){$('btMsg').textContent='検証エラー：'+e.message}
    finally{b.disabled=false;stopWait()}
  }
  function renderBT(d){$('btMetrics').innerHTML=`<div class="metric"><div class="k">累積</div><div class="v ${d.total_return>=0?'good':'bad'}">${pct(d.total_return)}</div></div><div class="metric"><div class="k">最終資金</div><div class="v">${yen(d.ending_capital)}</div></div><div class="metric"><div class="k">最大DD</div><div class="v bad">${pct(d.max_drawdown)}</div></div><div class="metric"><div class="k">期間数</div><div class="v">${d.periods}</div></div>`;drawCurve(d.curve);$('btCompareTable').innerHTML=`<div class="small">候補ユニバース等金額ベンチ: ${pct(d.benchmark_return)} / 平均半導体保有 ${d.avg_semiconductor_selected.toFixed(1)}銘柄</div>`}
  function drawCurve(curve){const c=$('btChart'),ctx=c.getContext('2d'),W=c.width,H=c.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#0a142a';ctx.fillRect(0,0,W,H);if(!curve?.length)return;const vals=curve.flatMap(x=>[x.strategy,x.benchmark]),mn=Math.min(...vals)*.96,mx=Math.max(...vals)*1.04;ctx.strokeStyle='#293b61';ctx.lineWidth=1;for(let i=1;i<5;i++){let y=H*i/5;ctx.beginPath();ctx.moveTo(38,y);ctx.lineTo(W-12,y);ctx.stroke()}function line(k,col){ctx.strokeStyle=col;ctx.lineWidth=3;ctx.beginPath();curve.forEach((x,i)=>{let xx=38+(W-52)*i/(curve.length-1||1),yy=H-18-(H-36)*(x[k]-mn)/(mx-mn||1);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke()}line('strategy','#7aa8ff');line('benchmark','#95a6c2')}
  async function compareSemi(){
    switchPane('backtest');startWait('半導体あり／なしを比較中',10);$('btMsg').textContent='半導体を含む場合と、除いた場合の過去成績を比較しています…';
    try{
      await Promise.all([ensureHistory(13),loadStrategyConfig().catch(()=>null)]);
      const days=resolvedRebalanceDays();
      const base={capital:+$('capital').value||100000,risk:$('risk').value,lot:+$('lotMode').value||1,topN:10,rebalanceDays:days,costBps:10,reserve:.10,theme:settings.theme};
      const a=IPCore.runBacktest(state.priceMap,{...base,mode:'all'}),b=IPCore.runBacktest(state.priceMap,{...base,mode:'exclude'});
      renderBT(a);
      $('btCompareTable').innerHTML='<table style="min-width:560px"><thead><tr><th>条件</th><th>最終資金</th><th>累積</th><th>最大DD</th><th>期間</th></tr></thead><tbody><tr><td>半導体を含む</td><td>'+yen(a.ending_capital)+'</td><td>'+pct(a.total_return)+'</td><td>'+pct(a.max_drawdown)+'</td><td>'+a.periods+'</td></tr><tr><td>半導体を除く</td><td>'+yen(b.ending_capital)+'</td><td>'+pct(b.total_return)+'</td><td>'+pct(b.max_drawdown)+'</td><td>'+b.periods+'</td></tr></tbody></table>';
      $('btMsg').textContent='比較完了。見直し間隔は '+strategyDaysLabel(days)+' を使用。';
    }catch(e){$('btMsg').textContent='比較エラー：'+e.message}
    finally{stopWait()}
  }
  async function runResearch(){
    const code=$('researchCode').value.trim(),company=$('researchCompany').value.trim();
    if(!code){$('researchSummary').textContent='証券コードか会社名で銘柄を検索してください。';return}
    $('liveResearchBtn').style.display='none';
    $('researchSummary').textContent='事前取得したニュース・決算を確認中…';
    try{
      const cloud=await loadCloudResearch();
      const d=cloud?.stocks?.[code];
      if(d&&(d.results||[]).length){
        renderResearchResult(d,'クラウド事前調査');
        return;
      }
      try{
        const local=JSON.parse(localStorage.getItem('ip7_research_'+code)||'null');
        if(local?.ok&&(local.results||[]).length){
          renderResearchResult(local,'前回の追加調査');
          return;
        }
      }catch{}
      if(d)renderResearchResult(d,'クラウド事前調査');
      else{
        $('researchSummary').textContent='事前ニュースがありません。「今すぐ調べて評価」で追加調査できます。';
        $('researchResults').innerHTML='';
      }
      $('liveResearchBtn').style.display='block';
    }catch(e){
      try{
        const local=JSON.parse(localStorage.getItem('ip7_research_'+code)||'null');
        if(local?.ok){
          renderResearchResult(local,'前回の追加調査');
          return;
        }
      }catch{}
      $('researchSummary').textContent='事前調査データを読めませんでした。「今すぐ調べて評価」を押してください。';
      $('researchResults').innerHTML='';
      $('liveResearchBtn').style.display='block';
    }
  }
  function manualSearch(){const raw=$('researchCode').value?`${$('researchCode').value} ${$('researchCompany').value}`:$('researchQuery').value;const q=encodeURIComponent(`${raw} 株 決算 最新ニュース 上方修正 下方修正`);window.open('https://www.google.com/search?q='+q,'_blank','noopener')}
  async function exportRanking(){const rows=currentRows(),head=['rank','code','company','score','close','ret20','ret60','ret120','ret250','semiconductor','budget_yen','shares'];const csv=[head.join(','),...rows.map(x=>[x.rank,x.code,`"${String(x.company).replaceAll('"','""')}"`,x.technical_score.toFixed(2),x.close,x.ret20,x.ret60,x.ret120,x.ret250,x.is_semiconductor?1:0,x.budget_yen,x.shares_by_budget].join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'}));a.download='invest_pilot_v7_ranking.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  async function init(){
    state.compareCodes=getCompareCodes();
    $('capital').value=localStorage.getItem('ip7_capital')||200000;$('risk').value=localStorage.getItem('ip7_risk')||'mid';$('semiMode').value=localStorage.getItem('ip7_semi')||'all';$('lotMode').value=localStorage.getItem('ip7_lot')||'1';$('btCapital').value=$('capital').value;$('btLot').value=$('lotMode').value;$('btDays').value=localStorage.getItem('ip7_bt_days')||'auto';$('sourcePage').value=settings.source;$('relayMode').value=settings.relay;$('semiExtra').value=(settings.theme.extra||[]).join(',');$('semiExclude').value=(settings.theme.exclude||[]).join(',');$('autoToggle').classList.toggle('on',settings.auto);
    try{const snap=await idbGet('snapshots','latest');if(snap?.ranked?.length){state.snapshot=snap;state.ranked=snap.ranked;state.months=snap.months||0}}catch{}renderStatus();renderRows();
    document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchPane(b.dataset.pane));
    document.querySelectorAll('.filterbox').forEach(b=>b.onclick=()=>{state.signalFilter=b.dataset.signal||'all';state.visibleCount=20;document.querySelectorAll('.filterbox').forEach(x=>x.classList.toggle('active',x===b));renderRows();});['capital','risk','semiMode','lotMode'].forEach(id=>$(id).addEventListener('change',()=>{if(id==='capital')$('btCapital').value=$('capital').value;if(id==='lotMode')$('btLot').value=$('lotMode').value;renderRows(true)}));
    $('syncBtn').onclick=()=>loadCloudSnapshot().then(()=>loadDailyQuotes(true).catch(()=>{})).catch(e=>{stopWait();$('topMessage').textContent='更新エラー：'+e.message});$('syncBtnBottom').onclick=$('syncBtn').onclick;$('recalcBtn').onclick=()=>renderRows(true);$('moreBtn').onclick=()=>{state.visibleCount=Math.min(100,state.visibleCount+20);renderRows()};$('compareBtn').onclick=compareSemi;$('btRun').onclick=()=>runBT();$('btLoad24').onclick=()=>{state.priceMap=null;state.months=0;startWait('クラウド履歴を再読込中',8);loadCloudHistory().then(()=>{$('btMsg').textContent='クラウド履歴を読み込みました。';stopWait()}).catch(e=>{stopWait();$('btMsg').textContent='履歴読込エラー：'+e.message})};$('researchBtn').onclick=resolveSearch;$('liveResearchBtn').onclick=liveResearch;$('manualSearchBtn').onclick=manualSearch;$('favoriteBtn').onclick=toggleFavorite;$('compareAddBtn').onclick=addSelectedToCompare;$('compareClearBtn').onclick=()=>{saveCompareCodes([]);renderCompare();updateCompareButton()};$('homeSearchBtn').onclick=homeSearch;$('homeSearch').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();homeSearch()}});$('researchQuery').addEventListener('input',async()=>{const q=$('researchQuery').value.trim();if(!q){renderSearchSuggestions([]);return}try{await loadStockMaster();renderSearchSuggestions(searchStocks(q,10))}catch{}});$('researchQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();resolveSearch()}});renderFavorites();renderCompare();renderDataHealth();renderStrategyConfig();$('btDays').addEventListener('change',()=>localStorage.setItem('ip7_bt_days',$('btDays').value));
    $('autoToggle').onclick=()=>{settings.auto=!settings.auto;$('autoToggle').classList.toggle('on',settings.auto)};$('sourcePage').onchange=()=>settings.source=$('sourcePage').value.trim();$('relayMode').onchange=()=>settings.relay=$('relayMode').value;$('saveThemeBtn').onclick=()=>{localStorage.setItem('ip7_semi_extra',$('semiExtra').value);localStorage.setItem('ip7_semi_exclude',$('semiExclude').value);$('topMessage').textContent='半導体テーマ設定を保存しました。次回再計算から反映します。';if(state.priceMap){state.ranked=IPCore.scorePriceMap(state.priceMap,settings.theme);renderRows()}};$('clearCacheBtn').onclick=async()=>{await idbClear();state.priceMap=null;state.snapshot=null;state.cloudResearch=null;state.ranked=IPCore.DEMO.slice();localStorage.removeItem('ip7_last_sync');renderStatus();renderRows();$('topMessage').textContent='保存データを削除しました。'};$('exportBtn').onclick=exportRanking;
    if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
    setTimeout(()=>loadCloudSnapshot().catch(()=>{}),300);
  }
  init();
}
