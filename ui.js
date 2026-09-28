if(typeof document!=='undefined'){
  const $=id=>document.getElementById(id); const state={priceMap:null,ranked:IPCore.DEMO.slice(),snapshot:null,months:0,actions:[],busy:false,cloudResearch:null};
  const settings={
    get auto(){return localStorage.getItem('ip7_auto')!=='0'}, set auto(v){localStorage.setItem('ip7_auto',v?'1':'0')},
    get source(){return localStorage.getItem('ip7_source')||'https://softhompo.a.la9.jp/Data/StockData.html'}, set source(v){localStorage.setItem('ip7_source',v)},
    get relay(){return localStorage.getItem('ip7_relay')||'auto'}, set relay(v){localStorage.setItem('ip7_relay',v)},
    get theme(){return {extra:(localStorage.getItem('ip7_semi_extra')||'').split(',').map(x=>x.trim()).filter(Boolean),exclude:(localStorage.getItem('ip7_semi_exclude')||'').split(',').map(x=>x.trim()).filter(Boolean)}}
  };
  const yen=n=>Number.isFinite(+n)?Math.round(+n).toLocaleString('ja-JP')+'円':'--'; const pct=n=>Number.isFinite(+n)?((+n)*100).toFixed(1)+'%':'--'; const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const researchJobs=new Map();
  let researchWorker=null;
  function ensureResearchWorker(){
    if(researchWorker)return researchWorker;
    researchWorker=new Worker('./research-worker.js');
    researchWorker.onmessage=e=>{
      const d=e.data||{}; researchJobs.delete(d.id);
      if(d.code){ try{ localStorage.setItem('ip7_research_'+d.code,JSON.stringify(d)); }catch{} }
      if($('researchCode').value.trim()!==String(d.code||''))return;
      if(!d.ok){
        $('researchSummary').textContent='バックグラウンド検索失敗：'+(d.error||'取得失敗')+'。Safari検索も使えます。';
        return;
      }
      const sig=d.sig||{score:0,positive:[],negative:[]};
      $('researchSummary').innerHTML=`バックグラウンド検索 完了　材料スコア <b class="${sig.score>3?'good':sig.score<-3?'bad':'warn'}">${sig.score>0?'+':''}${sig.score}</b><br><span class="small">プラス: ${esc((sig.positive||[]).join('・')||'なし')} / 注意: ${esc((sig.negative||[]).join('・')||'なし')}</span>`;
      $('researchResults').innerHTML=(d.results||[]).length?(d.results||[]).map(x=>`<div class="research-item"><a target="_blank" rel="noopener" href="${esc(x.url)}">${esc(x.title)}</a></div>`).join(''):'<div class="small">検索結果リンクは抽出できませんでした。</div>';
    };
    return researchWorker;
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
    $('topMessage').textContent='クラウドで作成済みの上位100を取得中…';
    const r=await fetch('./data/latest-ranking.json?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('クラウドランキング未生成: HTTP '+r.status);
    const d=await r.json();
    const rows=Array.isArray(d.top100)?d.top100:[];
    if(!rows.length)throw new Error('クラウドランキングが空です');
    state.ranked=rows.slice(0,100);
    state.snapshot={key:'cloud',updatedAt:Date.parse(d.generated_at)||Date.now(),months:0,asof:null,actionCount:0,ranked:state.ranked};
    state.months=0;
    renderStatus();renderRows();
    $('asof').textContent=d.generated_at?new Date(d.generated_at).toLocaleString('ja-JP',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'CLOUD';
    $('cacheState').textContent='Cloud';
    $('topMessage').textContent='クラウド解析済みの上位100を表示中。iPhone側では重い全銘柄解析をしていません。';
    return d;
  }
  async function loadCloudResearch(){
    if(state.cloudResearch)return state.cloudResearch;
    const r=await fetch('./data/research.json?ts='+Date.now(),{cache:'no-store'});
    if(!r.ok)throw new Error('クラウド調査データ未生成');
    state.cloudResearch=await r.json();
    return state.cloudResearch;
  }
  async function syncData(months=13){
    if(state.busy)return;state.busy=true;toggleBusy(true);setProgress(2,'価格データ公開ページを確認中…');const started=Date.now();
    try{
      const page=await fetchAny(settings.source,{binary:false,useCache:false});setProgress(8,'ダウンロード対象を確認中…');const priceLinks=IPCore.selectPriceLinks(IPCore.discoverLinks(page,settings.source,'prices'),months);const splitLinks=IPCore.selectSplitLinks(IPCore.discoverLinks(page,settings.source,'splits'),months);if(!priceLinks.length)throw new Error('株価ZIP/CSVリンクを検出できませんでした');
      const priceMap=new Map(),actions=[];let done=0,total=priceLinks.length+splitLinks.length;
      for(const link of splitLinks){setProgress(8+74*(done/Math.max(1,total)),`分割・併合 ${link.label} を確認中…`);try{const b=await fetchAny(link.url,{binary:true,timeout:50000});await parseArchive(b,link,priceMap,actions,true)}catch(e){console.warn('split',link.label,e)}done++;}
      for(const link of priceLinks){setProgress(8+74*(done/Math.max(1,total)),`株価 ${link.label} を解析中…`);const b=await fetchAny(link.url,{binary:true,timeout:60000});await parseArchive(b,link,priceMap,actions,false);done++;await breathe();}
      setProgress(84,'株式分割・併合を補正中…');IPCore.normalizePriceMap(priceMap,Math.max(330,months*24+50));IPCore.applyCorporateActions(priceMap,actions);setProgress(90,'全銘柄を採点中…');const ranked=IPCore.scorePriceMap(priceMap,settings.theme);if(!ranked.length)throw new Error('採点可能な銘柄がありません');state.priceMap=priceMap;state.ranked=ranked;state.months=months;state.actions=actions;const asof=Math.max(...[...priceMap.values()].map(x=>x.points.at(-1)?.[0]||0));const snap={key:'latest',updatedAt:Date.now(),months,asof,actionCount:actions.length,ranked:ranked.slice(0,500)};await idbPut('snapshots',snap);localStorage.setItem('ip7_last_sync',String(Date.now()));state.snapshot=snap;renderStatus();renderRows();setProgress(100,`更新完了：${ranked.length.toLocaleString('ja-JP')}銘柄 / ${IPCore.dateIntToISO(asof)} / ${(Date.now()-started)/1000|0}秒`);setTimeout(()=>setProgress(0),1800);
    }catch(e){console.error(e);setProgress(0,'自動取得エラー：'+e.message+'　保存済みデータは維持しています。');throw e}finally{state.busy=false;toggleBusy(false)}
  }
  function toggleBusy(v){['syncBtn','syncBtnBottom','btLoad24'].forEach(id=>{if($(id))$(id).disabled=v})}
  function renderStatus(){const s=state.snapshot;$('asof').textContent=s?.asof?IPCore.dateIntToISO(s.asof):'DEMO';$('scoreCount').textContent=(state.ranked?.length||0).toLocaleString('ja-JP');$('cacheState').textContent=s?`${s.months}か月`:'未同期';$('envState').textContent=navigator.standalone||matchMedia('(display-mode: standalone)').matches?'PWA':'Safari';}
  function currentRows(){const capital=+$('capital').value||100000,risk=$('risk').value,lot=+$('lotMode').value||1,mode=$('semiMode').value;return IPCore.decorateForCapital(state.ranked,capital,risk,lot,mode).slice(0,100)}
  function renderRows(){
    const rows=currentRows();
    $('rows').innerHTML=rows.length?rows.map(x=>{
      const sig=(globalThis.IPSignals&&IPSignals.classify)?IPSignals.classify(x):{key:'watch',label:'🔵 監視',reason:'条件確認中'};
      const sigClass=sig.key==='buy'?'good':sig.key==='avoid'?'bad':sig.key==='wait'?'warn':'';
      return `<tr data-code="${esc(x.code)}"><td><div class="name">#${x.rank} ${esc(x.company||x.code)}${x.is_semiconductor?'<span class="badge semi">半導体</span>':''}${x.adjustment_events?'<span class="badge">分割調整</span>':''}</div><div class="meta">${esc(x.code)} · ${esc(x.market||'')} · ${esc(x.sector33||'')}</div></td><td><div class="${sigClass}" style="font-weight:850">${sig.label}</div><div class="meta">${esc(sig.reason)}</div></td><td class="score ${x.technical_score>=80?'good':x.technical_score<60?'bad':'warn'}">${(+x.technical_score).toFixed(1)}</td><td>${yen(x.close)}</td><td class="${x.ret20>=0?'up':'down'}">${pct(x.ret20)}</td><td class="${x.ret60>=0?'up':'down'}">${pct(x.ret60)}</td><td class="${x.ret120>=0?'up':'down'}">${pct(x.ret120)}</td><td class="${x.ret250>=0?'up':'down'}">${pct(x.ret250)}</td><td><b>${yen(x.budget_yen)}</b></td><td>${x.shares_by_budget>0?x.shares_by_budget:'—'}</td></tr>`;
    }).join(''):'<tr><td colspan="10">該当候補なし</td></tr>';
    document.querySelectorAll('#rows tr[data-code]').forEach(tr=>tr.onclick=()=>pickResearch(tr.dataset.code));
    saveBasicSettings();
  }
  function saveBasicSettings(){localStorage.setItem('ip7_capital',$('capital').value);localStorage.setItem('ip7_risk',$('risk').value);localStorage.setItem('ip7_semi',$('semiMode').value);localStorage.setItem('ip7_lot',$('lotMode').value)}
  function pickResearch(code){const x=state.ranked.find(y=>y.code===code);$('researchCode').value=code;$('researchCompany').value=x?.company||'';switchPane('research')}
  function switchPane(id){document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x.dataset.pane===id));document.querySelectorAll('.pane').forEach(x=>x.classList.toggle('active',x.id===id));}
  async function ensureHistory(months=13){if(state.priceMap&&state.months>=months)return;await syncData(months)}
  async function runBT(modeOverride=null){const b=$('btRun');b.disabled=true;$('btMsg').textContent='iPhone内でバックテスト中…';try{await ensureHistory(13);const opts={mode:modeOverride||$('btSemi').value,capital:+$('btCapital').value||100000,risk:$('risk').value,lot:+$('btLot').value||1,topN:+$('btTop').value||10,rebalanceDays:+$('btDays').value||20,costBps:+$('btCost').value||10,reserve:.10,theme:settings.theme};const d=IPCore.runBacktest(state.priceMap,opts);renderBT(d);$('btMsg').textContent=`${d.start_date}〜${d.end_date} / ${d.periods}期間 / 買えず見送り ${d.skipped_unaffordable}回`;}catch(e){$('btMsg').textContent='検証エラー：'+e.message}finally{b.disabled=false}}
  function renderBT(d){$('btMetrics').innerHTML=`<div class="metric"><div class="k">累積</div><div class="v ${d.total_return>=0?'good':'bad'}">${pct(d.total_return)}</div></div><div class="metric"><div class="k">最終資金</div><div class="v">${yen(d.ending_capital)}</div></div><div class="metric"><div class="k">最大DD</div><div class="v bad">${pct(d.max_drawdown)}</div></div><div class="metric"><div class="k">期間数</div><div class="v">${d.periods}</div></div>`;drawCurve(d.curve);$('btCompareTable').innerHTML=`<div class="small">候補ユニバース等金額ベンチ: ${pct(d.benchmark_return)} / 平均半導体保有 ${d.avg_semiconductor_selected.toFixed(1)}銘柄</div>`}
  function drawCurve(curve){const c=$('btChart'),ctx=c.getContext('2d'),W=c.width,H=c.height;ctx.clearRect(0,0,W,H);ctx.fillStyle='#0a142a';ctx.fillRect(0,0,W,H);if(!curve?.length)return;const vals=curve.flatMap(x=>[x.strategy,x.benchmark]),mn=Math.min(...vals)*.96,mx=Math.max(...vals)*1.04;ctx.strokeStyle='#293b61';ctx.lineWidth=1;for(let i=1;i<5;i++){let y=H*i/5;ctx.beginPath();ctx.moveTo(38,y);ctx.lineTo(W-12,y);ctx.stroke()}function line(k,col){ctx.strokeStyle=col;ctx.lineWidth=3;ctx.beginPath();curve.forEach((x,i)=>{let xx=38+(W-52)*i/(curve.length-1||1),yy=H-18-(H-36)*(x[k]-mn)/(mx-mn||1);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.stroke()}line('strategy','#7aa8ff');line('benchmark','#95a6c2')}
  async function compareSemi(){switchPane('backtest');$('btMsg').textContent='「半導体込み」と「除外」を順番に検証中…';try{await ensureHistory(13);const base={capital:+$('capital').value||100000,risk:$('risk').value,lot:+$('lotMode').value||1,topN:10,rebalanceDays:20,costBps:10,reserve:.10,theme:settings.theme};const a=IPCore.runBacktest(state.priceMap,{...base,mode:'all'}),b=IPCore.runBacktest(state.priceMap,{...base,mode:'exclude'});renderBT(a);$('btCompareTable').innerHTML=`<table style="min-width:560px"><thead><tr><th>条件</th><th>最終資金</th><th>累積</th><th>最大DD</th><th>期間</th></tr></thead><tbody><tr><td>半導体込み</td><td>${yen(a.ending_capital)}</td><td>${pct(a.total_return)}</td><td>${pct(a.max_drawdown)}</td><td>${a.periods}</td></tr><tr><td>半導体除外</td><td>${yen(b.ending_capital)}</td><td>${pct(b.total_return)}</td><td>${pct(b.max_drawdown)}</td><td>${b.periods}</td></tr></tbody></table>`;$('btMsg').textContent='比較完了。これは予測ではなく、取得済み過去データでの比較です。'}catch(e){$('btMsg').textContent='比較エラー：'+e.message}}
  async function runResearch(){
    const code=$('researchCode').value.trim(),company=$('researchCompany').value.trim();
    if(!code){$('researchSummary').textContent='銘柄コードを入力してください';return}
    let shown=false;
    try{
      const cloud=await loadCloudResearch();
      const d=cloud?.stocks?.[code];
      if(d){
        shown=true;
        const score=Number(d.score)||0;
        $('researchSummary').innerHTML=`クラウド調査済み　材料スコア <b class="${score>3?'good':score<-3?'bad':'warn'}">${score>0?'+':''}${score}</b><br><span class="small">プラス: ${esc((d.positive||[]).join('・')||'なし')} / 注意: ${esc((d.negative||[]).join('・')||'なし')}</span>`;
        $('researchResults').innerHTML=(d.results||[]).map(x=>`<div class="research-item"><a target="_blank" rel="noopener" href="${esc(x.url)}">${esc(x.title)}</a><div class="meta">${esc(x.published||'')}</div></div>`).join('');
      }
    }catch{}
    const id=crypto.randomUUID?crypto.randomUUID():String(Date.now())+Math.random();
    researchJobs.set(id,{code,company});
    ensureResearchWorker().postMessage({id,code,company});
    if(!shown)$('researchSummary').textContent='バックグラウンドで検索中。ほかの画面を操作してOKです。';
    else $('researchSummary').insertAdjacentHTML('beforeend','<br><span class="small">追加のライブ検索もバックグラウンドで実行中…</span>');
  }
  function manualSearch(){const q=encodeURIComponent(`${$('researchCode').value} ${$('researchCompany').value} 決算 最新ニュース 上方修正 下方修正`);window.open('https://www.google.com/search?q='+q,'_blank','noopener')}
  async function exportRanking(){const rows=currentRows(),head=['rank','code','company','score','close','ret20','ret60','ret120','ret250','semiconductor','budget_yen','shares'];const csv=[head.join(','),...rows.map(x=>[x.rank,x.code,`"${String(x.company).replaceAll('"','""')}"`,x.technical_score.toFixed(2),x.close,x.ret20,x.ret60,x.ret120,x.ret250,x.is_semiconductor?1:0,x.budget_yen,x.shares_by_budget].join(','))].join('\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv'}));a.download='invest_pilot_v7_ranking.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  async function init(){
    $('capital').value=localStorage.getItem('ip7_capital')||100000;$('risk').value=localStorage.getItem('ip7_risk')||'mid';$('semiMode').value=localStorage.getItem('ip7_semi')||'all';$('lotMode').value=localStorage.getItem('ip7_lot')||'1';$('btCapital').value=$('capital').value;$('btLot').value=$('lotMode').value;$('sourcePage').value=settings.source;$('relayMode').value=settings.relay;$('semiExtra').value=(settings.theme.extra||[]).join(',');$('semiExclude').value=(settings.theme.exclude||[]).join(',');$('autoToggle').classList.toggle('on',settings.auto);
    try{const snap=await idbGet('snapshots','latest');if(snap?.ranked?.length){state.snapshot=snap;state.ranked=snap.ranked;state.months=snap.months||0}}catch{}renderStatus();renderRows();
    document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>switchPane(b.dataset.pane));['capital','risk','semiMode','lotMode'].forEach(id=>$(id).addEventListener('change',()=>{if(id==='capital')$('btCapital').value=$('capital').value;if(id==='lotMode')$('btLot').value=$('lotMode').value;renderRows()}));
    $('syncBtn').onclick=()=>loadCloudSnapshot().catch(e=>$('topMessage').textContent='クラウド更新待ち：'+e.message);$('syncBtnBottom').onclick=$('syncBtn').onclick;$('recalcBtn').onclick=renderRows;$('compareBtn').onclick=compareSemi;$('btRun').onclick=()=>runBT();$('btLoad24').onclick=()=>syncData(24).then(()=>{$('btMsg').textContent='24か月履歴を読み込みました。このまま検証できます。'}).catch(e=>$('btMsg').textContent='履歴取得エラー：'+e.message);$('researchBtn').onclick=runResearch;$('manualSearchBtn').onclick=manualSearch;
    $('autoToggle').onclick=()=>{settings.auto=!settings.auto;$('autoToggle').classList.toggle('on',settings.auto)};$('sourcePage').onchange=()=>settings.source=$('sourcePage').value.trim();$('relayMode').onchange=()=>settings.relay=$('relayMode').value;$('saveThemeBtn').onclick=()=>{localStorage.setItem('ip7_semi_extra',$('semiExtra').value);localStorage.setItem('ip7_semi_exclude',$('semiExclude').value);$('topMessage').textContent='半導体テーマ設定を保存しました。次回再計算から反映します。';if(state.priceMap){state.ranked=IPCore.scorePriceMap(state.priceMap,settings.theme);renderRows()}};$('clearCacheBtn').onclick=async()=>{await idbClear();state.priceMap=null;state.snapshot=null;state.ranked=IPCore.DEMO.slice();localStorage.removeItem('ip7_last_sync');renderStatus();renderRows();$('topMessage').textContent='保存データを削除しました。'};$('exportBtn').onclick=exportRanking;
    if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
    setTimeout(()=>loadCloudSnapshot().catch(()=>{}),300);
  }
  init();
}
