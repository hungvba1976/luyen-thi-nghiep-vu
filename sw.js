const APP_CACHE = "luyenthi-v130-app-final-clean-fix14";
const BANK_CACHE = "luyenthi-v130-bank-releases";
const CAMPAIGN_CACHE = "luyenthi-v130-campaign-modules";
const APP_ASSETS = [
  "./index.html","./styles.css?v=v1.3.0-final-clean-fix11c-fix12b-fix13-fix14","./app.js?v=v1.3.0-final-clean-fix11c-fix12b-fix13-fix14",
  "./manifest.webmanifest","./version.json",
  "./icon-192.png","./icon-512.png","./apple-touch-icon-180.png","./donate-qr.png"
];
const BASELINE_BANK_ASSETS = [
  "./release/latest.json","./release/1.0.0/manifest.json","./release/1.0.0/banks.json"
];
const CAMPAIGN_ASSETS = ["./campaigns/catalog.json"];
self.addEventListener("install", event => {
  event.waitUntil(Promise.all([
    caches.open(APP_CACHE).then(cache => cache.addAll(APP_ASSETS)),
    caches.open(BANK_CACHE).then(cache => cache.addAll(BASELINE_BANK_ASSETS)),
    caches.open(CAMPAIGN_CACHE).then(cache => cache.addAll(CAMPAIGN_ASSETS))
  ]));
  self.skipWaiting();
});
const MOBILE_UA_RE = /(Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|IEMobile|Opera Mini)/i;
function isLegacyAppCache(name){
  if([APP_CACHE,BANK_CACHE,CAMPAIGN_CACHE].includes(name)) return false;
  return name.startsWith("luyenthi-");
}
self.addEventListener("activate", event => {
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    // V0.1/V0.1.1 used one cache for the whole app and a cache-first shell. Keep
    // this signal before cleanup so a newly installed SW can rescue stale desktop
    // clients that have no update code of their own.
    const hadV01Cache=keys.some(k=>k==="luyenthi-mobile-v0.1" || k==="luyenthi-mobile-v0.1.1");
    await Promise.all(keys.filter(isLegacyAppCache).map(k=>caches.delete(k)));
    await self.clients.claim();

    // Desktop-only legacy takeover. Current mobile/PWA clients keep their proven
    // lifecycle and controllerchange behavior; they are never force-navigated here.
    const ua=(self.navigator&&self.navigator.userAgent)||"";
    if(hadV01Cache && !MOBILE_UA_RE.test(ua)){
      const windows=await self.clients.matchAll({type:"window",includeUncontrolled:true});
      await Promise.all(windows.map(async client=>{
        try{
          const u=new URL(client.url);
          if(u.origin!==self.location.origin)return;
          u.searchParams.set("__lt_shell_update","legacy-v01-to-fix14");
          await client.navigate(u.href);
        }catch(e){}
      }));
    }
  })());
});
function freshRequest(request){
  try{return new Request(request,{cache:"no-store"});}catch{return request;}
}
async function networkFirst(request, cacheName, forceFresh=false){
  const cache = await caches.open(cacheName);
  try{
    const response = await fetch(forceFresh?freshRequest(request):request);
    if(response && response.ok) await cache.put(request, response.clone());
    return response;
  }catch(e){
    const cached = await cache.match(request);
    if(cached) return cached;
    throw e;
  }
}
async function cacheFirst(request, cacheName){
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if(cached) return cached;
  const response = await fetch(request);
  if(response && response.ok) await cache.put(request, response.clone());
  return response;
}
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  if(event.request.method !== "GET") return;
  if(url.pathname.endsWith("/version.json")){
    event.respondWith(networkFirst(event.request, APP_CACHE, true));
    return;
  }
  if(url.pathname.endsWith("/campaigns/catalog.json")){
    event.respondWith(networkFirst(event.request, CAMPAIGN_CACHE, true));
    return;
  }
  if(url.pathname.includes("/campaigns/") && (url.pathname.endsWith("module.json") || url.pathname.endsWith("questions.json"))){
    event.respondWith(cacheFirst(event.request, CAMPAIGN_CACHE));
    return;
  }
  if(url.pathname.endsWith("/release/latest.json")){
    event.respondWith(networkFirst(event.request, BANK_CACHE, true));
    return;
  }
  if(url.pathname.includes("/release/") && (url.pathname.endsWith("banks.json") || url.pathname.endsWith("manifest.json"))){
    event.respondWith(cacheFirst(event.request, BANK_CACHE));
    return;
  }
  if(event.request.mode === "navigate"){
    event.respondWith(networkFirst(event.request, APP_CACHE, true).catch(()=>caches.match("./index.html")));
    return;
  }
  if(["script","style","manifest"].includes(event.request.destination)){
    event.respondWith(networkFirst(event.request, APP_CACHE, true));
    return;
  }
  event.respondWith(cacheFirst(event.request, APP_CACHE));
});
