"use strict";

const APP_VERSION = "Mobile V1.3.0 FIELD TEST RC";
const BASELINE_RELEASE = {
  "schemaVersion": 2,
  "bankVersion": "1.0.0",
  "publishedAt": "2026-08-28T16:30:00+07:00",
  "questionCount": 4354,
  "newCount": 0,
  "updatedCount": 0,
  "checksumSha256": "c68154740630db9b220666ba4ea63fee494ae311d83a12c67f4d81627fb3b6fa",
  "banksUrl": "./release/1.0.0/banks.json",
  "manifestUrl": "./release/1.0.0/manifest.json"
};
const LATEST_URL = "./release/latest.json";
const EXAM_SECONDS = 45 * 60;
const STORAGE_PREFIX = "luyenthi:v13field:";
const ACTIVE_RELEASE_KEY = `${STORAGE_PREFIX}activeRelease`;
const LAST_RESULT_KEY = `${STORAGE_PREFIX}lastResult`;
const CAMPAIGN_REGISTRY_KEY = `${STORAGE_PREFIX}campaignRegistry`;
const CAMPAIGN_CATALOG_URL = "./campaigns/catalog.json";
const CAMPAIGN_CACHE_NAME = "luyenthi-v13field-campaign-modules";


const GROUP_B = ["khdn","khcn","tham_dinh","ktgd_noi_bo","ktgd_khach_hang","ttqt_tttm","xu_ly_no"];
const GROUP_C = ["kh_qlrr","ktgsnb","cntt","nhan_su_tien_luong","phap_che","xdcb_qthc","van_thu_le_tan","tien_te_kho_quy"];
const GROUP_A = [...GROUP_B, ...GROUP_C];
function legacyExamGroups(bankId){
  const groups=[];
  if(GROUP_A.includes(bankId))groups.push("A");
  if(GROUP_B.includes(bankId))groups.push("B");
  if(GROUP_C.includes(bankId))groups.push("C");
  return groups;
}
function examConfigForBank(bankId){
  const b=CURRENT_DATA?.banks?.[bankId] || ACTIVE_DATA?.banks?.[bankId];
  const cfg=b?.meta?.examConfig ?? b?.examConfig ?? manifest().find(x=>x.id===bankId)?.examConfig;
  if(cfg && typeof cfg==="object"){
    const enabled=cfg.enabled!==false;
    const groups=Array.isArray(cfg.groups)?[...new Set(cfg.groups.map(x=>String(x).toUpperCase()).filter(x=>["A","B","C"].includes(x)))]:[];
    return {enabled,groups};
  }
  const groups=legacyExamGroups(bankId);
  return {enabled:groups.length>0,groups,legacy:true};
}
function bankEligibleForExam(bankId,groupCode){
  const cfg=examConfigForBank(bankId);
  return cfg.enabled && cfg.groups.includes(groupCode);
}
const CATEGORY_NAMES = {
  organization_culture: "Mô hình tổ chức, điều lệ, văn hóa Agribank",
  products_services: "Sản phẩm dịch vụ Agribank",
  labor_rules: "Nội quy lao động",
  banking_law: "Pháp luật liên quan hoạt động ngân hàng",
  communication_customer_care: "Giao tiếp, chăm sóc và phát triển khách hàng",
  digital_transformation: "Chuyển đổi số",
  management_skills: "Kỹ năng quản lý, lãnh đạo",
  transaction_style: "Tiêu chuẩn phong cách giao dịch"
};
const BLUEPRINTS = {
  A: {
    name: "Lao động giữ chức danh, chức vụ",
    allowed: GROUP_A,
    specialist: 75,
    general: {
      organization_culture:3, products_services:4, labor_rules:2,
      management_skills:5, banking_law:4,
      communication_customer_care:4, digital_transformation:3
    }
  },
  B: {
    name: "Lao động chuyên môn nghiệp vụ - nhóm 7 vị trí",
    allowed: GROUP_B,
    specialist: 75,
    general: {
      organization_culture:3, products_services:4, labor_rules:3,
      banking_law:4, communication_customer_care:5,
      transaction_style:3, digital_transformation:3
    }
  },
  C: {
    name: "Lao động chuyên môn/thừa hành, phục vụ - nhóm vị trí còn lại",
    allowed: GROUP_C,
    specialist: 75,
    general: {
      organization_culture:3, products_services:5, labor_rules:3,
      banking_law:4, communication_customer_care:5,
      digital_transformation:5
    }
  }
};

const $ = sel => document.querySelector(sel);
const app = () => $("#app");
const header = () => $("#sessionHeader");
let ACTIVE_RELEASE = null;
let ACTIVE_DATA = null;
let CURRENT_DATA = null;
let currentSession = null;
let timerHandle = null;
let deferredInstallPrompt = null;
let pendingUpdate = null;
const releaseCache = new Map();
const campaignCache = new Map();
let CAMPAIGN_CATALOG = [];
let ACTIVE_CAMPAIGN = null;


function esc(text){
  return String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[ch]);
}
function uid(prefix){ return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`; }
function hash32(str){
  let h=2166136261>>>0;
  for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61); return ((t^t>>>14)>>>0)/4294967296; }; }
function shuffledCopy(arr, seedStr){
  const out=[...arr], rnd=mulberry32(hash32(seedStr));
  for(let i=out.length-1;i>0;i--){ const j=Math.floor(rnd()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; }
  return out;
}
function sample(arr,n,seed){ return shuffledCopy(arr,seed).slice(0,n); }
function normalizeVN(text){
  return String(text??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/đ/g,"d").replace(/Đ/g,"D").toLowerCase().replace(/\s+/g," ").trim();
}
function optionMode(q){
  if(!q.shuffleOptions) return "FIXED";
  const texts=q.options.map(o=>normalizeVN(o.text));
  const referencesLabels=texts.some(t => /\b(ca|dap an|phuong an)\b[^|]*(\b[abcd]\b.*\b[abcd]\b|\b[1-4]\b.*\b[1-4]\b)/i.test(t));
  if(referencesLabels) return "FIXED";
  const allAbove=texts.some(t => /^(tat ca|toan bo).*(dap an|phuong an).*(tren|neu tren)/i.test(t));
  if(allAbove) return "SHUFFLE_EXCEPT_LAST";
  return "SHUFFLE_ALL";
}
function optionView(q,sessionId){
  const mode=optionMode(q);
  let options=[...q.options];
  if(mode==="SHUFFLE_ALL") options=shuffledCopy(options,`${sessionId}|${q.id}`);
  if(mode==="SHUFFLE_EXCEPT_LAST"){
    const anchored=options.filter(o=>/^(tat ca|toan bo).*(dap an|phuong an).*(tren|neu tren)/i.test(normalizeVN(o.text)));
    const normal=options.filter(o=>!anchored.includes(o));
    options=[...shuffledCopy(normal,`${sessionId}|${q.id}`),...anchored];
  }
  return options.map((o,i)=>({...o,displayLabel:"ABCDEF"[i]}));
}
function formatDate(iso){
  try{return new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(iso));}catch{return "";}
}
function formatPercent(value){ return `${value.toFixed(1).replace(".",",")}%`; }
function storageKeyPractice(bankId,newOnly=false){ return `practice:${newOnly?"new:":""}${bankId}`; }
function storageKeyExam(group,bankId){ return `exam:${group}:${bankId}`; }
function saveSession(session){
  try{ session.savedAt=Date.now(); localStorage.setItem(`${STORAGE_PREFIX}${session.storageKey}`,JSON.stringify(session)); return true; }
  catch(e){ console.warn("Không lưu được phiên:",e); return false; }
}
function deleteSession(storageKey){ try{localStorage.removeItem(`${STORAGE_PREFIX}${storageKey}`);}catch(e){console.warn("Không xóa được phiên:",e);} }
function sessionQuestionsValid(questions,questionIds){
  if(!Array.isArray(questions) || !questions.length) return false;
  const seen=new Set();
  for(const q of questions){
    if(!q?.id || seen.has(q.id) || !Array.isArray(q.options) || q.options.length<2) return false;
    seen.add(q.id); const oids=new Set(); let correct=0;
    for(const o of q.options){ if(!o?.id || oids.has(o.id))return false; oids.add(o.id); if(o.correct===true)correct++; }
    if(correct!==1)return false;
  }
  return questionIds.every(id=>seen.has(id));
}
function validateStoredSession(s,storageKey){
  if(!s || !["practice","exam"].includes(s.kind)) return null;
  if(!s.sessionId || !Array.isArray(s.questionIds) || !s.questionIds.length || !s.states || typeof s.states!=="object" || Array.isArray(s.states)) return null;
  if(new Set(s.questionIds).size!==s.questionIds.length || s.questionIds.some(id=>typeof id!=="string" || !id)) return null;
  s.storageKey=storageKey;
  const idx=Number(s.index); s.index=Number.isInteger(idx)?Math.max(0,Math.min(idx,s.questionIds.length-1)):0;
  if(s.kind==="exam"){
    if(!Number.isFinite(Number(s.deadline)) || !sessionQuestionsValid(s.questions,s.questionIds)) return null;
  }else if(s.campaignId){
    if(!sessionQuestionsValid(s.embeddedQuestions,s.questionIds)) return null;
  }else if(!s.bankId) return null;
  if(!s.bankVersion && !s.campaignId){ s.bankVersion=BASELINE_RELEASE.bankVersion; s.banksUrl=BASELINE_RELEASE.banksUrl; s.checksumSha256=BASELINE_RELEASE.checksumSha256; }
  return s;
}
function loadSession(storageKey){
  let raw; try{raw=localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`);}catch{return null;} if(!raw)return null;
  try{
    const s=validateStoredSession(JSON.parse(raw),storageKey);
    if(!s) deleteSession(storageKey);
    return s;
  }catch{deleteSession(storageKey);return null;}
}
function allSavedSessions(){
  const out=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key?.startsWith(STORAGE_PREFIX)) continue;

    // Kết quả gần nhất/metadata không phải session.
    if([ACTIVE_RELEASE_KEY,LAST_RESULT_KEY].includes(key) || key.endsWith(":lastResult")) continue;

    try{
      const s=JSON.parse(localStorage.getItem(key));

      // Chỉ nhận đúng session có danh sách câu hỏi.
      // Điều này cũng bảo vệ khi nhiều GitHub Pages repository cùng chia sẻ localStorage của hungvba1976.github.io.
      if(!s?.kind || !Array.isArray(s.questionIds) || !s.questionIds.length) continue;
      if(s.completed || s.submitted) continue;
      if(s.campaignId){
        const entry=CAMPAIGN_CATALOG.find(x=>x.moduleId===s.campaignId) || loadCampaignRegistry().find(x=>x.moduleId===s.campaignId);
        if(!entry || campaignStatus(entry)!=="ACTIVE")continue;
      }

      if(!s.bankVersion && !s.campaignId){
        s.bankVersion=BASELINE_RELEASE.bankVersion;
        s.banksUrl=BASELINE_RELEASE.banksUrl;
      }
      out.push(s);
    }catch{}
  }
  return out.sort((a,b)=>(b.savedAt||0)-(a.savedAt||0));
}
function saveLastResult(result){ result.completedAt=Date.now(); localStorage.setItem(LAST_RESULT_KEY,JSON.stringify(result)); }
function loadLastResult(){ try{return JSON.parse(localStorage.getItem(LAST_RESULT_KEY)||"null");}catch{return null;} }
function releaseMetaForSession(session){
  return {bankVersion:session.bankVersion||BASELINE_RELEASE.bankVersion,banksUrl:session.banksUrl||BASELINE_RELEASE.banksUrl,checksumSha256:session.checksumSha256||BASELINE_RELEASE.checksumSha256,questionCount:session.questionCount};
}
async function sha256Hex(buffer){
  const digest=await crypto.subtle.digest("SHA-256",buffer);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
async function fetchJson(url,opts={}){
  const res=await fetch(url,opts);
  if(!res.ok) throw new Error(`Không tải được ${url} (${res.status})`);
  return res.json();
}
function validateReleaseData(data,meta){
  if(!data || !data.banks || !Array.isArray(data.manifest) || !data.bankVersion) throw new Error("Cấu trúc Bank Release không hợp lệ.");
  if(String(data.bankVersion)!==String(meta.bankVersion)) throw new Error("bankVersion trong dữ liệu không khớp Release.");
  const manifestIds=data.manifest.map(x=>x?.id);
  if(manifestIds.some(id=>!id) || new Set(manifestIds).size!==manifestIds.length) throw new Error("Manifest có ID thiếu/trùng.");
  const bankIds=Object.keys(data.banks);
  if(bankIds.length!==manifestIds.length || bankIds.some(id=>!manifestIds.includes(id))) throw new Error("Manifest không khớp danh sách Bank.");
  const qids=new Set(); let total=0;
  for(const [bankId,b] of Object.entries(data.banks)){
    if(!Array.isArray(b?.questions)) throw new Error(`Bank ${bankId} không có danh sách câu hỏi hợp lệ.`);
    for(const q of b.questions){
      total++;
      if(!q?.id || qids.has(q.id)) throw new Error("Thiếu hoặc trùng question ID.");
      qids.add(q.id);
      if(!Array.isArray(q.options) || q.options.length<2) throw new Error(`Câu ${q.id} không đủ đáp án.`);
      const oids=new Set(); let correct=0;
      for(const o of q.options){ if(!o?.id || oids.has(o.id)) throw new Error(`Câu ${q.id} có option ID thiếu/trùng.`); oids.add(o.id); if(o.correct===true)correct++; }
      if(correct!==1) throw new Error(`Câu ${q.id} phải có đúng 1 đáp án đúng.`);
    }
  }
  if(Number.isFinite(Number(meta.questionCount)) && Number(meta.questionCount)!==total) throw new Error("questionCount không khớp dữ liệu thực tế.");
  return data;
}
async function loadRelease(meta,verifyChecksum=false){
  const cacheKey=`${meta.bankVersion}|${meta.banksUrl}|${meta.checksumSha256||"nochecksum"}`;
  if(releaseCache.has(cacheKey)) return releaseCache.get(cacheKey);
  if(verifyChecksum && !meta.checksumSha256) throw new Error("Release cập nhật thiếu checksum SHA-256.");
  const res=await fetch(meta.banksUrl);
  if(!res.ok) throw new Error(`Không tải được ngân hàng ${meta.bankVersion}.`);
  const buffer=await res.arrayBuffer();
  if(verifyChecksum){ const got=await sha256Hex(buffer); if(got!==meta.checksumSha256) throw new Error("Checksum ngân hàng không hợp lệ."); }
  const data=validateReleaseData(JSON.parse(new TextDecoder("utf-8").decode(buffer)),meta);
  releaseCache.set(cacheKey,data);
  return data;
}
async function setActiveRelease(meta){
  const data=await loadRelease(meta,true);
  ACTIVE_RELEASE={...meta};
  ACTIVE_DATA=data;
  CURRENT_DATA=ACTIVE_DATA;
  localStorage.setItem(ACTIVE_RELEASE_KEY,JSON.stringify(ACTIVE_RELEASE));
}
function activeReleaseFromStorage(){
  try{return JSON.parse(localStorage.getItem(ACTIVE_RELEASE_KEY)||"null")||BASELINE_RELEASE;}catch{return BASELINE_RELEASE;}
}
function bank(bankId){ return CURRENT_DATA.banks[bankId]; }
function manifest(){ return CURRENT_DATA.manifest; }
function specialistManifest(){ return manifest().filter(x=>x.group==="Chuyên môn nghiệp vụ"); }
function supportManifest(){ return manifest().filter(x=>x.group!=="Chuyên môn nghiệp vụ"); }
function bankNewCount(bankId){ return bank(bankId)?.meta?.newCount||0; }


function localDateYmd(date=new Date()){
  const y=date.getFullYear(),m=String(date.getMonth()+1).padStart(2,"0"),d=String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}
function campaignStartAt(entry){
  return entry.startAt || `${entry.startDate}T00:00:00+07:00`;
}
function campaignEndAt(entry){
  return entry.endAt || `${entry.endDate}T23:59:59+07:00`;
}
function campaignStatus(entry,now=new Date()){
  if(String(entry.status||"ACTIVE").toUpperCase()==="CLOSED")return "EXPIRED";
  const t=now instanceof Date ? now.getTime() : new Date(now).getTime();
  const start=new Date(campaignStartAt(entry)).getTime();
  const end=new Date(campaignEndAt(entry)).getTime();
  if(Number.isFinite(start)&&t<start)return "UPCOMING";
  if(Number.isFinite(end)&&t>=end)return "EXPIRED";
  return "ACTIVE";
}
function campaignRemainingText(entry,now=new Date()){
  const ms=Math.max(0,new Date(campaignEndAt(entry)).getTime()-now.getTime());
  const mins=Math.ceil(ms/60000);
  if(mins<60)return `Còn ${mins} phút`;
  const hours=Math.ceil(mins/60);
  if(hours<24)return `Còn ${hours} giờ`;
  return `Còn ${Math.ceil(hours/24)} ngày`;
}
function formatDateTime(iso){
  try{return new Intl.DateTimeFormat("vi-VN",{timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(iso));}catch{return "";}
}
function campaignSessionIsActive(session){
  if(!session?.campaignId)return true;
  const entry=CAMPAIGN_CATALOG.find(x=>x.moduleId===session.campaignId) || loadCampaignRegistry().find(x=>x.moduleId===session.campaignId);
  return !!entry && campaignStatus(entry)==="ACTIVE";
}
function campaignPrefix(id){return `${STORAGE_PREFIX}campaign:${id}:`;}
function campaignStorageKey(id,kind){return `campaign:${id}:${kind}`;}
function activeCampaigns(){return CAMPAIGN_CATALOG.filter(x=>campaignStatus(x)==="ACTIVE");}
function loadCampaignRegistry(){
  try{return JSON.parse(localStorage.getItem(CAMPAIGN_REGISTRY_KEY)||"[]");}catch{return [];}
}
function saveCampaignRegistry(entries){
  localStorage.setItem(CAMPAIGN_REGISTRY_KEY,JSON.stringify(entries));
}
function mergeCampaignRegistry(catalog){
  const byId=new Map(loadCampaignRegistry().map(x=>[x.moduleId,x]));
  catalog.filter(x=>campaignStatus(x)!=="EXPIRED").forEach(x=>
    byId.set(x.moduleId,{moduleId:x.moduleId,name:x.name,startDate:x.startDate,endDate:x.endDate,startAt:x.startAt,endAt:x.endAt,status:x.status||"ACTIVE"})
  );
  const merged=[...byId.values()];
  saveCampaignRegistry(merged);
  return merged;
}
async function loadCampaignCatalog(){
  try{
    const payload=await fetchJson(CAMPAIGN_CATALOG_URL,{cache:"no-store"});
    CAMPAIGN_CATALOG=Array.isArray(payload.campaigns)?payload.campaigns:[];
  }catch(e){
    try{
      const payload=await fetchJson(CAMPAIGN_CATALOG_URL);
      CAMPAIGN_CATALOG=Array.isArray(payload.campaigns)?payload.campaigns:[];
    }catch{CAMPAIGN_CATALOG=[];}
  }
  mergeCampaignRegistry(CAMPAIGN_CATALOG);
}
async function purgeCampaignCache(ids){
  if(!ids.size||!("caches" in window))return;
  try{
    const cache=await caches.open(CAMPAIGN_CACHE_NAME);
    const reqs=await cache.keys();
    await Promise.all(reqs.filter(r=>{
      const path=new URL(r.url).pathname;
      return [...ids].some(id=>path.includes(`/campaigns/${id}/`));
    }).map(r=>cache.delete(r)));
  }catch{}
}
async function cleanupExpiredCampaigns(){
  const registry=loadCampaignRegistry();
  const expiredIds=new Set([
    ...registry.filter(x=>campaignStatus(x)==="EXPIRED").map(x=>x.moduleId),
    ...CAMPAIGN_CATALOG.filter(x=>campaignStatus(x)==="EXPIRED").map(x=>x.moduleId)
  ]);
  if(!expiredIds.size)return;

  // Một lượt duy nhất qua localStorage, dù có nhiều Campaign hết hạn.
  const toDelete=[];
  for(let i=0;i<localStorage.length;i++){
    const key=localStorage.key(i);
    if(!key?.startsWith(`${STORAGE_PREFIX}campaign:`))continue;
    const id=key.slice(`${STORAGE_PREFIX}campaign:`.length).split(":")[0];
    if(expiredIds.has(id))toDelete.push(key);
  }
  toDelete.forEach(k=>localStorage.removeItem(k));
  expiredIds.forEach(id=>campaignCache.delete(id));
  await purgeCampaignCache(expiredIds);

  // Giữ registry của Campaign chưa hết hạn; Campaign đã hết hạn đã được dọn sạch.
  saveCampaignRegistry(registry.filter(x=>!expiredIds.has(x.moduleId)));
}
let campaignMaintenanceTimer=null;
function nextCampaignBoundary(now=new Date()){
  const t=now.getTime(),times=[];
  CAMPAIGN_CATALOG.forEach(entry=>{
    if(String(entry.status||"ACTIVE").toUpperCase()==="CLOSED")return;
    const start=new Date(campaignStartAt(entry)).getTime();
    const end=new Date(campaignEndAt(entry)).getTime();
    if(Number.isFinite(start)&&start>t)times.push(start);
    if(Number.isFinite(end)&&end>t)times.push(end);
  });
  return times.length?Math.min(...times):null;
}
function scheduleCampaignMaintenance(){
  if(campaignMaintenanceTimer)clearTimeout(campaignMaintenanceTimer);
  const now=new Date(),boundary=nextCampaignBoundary(now);
  // Tối đa 60 giây kiểm tra lại catalog để CLOSED/endAt sửa sớm có hiệu lực nhanh.
  const boundaryDelay=boundary===null?60000:Math.max(1000,boundary-now.getTime()+500);
  const delay=Math.min(60000,boundaryDelay);
  campaignMaintenanceTimer=setTimeout(async()=>{
    const previousIds=new Set(activeCampaigns().map(x=>x.moduleId));
    await loadCampaignCatalog();
    const expiredCurrent=!!currentSession?.campaignId&&!campaignSessionIsActive(currentSession);
    await cleanupExpiredCampaigns();

    if(expiredCurrent){
      stopTimer();currentSession=null;ACTIVE_CAMPAIGN=null;CURRENT_DATA=ACTIVE_DATA;
      alert("Cuộc thi phong trào đã kết thúc. Module và dữ liệu của cuộc thi đã được gỡ.");
      renderHome();
    }else if(!currentSession){
      renderHome();
    }
    scheduleCampaignMaintenance();
  },delay);
}

async function loadCampaign(entry){
  if(campaignCache.has(entry.moduleId))return campaignCache.get(entry.moduleId);
  const module=await fetchJson(entry.moduleUrl);
  if(module.type!=="campaign"||module.moduleId!==entry.moduleId)throw new Error("Cấu trúc Campaign không hợp lệ.");

  const res=await fetch(module.questionsUrl);
  if(!res.ok)throw new Error(`Không tải được dữ liệu Campaign ${entry.moduleId}.`);
  const buffer=await res.arrayBuffer();
  if(module.checksumSha256){
    const got=await sha256Hex(buffer);
    if(got!==module.checksumSha256)throw new Error("Checksum dữ liệu Campaign không hợp lệ.");
  }
  const qPayload=JSON.parse(new TextDecoder("utf-8").decode(buffer));
  if(qPayload.campaignId!==entry.moduleId||!Array.isArray(qPayload.questions))throw new Error("Dữ liệu câu hỏi Campaign không hợp lệ.");

  const campaign={...module,questions:qPayload.questions};
  campaignCache.set(entry.moduleId,campaign);
  return campaign;
}
function campaignLastResultKey(id){return `${campaignPrefix(id)}lastResult`;}
function saveCampaignLastResult(id,result){result.completedAt=Date.now();localStorage.setItem(campaignLastResultKey(id),JSON.stringify(result));}
function loadCampaignLastResult(id){try{return JSON.parse(localStorage.getItem(campaignLastResultKey(id))||"null");}catch{return null;}}
function newCampaignPractice(campaign,mode){
  const sessionId=uid("campaign_practice");
  let ids=campaign.questions.map(q=>q.id);
  if(mode==="Ngẫu nhiên")ids=shuffledCopy(ids,sessionId);
  return {
    version:"1.2",kind:"practice",campaignId:campaign.moduleId,campaignName:campaign.name,campaignEndDate:campaign.endDate,
    sessionId,storageKey:campaignStorageKey(campaign.moduleId,"practice"),bankVersion:`campaign:${campaign.moduleId}:${campaign.version}`,
    bankId:`campaign_${campaign.moduleId}`,bankName:campaign.name,mode,newOnly:false,questionIds:ids,index:0,states:{},
    embeddedQuestions:campaign.questions,completed:false
  };
}
function newCampaignExam(campaign){
  const total=Math.min(campaign.examQuestionCount,campaign.questions.length);
  const sessionId=uid("campaign_exam"),seed=uid("campaign_paper"),now=Date.now();
  const questions=sample(campaign.questions,total,seed).map(q=>({...q,examSource:"campaign"}));
  return {
    version:"1.2",kind:"exam",campaignId:campaign.moduleId,campaignName:campaign.name,campaignEndDate:campaign.endDate,
    sessionId,storageKey:campaignStorageKey(campaign.moduleId,"exam"),bankVersion:`campaign:${campaign.moduleId}:${campaign.version}`,
    candidateGroup:"Cuộc thi phong trào",bankId:`campaign_${campaign.moduleId}`,bankName:campaign.name,
    questionIds:shuffledCopy(questions.map(q=>q.id),sessionId),index:0,states:{},submitted:false,score:null,breakdown:{},
    startedAt:now,deadline:now+campaign.examMinutes*60*1000,questions,examTotal:total,examMinutes:campaign.examMinutes
  };
}
function practiceState(session,qid){
  if(!session.states[qid]) session.states[qid]={selectedOptionId:null,locked:false,isCorrect:null,correctOptionId:null,flagged:false};
  return session.states[qid];
}
function practiceStatus(session,qid){ const s=practiceState(session,qid); if(s.locked)return s.isCorrect?"correct":"wrong"; return s.selectedOptionId?"selected":"blank"; }
function practiceCounts(session){
  const c={blank:0,selected:0,correct:0,wrong:0,flagged:0};
  session.questionIds.forEach(qid=>{c[practiceStatus(session,qid)]++;if(practiceState(session,qid).flagged)c.flagged++;});
  return c;
}
function examState(session,qid){
  if(!session.states[qid]) session.states[qid]={selectedOptionId:null,flagged:false,isCorrect:null};
  return session.states[qid];
}
function examStatus(session,qid){
  const s=examState(session,qid);
  if(session.submitted){ if(!s.selectedOptionId)return "blank"; return s.isCorrect?"correct":"wrong"; }
  return s.selectedOptionId?"selected":"blank";
}
function examCounts(session){
  const c={blank:0,selected:0,correct:0,wrong:0,flagged:0};
  session.questionIds.forEach(qid=>{c[examStatus(session,qid)]++;if(examState(session,qid).flagged)c.flagged++;});
  return c;
}
function questionLookup(session){
  if(session.campaignId&&Array.isArray(session.embeddedQuestions)) return Object.fromEntries(session.embeddedQuestions.map(q=>[q.id,q]));
  if(session.kind==="practice") return Object.fromEntries(bank(session.bankId).questions.map(q=>[q.id,q]));
  return Object.fromEntries(session.questions.map(q=>[q.id,q]));
}
function currentQuestion(session){ return questionLookup(session)[session.questionIds[session.index]]; }
function remainingSeconds(session){ return Math.max(0,Math.ceil((session.deadline-Date.now())/1000)); }

function newPractice(bankId,mode,newOnly=false){
  let questions=bank(bankId).questions;
  if(newOnly) questions=questions.filter(q=>q.releaseStatus==="NEW");
  let ids=questions.map(q=>q.id);
  const sessionId=uid("practice"); if(mode==="Ngẫu nhiên")ids=shuffledCopy(ids,sessionId);
  return {
    version:"1.1",kind:"practice",sessionId,storageKey:storageKeyPractice(bankId,newOnly),
    bankVersion:CURRENT_DATA.bankVersion,banksUrl:ACTIVE_RELEASE.banksUrl,checksumSha256:ACTIVE_RELEASE.checksumSha256,questionCount:ACTIVE_RELEASE.questionCount,
    bankId,bankName:bank(bankId).meta.name,mode,newOnly,questionIds:ids,index:0,states:{},completed:false
  };
}
function buildExam(groupCode,bankId){
  const bp=BLUEPRINTS[groupCode]; if(!bankEligibleForExam(bankId,groupCode))throw new Error("Nghiệp vụ không thuộc đối tượng thi đã chọn.");
  const seed=uid("paper"),selected=[];
  sample(bank(bankId).questions,bp.specialist,`${seed}|specialist`).forEach(q=>selected.push({...q,examSource:"specialist"}));
  const general=bank("kien_thuc_chung").questions;
  for(const [category,count] of Object.entries(bp.general)){
    let pool;
    if(category==="management_skills")pool=bank("ky_nang_quan_ly").questions;
    else if(category==="transaction_style")pool=bank("tac_phong_gdv").questions;
    else pool=general.filter(q=>q.examCategory===category);
    if(pool.length<count)throw new Error(`Không đủ câu cho ${CATEGORY_NAMES[category]||category}.`);
    sample(pool,count,`${seed}|${category}`).forEach(q=>selected.push({...q,examSource:category}));
  }
  if(selected.length!==100)throw new Error(`Đề có ${selected.length} câu, không phải 100.`);
  if(new Set(selected.map(q=>q.id)).size!==100)throw new Error("Đề có câu trùng.");
  return selected;
}
function newExam(groupCode,bankId){
  const questions=buildExam(groupCode,bankId),sessionId=uid("exam"),now=Date.now();
  return {
    version:"1.1",kind:"exam",sessionId,storageKey:storageKeyExam(groupCode,bankId),
    bankVersion:CURRENT_DATA.bankVersion,banksUrl:ACTIVE_RELEASE.banksUrl,checksumSha256:ACTIVE_RELEASE.checksumSha256,questionCount:ACTIVE_RELEASE.questionCount,
    groupCode,candidateGroup:BLUEPRINTS[groupCode].name,bankId,bankName:bank(bankId).meta.name,
    questionIds:shuffledCopy(questions.map(q=>q.id),sessionId),index:0,states:{},submitted:false,score:null,breakdown:{},
    startedAt:now,deadline:now+EXAM_SECONDS*1000,questions
  };
}
function submitExam(session){
  if(session.submitted)return;
  const lookup=questionLookup(session);let score=0;const breakdown={};
  session.questionIds.forEach(qid=>{
    const q=lookup[qid],s=examState(session,qid),correct=q.options.find(o=>o.correct);
    s.isCorrect=!!s.selectedOptionId&&s.selectedOptionId===correct.id;s.flagged=false;if(s.isCorrect)score++;
    const src=q.examSource||"specialist"; if(!breakdown[src])breakdown[src]={total:0,correct:0}; breakdown[src].total++;if(s.isCorrect)breakdown[src].correct++;
  });
  session.submitted=true;session.score=score;session.breakdown=breakdown;saveSession(session);
}

function renderHeader(){
  if(!currentSession){ header().innerHTML=""; $("#subBrand").textContent=`${APP_VERSION} · Bank ${ACTIVE_RELEASE?.bankVersion||""}`; return; }
  $("#subBrand").textContent=currentSession.kind==="exam"?currentSession.candidateGroup:currentSession.bankName;
  const n=currentSession.index+1,total=currentSession.questionIds.length;
  if(currentSession.kind==="exam"&&!currentSession.submitted){
    const r=remainingSeconds(currentSession),mm=String(Math.floor(r/60)).padStart(2,"0"),ss=String(r%60).padStart(2,"0");
    header().innerHTML=`<span>${n}/${total}</span><span>⏱ ${mm}:${ss}</span>`;
  }else header().innerHTML=`<span>${n}/${total}</span>`;
}
function stopTimer(){if(timerHandle){clearInterval(timerHandle);timerHandle=null;}}
function startTimer(){
  stopTimer();if(!currentSession||currentSession.kind!=="exam"||currentSession.submitted)return;
  timerHandle=setInterval(()=>{
    if(!currentSession)return;
    if(remainingSeconds(currentSession)<=0){submitExam(currentSession);deleteSession(currentSession.storageKey);stopTimer();renderExamResult();}
    else renderHeader();
  },1000);
}
async function activateSession(session){
  if(session.campaignId&&!campaignSessionIsActive(session)){
    deleteSession(session.storageKey);
    currentSession=null;ACTIVE_CAMPAIGN=null;CURRENT_DATA=ACTIVE_DATA;
    alert("Cuộc thi phong trào đã kết thúc và dữ liệu phiên này đã được gỡ.");
    renderHome();return;
  }

  currentSession=session;
  if(session.campaignId){
    CURRENT_DATA=ACTIVE_DATA;
    const entry=CAMPAIGN_CATALOG.find(x=>x.moduleId===session.campaignId);
    ACTIVE_CAMPAIGN=entry ? await loadCampaign(entry).catch(()=>null) : null;
  }else{
    ACTIVE_CAMPAIGN=null;
    const meta=releaseMetaForSession(session);
    CURRENT_DATA=await loadRelease(meta,true);
  }
  if(session.kind==="exam"&&remainingSeconds(session)<=0&&!session.submitted){submitExam(session);deleteSession(session.storageKey);renderExamResult();return;}
  renderSession();
}
function goHome(){stopTimer();currentSession=null;CURRENT_DATA=ACTIVE_DATA;ACTIVE_CAMPAIGN=null;renderHome();}

function recentResumeCard(){
  const sessions=allSavedSessions(); if(!sessions.length)return "";
  const s=sessions[0];
  if(!Array.isArray(s.questionIds)||!s.questionIds.length)return "";
  let text="";
  if(s.kind==="practice"){
    const c=practiceCounts(s);text=`${c.correct+c.wrong}/${s.questionIds.length} câu đã chấm`;
  }else{
    if(remainingSeconds(s)<=0)return "";
    const c=examCounts(s);text=`${c.selected}/${s.questionIds.length} câu đã chọn`;
  }
  return `<section class="panel soft">
    <div class="row between"><div><div class="eyebrow">TIẾP TỤC GẦN NHẤT</div><div class="strong mt8">${esc(s.bankName)}</div><div class="small mt8">${esc(text)}</div></div>
    <button class="btn3d primary" id="resumeLatest">Tiếp tục</button></div>
  </section>`;
}
function lastResultCard(){
  const r=loadLastResult();if(!r)return "";
  const when=new Intl.DateTimeFormat("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(r.completedAt));
  if(r.kind==="practice") return `<section class="panel"><div class="row between"><div><div class="section-title">Kết quả lần gần nhất</div><div class="strong">${esc(r.bankName)}</div><div class="small mt8">Đúng ${r.correct}/${r.graded} · ${formatPercent(r.percent)} · ${when}</div></div><span class="badge primary">Luyện tập</span></div></section>`;
  return `<section class="panel"><div class="row between"><div><div class="section-title">Kết quả lần gần nhất</div><div class="strong">${esc(r.bankName)}</div><div class="small mt8">${esc(r.candidateGroup)} · ${r.score}/100 · ${when}</div></div><span class="badge primary">Thi thử</span></div></section>`;
}
function installCard(){
  const standalone=matchMedia("(display-mode: standalone)").matches||navigator.standalone;
  if(standalone)return "";
  return `<section class="notice info"><b>Cài để dùng offline</b><div class="mt8">Android: Chrome → Cài ứng dụng. iPhone/iPad: Safari → Chia sẻ → Thêm vào Màn hình chính.</div><button class="btn primary mt8 hidden" id="installBtn">Cài ứng dụng</button></section>`;
}

function campaignCards(){
  const items=activeCampaigns();
  if(!items.length)return "";
  return `<section class="panel"><div class="row between"><div><div class="eyebrow">CUỘC THI PHONG TRÀO</div><div class="section-title mt8">Đang mở ôn luyện</div></div><span class="badge new">${items.length} cuộc thi</span></div>
    <div class="choice-list mt12">${items.map(x=>`<button class="btn3d campaign-card" data-campaign="${x.moduleId}">
      <div class="campaign-icon">${esc(x.icon||"🏆")}</div>
      <div class="campaign-copy"><div class="strong">${esc(x.name)}</div><div class="small mt8">${campaignRemainingText(x)} · đến ${formatDateTime(campaignEndAt(x))}</div>${x.demo?`<div class="badge new mt8">BẢN MÔ PHỎNG</div>`:""}</div>
    </button>`).join("")}</div>
  </section>`;
}
async function openCampaign(id){
  const entry=CAMPAIGN_CATALOG.find(x=>x.moduleId===id);
  if(!entry||campaignStatus(entry)!=="ACTIVE"){renderHome();return;}
  try{
    const campaign=await loadCampaign(entry);
    ACTIVE_CAMPAIGN=campaign;
    renderCampaignHome(campaign);
  }catch(e){alert(`Không mở được Campaign: ${e.message}`);}
}
function renderCampaignHome(campaign){
  unbindSessionActionBar();document.body.classList.remove("session-mode");
  const last=loadCampaignLastResult(campaign.moduleId);
  const lastHtml=last?`<section class="panel"><div class="section-title">Kết quả gần nhất của cuộc thi</div><div class="small">${last.kind==="practice"?`Luyện tập · Đúng ${last.correct}/${last.graded}`:`Thi thử · ${last.score}/${last.total}`}</div></section>`:"";
  app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backHome">‹</button><div><div class="eyebrow">CUỘC THI PHONG TRÀO</div><div class="title mt8">${esc(campaign.name)}</div></div></div></section>
  <section class="notice info"><b>Thời gian ôn luyện:</b> ${formatDateTime(campaignStartAt(campaign))} – ${formatDateTime(campaignEndAt(campaign))}<div class="mt8">${esc(campaign.description||"")}</div><div class="mt8"><b>${campaign.questionCount}</b> câu trong module.</div></section>
  <section class="grid2">
    <button class="btn3d action-card" id="campaignPractice" ${campaign.practiceEnabled?"":"disabled"}><div class="action-icon">📘</div><div class="action-title">Luyện tập</div><div class="action-sub">Theo thứ tự hoặc ngẫu nhiên</div></button>
    <button class="btn3d action-card" id="campaignExam" ${campaign.mockExamEnabled?"":"disabled"}><div class="action-icon">⏱️</div><div class="action-title">Thi thử</div><div class="action-sub">${campaign.examQuestionCount} câu · ${campaign.examMinutes} phút</div></button>
  </section>${lastHtml}
  <div class="notice mt12">Sau ${formatDateTime(campaignEndAt(campaign))}, module sẽ tự ẩn và dữ liệu riêng của cuộc thi sẽ được xóa khỏi thiết bị.</div>`;
  $("#backHome").onclick=()=>{ACTIVE_CAMPAIGN=null;renderHome();};
  if(campaign.practiceEnabled)$("#campaignPractice").onclick=()=>renderCampaignPracticeMode(campaign);
  if(campaign.mockExamEnabled)$("#campaignExam").onclick=()=>startCampaignExam(campaign);
}
function renderCampaignPracticeMode(campaign){
  app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backCampaign">‹</button><div><div class="eyebrow">LUYỆN TẬP CUỘC THI</div><div class="title mt8">${esc(campaign.name)}</div></div></div></section>
  <section class="panel"><div class="section-title">Cách luyện</div><div class="grid2">
    <button class="btn3d choice-card selected" data-campaign-mode="Theo thứ tự">Theo thứ tự</button>
    <button class="btn3d choice-card" data-campaign-mode="Ngẫu nhiên">Ngẫu nhiên</button>
  </div><div class="panel soft mt16"><div class="eyebrow">ĐÃ CHỌN</div><div class="strong mt8">${esc(campaign.name)}</div><div class="small mt8">${campaign.questionCount} câu · <span id="campaignModeSummary">Luyện theo thứ tự</span></div></div>
  <div class="setup-action-spacer" aria-hidden="true"></div><div class="setup-action-dock"><button class="btn3d primary mt12" style="width:100%" id="startCampaignPractice">Bắt đầu luyện</button></div></section>`;
  let mode="Theo thứ tự";
  document.querySelectorAll("[data-campaign-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.campaignMode;document.querySelectorAll("[data-campaign-mode]").forEach(x=>x.classList.toggle("selected",x===b));$("#campaignModeSummary").textContent=`Luyện ${mode.toLowerCase()}`;});
  $("#backCampaign").onclick=()=>renderCampaignHome(campaign);
  const cpBtn=$("#startCampaignPractice");
  cpBtn.onclick=guardAction(cpBtn,async()=>{
    const key=campaignStorageKey(campaign.moduleId,"practice"),existing=loadSession(key);
    if(existing){const choice=await savedSessionChoice();if(choice==="resume"){await activateSession(existing);return;}if(choice==="home"){renderHome();return;}if(choice!=="new")return;}
    const s=newCampaignPractice(campaign,mode);deleteSession(key);saveSession(s);await activateSession(s);
  });
}
async function startCampaignExam(campaign){
  const key=campaignStorageKey(campaign.moduleId,"exam"),existing=loadSession(key);
  if(existing){const choice=await savedSessionChoice();if(choice==="resume"){await activateSession(existing);return;}if(choice==="home"){renderHome();return;}if(choice!=="new")return;}
  else if(!confirm(`Tạo đề ${campaign.examQuestionCount} câu / ${campaign.examMinutes} phút và bắt đầu ngay?`))return;
  const s=newCampaignExam(campaign);deleteSession(key);saveSession(s);await activateSession(s);
}
function renderHome(){
  unbindSessionActionBar();
  document.body.classList.remove("session-mode");
  renderHeader();const newTotal=Object.values(ACTIVE_DATA.banks).reduce((n,b)=>n+(b.meta.newCount||0),0);
  app().innerHTML=`${installCard()}${recentResumeCard()}
  <section class="panel">
    <div class="row between"><div><div class="eyebrow">NGÂN HÀNG HIỆN HÀNH</div><div class="title mt8">Bank ${esc(ACTIVE_RELEASE.bankVersion)}</div></div><span class="badge ${newTotal?"new":"primary"}">${newTotal?`🆕 ${newTotal} câu mới`:`${ACTIVE_RELEASE.questionCount} câu`}</span></div>
    <div class="small mt8">Phát hành ${formatDate(ACTIVE_RELEASE.publishedAt)} · ${ACTIVE_RELEASE.questionCount} câu</div>
  </section>
  <section class="grid2">
    <button class="btn3d action-card" id="goPractice"><div class="action-icon">📘</div><div class="action-title">Luyện tập</div><div class="action-sub">Chuyên môn hoặc kiến thức chung/phụ trợ</div></button>
    <button class="btn3d action-card" id="goExam"><div class="action-icon">⏱️</div><div class="action-title">Thi thử</div><div class="action-sub">100 câu · 45 phút · theo đối tượng thi</div></button>
    <button class="btn3d action-card" id="goNew" ${newTotal===0?"disabled":""}><div class="action-icon">🆕</div><div class="action-title">Luyện câu mới</div><div class="action-sub">${newTotal?`${newTotal} câu mới theo từng nghiệp vụ`:"Không có câu mới"}</div></button>
    <button class="btn3d action-card" id="goUpdate"><div class="action-icon">⬇️</div><div class="action-title">Cập nhật ngân hàng</div><div class="action-sub">Kiểm tra Bank Release mới</div></button>
    <button class="btn3d action-card" id="goAbout"><div class="action-icon">ℹ️</div><div class="action-title">Giới thiệu</div><div class="action-sub">Thông tin dự án · Góp ý · Ủng hộ</div></button>
  </section>
  ${campaignCards()}${lastResultCard()}
  <div class="center tiny mt12">Hoạt động offline · Tiến độ lưu trên thiết bị</div><div class="future-banner-slot" aria-hidden="true"></div>`;
  $("#goPractice").onclick=()=>renderPracticeSetup(false);$("#goExam").onclick=()=>renderExamSetup();$("#goUpdate").onclick=()=>renderUpdate();$("#goAbout").onclick=renderAbout;
  if(newTotal>0)$("#goNew").onclick=()=>renderPracticeSetup(true);
  document.querySelectorAll("[data-campaign]").forEach(b=>b.onclick=()=>openCampaign(b.dataset.campaign));
  const latest=allSavedSessions()[0];if(latest&&$("#resumeLatest"))$("#resumeLatest").onclick=()=>activateSession(latest);
  const ib=$("#installBtn");if(ib&&deferredInstallPrompt){ib.classList.remove("hidden");ib.onclick=async()=>{deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;};}
}

function renderAbout(){
  unbindSessionActionBar();
  document.body.classList.remove("session-mode");
  renderHeader();
  app().innerHTML=`
  <section class="panel">
    <div class="row"><button class="btn3d" id="backHome">‹</button><div><div class="eyebrow">THÔNG TIN ỨNG DỤNG</div><div class="title mt8">ℹ️ Giới thiệu</div></div></div>
  </section>
  <section class="panel">
    <div class="section-title">🎓 Luyện thi nghiệp vụ</div>
    <div class="about-text">Ứng dụng hỗ trợ người dùng chủ động ôn luyện, củng cố kiến thức và làm quen với hình thức thi trắc nghiệm trên thiết bị di động.</div>
    <div class="notice info mt12"><b>🌱 Dự án phi lợi nhuận</b><div class="mt8">Ứng dụng được phát triển với mục tiêu hỗ trợ học tập, luyện tập và tự đánh giá. Các chức năng học tập cơ bản được định hướng cung cấp miễn phí.</div></div>
  </section>
  <section class="panel">
    <div class="section-title">💬 Đánh giá & Góp ý</div>
    <div class="about-text">Ý kiến của người sử dụng là nguồn thông tin quan trọng để tiếp tục rà soát nội dung, khắc phục lỗi và hoàn thiện trải nghiệm trong các phiên bản tiếp theo.</div>
    <div class="small mt8">Kênh gửi góp ý và đánh giá trực tuyến sẽ được bổ sung sau.</div>
  </section>
  <section class="panel center">
    <div class="section-title">☕ Mời tác giả một ly cà phê</div>
    <div class="about-text">Nếu ứng dụng hữu ích và bạn muốn đồng hành cùng dự án, bạn có thể ủng hộ một ly cà phê để hỗ trợ một phần chi phí duy trì, thử nghiệm và tiếp tục hoàn thiện ứng dụng.</div>
    <div class="notice info mt12"><b>❤️ Hoàn toàn tự nguyện</b><div class="mt8">Việc ủng hộ không ảnh hưởng đến bất kỳ chức năng nào của ứng dụng.</div></div>
    <img class="donate-qr mt16" src="donate-qr.png" alt="QR ủng hộ dự án Luyện thi nghiệp vụ">
    <div class="strong mt8">☕ Quét mã QR để ủng hộ dự án</div>
    <div class="small mt8">Có thể sử dụng MoMo hoặc ứng dụng ngân hàng hỗ trợ VietQR.</div>
  </section>
  <div class="center tiny mt12">Cảm ơn bạn đã sử dụng và đồng hành cùng Luyện thi nghiệp vụ ❤️</div>`;
  $("#backHome").onclick=renderHome;
}

function groupButtons(selected){
  return `<div class="grid2">
    <button class="btn3d action-card ${selected==="specialist"?"choice-card selected":""}" data-group="specialist"><div class="action-icon">📘</div><div class="action-title">Chuyên môn nghiệp vụ</div><div class="action-sub">Các nghiệp vụ chuyên môn</div></button>
    <button class="btn3d action-card ${selected==="support"?"choice-card selected":""}" data-group="support"><div class="action-icon">📚</div><div class="action-title">Kiến thức chung / Phụ trợ</div><div class="action-sub">Kiến thức chung, quản lý, tác phong</div></button>
  </div>`;
}
function renderPracticeSetup(newOnly=false,selectedGroup="specialist"){
  unbindSessionActionBar();
  document.body.classList.remove("session-mode");
  CURRENT_DATA=ACTIVE_DATA;
  let items=(selectedGroup==="specialist"?specialistManifest():supportManifest());
  if(newOnly)items=items.filter(x=>bankNewCount(x.id)>0);
  const title=newOnly?"Luyện câu mới":"Luyện tập";
  const list=items.length?items.map(x=>`<button class="btn3d choice-card" data-bank="${x.id}"><div class="strong">${esc(x.name)}</div><div class="small mt8">${newOnly?`${bankNewCount(x.id)} câu mới`: `${bank(x.id).questions.length} câu`}</div></button>`).join(""):`<div class="notice">Không có nghiệp vụ nào có câu mới trong nhóm này.</div>`;
  app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backHome">‹</button><div><div class="eyebrow">${title}</div><div class="title mt8">Chọn nội dung</div></div></div></section>
  ${groupButtons(selectedGroup)}
  <section class="panel mt12"><div class="section-title">${selectedGroup==="specialist"?"Chuyên môn nghiệp vụ":"Kiến thức chung / Phụ trợ"}</div><div class="choice-list">${list}</div></section>`;
  $("#backHome").onclick=renderHome;document.querySelectorAll("[data-group]").forEach(b=>b.onclick=()=>renderPracticeSetup(newOnly,b.dataset.group));
  document.querySelectorAll("[data-bank]").forEach(b=>b.onclick=()=>renderPracticeMode(b.dataset.bank,newOnly));
}
function renderPracticeMode(bankId,newOnly){
  const count=newOnly?bankNewCount(bankId):bank(bankId).questions.length;
  app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backSetup">‹</button><div><div class="eyebrow">${newOnly?"Luyện câu mới":"Luyện tập"}</div><div class="title mt8">${esc(bank(bankId).meta.name)}</div></div></div></section>
  <section class="panel"><div class="section-title">Cách luyện</div><div class="grid2"><button class="btn3d choice-card selected" data-mode="Theo thứ tự">Theo thứ tự</button><button class="btn3d choice-card" data-mode="Ngẫu nhiên">Ngẫu nhiên</button></div>
  <div class="panel soft mt16"><div class="eyebrow">ĐÃ CHỌN</div><div class="strong mt8">${esc(bank(bankId).meta.name)}</div><div class="small mt8">${count} câu${newOnly?" mới":""} · <span id="modeSummary">Luyện theo thứ tự</span></div></div>
  <div class="setup-action-spacer" aria-hidden="true"></div><div class="setup-action-dock"><button class="btn3d primary mt12" style="width:100%" id="startPractice">Bắt đầu luyện</button></div></section>`;
  let mode="Theo thứ tự";document.querySelectorAll("[data-mode]").forEach(b=>b.onclick=()=>{mode=b.dataset.mode;document.querySelectorAll("[data-mode]").forEach(x=>x.classList.toggle("selected",x===b));$("#modeSummary").textContent=`Luyện ${mode.toLowerCase()}`;});
  $("#backSetup").onclick=()=>renderPracticeSetup(newOnly,manifest().find(x=>x.id===bankId).group==="Chuyên môn nghiệp vụ"?"specialist":"support");
  const startPracticeBtn=$("#startPractice");
  startPracticeBtn.onclick=guardAction(startPracticeBtn,async()=>{
    const key=storageKeyPractice(bankId,newOnly),existing=loadSession(key);
    if(existing){const choice=await savedSessionChoice();if(choice==="resume"){await activateSession(existing);return;}if(choice==="home"){renderHome();return;}if(choice!=="new")return;}
    const s=newPractice(bankId,mode,newOnly);if(!s.questionIds.length){alert("Không có câu phù hợp.");return;}delete s.reviewOnly;deleteSession(key);saveSession(s);await activateSession(s);
  });
}

function examStructureHtml(bp){
  return `<div class="list-lines">
    ${Object.entries(bp.general).map(([cat,n])=>`<div class="list-line"><span>${esc(CATEGORY_NAMES[cat])}</span><b>${n} câu</b></div>`).join("")}
    <div class="list-line total"><span><b>Tổng Kiến thức chung / Phụ trợ</b></span><b>25 câu</b></div>
    <div class="list-line"><span>Chuyên môn nghiệp vụ</span><b>75 câu</b></div>
    <div class="list-line total"><span><b>Tổng đề thi</b></span><b>100 câu · 45 phút</b></div>
  </div>`;
}

function renderExamSetup(selectedGroup="specialist",groupCode="A",bankId=null){
  unbindSessionActionBar();
  document.body.classList.remove("session-mode");
  CURRENT_DATA=ACTIVE_DATA;

  // Nhánh Kiến thức chung / Phụ trợ trong Thi thử chỉ dùng để xem cơ cấu.
  // Không chọn đối tượng, không chọn nghiệp vụ và không tạo đề tại đây.
  if(selectedGroup==="support"){
    const structures = Object.entries(BLUEPRINTS).map(([code,bp])=>`
      <section class="panel">
        <div class="eyebrow">${esc(bp.name)}</div>
        <div class="section-title mt8">Cơ cấu 25 câu Kiến thức chung / Phụ trợ</div>
        <div class="mt12">${examStructureHtml(bp)}</div>
      </section>
    `).join("");

    app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backHome">‹</button><div><div class="eyebrow">THI THỬ</div><div class="title mt8">Cơ cấu đề thi</div></div></div></section>
    ${groupButtons("support")}
    <section class="notice info"><b>Kiến thức chung / Phụ trợ không tạo đề thi độc lập.</b><div class="mt8">Đối tượng thi và chuyên đề/nghiệp vụ được chọn tại mục <b>Chuyên môn nghiệp vụ</b>. Hệ thống sẽ tự ghép 25 câu Kiến thức chung / Phụ trợ theo đúng cơ cấu của đối tượng đã chọn.</div></section>
    ${structures}`;

    $("#backHome").onclick=renderHome;
    document.querySelectorAll("[data-group]").forEach(b=>b.onclick=()=>renderExamSetup(b.dataset.group,groupCode,bankId));
    return;
  }

  // Nhánh Chuyên môn nghiệp vụ:
  // 1. Chọn đối tượng thi trước.
  // 2. Sau đó chỉ hiện các chuyên đề/nghiệp vụ phù hợp với đối tượng đó.
  const bp=BLUEPRINTS[groupCode];
  const specialists=specialistManifest().filter(x=>bankEligibleForExam(x.id,groupCode));
  if(!bankId||!specialists.some(x=>x.id===bankId)) bankId=specialists[0]?.id || null;

  const candidateButtons=Object.entries(BLUEPRINTS).map(([k,v])=>
    `<button class="btn3d choice-card ${k===groupCode?"selected":""}" data-candidate="${k}">
      <div class="strong">${esc(v.name)}</div>
    </button>`
  ).join("");

  const subjectButtons=specialists.length
    ? specialists.map(x=>
      `<button class="btn3d choice-card ${x.id===bankId?"selected":""}" data-exam-bank="${x.id}">
        <div class="strong">${esc(x.name)}</div>
        <div class="small mt8">75 câu chuyên môn trong đề</div>
      </button>`
    ).join("")
    : `<div class="notice">Không có chuyên đề/nghiệp vụ phù hợp với đối tượng này.</div>`;

  const selectedSubject = bankId ? bank(bankId)?.meta.name || "" : "";

  app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backHome">‹</button><div><div class="eyebrow">THI THỬ</div><div class="title mt8">Tạo đề thi</div></div></div></section>
  ${groupButtons("specialist")}

  <section class="panel mt12">
    <div class="section-title">1. Đối tượng thi</div>
    <div class="choice-list mt12">${candidateButtons}</div>
  </section>

  <section class="panel">
    <div class="section-title">2. Chuyên đề / nghiệp vụ thi</div>
    <div class="small mt8">Danh sách được lọc theo đối tượng thi đã chọn.</div>
    <div class="choice-list mt12">${subjectButtons}</div>
  </section>

  <section class="panel">
    <div class="section-title">3. Cơ cấu Kiến thức chung / Phụ trợ</div>
    <div class="mt12">${examStructureHtml(bp)}</div>
  </section>

  <section class="panel soft center">
    <div class="eyebrow">ĐỀ SẼ TẠO</div>
    <div class="strong mt8">ĐỀ THI NGHIỆP VỤ<br>${esc(selectedSubject.toUpperCase())}</div>
    <div class="small strong mt8">${esc(bp.name)}</div>
    <div class="small mt12"><b>100</b> câu · <b>45</b> phút</div>
  </section>

  <div class="setup-action-spacer" aria-hidden="true"></div><div class="setup-action-dock"><button class="btn3d primary" style="width:100%" id="startExam" ${!bankId?"disabled":""}>Tạo đề & bắt đầu thi</button><div class="center tiny mt8">Thời gian bắt đầu tính ngay khi đề được tạo.</div></div>`;

  $("#backHome").onclick=renderHome;
  document.querySelectorAll("[data-group]").forEach(b=>b.onclick=()=>renderExamSetup(b.dataset.group,groupCode,bankId));

  // Khi đổi đối tượng, bankId được reset để danh sách chuyên đề được lọc lại từ đầu.
  document.querySelectorAll("[data-candidate]").forEach(b=>b.onclick=()=>renderExamSetup("specialist",b.dataset.candidate,null));

  document.querySelectorAll("[data-exam-bank]").forEach(b=>b.onclick=()=>renderExamSetup("specialist",groupCode,b.dataset.examBank));

  const startExamBtn=$("#startExam");
  startExamBtn.onclick=guardAction(startExamBtn,async()=>{
    const key=storageKeyExam(groupCode,bankId),existing=loadSession(key);
    if(existing){const choice=await savedSessionChoice();if(choice==="resume"){await activateSession(existing);return;}if(choice==="home"){renderHome();return;}if(choice!=="new")return;}
    try{deleteSession(key);const s=newExam(groupCode,bankId);saveSession(s);await activateSession(s);}catch(e){alert(e.message);}
  });
}

function renderNavigator(session){
  const ids=session.questionIds;return `<div class="navigator-wrap"><div class="row between"><div class="section-title">Trạng thái câu hỏi</div><div class="tiny">10 câu / hàng</div></div>
  <div class="legend"><span>□ Chưa làm</span><span>■ Đã chọn</span>${session.kind==="practice"?"<span>● Đúng</span><span>● Sai</span>":""}<span>⚑ Đánh dấu</span></div>
  <div class="navigator">${ids.map((qid,i)=>{const status=session.kind==="practice"?practiceStatus(session,qid):examStatus(session,qid);const state=session.kind==="practice"?practiceState(session,qid):examState(session,qid);return `<button class="nav-btn ${status} ${state.flagged?"flagged":""} ${i===session.index?"current":""}" data-jump="${i}">${i+1}</button>`;}).join("")}</div></div>`;
}
function questionTitle(session){
  if(session.campaignId){
    if(session.kind==="exam")return `<div class="eyebrow">THI THỬ CUỘC THI PHONG TRÀO</div><div class="small strong mt8">${esc(session.campaignName)}</div>`;
    return `<div class="eyebrow">LUYỆN TẬP CUỘC THI PHONG TRÀO</div><div class="small strong mt8">${esc(session.campaignName)}</div>`;
  }
  if(session.kind==="exam")return `<div class="eyebrow">ĐỀ THI NGHIỆP VỤ ${esc(session.bankName.toUpperCase())}</div><div class="small strong mt8">${esc(session.candidateGroup)}</div>`;
  return `<div class="eyebrow">${session.newOnly?"LUYỆN CÂU MỚI":"LUYỆN TẬP"}</div><div class="small strong mt8">${esc(session.bankName)}</div>`;
}

function practiceReviewIndices(session){
  if(session.reviewOnly!=="wrong") return null;
  return session.questionIds
    .map((qid,index)=>practiceStatus(session,qid)==="wrong"?index:null)
    .filter(index=>index!==null);
}

function adjacentPracticeReviewIndex(session,direction){
  const indices=practiceReviewIndices(session);
  if(!indices||!indices.length) return null;
  const pos=indices.indexOf(session.index);
  if(pos<0) return indices[0];
  const nextPos=pos+direction;
  if(nextPos<0||nextPos>=indices.length) return null;
  return indices[nextPos];
}

let actionBarResizeObserver = null;
let actionBarScrollTimer = null;


function scrollFeedbackAboveActionBar(){
  const feedback=document.querySelector("[data-feedback-anchor]");
  if(!feedback) return;
  const bar=document.querySelector(".session-actionbar");
  const topbar=document.querySelector(".topbar");
  const barHeight=bar?.getBoundingClientRect().height || 0;
  const topbarHeight=topbar?.getBoundingClientRect().height || 0;
  const viewportHeight=window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight;
  const topLimit=topbarHeight+10;
  const bottomLimit=viewportHeight-barHeight-12;
  const rect=feedback.getBoundingClientRect();
  const available=Math.max(80,bottomLimit-topLimit);

  // Nếu khối kết quả ngắn: đặt mép dưới ngay trên thanh nút.
  // Nếu khối giải thích dài: đặt đầu khối ngay dưới header để người dùng đọc từ đầu.
  const desiredTop=rect.height<=available ? bottomLimit-rect.height : topLimit;
  const delta=rect.top-desiredTop;
  window.scrollTo({top:Math.max(0,window.scrollY+delta),behavior:"smooth"});
}
function scrollQuestionToTop(){
  const target = document.querySelector("[data-question-anchor]");
  if(!target) return;
  const topbar = document.querySelector(".topbar");
  const offset = (topbar?.getBoundingClientRect().height || 0) + 8;
  const top = window.scrollY + target.getBoundingClientRect().top - offset;
  window.scrollTo({top:Math.max(0,top),behavior:"smooth"});
}

function goToQuestionIndex(session,index){
  session.index=Math.max(0,Math.min(index,session.questionIds.length-1));
  saveSession(session);
  renderSession();
  requestAnimationFrame(()=>requestAnimationFrame(scrollQuestionToTop));
}

function bindSessionActionBar(){
  const bar=document.querySelector(".session-actionbar");
  if(!bar) return;

  const updateHeight=()=>{
    const h=Math.ceil(bar.getBoundingClientRect().height);
    document.documentElement.style.setProperty("--session-actionbar-height",`${h}px`);
  };
  updateHeight();

  if(actionBarResizeObserver) actionBarResizeObserver.disconnect();
  if("ResizeObserver" in window){
    actionBarResizeObserver=new ResizeObserver(updateHeight);
    actionBarResizeObserver.observe(bar);
  }

  const onScroll=()=>{
    bar.classList.add("is-scrolling");
    if(actionBarScrollTimer) clearTimeout(actionBarScrollTimer);
    actionBarScrollTimer=setTimeout(()=>bar.classList.remove("is-scrolling"),360);
  };
  window.removeEventListener("scroll",window.__luyenthiScrollHandler||(()=>{}));
  window.__luyenthiScrollHandler=onScroll;
  window.addEventListener("scroll",onScroll,{passive:true});
}

function unbindSessionActionBar(){
  if(actionBarResizeObserver){
    actionBarResizeObserver.disconnect();
    actionBarResizeObserver=null;
  }
  if(actionBarScrollTimer){
    clearTimeout(actionBarScrollTimer);
    actionBarScrollTimer=null;
  }
  if(window.__luyenthiScrollHandler){
    window.removeEventListener("scroll",window.__luyenthiScrollHandler);
    window.__luyenthiScrollHandler=null;
  }
  document.documentElement.style.removeProperty("--session-actionbar-height");
}
function goParentFromSession(){
  const s=currentSession;stopTimer();currentSession=null;CURRENT_DATA=ACTIVE_DATA;
  if(s?.campaignId && ACTIVE_CAMPAIGN){ if(s.kind==="practice")renderCampaignPracticeMode(ACTIVE_CAMPAIGN); else renderCampaignHome(ACTIVE_CAMPAIGN); return; }
  ACTIVE_CAMPAIGN=null;
  if(s?.kind==="practice")renderPracticeMode(s.bankId,!!s.newOnly); else if(s?.kind==="exam")renderExamSetup("specialist",s.groupCode,s.bankId); else renderHome();
}
function renderSession(){
  if(currentSession?.campaignId&&!campaignSessionIsActive(currentSession)){
    deleteSession(currentSession.storageKey);
    currentSession=null;ACTIVE_CAMPAIGN=null;CURRENT_DATA=ACTIVE_DATA;
    cleanupExpiredCampaigns().finally(renderHome);
    return;
  }
  document.body.classList.add("session-mode");
  renderHeader();const s=currentSession,q=currentQuestion(s);if(!q){app().innerHTML=`<section class="notice error">Không tìm thấy câu hỏi trong Bank ${esc(s.bankVersion)}.</section>`;return;}
  if(s.kind==="exam"&&!s.submitted&&remainingSeconds(s)<=0){submitExam(s);deleteSession(s.storageKey);renderExamResult();return;}
  const options=optionView(q,s.sessionId),state=s.kind==="practice"?practiceState(s,q.id):examState(s,q.id),locked=s.kind==="practice"&&state.locked;
  let feedback="";
  if(s.kind==="practice"&&locked){
    const chosen=q.options.find(o=>o.id===state.selectedOptionId);
    const correct=q.options.find(o=>o.correct);
    const explanation=q.explanation||q.reference||q.source||"";
    if(state.isCorrect){
      feedback=`<div class="feedback ok" data-feedback-anchor><b>✅ Chính xác!</b><div class="small mt8">Đáp án đúng: ${esc(correct?.text||"")}</div>${explanation?`<div class="feedback-explanation mt8"><b>Giải thích:</b> ${esc(explanation)}</div>`:""}</div>`;
    }else{
      feedback=`<div class="feedback bad" data-feedback-anchor><b>❌ Không chính xác.</b><div class="small mt8">Bạn chọn: ${esc(chosen?.text||"")}<br>Đáp án đúng: ${esc(correct?.text||"")}</div>${explanation?`<div class="feedback-explanation mt8"><b>Giải thích:</b> ${esc(explanation)}</div>`:""}</div>`;
    }
  }
  const newBadge=q.releaseStatus==="NEW"?`<span class="badge new">🆕 Mới</span>`:"";
  app().innerHTML=`<section class="panel" data-question-anchor><div class="row"><button class="btn3d" id="backSession" aria-label="Quay lại">‹</button><div>${questionTitle(s)}</div></div><div class="question-head mt12"><span class="badge primary">Câu ${s.index+1}</span>${newBadge}</div><div class="question">${esc(q.question)}</div>
  <div class="options">${options.map(o=>`<label class="option ${state.selectedOptionId===o.id?"selected":""}"><input type="radio" name="answer" value="${o.id}" ${state.selectedOptionId===o.id?"checked":""} ${locked?"disabled":""}><span class="letter">${o.displayLabel}</span><span class="option-text">${esc(o.text)}</span></label>`).join("")}</div>${feedback}
  </section><section class="panel">${renderNavigator(s)}</section>
  <div class="session-bottom-spacer" aria-hidden="true"></div>
  ${s.kind==="practice"?`
  <nav class="session-actionbar practice-actions" aria-label="Điều khiển luyện tập">
    <div class="action-grid practice-grid">
      <button class="btn3d" id="prev">Câu trước</button>
      <button class="btn3d primary" id="grade">Đáp án</button>
      <button class="btn3d" id="next">Câu tiếp theo</button>
      <button class="btn3d" id="flag">${state.flagged?"Bỏ đánh dấu":"Đánh dấu"}</button>
      <button class="btn3d" id="skip">Bỏ qua</button>
      <button class="btn3d" id="stop">Dừng/Kết thúc</button>
    </div>
  </nav>`:`
  <nav class="session-actionbar exam-actions" aria-label="Điều khiển thi thử">
    <div class="action-grid exam-grid">
      <button class="btn3d" id="prev">Câu trước</button>
      <button class="btn3d" id="flag">${state.flagged?"Bỏ đánh dấu":"Đánh dấu"}</button>
      <button class="btn3d" id="next">Câu tiếp theo</button>
      <button class="btn3d danger exam-stop" id="stop">Dừng / Nộp bài</button>
    </div>
  </nav>`}`;
  $("#backSession").onclick=()=>{persistActiveSessionForLifecycle();goParentFromSession();};
  document.querySelectorAll('input[name="answer"]').forEach(r=>r.onchange=()=>{
    if(s.kind==="practice"){if(!state.locked){state.selectedOptionId=r.value;const g=$("#grade");if(g)g.disabled=false;}}
    else state.selectedOptionId=r.value;
    saveSession(s);renderSession();
  });
  document.querySelectorAll("[data-jump]").forEach(b=>b.onclick=()=>goToQuestionIndex(s,Number(b.dataset.jump)));
  if(s.kind==="practice"&&s.reviewOnly==="wrong"){
    const prevWrong=adjacentPracticeReviewIndex(s,-1);
    const nextWrong=adjacentPracticeReviewIndex(s,1);
    $("#prev").disabled=prevWrong===null;
    $("#prev").onclick=()=>{if(prevWrong!==null)goToQuestionIndex(s,prevWrong)};
    $("#next").disabled=nextWrong===null;
    $("#next").onclick=()=>{if(nextWrong!==null)goToQuestionIndex(s,nextWrong)};
  }else{
    $("#prev").disabled=s.index===0;$("#prev").onclick=()=>goToQuestionIndex(s,s.index-1);
    $("#next").disabled=s.index>=s.questionIds.length-1;$("#next").onclick=()=>goToQuestionIndex(s,s.index+1);
  }
  $("#flag").disabled=locked;$("#flag").onclick=()=>{state.flagged=!state.flagged;saveSession(s);renderSession();};
  if(s.kind==="practice"){
    $("#grade").disabled=locked||!state.selectedOptionId;$("#grade").onclick=()=>{const correct=q.options.find(o=>o.correct);state.correctOptionId=correct.id;state.isCorrect=state.selectedOptionId===correct.id;state.locked=true;state.flagged=false;saveSession(s);renderSession();requestAnimationFrame(()=>requestAnimationFrame(scrollFeedbackAboveActionBar));};
    $("#skip").disabled=locked;$("#skip").onclick=()=>{state.selectedOptionId=null;saveSession(s);if(s.index<s.questionIds.length-1)goToQuestionIndex(s,s.index+1);else renderSession();};
    $("#stop").onclick=showPracticeStop;
  }else{$("#stop").onclick=showExamStop;startTimer();}
  bindSessionActionBar();
}
function nextIndexMatching(predicate){
  const ids=currentSession.questionIds,start=currentSession.index;for(let step=1;step<=ids.length;step++){const i=(start+step)%ids.length;if(predicate(ids[i]))return i;}return null;
}
let modalCancelHandler=null;
function showModal(html){closeModal();const wrap=document.createElement("div");wrap.className="modal-wrap";wrap.id="modalWrap";wrap.innerHTML=`<div class="modal">${html}</div>`;document.body.appendChild(wrap);}
function closeModal(){ $("#modalWrap")?.remove(); modalCancelHandler=null; }
function savedSessionChoice(){
  return new Promise(resolve=>{
    showModal(`<div class="eyebrow">PHIÊN ĐANG LƯU</div><h3 class="mt8">Bạn muốn làm gì?</h3><div class="modal-actions"><button class="btn3d primary" id="resumeSaved">Tiếp tục phiên đang lưu</button><button class="btn3d" id="newSaved">Tạo phiên mới</button><button class="btn3d" id="homeSaved">Thoát về màn hình chính</button></div>`);
    const done=v=>{closeModal();resolve(v)}; modalCancelHandler=()=>done("cancel");
    $("#resumeSaved").onclick=()=>done("resume"); $("#newSaved").onclick=()=>done("new"); $("#homeSaved").onclick=()=>done("home");
  });
}
function guardAction(button,fn){ return async()=>{ if(button.dataset.busy==="1")return; button.dataset.busy="1";button.disabled=true;try{await fn();}finally{if(document.body.contains(button)){button.dataset.busy="0";button.disabled=false;}} }; }
function showPracticeStop(){
  const s=currentSession,c=practiceCounts(s),graded=c.correct+c.wrong,unfinished=c.blank+c.selected;
  showModal(`<div class="eyebrow">LUYỆN TẬP</div><h3 class="mt8">Dừng / Kết thúc</h3><div class="small mt8">${esc(s.bankName)}</div>
  <div class="grid4 mt16"><div class="metric"><strong>${graded}</strong><span>Đã chấm</span></div><div class="metric"><strong>${unfinished}</strong><span>Chưa hoàn tất</span></div><div class="metric"><strong>${c.correct}</strong><span>Đúng</span></div><div class="metric"><strong>${c.wrong}</strong><span>Sai</span></div></div>
  ${c.selected?`<div class="notice mt12">Trong đó có <b>${c.selected}</b> câu đã chọn nhưng chưa bấm Đáp án.</div>`:""}
  <div class="modal-actions"><button class="btn3d primary" id="saveStop">💾 Lưu và dừng</button><button class="btn3d" id="goBlank">Câu chưa trả lời</button><button class="btn3d" id="goWrong">Xem câu sai</button><button class="btn3d" id="backPractice">Quay lại luyện tập</button><button class="btn3d" id="finishPractice">Kết thúc phiên luyện</button></div>`);
  $("#saveStop").onclick=()=>{saveSession(s);closeModal();goHome();};
  $("#goBlank").disabled=unfinished===0;$("#goBlank").onclick=()=>{delete s.reviewOnly;const i=nextIndexMatching(qid=>["blank","selected"].includes(practiceStatus(s,qid)));closeModal();if(i!==null)goToQuestionIndex(s,i);else renderSession();};
  $("#goWrong").disabled=c.wrong===0;$("#goWrong").onclick=()=>{s.reviewOnly="wrong";const i=nextIndexMatching(qid=>practiceStatus(s,qid)==="wrong");closeModal();if(i!==null)goToQuestionIndex(s,i);};
  $("#backPractice").onclick=()=>{delete s.reviewOnly;saveSession(s);closeModal();renderSession();};
  $("#finishPractice").onclick=()=>{delete s.reviewOnly;closeModal();deleteSession(s.storageKey);renderPracticeResult();};
}
function renderPracticeResult(){
  stopTimer();const s=currentSession,c=practiceCounts(s),graded=c.correct+c.wrong,ungraded=c.blank+c.selected,percent=graded?c.correct/graded*100:0;
  if(s.campaignId)saveCampaignLastResult(s.campaignId,{kind:"practice",bankName:s.bankName,correct:c.correct,wrong:c.wrong,graded,ungraded,percent});
  else saveLastResult({kind:"practice",bankName:s.bankName,correct:c.correct,wrong:c.wrong,graded,ungraded,percent});
  app().innerHTML=`<section class="panel center"><div class="eyebrow">KẾT QUẢ LUYỆN TẬP</div><div class="title mt8">${esc(s.bankName)}</div><div class="small mt8">${esc(s.mode)}</div></section>
  <section class="panel soft"><div class="result-score"><div class="caption">Tỷ lệ đúng trên số câu đã chấm</div><div class="big">${formatPercent(percent)}</div></div><div class="grid4 mt16"><div class="metric"><strong>${graded}</strong><span>Đã làm</span></div><div class="metric"><strong>${c.correct}</strong><span>Đúng</span></div><div class="metric"><strong>${c.wrong}</strong><span>Sai</span></div><div class="metric"><strong>${ungraded}</strong><span>Chưa chấm</span></div></div></section>
  <section class="panel"><div class="choice-list"><button class="btn3d" id="reviewWrong" ${c.wrong===0?"disabled":""}>Xem lại ${c.wrong} câu sai</button><button class="btn3d" id="repeatPractice">Luyện lại nghiệp vụ này</button><button class="btn3d" id="homeResult">⌂ Về màn hình chính</button></div></section>`;
  $("#reviewWrong").onclick=()=>{s.reviewOnly="wrong";const i=s.questionIds.findIndex(qid=>practiceStatus(s,qid)==="wrong");if(i>=0){s.index=i;renderSession();}};
  $("#repeatPractice").onclick=()=>{if(s.campaignId&&ACTIVE_CAMPAIGN)renderCampaignPracticeMode(ACTIVE_CAMPAIGN);else{CURRENT_DATA=ACTIVE_DATA;renderPracticeMode(s.bankId,s.newOnly);}};$("#homeResult").onclick=goHome;
}
function showExamStop(){
  const s=currentSession,c=examCounts(s),r=remainingSeconds(s),mm=String(Math.floor(r/60)).padStart(2,"0"),ss=String(r%60).padStart(2,"0");
  showModal(`<div class="eyebrow">${s.campaignId?"THI THỬ CUỘC THI PHONG TRÀO":`ĐỀ THI NGHIỆP VỤ ${esc(s.bankName.toUpperCase())}`}</div><div class="small strong mt8">${esc(s.campaignId?s.campaignName:s.candidateGroup)}</div><h3 class="mt12">Dừng / Nộp bài</h3><div class="grid3 mt16"><div class="metric"><strong>${c.selected}</strong><span>Đã trả lời</span></div><div class="metric"><strong>${c.blank}</strong><span>Chưa trả lời</span></div><div class="metric"><strong>${c.flagged}</strong><span>Đánh dấu</span></div></div><div class="notice info mt12">⏱ Thời gian còn lại: <b>${mm}:${ss}</b>. Đồng hồ không tạm dừng.</div>
  <div class="modal-actions"><button class="btn3d" id="backExam">Tiếp tục làm</button><button class="btn3d" id="goExamBlank" ${c.blank===0?"disabled":""}>Làm câu chưa trả lời</button><button class="btn3d" id="goExamFlag" ${c.flagged===0?"disabled":""}>Xem câu đánh dấu</button><button class="btn3d danger" id="submitNow">Nộp bài</button></div>`);
  $("#backExam").onclick=closeModal;$("#goExamBlank").onclick=()=>{const i=nextIndexMatching(qid=>examStatus(s,qid)==="blank");if(i!==null)s.index=i;closeModal();renderSession();};$("#goExamFlag").onclick=()=>{const i=nextIndexMatching(qid=>examState(s,qid).flagged);if(i!==null)s.index=i;closeModal();renderSession();};$("#submitNow").onclick=()=>{closeModal();confirmExamSubmit();};
}
function confirmExamSubmit(){
  const s=currentSession,c=examCounts(s);showModal(`<h3>Xác nhận nộp bài</h3>${c.blank||c.flagged?`<div class="notice mt12">Còn <b>${c.blank}</b> câu chưa trả lời và <b>${c.flagged}</b> câu đánh dấu.</div>`:`<div class="notice info mt12">Đã trả lời đủ ${s.questionIds.length} câu và không còn câu đánh dấu.</div>`}<div class="modal-actions"><button class="btn3d" id="cancelSubmit">Quay lại làm tiếp</button><button class="btn3d danger" id="doSubmit">Vẫn nộp bài</button></div>`);
  $("#cancelSubmit").onclick=closeModal;$("#doSubmit").onclick=()=>{submitExam(s);deleteSession(s.storageKey);closeModal();renderExamResult();};
}
function examResultNavigator(s){
  return `<div class="navigator">${s.questionIds.map((qid,i)=>`<button class="nav-btn ${examStatus(s,qid)}" data-review-exam="${i}">${i+1}</button>`).join("")}</div>`;
}
function renderExamResult(){
  stopTimer();const s=currentSession;if(!s.submitted)submitExam(s);
  const total=s.questionIds.length,c=examCounts(s),blank=s.questionIds.filter(qid=>!examState(s,qid).selectedOptionId).length;
  if(s.campaignId)saveCampaignLastResult(s.campaignId,{kind:"exam",bankName:s.bankName,score:s.score,total});
  else saveLastResult({kind:"exam",bankName:s.bankName,candidateGroup:s.candidateGroup,score:s.score});
  const heading=s.campaignId?`THI THỬ CUỘC THI PHONG TRÀO<br>${esc(s.campaignName.toUpperCase())}`:`ĐỀ THI NGHIỆP VỤ<br>${esc(s.bankName.toUpperCase())}`;
  const sub=s.campaignId?"":`<div class="small strong mt8">${esc(s.candidateGroup)}</div>`;
  app().innerHTML=`<section class="panel center"><div class="eyebrow">KẾT QUẢ THI THỬ</div><div class="strong mt8">${heading}</div>${sub}</section>
  <section class="panel soft"><div class="result-score"><div class="caption">Kết quả</div><div class="big">${s.score} / ${total}</div></div><div class="grid3 mt16"><div class="metric"><strong>${s.score}</strong><span>Đúng</span></div><div class="metric"><strong>${total-s.score-blank}</strong><span>Sai</span></div><div class="metric"><strong>${blank}</strong><span>Bỏ trống</span></div></div></section>
  ${s.campaignId?"":`<section class="panel"><div class="section-title">Kết quả theo nhóm</div><div class="list-lines">${Object.entries(s.breakdown).map(([k,v])=>`<div class="list-line"><span>${esc(k==="specialist"?"Chuyên môn nghiệp vụ":CATEGORY_NAMES[k]||k)}</span><b>${v.correct}/${v.total}</b></div>`).join("")}</div></section>`}
  <section class="panel"><div class="row between"><div class="section-title">Xem lại bài thi</div><div class="tiny">10 câu / hàng</div></div><div class="legend"><span>● Đúng</span><span>● Sai</span><span>□ Bỏ trống</span></div>${examResultNavigator(s)}</section>
  <section class="panel"><div class="choice-list"><button class="btn3d" id="reviewExamWrong">Xem câu sai</button><button class="btn3d" id="repeatExam">Thi thử lại</button><button class="btn3d" id="homeExamResult">⌂ Về màn hình chính</button></div></section>`;
  document.querySelectorAll("[data-review-exam]").forEach(b=>b.onclick=()=>renderExamReview(Number(b.dataset.reviewExam)));
  $("#reviewExamWrong").onclick=()=>{const i=s.questionIds.findIndex(qid=>examStatus(s,qid)==="wrong");if(i>=0)renderExamReview(i,true);};
  $("#repeatExam").onclick=()=>{if(s.campaignId&&ACTIVE_CAMPAIGN)startCampaignExam(ACTIVE_CAMPAIGN);else{CURRENT_DATA=ACTIVE_DATA;renderExamSetup("specialist",s.groupCode,s.bankId);}};
  $("#homeExamResult").onclick=goHome;
}
function renderExamReview(index,wrongOnly=false){
  const s=currentSession;s.index=index;const q=currentQuestion(s),state=examState(s,q.id),options=optionView(q,s.sessionId),correct=q.options.find(o=>o.correct),chosen=q.options.find(o=>o.id===state.selectedOptionId);
  app().innerHTML=`<section class="panel"><div class="row between"><div><div class="eyebrow">XEM LẠI BÀI THI</div><div class="small strong mt8">${esc(s.bankName)} · Câu ${index+1}/100</div></div><button class="btn3d" id="backResult">‹ Kết quả</button></div><div class="question mt16">${esc(q.question)}</div><div class="options">${options.map(o=>`<div class="option ${o.id===correct.id?"selected":""}"><span class="letter">${o.displayLabel}</span><span class="option-text">${esc(o.text)}${o.id===state.selectedOptionId?" <b>← Bạn chọn</b>":""}${o.id===correct.id?" <b>✓ Đúng</b>":""}</span></div>`).join("")}</div><div class="feedback ${state.isCorrect?"ok":"bad"}">${state.isCorrect?"✅ Trả lời đúng":"❌ Trả lời sai hoặc bỏ trống"}</div>
  <div class="toolbar3"><button class="btn3d" id="prevReview">Câu trước</button><button class="btn3d" id="nextWrong">${wrongOnly?"Câu sai tiếp":"Câu tiếp"}</button><button class="btn3d" id="nextReview">Câu tiếp theo</button></div></section>`;
  $("#backResult").onclick=renderExamResult;$("#prevReview").disabled=index===0;$("#prevReview").onclick=()=>renderExamReview(index-1,wrongOnly);$("#nextReview").disabled=index>=s.questionIds.length-1;$("#nextReview").onclick=()=>renderExamReview(index+1,wrongOnly);
  $("#nextWrong").onclick=()=>{let found=null;for(let step=1;step<=s.questionIds.length;step++){const i=(index+step)%s.questionIds.length;if(examStatus(s,s.questionIds[i])==="wrong"){found=i;break;}}if(found!==null)renderExamReview(found,true);};
}

async function renderUpdate(){
  CURRENT_DATA=ACTIVE_DATA;pendingUpdate=null;
  app().innerHTML=`<section class="panel"><div class="row"><button class="btn3d" id="backHome">‹</button><div><div class="eyebrow">NGÂN HÀNG CÂU HỎI</div><div class="title mt8">Cập nhật dữ liệu</div></div></div></section>
  <section class="panel"><div class="eyebrow">PHIÊN BẢN ĐANG DÙNG</div><div class="row between mt8"><div><div class="title">Bank ${esc(ACTIVE_RELEASE.bankVersion)}</div><div class="small mt8">${ACTIVE_RELEASE.questionCount} câu · ${formatDate(ACTIVE_RELEASE.publishedAt)}</div></div><span class="badge primary">Đang hoạt động</span></div></section>
  <section class="panel" id="updateStatus"><div class="center"><div class="small">Bấm để kiểm tra phiên bản mới khi có Internet.</div><button class="btn3d primary mt12" id="checkUpdate">Kiểm tra cập nhật</button></div></section>
  <div class="center tiny">Chỉ cần Internet khi kiểm tra/tải Bank mới. Sau đó tiếp tục dùng offline.</div>`;
  $("#backHome").onclick=renderHome;$("#checkUpdate").onclick=checkForUpdate;
}
async function checkForUpdate(){
  const box=$("#updateStatus");box.innerHTML=`<div class="center"><b>Đang kiểm tra…</b></div>`;
  try{
    const latest=await fetchJson(`${LATEST_URL}?t=${Date.now()}`,{cache:"no-store"});
    if(latest.bankVersion===ACTIVE_RELEASE.bankVersion){box.innerHTML=`<div class="notice info"><b>Ngân hàng đang là phiên bản mới nhất.</b><div class="mt8">Bank ${esc(latest.bankVersion)} · ${latest.questionCount} câu.</div></div><button class="btn3d mt12" id="checkAgain">Kiểm tra lại</button>`;$("#checkAgain").onclick=checkForUpdate;return;}
    pendingUpdate=latest;
    box.innerHTML=`<div class="panel accent"><div class="row between"><div><div class="eyebrow">CÓ BẢN MỚI</div><div class="title mt8">Bank ${esc(latest.bankVersion)}</div><div class="small mt8">Phát hành ${formatDate(latest.publishedAt)}</div></div><span class="badge new">MỚI</span></div>
    <div class="grid3 mt16"><div class="metric"><strong>${latest.newCount}</strong><span>Câu mới</span></div><div class="metric"><strong>${latest.updatedCount}</strong><span>Câu cập nhật</span></div><div class="metric"><strong>${latest.questionCount}</strong><span>Tổng câu</span></div></div>
    <div class="notice info mt12"><b>Phiên đang luyện sẽ không bị thay đổi.</b><div class="mt8">Phiên mới sẽ dùng Bank mới sau khi cập nhật hoàn tất.</div></div><button class="btn3d primary mt12" style="width:100%" id="doUpdate">⬇️ Cập nhật ngay</button></div>`;
    $("#doUpdate").onclick=downloadUpdate;
  }catch(e){box.innerHTML=`<div class="notice error"><b>Không kiểm tra được cập nhật.</b><div class="mt8">${esc(e.message)} Bank hiện tại vẫn được giữ nguyên.</div></div><button class="btn3d mt12" id="retryUpdate">Thử lại</button>`;$("#retryUpdate").onclick=checkForUpdate;}
}
async function downloadUpdate(){
  const box=$("#updateStatus");box.innerHTML=`<div class="center"><b>Đang tải và kiểm tra Bank ${esc(pendingUpdate.bankVersion)}…</b><div class="small mt8">Không đóng ứng dụng trong bước này.</div></div>`;
  try{
    await setActiveRelease(pendingUpdate);
    const newByBank=Object.values(ACTIVE_DATA.banks).filter(b=>(b.meta.newCount||0)>0);
    box.innerHTML=`<div class="notice info"><b>✅ Cập nhật thành công Bank ${esc(ACTIVE_RELEASE.bankVersion)}</b><div class="mt8">${ACTIVE_RELEASE.newCount} câu mới · ${ACTIVE_RELEASE.updatedCount} câu cập nhật · ${ACTIVE_RELEASE.questionCount} câu tổng.</div></div>
    ${newByBank.length?`<div class="panel mt12"><div class="section-title">Nghiệp vụ có câu mới</div><div class="list-lines">${newByBank.map(b=>`<div class="list-line"><span>${esc(b.meta.name)}</span><b>${b.meta.newCount}</b></div>`).join("")}</div></div><button class="btn3d primary" style="width:100%" id="goNewAfterUpdate">🆕 Luyện câu mới</button>`:""}
    <button class="btn3d mt12" style="width:100%" id="homeAfterUpdate">Về màn hình chính</button>`;
    if($("#goNewAfterUpdate"))$("#goNewAfterUpdate").onclick=()=>renderPracticeSetup(true);$("#homeAfterUpdate").onclick=renderHome;
  }catch(e){box.innerHTML=`<div class="notice error"><b>❌ Cập nhật không thành công.</b><div class="mt8">${esc(e.message)} Bank cũ vẫn được giữ nguyên.</div></div><button class="btn3d mt12" id="retryDownload">Thử lại</button>`;$("#retryDownload").onclick=downloadUpdate;}
}

function persistActiveSessionForLifecycle(){
  try{
    if(currentSession && !currentSession.completed && !currentSession.submitted) saveSession(currentSession);
  }catch(e){ console.warn("Lifecycle autosave:",e); }
}
function syncIOSViewport(){
  const vv=window.visualViewport;
  const height=Math.max(1,Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight || 1));
  const offsetTop=Math.max(0,Math.round(vv?.offsetTop || 0));
  document.documentElement.style.setProperty("--app-viewport-height",`${height}px`);
  document.documentElement.style.setProperty("--app-viewport-offset-top",`${offsetTop}px`);
  requestAnimationFrame(()=>{
    const bar=document.querySelector(".session-actionbar");
    if(bar) document.documentElement.style.setProperty("--session-actionbar-height",`${Math.ceil(bar.getBoundingClientRect().height)}px`);
  });
}
function resumeFromIOSLifecycle(){
  syncIOSViewport();
  if(currentSession?.kind==="exam" && !currentSession.submitted){
    if(remainingSeconds(currentSession)<=0){ submitExam(currentSession); deleteSession(currentSession.storageKey); renderExamResult(); return; }
    startTimer();
  }
  requestAnimationFrame(syncIOSViewport);
  setTimeout(syncIOSViewport,180);
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden") persistActiveSessionForLifecycle();
  else resumeFromIOSLifecycle();
});
window.addEventListener("pagehide",persistActiveSessionForLifecycle);
window.addEventListener("pageshow",resumeFromIOSLifecycle);
window.addEventListener("orientationchange",()=>setTimeout(syncIOSViewport,120));
window.addEventListener("resize",syncIOSViewport,{passive:true});
if(window.visualViewport){
  window.visualViewport.addEventListener("resize",syncIOSViewport,{passive:true});
  window.visualViewport.addEventListener("scroll",syncIOSViewport,{passive:true});
}
syncIOSViewport();

let historyGuardArmed=false,allowHistoryExit=false;
function armHistoryGuard(){ if(allowHistoryExit||historyGuardArmed)return; history.pushState({luyenthiGuard:true},"");historyGuardArmed=true; }
function atHomeView(){ return !currentSession && !!document.querySelector("#goPractice"); }
function handleSystemBack(){
  if($("#modalWrap")){ if(modalCancelHandler)modalCancelHandler(); else closeModal(); return "handled"; }
  if(currentSession){persistActiveSessionForLifecycle();goParentFromSession();return "handled";}
  for(const id of ["#backSetup","#backCampaign","#backResult","#backHome"]){const b=$(id);if(b){b.click();return "handled";}}
  if(atHomeView()){
    if(confirm("Thoát ứng dụng?\nBạn có muốn thoát Luyện thi nghiệp vụ không?")){allowHistoryExit=true;return "exit";}
    return "stay";
  }
  renderHome();return "handled";
}
window.addEventListener("popstate",()=>{
  if(allowHistoryExit)return;
  historyGuardArmed=false;
  const result=handleSystemBack();
  if(result!=="exit")armHistoryGuard();
});
armHistoryGuard();

window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;const b=$("#installBtn");if(b)b.classList.remove("hidden");});
async function registerSW(){
  if(!("serviceWorker" in navigator))return;
  try{
    const reg=await navigator.serviceWorker.register("./sw.js");await reg.update();
    navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!sessionStorage.getItem("swReloaded")){sessionStorage.setItem("swReloaded","1");location.reload();}});
  }catch(e){console.warn("Service worker:",e);}
}
async function boot(){
  await registerSW();
  ACTIVE_RELEASE=activeReleaseFromStorage();
  try{ACTIVE_DATA=await loadRelease(ACTIVE_RELEASE,true);}catch(e){ACTIVE_RELEASE=BASELINE_RELEASE;ACTIVE_DATA=await loadRelease(BASELINE_RELEASE,true);localStorage.setItem(ACTIVE_RELEASE_KEY,JSON.stringify(ACTIVE_RELEASE));}
  CURRENT_DATA=ACTIVE_DATA;
  await loadCampaignCatalog();
  await cleanupExpiredCampaigns();
  scheduleCampaignMaintenance();
  renderHome();
}
boot().catch(e=>{app().innerHTML=`<section class="notice error"><b>Không nạp được ứng dụng.</b><div class="mt8">${esc(e.message)}</div><div class="mt8">Hãy mở qua HTTPS hoặc localhost.</div></section>`;});
