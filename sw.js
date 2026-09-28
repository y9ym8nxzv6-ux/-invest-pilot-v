const CACHE='invest-pilot-app-v10';
const DATA_CACHE='invest-pilot-data-v10';
const ASSETS=['./','./index.html','./core.js','./signals.js','./ui.js','./research-worker.js','./manifest.webmanifest'];
const DATA_FILES=['latest-ranking.json','all-analysis.json','stock-master.json','research.json','backtest-history.json','strategy-config.json','fundamentals.json'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==DATA_CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

function isDataRequest(url){
  return url.origin===self.location.origin && url.pathname.includes('/data/') &&
    DATA_FILES.some(name=>url.pathname.endsWith('/'+name));
}

async function networkFirst(request){
  const cache=await caches.open(DATA_CACHE);
  try{
    const response=await fetch(request);
    if(response&&response.ok)cache.put(request,response.clone());
    return response;
  }catch(err){
    const cached=await cache.match(request,{ignoreSearch:true});
    if(cached)return cached;
    throw err;
  }
}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);

  if(isDataRequest(url)){
    event.respondWith(networkFirst(event.request));
    return;
  }

  if(url.origin===self.location.origin){
    event.respondWith(
      caches.match(event.request,{ignoreSearch:true})
        .then(cached=>cached||fetch(event.request).then(response=>{
          if(response&&response.ok)caches.open(CACHE).then(cache=>cache.put(event.request,response.clone()));
          return response;
        }))
    );
    return;
  }

  event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
