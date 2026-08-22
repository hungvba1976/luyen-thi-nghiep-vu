
"use strict";

const DATA_URL = "./data/banks.json";
const APP_VERSION = "Mobile Offline V0.1.1";
const EXAM_SECONDS = 45 * 60;

const GROUP_B = ["khdn","khcn","tham_dinh","ktgd_noi_bo","ktgd_khach_hang","ttqt_tttm","xu_ly_no"];
const GROUP_C = ["kh_qlrr","ktgsnb","cntt","nhan_su_tien_luong","phap_che","xdcb_qthc","van_thu_le_tan","tien_te_kho_quy"];
const GROUP_A = [...GROUP_B, ...GROUP_C];

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
    name: "A. Lao động giữ chức danh, chức vụ",
    allowed: GROUP_A,
    specialist: 75,
    general: {
      organization_culture:3, products_services:4, labor_rules:2,
      management_skills:5, banking_law:4,
      communication_customer_care:4, digital_transformation:3
    }
  },
  B: {
    name: "B. Lao động chuyên môn nghiệp vụ - nhóm 7 vị trí",
    allowed: GROUP_B,
    specialist: 75,
    general: {
      organization_culture:3, products_services:4, labor_rules:3,
      banking_law:4, communication_customer_care:5,
      transaction_style:3, digital_transformation:3
    }
  },
  C: {
    name: "C. Lao động chuyên môn/thừa hành, phục vụ - nhóm vị trí còn lại",
    allowed: GROUP_C,
    specialist: 75,
    general: {
      organization_culture:3, products_services:5, labor_rules:3,
      banking_law:4, communication_customer_care:5,
      digital_transformation:5
    }
  }
};

let DATA = null;
let view = {screen:"home", tab:"practice"};
let currentSession = null;
let timerHandle = null;
let deferredInstallPrompt = null;

const $ = (sel) => document.querySelector(sel);
const app = () => $("#app");
const header = () => $("#sessionHeader");

function esc(text){
  return String(text ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[ch]);
}

function uid(prefix){
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
}

function hash32(str){
  let h = 2166136261 >>> 0;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a){
  return function(){
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function shuffledCopy(arr, seedStr){
  const out = [...arr];
  const rnd = mulberry32(hash32(seedStr));
  for(let i=out.length-1;i>0;i--){
    const j = Math.floor(rnd()*(i+1));
    [out[i],out[j]] = [out[j],out[i]];
  }
  return out;
}
function sample(arr, n, seedStr){
  return shuffledCopy(arr, seedStr).slice(0,n);
}
function optionView(q, sessionId){
  const options = q.shuffleOptions ? shuffledCopy(q.options, `${sessionId}|${q.id}`) : [...q.options];
  return options.map((o,i)=>({...o, displayLabel:"ABCDEF"[i]}));
}

function practiceKey(bankId){ return `practice:${bankId}`; }
function examKey(group,bankId){ return `exam:${group}:${bankId}`; }
function saveSession(session){
  localStorage.setItem(`luyenthi:${session.storageKey}`, JSON.stringify(session));
}
function loadSession(storageKey){
  const raw = localStorage.getItem(`luyenthi:${storageKey}`);
  if(!raw) return null;
  try{return JSON.parse(raw);}catch{return null;}
}
function deleteSession(storageKey){
  localStorage.removeItem(`luyenthi:${storageKey}`);
}

function bank(bankId){ return DATA.banks[bankId]; }
function manifestById(bankId){ return DATA.manifest.find(x=>x.id===bankId); }
function specialistManifest(){
  return DATA.manifest.filter(x=>x.group==="Chuyên môn nghiệp vụ");
}
function supportManifest(){
  return DATA.manifest.filter(x=>x.group!=="Chuyên môn nghiệp vụ");
}

function practiceState(session,qid){
  if(!session.states[qid]){
    session.states[qid] = {selectedOptionId:null,locked:false,isCorrect:null,correctOptionId:null,flagged:false};
  }
  return session.states[qid];
}
function practiceStatus(session,qid){
  const s = practiceState(session,qid);
  if(s.locked) return s.isCorrect ? "correct" : "wrong";
  if(s.selectedOptionId) return "selected";
  return "blank";
}
function practiceCounts(session){
  const c={blank:0,selected:0,correct:0,wrong:0,flagged:0};
  session.questionIds.forEach(qid=>{
    c[practiceStatus(session,qid)]++;
    if(practiceState(session,qid).flagged) c.flagged++;
  });
  return c;
}

function examState(session,qid){
  if(!session.states[qid]){
    session.states[qid] = {selectedOptionId:null,flagged:false,isCorrect:null};
  }
  return session.states[qid];
}
function examStatus(session,qid){
  const s=examState(session,qid);
  if(session.submitted){
    if(!s.selectedOptionId) return "blank";
    return s.isCorrect ? "correct" : "wrong";
  }
  return s.selectedOptionId ? "selected" : "blank";
}
function examCounts(session){
  const c={blank:0,selected:0,correct:0,wrong:0,flagged:0};
  session.questionIds.forEach(qid=>{
    c[examStatus(session,qid)]++;
    if(examState(session,qid).flagged) c.flagged++;
  });
  return c;
}

function questionLookup(session){
  if(session.kind==="practice"){
    return Object.fromEntries(bank(session.bankId).questions.map(q=>[q.id,q]));
  }
  return Object.fromEntries(session.questions.map(q=>[q.id,q]));
}

function currentQuestion(session){
  const lookup=questionLookup(session);
  return lookup[session.questionIds[session.index]];
}

function newPractice(bankId, mode){
  let ids=bank(bankId).questions.map(q=>q.id);
  const sessionId=uid("practice");
  if(mode==="Ngẫu nhiên") ids=shuffledCopy(ids,sessionId);
  return {
    version:"mobile-0.1",kind:"practice",sessionId,storageKey:practiceKey(bankId),
    bankId,bankName:bank(bankId).meta.name,mode,questionIds:ids,index:0,states:{},completed:false
  };
}

function buildExam(groupCode, bankId){
  const bp=BLUEPRINTS[groupCode];
  if(!bp.allowed.includes(bankId)) throw new Error("Nghiệp vụ không thuộc nhóm đã chọn.");
  const seed=uid("paper");
  const selected=[];

  sample(bank(bankId).questions,bp.specialist,`${seed}|specialist`).forEach(q=>{
    selected.push({...q,examSource:"specialist"});
  });

  const general=bank("kien_thuc_chung").questions;
  for(const [category,count] of Object.entries(bp.general)){
    let pool;
    if(category==="management_skills") pool=bank("ky_nang_quan_ly").questions;
    else if(category==="transaction_style") pool=bank("tac_phong_gdv").questions;
    else pool=general.filter(q=>q.examCategory===category);

    if(pool.length<count) throw new Error(`Không đủ câu cho ${CATEGORY_NAMES[category]||category}`);
    sample(pool,count,`${seed}|${category}`).forEach(q=>{
      selected.push({...q,examSource:category});
    });
  }
  if(selected.length!==100) throw new Error(`Đề hiện có ${selected.length} câu, không phải 100.`);
  if(new Set(selected.map(q=>q.id)).size!==100) throw new Error("Đề có câu trùng.");
  return selected;
}

function newExam(groupCode, bankId){
  const questions=buildExam(groupCode,bankId);
  const sessionId=uid("exam");
  const ids=shuffledCopy(questions.map(q=>q.id),sessionId);
  const now=Date.now();
  return {
    version:"mobile-0.1",kind:"exam",sessionId,storageKey:examKey(groupCode,bankId),
    groupCode,bankId,bankName:bank(bankId).meta.name,questionIds:ids,index:0,states:{},
    submitted:false,score:null,breakdown:{},startedAt:now,deadline:now+EXAM_SECONDS*1000,
    questions
  };
}

function remainingSeconds(session){
  return Math.max(0,Math.ceil((session.deadline-Date.now())/1000));
}

function submitExam(session){
  if(session.submitted) return;
  const lookup=questionLookup(session);
  let score=0;
  const breakdown={};
  session.questionIds.forEach(qid=>{
    const q=lookup[qid], s=examState(session,qid);
    const correct=q.options.find(o=>o.correct);
    s.isCorrect=!!s.selectedOptionId && s.selectedOptionId===correct.id;
    s.flagged=false;
    if(s.isCorrect) score++;
    const src=q.examSource||"specialist";
    if(!breakdown[src]) breakdown[src]={total:0,correct:0};
    breakdown[src].total++;
    if(s.isCorrect) breakdown[src].correct++;
  });
  session.submitted=true;
  session.score=score;
  session.breakdown=breakdown;
  saveSession(session);
}

function stopTimer(){
  if(timerHandle){clearInterval(timerHandle);timerHandle=null;}
}
function startTimer(){
  stopTimer();
  if(!currentSession || currentSession.kind!=="exam" || currentSession.submitted) return;
  timerHandle=setInterval(()=>{
    if(!currentSession) return;
    if(remainingSeconds(currentSession)<=0){
      submitExam(currentSession);
      deleteSession(currentSession.storageKey);
      stopTimer();
      renderResult();
    }else{
      renderHeaderSession();
    }
  },1000);
}

function renderHeaderSession(){
  if(!currentSession){header().innerHTML="";return;}
  const n=currentSession.index+1;
  const total=currentSession.questionIds.length;
  if(currentSession.kind==="exam" && !currentSession.submitted){
    const rem=remainingSeconds(currentSession), mm=String(Math.floor(rem/60)).padStart(2,"0"), ss=String(rem%60).padStart(2,"0");
    header().innerHTML=`<span>${n}/100</span><span>⏱ ${mm}:${ss}</span>`;
  }else{
    header().innerHTML=`<span>${n}/${total}</span>`;
  }
}

function homeInstallCard(){
  const isIos=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone=window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
  if(standalone) return `<div class="card small">✅ Ứng dụng đang chạy ở chế độ cài đặt/offline.</div>`;
  let instruction=isIos
    ? `Trên iPhone/iPad: mở bằng Safari → Chia sẻ → <b>Thêm vào Màn hình chính</b>. Sau khi mở app một lần, dữ liệu sẽ được lưu để dùng offline.`
    : `Trên Android: dùng nút <b>Cài ứng dụng</b> (nếu xuất hiện) hoặc menu Chrome → <b>Cài ứng dụng/Thêm vào màn hình chính</b>.`;
  return `<div class="card install-note">
    <b>Cài để dùng offline</b><div class="small">${instruction}</div>
    <div class="toolbar"><button class="btn primary" id="installBtn" style="display:none">Cài ứng dụng</button></div>
  </div>`;
}

function renderHome(){
  stopTimer(); currentSession=null; renderHeaderSession();
  const specialists=specialistManifest(), supports=supportManifest();

  app().innerHTML=`
    ${homeInstallCard()}
    <div class="tabs">
      <button class="tab ${view.tab==="practice"?"active":""}" data-tab="practice">Luyện tập</button>
      <button class="tab ${view.tab==="exam"?"active":""}" data-tab="exam">Thi thử</button>
    </div>
    <div id="homePanel"></div>
    <div class="card small">
      <b>${APP_VERSION}</b> · ${DATA.manifest.length} ngân hàng ·
      ${Object.values(DATA.banks).reduce((n,b)=>n+b.questions.length,0)} câu.
      Tiến độ chỉ lưu trên thiết bị này.
    </div>
  `;
  document.querySelectorAll("[data-tab]").forEach(btn=>btn.onclick=()=>{view.tab=btn.dataset.tab;renderHome();});
  if(view.tab==="practice") renderPracticeHome(specialists,supports);
  else renderExamHome(specialists);

  const ib=$("#installBtn");
  if(ib && deferredInstallPrompt){
    ib.style.display="inline-block";
    ib.onclick=async()=>{
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt=null;
      ib.style.display="none";
    };
  }
}

function renderPracticeHome(specialists,supports){
  const panel=$("#homePanel");
  panel.innerHTML=`
    <div class="card">
      <h3>Luyện tập</h3>
      <div class="form-row">
        <div><label>Nhóm ngân hàng</label>
          <select id="practiceGroup">
            <option value="specialist">Chuyên môn nghiệp vụ</option>
            <option value="support">Kiến thức chung / phụ trợ</option>
          </select>
        </div>
        <div><label>Ngân hàng câu hỏi</label><select id="practiceBank"></select></div>
        <div><label>Cách luyện</label>
          <select id="practiceMode"><option>Theo thứ tự</option><option>Ngẫu nhiên</option></select>
        </div>
      </div>
      <div id="practiceResume"></div>
      <div class="toolbar"><button class="btn primary" id="startPractice">Bắt đầu luyện</button></div>
    </div>
  `;
  const group=$("#practiceGroup"), bankSel=$("#practiceBank");
  function fillBanks(){
    const arr=group.value==="specialist"?specialists:supports;
    bankSel.innerHTML=arr.map(x=>`<option value="${x.id}">${esc(x.name)} (${x.question_count??x.questionCount??bank(x.id).questions.length})</option>`).join("");
    renderResume();
  }
  function renderResume(){
    const saved=loadSession(practiceKey(bankSel.value));
    const box=$("#practiceResume");
    if(!saved){box.innerHTML="";return;}
    const c=practiceCounts(saved);
    box.innerHTML=`<div class="install-note" style="margin-top:10px">
      Phiên đã lưu: ⚪ ${c.blank} · 🔵 ${c.selected} · 🟢 ${c.correct} · 🔴 ${c.wrong} · 🚩 ${c.flagged}
      <div class="toolbar"><button class="btn" id="resumePractice">Tiếp tục</button></div>
    </div>`;
    $("#resumePractice").onclick=()=>{currentSession=saved;view.screen="session";renderSession();};
  }
  group.onchange=fillBanks;bankSel.onchange=renderResume;fillBanks();
  $("#startPractice").onclick=()=>{
    const key=practiceKey(bankSel.value);
    if(loadSession(key) && !confirm("Nghiệp vụ này có phiên đang lưu. Tạo lượt mới sẽ thay thế phiên cũ. Tiếp tục?")) return;
    currentSession=newPractice(bankSel.value,$("#practiceMode").value);
    saveSession(currentSession);view.screen="session";renderSession();
  };
}

function renderExamHome(specialists){
  const panel=$("#homePanel");
  panel.innerHTML=`
    <div class="card">
      <h3>Thi thử</h3>
      <div class="small">100 câu · 45 phút · 75 câu chuyên môn + 25 câu kiến thức chung/phụ trợ.</div>
      <div class="form-row" style="margin-top:10px">
        <div><label>Nhóm đối tượng</label>
          <select id="examGroup">
            ${Object.entries(BLUEPRINTS).map(([k,v])=>`<option value="${k}">${esc(v.name)}</option>`).join("")}
          </select>
        </div>
        <div><label>Nghiệp vụ chuyên môn</label><select id="examBank"></select></div>
      </div>
      <div class="small" id="examStructure" style="margin-top:10px"></div>
      <div id="examResume"></div>
      <div class="toolbar"><button class="btn primary" id="startExam">Tạo đề và bắt đầu 45 phút</button></div>
    </div>
  `;
  const group=$("#examGroup"), bankSel=$("#examBank");
  function refresh(){
    const bp=BLUEPRINTS[group.value];
    const arr=specialists.filter(x=>bp.allowed.includes(x.id));
    bankSel.innerHTML=arr.map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join("");
    $("#examStructure").textContent="Cơ cấu 25 câu: "+Object.entries(bp.general).map(([cat,n])=>`${n} ${CATEGORY_NAMES[cat]}`).join(" · ");
    resume();
  }
  function resume(){
    let saved=loadSession(examKey(group.value,bankSel.value));
    const box=$("#examResume");
    if(saved && !saved.submitted && remainingSeconds(saved)>0){
      box.innerHTML=`<div class="install-note" style="margin-top:10px">
        Có bài thi đang làm dở. Đồng hồ vẫn tính từ lúc tạo đề.
        <div class="toolbar"><button class="btn" id="resumeExam">Tiếp tục bài thi</button></div>
      </div>`;
      $("#resumeExam").onclick=()=>{currentSession=saved;view.screen="session";renderSession();};
    }else{
      if(saved && remainingSeconds(saved)<=0) deleteSession(saved.storageKey);
      box.innerHTML="";
    }
  }
  group.onchange=refresh;bankSel.onchange=resume;refresh();
  $("#startExam").onclick=()=>{
    const key=examKey(group.value,bankSel.value);
    if(loadSession(key) && !confirm("Đang có bài thi đã lưu. Tạo đề mới sẽ thay thế bài cũ. Tiếp tục?")) return;
    try{
      currentSession=newExam(group.value,bankSel.value);
      saveSession(currentSession);view.screen="session";renderSession();
    }catch(err){alert(err.message);}
  };
}

function renderNavigator(session){
  const ids=session.questionIds;
  const buttons=ids.map((qid,i)=>{
    const status=session.kind==="practice"?practiceStatus(session,qid):examStatus(session,qid);
    const state=session.kind==="practice"?practiceState(session,qid):examState(session,qid);
    return `<button class="nav-btn ${status} ${state.flagged?"flagged":""} ${i===session.index?"current":""}" data-jump="${i}">${i+1}</button>`;
  }).join("");
  return `<div class="sticky-status">
    <div class="status-legend">
      <span>⚪ Chưa làm</span><span>🔵 Đã chọn</span>
      ${session.kind==="practice"?`<span>🟢 Đúng</span><span>🔴 Sai</span>`:""}
      <span>🚩 Đánh dấu</span>
    </div>
    <div class="navigator">${buttons}</div>
  </div>`;
}

function renderSession(){
  if(!currentSession){renderHome();return;}
  if(currentSession.kind==="exam" && !currentSession.submitted && remainingSeconds(currentSession)<=0){
    submitExam(currentSession);deleteSession(currentSession.storageKey);renderResult();return;
  }
  renderHeaderSession();
  const q=currentQuestion(currentSession);
  const options=optionView(q,currentSession.sessionId);
  const state=currentSession.kind==="practice"?practiceState(currentSession,q.id):examState(currentSession,q.id);
  const locked=currentSession.kind==="practice" && state.locked;

  let feedback="";
  if(currentSession.kind==="practice" && state.locked){
    if(state.isCorrect) feedback=`<div class="feedback ok">✅ Chính xác!</div>`;
    else{
      const chosen=q.options.find(o=>o.id===state.selectedOptionId);
      const correct=q.options.find(o=>o.correct);
      feedback=`<div class="feedback bad">❌ Không chính xác.<br><span class="small">Bạn chọn: ${esc(chosen?.text||"")}<br>Đáp án đúng: ${esc(correct.text)}</span></div>`;
    }
  }

  const optionHtml=options.map((o,i)=>`
    <label class="option">
      <input type="radio" name="answer" value="${o.id}" ${state.selectedOptionId===o.id?"checked":""} ${locked?"disabled":""}>
      <span><b>${o.displayLabel}.</b> ${esc(o.text)}</span>
    </label>
  `).join("");

  const toolbar=currentSession.kind==="practice"
    ? `<div class="toolbar">
        <button class="btn" id="prevBtn">Câu trước</button>
        <button class="btn primary" id="gradeBtn">Đáp án</button>
        <button class="btn" id="nextBtn">Câu tiếp theo</button>
        <button class="btn" id="flagBtn">${state.flagged?"Bỏ đánh dấu":"Đánh dấu"}</button>
        <button class="btn" id="skipBtn">Bỏ qua</button>
        <button class="btn" id="stopBtn">Dừng/Kết thúc</button>
      </div>`
    : `<div class="toolbar">
        <button class="btn" id="prevBtn">Câu trước</button>
        <button class="btn" id="nextBtn">Câu tiếp theo</button>
        <button class="btn" id="flagBtn">${state.flagged?"Bỏ đánh dấu":"Đánh dấu"}</button>
        <button class="btn" id="stopBtn">Dừng/Kết thúc</button>
      </div>`;

  app().innerHTML=`
    <div class="card">
      <div class="small">${esc(currentSession.bankName)}</div>
      <div class="question">${esc(q.question)}</div>
      <div class="options">${optionHtml}</div>
      ${feedback}
      ${toolbar}
    </div>
    <div class="card">${renderNavigator(currentSession)}</div>
  `;

  document.querySelectorAll('input[name="answer"]').forEach(radio=>{
    radio.onchange=()=>{
      if(currentSession.kind==="practice"){
        if(!state.locked){
          state.selectedOptionId=radio.value;
          const gradeButton = $("#gradeBtn");
          if(gradeButton) gradeButton.disabled = false;
        }
      }else{
        state.selectedOptionId=radio.value; // editable until submit
      }
      saveSession(currentSession);
      renderHeaderSession();
      // refresh only navigator colors without losing current selection.
      document.querySelectorAll("[data-jump]").forEach(btn=>{
        const idx=Number(btn.dataset.jump),qid=currentSession.questionIds[idx];
        const status=currentSession.kind==="practice"?practiceStatus(currentSession,qid):examStatus(currentSession,qid);
        btn.classList.remove("blank","selected","correct","wrong");
        btn.classList.add(status);
      });
    };
  });

  document.querySelectorAll("[data-jump]").forEach(btn=>btn.onclick=()=>{
    currentSession.index=Number(btn.dataset.jump);saveSession(currentSession);renderSession();
  });

  $("#prevBtn").disabled=currentSession.index===0;
  $("#prevBtn").onclick=()=>{currentSession.index--;saveSession(currentSession);renderSession();};

  $("#nextBtn").disabled=currentSession.index>=currentSession.questionIds.length-1;
  $("#nextBtn").onclick=()=>{currentSession.index++;saveSession(currentSession);renderSession();};

  $("#flagBtn").onclick=()=>{
    if(currentSession.kind==="practice" && state.locked) return;
    state.flagged=!state.flagged;saveSession(currentSession);renderSession();
  };
  if(currentSession.kind==="practice" && state.locked) $("#flagBtn").disabled=true;

  if(currentSession.kind==="practice"){
    $("#gradeBtn").disabled=state.locked || !state.selectedOptionId;
    $("#gradeBtn").onclick=()=>{
      if(state.locked || !state.selectedOptionId) return;
      const correct=q.options.find(o=>o.correct);
      state.correctOptionId=correct.id;
      state.isCorrect=state.selectedOptionId===correct.id;
      state.locked=true;state.flagged=false;
      saveSession(currentSession);renderSession();
    };
    $("#skipBtn").disabled=state.locked;
    $("#skipBtn").onclick=()=>{
      if(state.locked) return;
      state.selectedOptionId=null;
      saveSession(currentSession);
      if(currentSession.index<currentSession.questionIds.length-1) currentSession.index++;
      saveSession(currentSession);renderSession();
    };
  }

  $("#stopBtn").onclick=()=>showStopModal();
  if(currentSession.kind==="exam") startTimer(); else stopTimer();
}

function nextIndexMatching(predicate){
  const ids=currentSession.questionIds,start=currentSession.index;
  for(let step=1;step<=ids.length;step++){
    const idx=(start+step)%ids.length;
    if(predicate(ids[idx])) return idx;
  }
  return null;
}

function showModal(html){
  const wrap=document.createElement("div");
  wrap.className="modal-wrap";wrap.id="modalWrap";
  wrap.innerHTML=`<div class="modal">${html}</div>`;
  document.body.appendChild(wrap);
}
function closeModal(){ $("#modalWrap")?.remove(); }

function showStopModal(){
  const s=currentSession;
  if(s.kind==="practice"){
    const c=practiceCounts(s);
    showModal(`
      <h3>Dừng / Kết thúc</h3>
      <p>⚪ ${c.blank} · 🔵 ${c.selected} · 🟢 ${c.correct} · 🔴 ${c.wrong} · 🚩 ${c.flagged}</p>
      <div class="modal-actions">
        <button class="btn primary" id="saveStop">Lưu và dừng</button>
        <button class="btn" id="goBlank">Câu chưa làm</button>
        <button class="btn" id="goWrong">Xem câu sai</button>
        <button class="btn danger" id="finishPractice">Kết thúc phiên</button>
        <button class="btn" id="cancelModal">Quay lại</button>
      </div>`);
    $("#saveStop").onclick=()=>{saveSession(s);currentSession=null;closeModal();renderHome();};
    $("#goBlank").onclick=()=>{const i=nextIndexMatching(qid=>practiceStatus(s,qid)==="blank");if(i!==null)s.index=i;closeModal();renderSession();};
    $("#goWrong").onclick=()=>{const i=nextIndexMatching(qid=>practiceStatus(s,qid)==="wrong");if(i!==null)s.index=i;closeModal();renderSession();};
    $("#finishPractice").onclick=()=>{deleteSession(s.storageKey);closeModal();renderResult();};
    $("#cancelModal").onclick=closeModal;
  }else{
    const c=examCounts(s),rem=remainingSeconds(s),mm=String(Math.floor(rem/60)).padStart(2,"0"),ss=String(rem%60).padStart(2,"0");
    showModal(`
      <h3>Dừng / Kết thúc</h3>
      <p>⚪ Chưa trả lời: <b>${c.blank}</b> · 🔵 Đã trả lời: <b>${c.selected}</b> · 🚩 <b>${c.flagged}</b></p>
      <p>⏱ Còn lại: <b>${mm}:${ss}</b></p>
      <div class="modal-actions">
        <button class="btn primary" id="saveStop">Lưu và dừng</button>
        <button class="btn" id="cancelModal">Quay lại làm tiếp</button>
        <button class="btn danger" id="submitExamBtn">Nộp bài</button>
      </div>`);
    $("#saveStop").onclick=()=>{saveSession(s);currentSession=null;stopTimer();closeModal();renderHome();};
    $("#cancelModal").onclick=closeModal;
    $("#submitExamBtn").onclick=()=>{closeModal();confirmSubmit();};
  }
}

function confirmSubmit(){
  const c=examCounts(currentSession);
  showModal(`
    <h3>Xác nhận nộp bài</h3>
    ${c.blank||c.flagged?`<p class="install-note">Bạn còn <b>${c.blank}</b> câu chưa trả lời và <b>${c.flagged}</b> câu đánh dấu.</p>`:`<p>Đã trả lời đủ 100 câu.</p>`}
    <div class="modal-actions">
      <button class="btn" id="backExam">Quay lại</button>
      <button class="btn danger" id="doSubmit">Vẫn nộp bài</button>
    </div>`);
  $("#backExam").onclick=closeModal;
  $("#doSubmit").onclick=()=>{
    submitExam(currentSession);deleteSession(currentSession.storageKey);stopTimer();closeModal();renderResult();
  };
}

function renderResult(){
  stopTimer();renderHeaderSession();
  const s=currentSession;
  if(!s){renderHome();return;}
  if(s.kind==="practice"){
    const c=practiceCounts(s);
    app().innerHTML=`<div class="card">
      <h2>Kết quả luyện tập</h2>
      <div class="score-grid">
        <div class="metric"><strong>${c.correct}</strong>Đúng</div>
        <div class="metric"><strong>${c.wrong}</strong>Sai</div>
        <div class="metric"><strong>${c.blank+c.selected}</strong>Chưa chấm</div>
      </div>
      <div class="toolbar"><button class="btn primary" id="homeBtn">Về trang chính</button></div>
    </div>`;
  }else{
    if(!s.submitted) submitExam(s);
    const detail=Object.entries(s.breakdown).map(([k,v])=>`<div><b>${esc(k==="specialist"?"Chuyên môn nghiệp vụ":CATEGORY_NAMES[k]||k)}:</b> ${v.correct}/${v.total}</div>`).join("");
    app().innerHTML=`<div class="card">
      <h2>Kết quả thi thử</h2>
      <div class="score-grid">
        <div class="metric"><strong>${s.score}/100</strong>Điểm</div>
        <div class="metric"><strong>${s.score}</strong>Đúng</div>
        <div class="metric"><strong>${100-s.score}</strong>Sai/Trống</div>
      </div>
      <div class="card" style="margin-top:12px">${detail}</div>
      <div class="toolbar"><button class="btn primary" id="homeBtn">Về trang chính</button></div>
    </div>`;
  }
  $("#homeBtn").onclick=()=>{currentSession=null;renderHome();};
}

window.addEventListener("beforeinstallprompt",e=>{
  e.preventDefault();deferredInstallPrompt=e;
  const btn=$("#installBtn");if(btn) btn.style.display="inline-block";
});

async function boot(){
  if("serviceWorker" in navigator){
    try{await navigator.serviceWorker.register("./sw.js");}catch(err){console.warn("SW",err);}
  }
  const resp=await fetch(DATA_URL);
  DATA=await resp.json();
  renderHome();
}

boot().catch(err=>{
  app().innerHTML=`<div class="card"><h3>Không nạp được dữ liệu</h3><p>${esc(err.message)}</p>
  <p class="small">Hãy mở ứng dụng qua HTTPS hoặc máy chủ web tĩnh, không mở trực tiếp bằng file://.</p></div>`;
});
