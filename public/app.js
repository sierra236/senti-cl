document.addEventListener("DOMContentLoaded", () => {
  /* ---------- DOM ---------- */
  const addBtn = document.getElementById("addFieldBtn");
  const clearBtn = document.getElementById("clearAllBtn");
  const changeFormatBtn = document.getElementById("changeFormatBtn");

  const formatScreen = document.getElementById("formatScreen");
  const teamsCard = document.getElementById("teamsCard");


  const makeTeamsBtn = document.getElementById("makeTeamsBtn");
  const resultsEl = document.getElementById("results");

  // --- Kurallar UI
  const ruleTypeEl = document.getElementById("ruleType");
  const ruleAEl = document.getElementById("ruleA");
  const ruleBEl = document.getElementById("ruleB");
  const addRuleBtn = document.getElementById("addRuleBtn");
  const rulesListEl = document.getElementById("rulesList");

  // Depolama anahtarı
  const LS_RULES = "senti-cl:rules:v1";
  let RULES = []; // { id, type: 'avoidPair'|'preferPair', a, b }

  // Tier containerları
  const containers = {
    t1: document.getElementById("fields-t1"),
    t2: document.getElementById("fields-t2"),
    t3: document.getElementById("fields-t3"),
    t4: document.getElementById("fields-t4"),
    t5: document.getElementById("fields-t5"),
  };

  const tierCards = {
    t1: document.querySelector('.tier-card[data-tier="t1"]'),
    t2: document.querySelector('.tier-card[data-tier="t2"]'),
    t3: document.querySelector('.tier-card[data-tier="t3"]'),
    t4: document.querySelector('.tier-card[data-tier="t4"]'),
    t5: document.querySelector('.tier-card[data-tier="t5"]'),
  };

  /* ---------- State / Ayarlar ---------- */
  const LS_KEY = "senti-cl:participants:v3";
  let currentFormat = null; // 1..5
  let MIN_REQUIRED = {};    // görünür tier'lar için min=1, diğerleri 0

  /* ---------- Yardımcılar ---------- */
  function visibleTierKeys() {
    const n = currentFormat || 1;
    const list = [];
    for (let i = 1; i <= n; i++) list.push(`t${i}`);
    return list;
  }

  function createField(value = "") {
    const row = document.createElement("div");
    row.className = "input-row";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "input";
    input.placeholder = "Katılımcı adı";
    input.value = value;
    input.maxLength = 80;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn-icon btn-danger";
    remove.title = "Bu alanı kaldır";
    remove.textContent = "🗑";

    remove.addEventListener("click", () => {
      row.remove();
      persist();
      enforceMinimums();
    });

    // Enter'a basınca da tüm görünür tier'lara birer slot ekle
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addOneToAllVisibleTiers();
      }
    });

    input.addEventListener("input", persist);

    row.appendChild(input);
    row.appendChild(remove);
    return row;
  }

  function addFieldTo(tierKey, defaultValue = "") {
    const node = createField(defaultValue);
    containers[tierKey].appendChild(node);
    node.querySelector("input").focus();
    persist();
  }

  function addOneToAllVisibleTiers() {
    // Her görünür tier'a birer boş slot ekle
    const vis = visibleTierKeys();
    vis.forEach(k => addFieldTo(k, ""));
  }

  function enforceMinimums() {
    Object.entries(MIN_REQUIRED).forEach(([tierKey, min]) => {
      const cont = containers[tierKey];
      if (!cont) return;

      let required = min;
      // 1v1 formatında Tier 1'de 2 slot zorunlu
      if (currentFormat === 1 && tierKey === "t1") required = 2;

      while (cont.children.length < required) {
        addFieldTo(tierKey, "");
      }
    });
  }

  function clearAll() {
    Object.values(containers).forEach(c => c.innerHTML = "");
    enforceMinimums();
    persist();
    if (resultsEl) { resultsEl.style.display = "none"; resultsEl.innerHTML = ""; }
  }

  function teamsToMatrix(result, n) {
  const headers = ["Team"];
  for (let i = 1; i <= n; i++) headers.push(`T${i}`);
  const rows = result.teams.map((members, idx) => {
    const row = Array(n + 1).fill("");
    row[0] = `Team ${idx + 1}`;
    members.forEach(m => {
      const tierIdx = parseInt(m.tier.slice(1), 10) - 1;
      if (tierIdx >= 0 && tierIdx < n) row[tierIdx + 1] = m.name;
    });
    return row;
  });
  return { headers, rows };
  }

  function showFormatScreen() {
    formatScreen?.classList.remove("hidden");
    teamsCard?.classList.add("hidden");
  }

  function hideFormatScreen() {
    formatScreen?.classList.add("hidden");
    teamsCard?.classList.remove("hidden");
  }


  // CSV üret
  function toCSV(headers, rows) {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const lines = [];
    lines.push(headers.map(esc).join(","));
    rows.forEach(r => lines.push(r.map(esc).join(",")));
    return lines.join("\r\n");
  }

  // CSV indir
  function downloadCSV(filename, text) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.style.display = "none";
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 0);
  }

  // XLSX indir (SheetJS varsa)
  function downloadXLSX(filename, headers, rows) {
    if (!window.XLSX) return false;
    const wsData = [headers, ...rows];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, "Teams");
    XLSX.writeFile(wb, filename);
    return true;
  }

  function loadData() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return null;
      return {
        format: Math.max(1, Math.min(5, Number(obj.format) || 1)),
        t1: Array.isArray(obj.t1) ? obj.t1 : [],
        t2: Array.isArray(obj.t2) ? obj.t2 : [],
        t3: Array.isArray(obj.t3) ? obj.t3 : [],
        t4: Array.isArray(obj.t4) ? obj.t4 : [],
        t5: Array.isArray(obj.t5) ? obj.t5 : [],
      };
    } catch { return null; }
  }

  function persist() {
    const data = { format: currentFormat || 1 };
    for (const key of Object.keys(containers)) {
      data[key] = [...containers[key].querySelectorAll("input")]
        .map(i => i.value.trim())
        .filter(Boolean);
    }
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  }

  const norm = (s) => String(s || "").trim().toLowerCase();

  function loadRules() {
    try {
      const raw = localStorage.getItem(LS_RULES);
      const arr = JSON.parse(raw || "[]");
      if (Array.isArray(arr)) RULES = arr;
      else RULES = [];
    } catch { RULES = []; }
  }

  function persistRules() {
    localStorage.setItem(LS_RULES, JSON.stringify(RULES));
  }

  function renderRules() {
    if (!rulesListEl) return;
    rulesListEl.innerHTML = "";
    if (!RULES.length) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.textContent = "Henüz kural eklenmedi.";
      rulesListEl.appendChild(empty);
      return;
    }
    RULES.forEach(rule => {
      const row = document.createElement("div");
      row.className = "rule-item";

      const meta = document.createElement("div");
      meta.className = "rule-meta";

      const badge = document.createElement("span");
      badge.className = "rule-type";
      badge.textContent = rule.type === "avoidPair" ? "GÖRMESİN" : "BERABER";

      const names = document.createElement("span");
      names.className = "rule-names";
      names.textContent = `${rule.a} ↔ ${rule.b}`;

      meta.appendChild(badge);
      meta.appendChild(names);

      const remove = document.createElement("button");
      remove.className = "btn btn-ghost rule-remove";
      remove.textContent = "Sil";
      remove.addEventListener("click", () => {
        RULES = RULES.filter(r => r.id !== rule.id);
        persistRules();
        renderRules();
      });

      row.appendChild(meta);
      row.appendChild(remove);
      rulesListEl.appendChild(row);
    });
  }

  function addRule() {
    const type = ruleTypeEl?.value || "avoidPair";
    const a = (ruleAEl?.value || "").trim();
    const b = (ruleBEl?.value || "").trim();
    if (!a || !b) return;
    // tekrarları engelle
    const exists = RULES.some(r => r.type === type && norm(r.a) === norm(a) && norm(r.b) === norm(b));
    if (exists) return;
    RULES.push({ id: Date.now() + Math.random(), type, a, b });
    persistRules();
    renderRules();
    if (ruleAEl) ruleAEl.value = "";
    if (ruleBEl) ruleBEl.value = "";
  }


  function snapshotFromDOM() {
  // currentFormat + ekrandaki inputlardan güncel liste
  const snap = { format: currentFormat || 1 };
  for (const key of Object.keys(containers)) {
    snap[key] = [...containers[key].querySelectorAll("input")]
      .map(i => i.value.trim())
      .filter(Boolean);
  }
  return snap;
  }

  function applyFormat(n) {
    currentFormat = n;

    // Kart görünürlükleri
    Object.keys(tierCards).forEach((k, idx) => {
      if (idx < n) tierCards[k].classList.remove("hidden");
      else tierCards[k].classList.add("hidden");
    });

    // Min gereklilikleri güncelle
    MIN_REQUIRED = {};
    for (let i = 1; i <= 5; i++) {
      MIN_REQUIRED[`t${i}`] = i <= n ? 1 : 0;
    }

    enforceMinimums();
    persist();
  }

  function restoreToFormat(n, saved) {
    // Önce kartları temizle
    Object.values(containers).forEach(c => (c.innerHTML = ""));
    applyFormat(n);

    if (saved) {
      for (const key of Object.keys(containers)) {
        (saved[key] || []).forEach(v => addFieldTo(key, v));
      }
    }

    enforceMinimums();
  }

  /* ---------- Butonlar / Olaylar ---------- */
  addBtn?.addEventListener("click", addOneToAllVisibleTiers);
  clearBtn?.addEventListener("click", clearAll);  

  const savedInit = loadData();
  if (!savedInit || !savedInit.format) {
    // draw teams varsayılan aktif; format seçilmeden ana içerik gizli
    showFormatScreen();
    // boş görünmemesi için görünür tier’ları şimdilik dokunma; seçimden sonra restoreToFormat çalışacak
  } else {
    restoreToFormat(savedInit.format, savedInit);
    hideFormatScreen();
}

  changeFormatBtn?.addEventListener("click", () => {
    persist();          // o anki girişi kaydet
    showFormatScreen(); // tam ekran seçimi aç
  });

  addRuleBtn?.addEventListener("click", addRule);
  ruleAEl?.addEventListener("keydown", e => { 
    if (e.key === "Enter") { 
      e.preventDefault(); 
      addRule(); 
    }
  });
  ruleBEl?.addEventListener("keydown", e => { 
    if (e.key === "Enter") { 
      e.preventDefault(); 
      addRule(); 
    }
  });

  // Başlangıçta kuralları yükle + göster
  loadRules();
  renderRules();



  // İlk ekran format seçim butonları
  document.querySelectorAll(".fs-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.format);
      // ekranda o anki girilen isimleri koruyarak uygula
      const snap = snapshotFromDOM ? snapshotFromDOM() : null;
      restoreToFormat(n, snap || loadData());
      hideFormatScreen();
    });
  });


  /* ===================== TAKIM OLUŞTURMA ===================== */


  function readFilled() {
    const data = {};
    for (const key of Object.keys(containers)) {
      data[key] = [...containers[key].querySelectorAll("input")]
        .map(i => i.value.trim())
        .filter(Boolean);
    }
    return data;
  }

  // --- Kuralları derle ve "aynı takımda olmasın" ihlali var mı kontrol et
  function compileAvoidPairs() {
    return RULES
      .filter(r => r.type === "avoidPair")
      .map(r => [norm(r.a), norm(r.b)]);
  }

  function violatesAvoid(teamMembers, avoidPairs) {
    // teamMembers: [{ tier: "t1", name: "..." }, ...]
    const names = teamMembers.map(m => norm(m.name));
    // a-b çifti aynı takımda ise ihlal
    return avoidPairs.some(([a, b]) => names.includes(a) && names.includes(b));
  }


  // Her görünür tier'dan birer oyuncu çekerek takımları kur
  function buildTeams() {
    const vis = visibleTierKeys();          // örn: ["t1","t2","t3","t4"]
    const data = readFilled();              // inputlardan
    const avoidPairs = compileAvoidPairs();

    // havuzları hazırla (karışık başlat)
    const pools = {};
    for (const k of vis) {
      const arr = [...data[k]].filter(Boolean);
      if (arr.length === 0) {
        return { ok: false, error: `Tier ${k.slice(1)} boş.`, teams: [] };
      }
      // küçük randomizasyon
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      pools[k] = arr;
    }

    // çıkarılabilecek takım sayısı = en küçük havuz
    const maxTeams = Math.min(...vis.map(k => pools[k].length));
    const teams = [];

    // derin kopya kolaylığı
    const copyPools = (src) => Object.fromEntries(Object.entries(src).map(([k,v]) => [k, [...v]]));

    // DFS: teamIdx’inci takımı kur
    function buildTeamDFS(teamIdx, poolsState) {
      if (teamIdx === maxTeams) return [];  // tüm takımlar kuruldu

      // bu takım için tier’ları sırayla dolduralım
      const currentTeam = [];
      const tiersOrder = [...vis]; // istersen en dar havuzdan başlatabilirsin

      function placeTier(ti, poolsLocal) {
        if (ti === tiersOrder.length) {
          // takım tamamlandı; sonraki takıma geç
          const nextPools = copyPools(poolsLocal);
          const next = buildTeamDFS(teamIdx + 1, nextPools);
          if (next !== null) return [currentTeam.slice(), ...next];
          return null;
        }

        const tierKey = tiersOrder[ti];
        const candidates = poolsLocal[tierKey];

        // adayları sırayla dene
        for (let idx = 0; idx < candidates.length; idx++) {
          const name = candidates[idx];

          // geçici ekle ve kontrol et
          currentTeam.push({ tier: tierKey, name });
          const bad = violatesAvoid(currentTeam, avoidPairs);

          if (!bad) {
            // havuzdan çıkar
            const nextPools = copyPools(poolsLocal);
            nextPools[tierKey] = candidates.filter((_, i) => i !== idx);

            const res = placeTier(ti + 1, nextPools);
            if (res !== null) return res; // başarılı yol
          }

          // geri al
          currentTeam.pop();
        }
        return null; // bu tier konumunda hiç adayla yol bulunamadı
      }

      return placeTier(0, poolsState);
    }

    const result = buildTeamDFS(0, copyPools(pools));
    if (!result) {
      return {
        ok: false,
        error: "Kurallara uygun kombinasyon bulunamadı (greedy değil, tüm kombinasyonlar denendi). Kuralları biraz gevşetmeyi deneyebilirsin.",
        teams: []
      };
    }

    return { ok: true, teams: result };
  }


  function renderTeams(result) {
    if (!resultsEl) return;
    resultsEl.style.display = "block";
    resultsEl.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = "Takımlar";
    resultsEl.appendChild(title);

    if (!result.ok) {
      const warn = document.createElement("div");
      warn.className = "warn";
      warn.textContent = result.error || "Takım oluşturulamadı.";
      resultsEl.appendChild(warn);
      return;
    }

    // Takım kutuları
    result.teams.forEach((teamMembers, idx) => {
      const teamBox = document.createElement("div");
      teamBox.className = "team";

      const h = document.createElement("div");
      h.className = "team-title";
      h.textContent = `Takım ${idx + 1}`;
      teamBox.appendChild(h);

      const ul = document.createElement("ul");
      teamMembers.forEach(m => {
        const li = document.createElement("li");
        li.textContent = `[T${m.tier.slice(1)}] ${m.name}`;
        ul.appendChild(li);
      });
      teamBox.appendChild(ul);

      resultsEl.appendChild(teamBox);
    });

    // İndir butonu (Excel/CSV)
    const actions = document.createElement("div");
    actions.className = "row gap";
    actions.style.marginTop = "12px";

    const dlBtn = document.createElement("button");
    dlBtn.className = "btn";
    dlBtn.textContent = "İndir (Excel/CSV)";
    dlBtn.addEventListener("click", () => {
      const n = currentFormat || 1;
      const { headers, rows } = teamsToMatrix(result, n);
      // Önce .xlsx dene (SheetJS varsa), yoksa CSV’ye düş
      if (!downloadXLSX("teams.xlsx", headers, rows)) {
        const csv = toCSV(headers, rows);
        downloadCSV("teams.csv", csv);
      }
    });

    actions.appendChild(dlBtn);
    resultsEl.appendChild(actions);
  }

  makeTeamsBtn?.addEventListener("click", () => {
    const res = buildTeams();
    renderTeams(res);
  });
});

/* ========== NAV: Draw Teams / Draw Fixture ========== */
const navTeams = document.getElementById("navTeams");
const navFixture = document.getElementById("navFixture");
const teamsSection = document.getElementById("results")?.closest("section") || document.querySelector("#teamsSection") || document.querySelector("main .card"); // mevcut Teams kartı
const fixtureSection = document.getElementById("fixtureSection");

function showView(view) {
  if (!teamsSection || !fixtureSection) return;
  if (view === "teams") {
    teamsSection.classList.remove("hidden");
    fixtureSection.classList.add("hidden");
    navTeams?.classList.add("active");
    navFixture?.classList.remove("active");
  } else {
    teamsSection.classList.add("hidden");
    fixtureSection.classList.remove("hidden");
    navTeams?.classList.remove("active");
    navFixture?.classList.add("active");
  }
}
navTeams?.addEventListener("click", () => showView("teams"));
navFixture?.addEventListener("click", () => showView("fixture"));
showView("teams");

/* ========== FIXTURE (Takım adlarından eşleşme) ========== */
const fixtureFields     = document.getElementById("fixtureFields");
const addTeamBtn        = document.getElementById("addTeamBtn");
const clearTeamsBtn     = document.getElementById("clearTeamsBtn");
const makeFixtureBtn    = document.getElementById("makeFixtureBtn");
const fixtureResults    = document.getElementById("fixtureResults");

const fixtureModeEl     = document.getElementById("fixtureMode");
const fixtureDoubleEl   = document.getElementById("fixtureDouble");
const doubleWrap        = document.getElementById("doubleWrap");
const fixtureSeedingEl  = document.getElementById("fixtureSeeding");

const LS_FIX = "senti-cl:fixtures:v1";

function createTeamField(value = "") {
  const row = document.createElement("div");
  row.className = "input-row";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "input";
  input.placeholder = "Takım adı";
  input.value = value;
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "btn-icon btn-danger";
  remove.textContent = "🗑";
  remove.addEventListener("click", () => { row.remove(); persistFixture(); });
  input.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); addTeamField(); }});
  input.addEventListener("input", persistFixture);
  row.appendChild(input); row.appendChild(remove);
  return row;
}
function addTeamField(val = "") {
  const node = createTeamField(val);
  fixtureFields.appendChild(node);
  node.querySelector("input").focus();
  persistFixture();
}
function readTeams() {
  return [...fixtureFields.querySelectorAll("input")]
    .map(i => i.value.trim()).filter(Boolean);
}
function persistFixture() {
  localStorage.setItem(LS_FIX, JSON.stringify(readTeams()));
}
function restoreFixture() {
  let arr = [];
  try { arr = JSON.parse(localStorage.getItem(LS_FIX) || "[]"); } catch { arr = []; }
  fixtureFields.innerHTML = "";
  if (arr.length) arr.forEach(v => addTeamField(v));
  else { addTeamField(); addTeamField(); }
}

/* yardımcılar */
function randShuffle(arr){ for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
function toCSV(headers, rows) {
  const esc = s => `"${String(s).replace(/"/g,'""')}"`;
  return [headers.map(esc).join(","), ...rows.map(r=>r.map(esc).join(","))].join("\r\n");
}
function downloadCSV(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.style.display = "none";
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },0);
}

/* Knockout (eleme) */
function nextPow2(n){ let p=1; while(p<n) p<<=1; return p; }
function roundLabel(size, idx){
  // size: bu rounda giren takım sayısı (örn 8 -> Çeyrek, 4 -> Yarı)
  if (size >= 16 && size % 8 === 0) return `Son ${size}`;
  if (size === 8) return "Çeyrek Final";
  if (size === 4) return "Yarı Final";
  if (size === 2) return "Final";
  return `Tur ${idx+1}`;
}

function generateSingleElimFull(teams, seedingMode="shuffle"){
  const list = [...teams];
  if (seedingMode === "shuffle") randShuffle(list);

  // Power-of-two'ya pad et (BYE'lar otomatik tur atlar)
  const target = nextPow2(list.length);
  while (list.length < target) list.push("BYE");

  // R1 eşleşmeleri
  const rounds = [];
  const r1 = [];
  for (let i=0; i<list.length; i+=2){
    r1.push([list[i], list[i+1]]);
  }
  rounds.push({ name: roundLabel(list.length, 0), matches: r1 });

  // Sonraki turlar: yer tutucu etiketleriyle
  let size = list.length / 2;
  let prevCount = r1.length;
  let rIdx = 1;
  while (size >= 1){
    const matches = [];
    for (let m=0; m<prevCount; m+=2){
      matches.push([`Kazanan R${rIdx}-M${m+1}`, `Kazanan R${rIdx}-M${m+2}`]);
    }
    if (matches.length){
      rounds.push({ name: roundLabel(size*2, rIdx), matches });
    }
    prevCount = matches.length;
    size = size / 2;
    rIdx++;
  }

  // BYE bilgisi (varsa ilk tur için duyuru)
  const bye = r1.flat().includes("BYE") ? "BYE alanlar bir üst tura ilerler." : null;
  return { rounds, bye, sections: null };
}

function generateDoubleElim(teams, seedingMode="shuffle"){
  const list = [...teams];
  if (seedingMode === "shuffle") randShuffle(list);
  const target = nextPow2(list.length);
  while (list.length < target) list.push("BYE");

  // Üst Bracket (UB) R1
  const UB = [];
  const R1 = [];
  for (let i=0;i<list.length;i+=2){ R1.push([list[i], list[i+1]]); }
  UB.push({ name: roundLabel(list.length, 0), matches: R1 });

  // UB sonraki turları (yer tutucu)
  let prevCount = R1.length; let idx=1; let size=list.length/2;
  while (prevCount >= 1){
    const matches = [];
    for (let m=0; m<prevCount; m+=2){
      matches.push([`Kazanan UB R${idx}-M${m+1}`, `Kazanan UB R${idx}-M${m+2}`]);
    }
    if (matches.length){
      UB.push({ name: roundLabel(size*2, idx), matches });
    }
    prevCount = matches.length;
    size = size/2; idx++;
  }

  // Lower Bracket (LB) – basitleştirilmiş eşleştirme:
  // LBR1: UB R1 kaybedenleri
  const LB = [];
  const lbRounds = [];

  const losersR1 = R1.map((_,i)=>`Kaybeden UB R1-M${i+1}`);
  // LBR1: kaybedenler birbirine
  const LBR1 = [];
  for (let i=0; i+1<losersR1.length; i+=2){ LBR1.push([losersR1[i], losersR1[i+1]]); }
  if (LBR1.length) lbRounds.push({ name: "LB R1", matches: LBR1 });

  // LBR2: LBR1 kazananları, UB R2 kaybedenleriyle
  // UB R2 maç sayısı = R1.length/2
  const losersR2 = Array.from({length: Math.max(1, R1.length/2)}, (_,i)=>`Kaybeden UB R2-M${i+1}`);
  const winnersLBR1 = LBR1.map((_,i)=>`Kazanan LB R1-M${i+1}`);
  const LBR2 = [];
  const pool2 = [...winnersLBR1, ...losersR2];
  for (let i=0; i+1<pool2.length; i+=2){ LBR2.push([pool2[i], pool2[i+1]]); }
  if (LBR2.length) lbRounds.push({ name: "LB R2", matches: LBR2 });

  // LBR3..: benzer şekilde UB R3 kaybedenleri sırayla aşağı iner
  let ubRoundIndex = 3;
  let prevLbWinners = LBR2.map((_,i)=>`Kazanan LB R2-M${i+1}`);
  while (Math.pow(2, ubRoundIndex-1) <= list.length){
    const losersUB = Array.from(
      { length: Math.max(1, Math.pow(2, (Math.log2(list.length) - (ubRoundIndex-1)) - 1)) },
      (_,i)=>`Kaybeden UB R${ubRoundIndex}-M${i+1}`
    );
    const pool = [...prevLbWinners, ...losersUB];
    if (pool.length < 2) break;
    const matches = [];
    for (let i=0;i+1<pool.length;i+=2) matches.push([pool[i], pool[i+1]]);
    const name = `LB R${lbRounds.length+1}`;
    lbRounds.push({ name, matches });
    prevLbWinners = matches.map((_,i)=>`Kazanan ${name}-M${i+1}`);
    ubRoundIndex++;
  }
  LB.push(...lbRounds);

  // LB Final (kalan 2), UB Final kazananı ile Büyük Final
  const lbFinalName = `LB Final`;
  const lbFinal = prevLbWinners.length>=2
    ? [[prevLbWinners[0], prevLbWinners[1]]]
    : (prevLbWinners.length===1 ? [[prevLbWinners[0], "LB'den gelen rakip"]] : []);
  if (lbFinal.length) LB.push({ name: lbFinalName, matches: lbFinal });

  const ubFinalWinner = `Kazanan ${UB[UB.length-1].name}-M1`;
  const lbWinner = lbFinal.length ? `Kazanan ${lbFinalName}-M1` : (prevLbWinners[0]||"LB Kazananı");

  const grandFinal = [{ name: "Büyük Final", matches: [[ubFinalWinner, lbWinner]] }];

  const sections = [
    { title: "Upper Bracket", rounds: UB },
    { title: "Lower Bracket", rounds: LB },
    { title: "Grand Final",  rounds: grandFinal }
  ];

  const bye = R1.flat().includes("BYE") ? "BYE alanlar ilgili turda otomatik ilerler." : null;
  return { rounds: [], bye, sections };
}

/* Round Robin (lig) – circle method */
function generateRoundRobin(teams, doubleMode="single", seedingMode="shuffle"){
  let list = [...teams];
  if (seedingMode === "shuffle") randShuffle(list);
  const odd = list.length % 2 === 1;
  if (odd) list.push("BAY");
  const n = list.length, half = n/2, rounds = [];
  const fixed = list[0];
  let others = list.slice(1);
  const numRounds = n - 1;
  for (let r=0; r<numRounds; r++){
    const left = [fixed, ...others.slice(0, half-1)];
    const right = others.slice(half-1).reverse();
    const matches = [];
    for (let i=0;i<half;i++){
      const a = left[i], b = right[i];
      if (a!=="BAY" && b!=="BAY") matches.push([a,b]);
    }
    rounds.push({ name:`Hafta ${r+1}`, matches });
    others = [others[others.length-1], ...others.slice(0, others.length-1)];
  }
  if (doubleMode === "double"){
    const ret = rounds.map((r,i)=>({ name:`Hafta ${numRounds+i+1}`, matches:r.matches.map(([a,b])=>[b,a]) }));
    rounds.push(...ret);
  }
  return { rounds, bye:null };
}

/* Çıktıyı yaz ve indir */
function renderFixtureOutput(output, mode){
  fixtureResults.style.display = "block";
  fixtureResults.innerHTML = "";

  const title = document.createElement("h3");
  const modeTitle = mode === "doubleelim" ? "Fikstür (Çift Eleme)"
                    : mode === "roundrobin" ? "Fikstür (Lig Usulü)"
                    : "Fikstür (Eleme Usulü)";
  title.textContent = modeTitle;
  fixtureResults.appendChild(title);

  const renderRounds = (rounds) => {
    rounds.forEach((round, idx) => {
      const box = document.createElement("div"); box.className = "team";
      const h = document.createElement("div"); h.className = "team-title";
      h.textContent = round.name || `Tur ${idx+1}`;
      box.appendChild(h);
      const ul = document.createElement("ul");
      round.matches.forEach(([a,b]) => {
        const li = document.createElement("li");
        li.textContent = `${a} vs ${b}`;
        ul.appendChild(li);
      });
      box.appendChild(ul);
      fixtureResults.appendChild(box);
    });
  };

  if (output.sections){ // Double Elim
    output.sections.forEach(section => {
      const secH = document.createElement("h4");
      secH.style.marginTop = "10px";
      secH.textContent = section.title;
      fixtureResults.appendChild(secH);
      renderRounds(section.rounds);
    });
  } else {
    renderRounds(output.rounds);
  }

  if (output.bye){
    const byeBox = document.createElement("div");
    byeBox.className = "warn";
    byeBox.textContent = output.bye;
    fixtureResults.appendChild(byeBox);
  }

  // CSV indir
  const actions = document.createElement("div");
  actions.className = "row gap"; actions.style.marginTop = "12px";
  const dlBtn = document.createElement("button");
  dlBtn.className = "btn"; dlBtn.textContent = "Fikstürü İndir (CSV)";
  dlBtn.addEventListener("click", () => {
    const headers = ["Round", "Home", "Away"];
    const rows = [];
    if (output.sections){
      output.sections.forEach(sec => {
        sec.rounds.forEach(r => r.matches.forEach(([a,b]) => rows.push([`${sec.title} - ${r.name}`, a, b])));
      });
    } else {
      output.rounds.forEach(r => r.matches.forEach(([a,b]) => rows.push([r.name, a, b])));
    }
    if (output.bye) rows.push(["BYE", output.bye, ""]);
    const csv = toCSV(headers, rows);
    downloadCSV("fixture.csv", csv);
  });
  actions.appendChild(dlBtn);
  fixtureResults.appendChild(actions);
}


/* Eventler */
addTeamBtn?.addEventListener("click", () => addTeamField());
clearTeamsBtn?.addEventListener("click", () => {
  fixtureFields.innerHTML = ""; addTeamField(); addTeamField();
  persistFixture(); fixtureResults.style.display = "none"; fixtureResults.innerHTML = "";
});
fixtureModeEl?.addEventListener("change", () => {
  if (fixtureModeEl.value === "roundrobin") doubleWrap.style.display = "";
  else doubleWrap.style.display = "none";
});
makeFixtureBtn?.addEventListener("click", () => {
  const teams = readTeams();
  if (teams.length < 2) {
    renderFixtureOutput({ rounds: [], bye: null }, fixtureModeEl.value);
    return;
  }
  const base = (fixtureSeedingEl.value === "ordered") ? [...teams] : randShuffle([...teams]);

  let out;
  if (fixtureModeEl.value === "roundrobin") {
    out = generateRoundRobin(base, fixtureDoubleEl.value, "ordered");
  } else if (fixtureModeEl.value === "doubleelim") {
    out = generateDoubleElim(base, "ordered");
  } else {
    out = generateSingleElimFull(base, "ordered");
  }

  renderFixtureOutput(out, fixtureModeEl.value);
  fixtureResults?.scrollIntoView({ behavior: "smooth", block: "start" });
});


// başlangıç
restoreFixture();
if (fixtureModeEl?.value === "roundrobin") doubleWrap.style.display = ""; else doubleWrap.style.display = "none";
