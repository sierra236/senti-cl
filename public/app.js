// app.js — tek dosya, tam sürüm (takım ve fikstür "Sıradaki" reveal)
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

  // Depolama anahtarları
  const LS_RULES = "senti-cl:rules:v1";
  const LS_KEY   = "senti-cl:participants:v3";
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
  let currentFormat = null; // 1..5
  let MIN_REQUIRED = {};    // görünür tier'lar için min=1, diğerleri 0

  // Reveal state: Takımlar
  let TEAM_QUEUE = [];                 // [[{tier,name}...], ...]
  let MEMBER_PTR = { team: 0, member: 0 };

  // Reveal state: Fikstür
  let FIXTURE_QUEUE = [];              // [{boxIndex, slot, name, listSpan?}, ...]
  let FIXTURE_PTR = 0;

  /* ---------- Yardımcılar ---------- */
  function visibleTierKeys() {
    const n = currentFormat || 1;
    return Array.from({ length: n }, (_, i) => `t${i + 1}`);
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

    // Enter -> tüm görünür tier'lara birer slot
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
    visibleTierKeys().forEach(k => addFieldTo(k, ""));
  }

  function enforceMinimums() {
    Object.entries(MIN_REQUIRED).forEach(([tierKey, min]) => {
      const cont = containers[tierKey];
      if (!cont) return;

      let required = min;
      // 1v1 formatında Tier1'de en az 2 slot
      if (currentFormat === 1 && tierKey === "t1") required = 2;

      while (cont.children.length < required) addFieldTo(tierKey, "");
    });
  }

  function clearAll() {
    Object.values(containers).forEach(c => (c.innerHTML = ""));
    enforceMinimums();
    persist();
    if (resultsEl) {
      resultsEl.style.display = "none";
      resultsEl.innerHTML = "";
    }
  }

  function teamsToMatrix(result, n) {
    const headers = ["Team", ...Array.from({ length: n }, (_, i) => `T${i + 1}`)];
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

  // CSV üret/indir
  function toCSV(headers, rows) {
    const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
    return [headers.map(esc).join(","), ...rows.map(r => r.map(esc).join(","))].join("\r\n");
  }
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
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
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
      RULES = Array.isArray(arr) ? arr : [];
    } catch { RULES = []; }
  }
  function persistRules() { localStorage.setItem(LS_RULES, JSON.stringify(RULES)); }

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
    const exists = RULES.some(r => r.type === type && norm(r.a) === norm(a) && norm(r.b) === norm(b));
    if (exists) return;
    RULES.push({ id: Date.now() + Math.random(), type, a, b });
    persistRules();
    renderRules();
    if (ruleAEl) ruleAEl.value = "";
    if (ruleBEl) ruleBEl.value = "";
  }

  function snapshotFromDOM() {
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
    Object.keys(tierCards).forEach((k, idx) => {
      if (idx < n) tierCards[k].classList.remove("hidden");
      else tierCards[k].classList.add("hidden");
    });

    MIN_REQUIRED = {};
    for (let i = 1; i <= 5; i++) MIN_REQUIRED[`t${i}`] = i <= n ? 1 : 0;

    enforceMinimums();
    persist();
  }

  function restoreToFormat(n, saved) {
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
    showFormatScreen();
  } else {
    restoreToFormat(savedInit.format, savedInit);
    hideFormatScreen();
  }

  changeFormatBtn?.addEventListener("click", () => {
    persist();
    showFormatScreen();
  });

  addRuleBtn?.addEventListener("click", addRule);
  ruleAEl?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addRule(); } });
  ruleBEl?.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addRule(); } });

  loadRules();
  renderRules();

  // İlk ekran format seçimi
  document.querySelectorAll(".fs-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.format);
      const snap = snapshotFromDOM();
      restoreToFormat(n, snap || loadData());
      hideFormatScreen();
    });
  });

  /* ===================== TAKIM OLUŞTURMA (reveal kişi) ===================== */
  function readFilled() {
    const data = {};
    for (const key of Object.keys(containers)) {
      data[key] = [...containers[key].querySelectorAll("input")]
        .map(i => i.value.trim())
        .filter(Boolean);
    }
    return data;
  }

  function compileAvoidPairs() {
    return RULES.filter(r => r.type === "avoidPair").map(r => [norm(r.a), norm(r.b)]);
  }

  function violatesAvoid(teamMembers, avoidPairs) {
    const names = teamMembers.map(m => norm(m.name));
    return avoidPairs.some(([a, b]) => names.includes(a) && names.includes(b));
  }

  function buildTeams() {
    const vis = visibleTierKeys();
    const data = readFilled();
    const avoidPairs = compileAvoidPairs();

    const pools = {};
    for (const k of vis) {
      const arr = [...data[k]].filter(Boolean);
      if (!arr.length) return { ok: false, error: `Tier ${k.slice(1)} boş.`, teams: [] };
      // küçük shuffle
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      pools[k] = arr;
    }

    const maxTeams = Math.min(...vis.map(k => pools[k].length));
    const copyPools = (src) => Object.fromEntries(Object.entries(src).map(([k, v]) => [k, [...v]]));

    function buildTeamDFS(teamIdx, poolsState) {
      if (teamIdx === maxTeams) return [];

      const currentTeam = [];
      const tiersOrder = [...vis];

      function placeTier(ti, poolsLocal) {
        if (ti === tiersOrder.length) {
          const nextPools = copyPools(poolsLocal);
          const next = buildTeamDFS(teamIdx + 1, nextPools);
          if (next !== null) return [currentTeam.slice(), ...next];
          return null;
        }

        const tierKey = tiersOrder[ti];
        const candidates = poolsLocal[tierKey];

        for (let idx = 0; idx < candidates.length; idx++) {
          const name = candidates[idx];
          currentTeam.push({ tier: tierKey, name });
          const bad = violatesAvoid(currentTeam, avoidPairs);

          if (!bad) {
            const nextPools = copyPools(poolsLocal);
            nextPools[tierKey] = candidates.filter((_, i) => i !== idx);
            const res = placeTier(ti + 1, nextPools);
            if (res !== null) return res;
          }
          currentTeam.pop();
        }
        return null;
      }
      return placeTier(0, poolsState);
    }

    const result = buildTeamDFS(0, copyPools(pools));
    if (!result) {
      return { ok: false, error: "Kurallara uygun kombinasyon bulunamadı.", teams: [] };
    }
    return { ok: true, teams: result };
  }

  // Hata kutusu
  function showTeamError(msg){
    if (!resultsEl) return;
    resultsEl.style.display = "block";
    resultsEl.innerHTML = "";
    const title = document.createElement("h3");
    title.textContent = "Takımlar";
    resultsEl.appendChild(title);

    const warn = document.createElement("div");
    warn.className = "warn";
    warn.textContent = msg || "Takım oluşturulamadı.";
    resultsEl.appendChild(warn);
  }

  // Liste alanını hazırlayıp indirme butonunu (başta disabled) koyar
  function renderTeamsHeader(){
    if (!resultsEl) return;
    resultsEl.style.display = "block";
    resultsEl.innerHTML = "";

    const title = document.createElement("h3");
    title.textContent = "Takımlar";
    resultsEl.appendChild(title);

    const actions = document.createElement("div");
    actions.className = "row gap";
    actions.style.marginTop = "12px";

    const dlBtn = document.createElement("button");
    dlBtn.className = "btn";
    dlBtn.id = "teamsDownloadBtn";
    dlBtn.textContent = "İndir (Excel/CSV)";
    dlBtn.disabled = true; // tüm takımlar açılınca aktif olacak
    dlBtn.addEventListener("click", () => {
      const n = currentFormat || 1;
      const headers = ["Team", ...Array.from({ length: n }, (_, i) => `T${i + 1}`)];
      const rows = TEAM_QUEUE.map((members, idx) => {
        const row = Array(n + 1).fill("");
        row[0] = `Team ${idx + 1}`;
        members.forEach(m => {
          const tierIdx = parseInt(m.tier.slice(1), 10) - 1;
          if (tierIdx >= 0 && tierIdx < n) row[tierIdx + 1] = m.name;
        });
        return row;
      });
      if (!downloadXLSX("teams.xlsx", headers, rows)) {
        const csv = toCSV(headers, rows);
        downloadCSV("teams.csv", csv);
      }
    });

    actions.appendChild(dlBtn);
    resultsEl.appendChild(actions);
  }

  // Kuyruğu hazırla (kurallara göre tüm takımlar hesaplanır ama gösterilmez)
  function prepareTeamQueue(){
    const res = buildTeams();
    if (!res || !res.ok) {
      showTeamError(res?.error || "Takım oluşturulamadı.");
      return false;
    }
    TEAM_QUEUE = res.teams || [];
    MEMBER_PTR = { team: 0, member: 0 };
    renderTeamsHeader();
    return true;
  }

  // Her çağrıda bir KİŞİ ekrana ekle
  function revealOneMember() {
    if (!TEAM_QUEUE.length) return;

    const tIdx = MEMBER_PTR.team;
    const mIdx = MEMBER_PTR.member;
    if (tIdx >= TEAM_QUEUE.length) return;

    const member = TEAM_QUEUE[tIdx][mIdx];

    // takım kutusu yoksa oluştur
    let teamBox = resultsEl.querySelector(`.team[data-idx="${tIdx}"]`);
    if (!teamBox) {
      teamBox = document.createElement("div");
      teamBox.className = "team";
      teamBox.setAttribute("data-idx", tIdx);

      const h = document.createElement("div");
      h.className = "team-title";
      h.textContent = `Takım ${tIdx + 1}`;
      teamBox.appendChild(h);

      const ul = document.createElement("ul");
      teamBox.appendChild(ul);

      const actions = resultsEl.querySelector(".row.gap");
      resultsEl.insertBefore(teamBox, actions);
    }

    // üyeyi ekle
    const ul = teamBox.querySelector("ul");
    const li = document.createElement("li");
    li.textContent = `[T${member.tier.slice(1)}] ${member.name}`;
    ul.appendChild(li);

    // pointer ilerlet
    MEMBER_PTR.member++;
    if (MEMBER_PTR.member >= TEAM_QUEUE[tIdx].length) {
      MEMBER_PTR.team++;
      MEMBER_PTR.member = 0;
    }

    // bitti mi?
    const mainBtn = document.getElementById("makeTeamsBtn");
    if (MEMBER_PTR.team >= TEAM_QUEUE.length) {
      const dl = document.getElementById("teamsDownloadBtn");
      if (dl) dl.disabled = false;
      if (mainBtn) { mainBtn.textContent = "Bitti"; mainBtn.disabled = true; }
    } else {
      if (mainBtn) mainBtn.textContent = "Sıradaki";
    }
  }

  // "Sıradaki" akışı (Takımlar)
  makeTeamsBtn?.addEventListener("click", () => {
    if (!TEAM_QUEUE.length) {
      const ok = prepareTeamQueue();
      if (!ok) return;
      makeTeamsBtn.textContent = "Sıradaki";
    }
    revealOneMember();
  });

  /* ========== NAV: Draw Teams / Draw Fixture ========== */
  const navTeams = document.getElementById("navTeams");
  const navFixture = document.getElementById("navFixture");
  const teamsSection =
    document.getElementById("results")?.closest("section") ||
    document.querySelector("#teamsSection") ||
    document.querySelector("main .card");
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

  /* ========== FIXTURE (Takım adlarından eşleşme - reveal) ========== */
  const fixtureFields     = document.getElementById("fixtureFields");
  const addTeamBtn        = document.getElementById("addTeamBtn");
  const clearTeamsBtn     = document.getElementById("clearTeamsBtn");
  const revealFixtureBtn  = document.getElementById("revealFixtureBtn"); // TEK buton
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

  // yardımcılar
  function randShuffle(arr){ for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
  function nextPow2(n){ let p=1; while(p<n) p<<=1; return p; }
  function roundLabel(size, idx){
    if (size >= 16 && size % 8 === 0) return `Son ${size}`;
    if (size === 8) return "Çeyrek Final";
    if (size === 4) return "Yarı Final";
    if (size === 2) return "Final";
    return `Tur ${idx+1}`;
  }

  // --- Generatorlar ---
  function generateSingleElimFull(teams, seedingMode = "shuffle") {
    const list = [...teams];
    if (seedingMode === "shuffle") randShuffle(list);
    const target = nextPow2(list.length);
    while (list.length < target) list.push("BYE");

    const rounds = [];
    const r1 = [];
    for (let i = 0; i < list.length; i += 2) r1.push([list[i], list[i + 1]]);
    rounds.push({ name: roundLabel(list.length, 0), matches: r1 });

    let prevCount = r1.length, teamCount = list.length / 2, roundNo = 2;
    while (prevCount > 1) {
      const matches = [];
      for (let m = 0; m + 1 < prevCount; m += 2) {
        matches.push([`Kazanan R${roundNo - 1}-M${m + 1}`, `Kazanan R${roundNo - 1}-M${m + 2}`]);
      }
      rounds.push({ name: roundLabel(teamCount, roundNo - 1), matches });
      prevCount = matches.length; teamCount = teamCount / 2; roundNo++;
    }

    const bye = r1.flat().includes("BYE") ? "BYE alanlar bir üst tura ilerler." : null;
    return { rounds, bye, sections: null };
  }

  function generateDoubleElim(teams, seedingMode = "shuffle") {
    const list = [...teams];
    if (seedingMode === "shuffle") randShuffle(list);
    const target = nextPow2(list.length);
    while (list.length < target) list.push("BYE");

    const UB = [];
    const labelHints = {};

    const R1 = [];
    for (let i = 0; i < list.length; i += 2) R1.push([list[i], list[i + 1]]);
    UB.push({ name: roundLabel(list.length, 0), matches: R1 });
    R1.forEach((pair, i) => (labelHints[`UB R1-M${i + 1}`] = `${pair[0]} vs ${pair[1]}`));

    let prevCount = R1.length, teamCount = list.length / 2, roundNo = 2;
    while (prevCount > 1) {
      const matches = [];
      for (let m = 0; m + 1 < prevCount; m += 2) {
        const a = `Kazanan UB R${roundNo - 1}-M${m + 1}`;
        const b = `Kazanan UB R${roundNo - 1}-M${m + 2}`;
        matches.push([a, b]);
      }
      UB.push({ name: roundLabel(teamCount, roundNo - 1), matches });
      matches.forEach((pair, i) => (labelHints[`UB R${roundNo}-M${i + 1}`] = `${pair[0]} vs ${pair[1]}`));
      prevCount = matches.length;
      teamCount = Math.max(1, teamCount / 2);
      roundNo++;
    }

    const losersOf = (r, count) =>
      Array.from({ length: count }, (_, i) => `Kaybeden UB R${r}-M${i + 1}`);

    const k = Math.log2(target);
    const losersR1 = losersOf(1, target / 2);
    const LB = [];

    const pairUp = (arr) => {
      const out = [];
      for (let i = 0; i + 1 < arr.length; i += 2) out.push([arr[i], arr[i + 1]]);
      return out;
    };
    const winnersOfRound = (name, m) => Array.from({ length: m }, (_, i) => `Kazanan ${name}-M${i + 1}`);

    const LBR1 = pairUp(losersR1);
    if (LBR1.length) LB.push({ name: "LB R1", matches: LBR1 });

    let lastWinners = winnersOfRound("LB R1", LBR1.length);

    for (let r = 2; r <= k; r++) {
      if (lastWinners.length >= 2) {
        const minorName = `LB R${LB.length + 1}`;
        const minor = pairUp(lastWinners);
        LB.push({ name: minorName, matches: minor });
        lastWinners = winnersOfRound(minorName, minor.length);
      }
      const losersThis = losersOf(r, Math.max(1, target / Math.pow(2, r)));
      const pool = [...lastWinners, ...losersThis];
      const majorName = `LB R${LB.length + 1}`;
      const major = pairUp(pool);
      if (major.length) LB.push({ name: majorName, matches: major });
      lastWinners = winnersOfRound(majorName, major.length);
    }

    let lbFinalName = "LB Final";
    if (lastWinners.length >= 2) {
      const fin = pairUp(lastWinners);
      LB.push({ name: lbFinalName, matches: fin });
      lastWinners = winnersOfRound(lbFinalName, fin.length);
    } else {
      if (lastWinners.length === 1) {
        LB.push({ name: lbFinalName, matches: [[lastWinners[0], "LB'den gelen rakip"]] });
        lastWinners = ["Kazanan LB Final-M1"];
      }
    }

    const ubWinner = `Kazanan ${UB[UB.length - 1].name}-M1`;
    const lbWinner = lastWinners[0] || "LB Kazananı";
    const grandFinal = [{ name: "Büyük Final", matches: [[ubWinner, lbWinner]] }];

    const sections = [
      { title: "Upper Bracket", rounds: UB },
      { title: "Lower Bracket", rounds: LB },
      { title: "Grand Final", rounds: grandFinal }
    ];

    const bye = R1.flat().includes("BYE") ? "BYE alanlar ilgili turda otomatik ilerler." : null;
    return { rounds: [], bye, sections, labelHints };
  }

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

  /* ------------ BRACKET RENDER ------------ */
  const BR_BOX_W = 260;
  const BR_BOX_H = 58;
  const BR_V_GAP = 26;
  const BR_COL_GAP = 120;
  const BR_WRAP_PAD = 24;

  function orthPath(x1, y1, x2, y2) {
    const midX = (x1 + x2) / 2;
    return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
  }

  // rounds = [{name, matches:[[a,b], ...]}, ...]
  // labelHints: UB eşleşmelerini LB/GF tarafına çözmek için opsiyonel harita
  function renderBracketColumns(target, rounds, labelHints = {}) {
    const wrap = document.createElement("div");
    wrap.className = "bracket-wrap";
    wrap.style.position = "relative";
    wrap.style.padding = `${BR_WRAP_PAD}px`;
    wrap.style.background = "#0b1020";
    wrap.style.borderRadius = "12px";
    wrap.style.overflow = "auto";
    target.appendChild(wrap);

    const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
    svg.setAttribute("class","bracket-svg");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    wrap.appendChild(svg);

    const cols = [];
    const startX = BR_WRAP_PAD;

    // Bu round içinde ID -> "A vs B" haritası (R{n}-M{k})
    const idToPair = {};

    const pretty = (raw) => {
      if (typeof raw !== "string") return raw;
      const mUB = raw.match(/^(Kazanan|Kaybeden)\s+UB\s+(R\d-M\d)$/i);
      if (mUB) {
        const what = mUB[1];
        const key  = `UB ${mUB[2]}`;
        if (labelHints[key]) return `${what} (${labelHints[key]})`;
        return raw;
      }
      const m = raw.match(/^(Kazanan|Kaybeden)\s+(R\d-M\d)$/i);
      if (m) {
        const what = m[1];
        const key  = m[2];
        if (idToPair[key]) return `${what} (${idToPair[key]})`;
        return raw;
      }
      return raw;
    };

    // --- 1. sütun (R1) ---
    const col0 = { boxes: [], titleEl: null };
    {
      const x = startX;
      let curY = BR_WRAP_PAD + 30;

      rounds[0].matches.forEach((pair, mIdx) => {
        idToPair[`R1-M${mIdx + 1}`] = `${pair[0]} vs ${pair[1]}`;

        const box = mkMatchBox(["???", "???"]); // önce soru işaretleri
        box.dataset.t1 = pretty(pair[0]);
        box.dataset.t2 = pretty(pair[1]);

        place(box, x, curY, BR_BOX_W, BR_BOX_H);
        wrap.appendChild(box);
        col0.boxes.push({ el: box, x, y: curY, w: BR_BOX_W, h: BR_BOX_H });
        curY += BR_BOX_H + BR_V_GAP;
      });

      const t = mkRoundChip(rounds[0].name || "Tur 1");
      place(t, x, BR_WRAP_PAD - 24, BR_BOX_W, 24);
      wrap.appendChild(t);
      col0.titleEl = t;
    }
    cols.push(col0);

    // --- 2..N sütunlar ---
    for (let r = 1; r < rounds.length; r++) {
      const prev = cols[r - 1];
      const x = startX + r * (BR_BOX_W + BR_COL_GAP);
      const col = { boxes: [], titleEl: null };

      rounds[r].matches.forEach((pair, mIdx) => {
        const thisId = `R${r + 1}-M${mIdx + 1}`;
        const srcA = `R${r}-M${mIdx * 2 + 1}`;
        const srcB = `R${r}-M${mIdx * 2 + 2}`;
        if (!idToPair[thisId] && idToPair[srcA]) {
          idToPair[thisId] = idToPair[srcA];
        }

        const box = mkMatchBox(["???", "???"]);
        box.dataset.t1 = pretty(pair[0]);
        box.dataset.t2 = pretty(pair[1]);

        // Orta hizalama (güvenli fallback)
        const leftA = prev.boxes[mIdx * 2];
        const leftB = prev.boxes[mIdx * 2 + 1];
        let midY;
        if (leftA && leftB) {
          midY = ((leftA.y + leftA.h / 2) + (leftB.y + leftB.h / 2)) / 2 - BR_BOX_H / 2;
        } else if (leftA || leftB) {
          const L = leftA || leftB;
          midY = (L.y + L.h / 2) - BR_BOX_H / 2;
        } else {
          const step = (BR_BOX_H + BR_V_GAP) * Math.pow(2, r);
          midY = BR_WRAP_PAD + 30 + ((step - BR_BOX_H)/2) + mIdx * step;
        }

        place(box, x, midY, BR_BOX_W, BR_BOX_H);
        wrap.appendChild(box);
        col.boxes.push({ el: box, x, y: midY, w: BR_BOX_W, h: BR_BOX_H });
      });

      const t = mkRoundChip(rounds[r].name || `Tur ${r + 1}`);
      place(t, x, BR_WRAP_PAD - 24, BR_BOX_W, 24);
      wrap.appendChild(t);
      col.titleEl = t;
      cols.push(col);
    }

    // Ölç – wrap & svg boyu
    const { maxW, maxH } = (function measureWrap(columns){
      let mx = 0, my = 0;
      columns.forEach(c => c.boxes.forEach(b => {
        mx = Math.max(mx, b.x + b.w + BR_WRAP_PAD);
        my = Math.max(my, b.y + b.h + BR_WRAP_PAD);
      }));
      columns.forEach(c => {
        const x = parseInt(c.titleEl.style.left||0,10);
        const y = parseInt(c.titleEl.style.top||0,10);
        mx = Math.max(mx, x + BR_BOX_W + BR_WRAP_PAD);
        my = Math.max(my, y + 24 + BR_WRAP_PAD);
      });
      return { maxW: mx, maxH: my };
    })(cols);

    svg.setAttribute("width",  maxW);
    svg.setAttribute("height", maxH);

    // Çizgiler
    for (let r = 1; r < cols.length; r++) {
      const left = cols[r - 1].boxes;
      const right = cols[r].boxes;
      for (let i = 0; i < right.length; i++) {
        const A = left[i * 2];
        const B = left[i * 2 + 1];
        const T = right[i];
        if (!A || !B || !T) continue;

        const x1a = A.x + A.w, y1a = A.y + A.h / 2;
        const x1b = B.x + B.w, y1b = B.y + B.h / 2;
        const x2  = T.x,       y2  = T.y + T.h / 2;

        const p1 = document.createElementNS("http://www.w3.org/2000/svg","path");
        p1.setAttribute("class","br-line");
        p1.setAttribute("d", orthPath(x1a, y1a, x2, y2));
        svg.appendChild(p1);

        const p2 = document.createElementNS("http://www.w3.org/2000/svg","path");
        p2.setAttribute("class","br-line");
        p2.setAttribute("d", orthPath(x1b, y1b, x2, y2));
        svg.appendChild(p2);
      }
    }

    // kutulardaki metinleri küçült + gerekirse ortadan kısalt
    fitAllTeamTexts(wrap);

    // ------------ local helpers ------------
    function escapeHtml(s){ return String(s)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }

    function mkMatchBox([A, B]) {
      const box = document.createElement("div");
      box.className = "match-box";
      box.style.position = "absolute";
      box.style.width = BR_BOX_W + "px";
      box.style.height = BR_BOX_H + "px";
      box.innerHTML = `
        <div class="team-row"><span class="team-name">${escapeHtml(A)}</span></div>
        <div class="sep"></div>
        <div class="team-row"><span class="team-name">${escapeHtml(B)}</span></div>
      `;
      return box;
    }

    function mkRoundChip(text){
      const t = document.createElement("div");
      t.className = "round-chip";
      t.textContent = text;
      return t;
    }

    function place(el,x,y,w,h){
      el.style.position = "absolute";
      el.style.left = x+"px"; el.style.top = y+"px";
      if (w) el.style.width = w+"px"; if (h) el.style.height = h+"px";
    }

    function middleEllipsis(str, keep = 26){
      const s = String(str);
      if (s.length <= keep) return s;
      const head = Math.ceil((keep-1)/2), tail = Math.floor((keep-1)/2);
      return s.slice(0, head) + "… " + s.slice(-tail);
    }
    function fitAllTeamTexts(scopeEl){
      const maxWidth = BR_BOX_W - 16;
      scopeEl.querySelectorAll(".team-name").forEach(el=>{
        el.style.fontSize = ""; el.style.letterSpacing = "";
        const full = el.getAttribute("data-full") || el.textContent;
        el.setAttribute("data-full", full); el.textContent = full; el.title = full;
        let size = parseFloat(getComputedStyle(el).fontSize) || 14;
        while (el.scrollWidth > maxWidth && size > 9) {
          size -= .5; el.style.fontSize = size + "px";
        }
        if (el.scrollWidth > maxWidth) {
          const approx = Math.max(18, Math.floor(maxWidth / (size * 0.6)));
          el.textContent = middleEllipsis(full, approx);
        }
      });
    }
  }

  /* ------------ Vektör Export (SVG -> PNG) ------------ */
  function bracketWrapToSVG(wrapEl) {
    const W = Math.ceil(wrapEl.scrollWidth || wrapEl.offsetWidth || 1000);
    const H = Math.ceil(wrapEl.scrollHeight || wrapEl.offsetHeight || 600);

    const svgNS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("xmlns", svgNS);
    svg.setAttribute("width",  W);
    svg.setAttribute("height", H);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    // Arkaplan
    const bgRect = document.createElementNS(svgNS, "rect");
    bgRect.setAttribute("x", "0"); bgRect.setAttribute("y", "0");
    bgRect.setAttribute("width", String(W)); bgRect.setAttribute("height", String(H));
    bgRect.setAttribute("fill", getComputedStyle(wrapEl).backgroundColor || "#0b1020");
    svg.appendChild(bgRect);

    // --- Kutuları oku
    const wrapRect = wrapEl.getBoundingClientRect();
    const boxesDom = Array.from(wrapEl.querySelectorAll(".match-box"));
    const boxes = boxesDom.map(b => {
      const r = b.getBoundingClientRect();
      const x = r.left - wrapRect.left;
      const y = r.top  - wrapRect.top;
      const w = r.width, h = r.height;
      const names = b.querySelectorAll(".team-name");
      const t1 = names[0]?.getAttribute("data-full") || names[0]?.textContent || "";
      const t2 = names[1]?.getAttribute("data-full") || names[1]?.textContent || "";
      return { x, y, w, h, t1, t2 };
    });

    // Kutuları çiz
    const drawBox = (b) => {
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", b.x); rect.setAttribute("y", b.y);
      rect.setAttribute("width", b.w); rect.setAttribute("height", b.h);
      rect.setAttribute("rx", "12"); rect.setAttribute("ry", "12");
      rect.setAttribute("fill", "#11182b");
      rect.setAttribute("stroke", "rgba(255,255,255,0.1)");
      rect.setAttribute("stroke-width", "1");
      svg.appendChild(rect);

      const padX = 12;
      const t1 = document.createElementNS(svgNS, "text");
      t1.setAttribute("x", b.x + padX);
      t1.setAttribute("y", b.y + b.h/4 + 5);
      t1.setAttribute("font-size", "14");
      t1.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial");
      t1.setAttribute("fill", "#e9eefc");
      t1.setAttribute("dominant-baseline", "middle");
      t1.textContent = b.t1;
      svg.appendChild(t1);

      const t2 = document.createElementNS(svgNS, "text");
      t2.setAttribute("x", b.x + padX);
      t2.setAttribute("y", b.y + (3*b.h)/4 - 5);
      t2.setAttribute("font-size", "14");
      t2.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial");
      t2.setAttribute("fill", "#e9eefc");
      t2.setAttribute("dominant-baseline", "middle");
      t2.textContent = b.t2;
      svg.appendChild(t2);

      const sep = document.createElementNS(svgNS, "line");
      sep.setAttribute("x1", b.x + 8);
      sep.setAttribute("x2", b.x + b.w - 8);
      sep.setAttribute("y1", b.y + b.h/2);
      sep.setAttribute("y2", b.y + b.h/2);
      sep.setAttribute("stroke", "rgba(255,255,255,0.06)");
      sep.setAttribute("stroke-width", "1");
      svg.appendChild(sep);
    };
    boxes.forEach(drawBox);

    // Round chip'leri çiz
    wrapEl.querySelectorAll(".round-chip").forEach(chip => {
      const r = chip.getBoundingClientRect();
      const x = r.left - wrapRect.left;
      const y = r.top  - wrapRect.top;
      const w = r.width, h = r.height;

      const rc = document.createElementNS(svgNS, "rect");
      rc.setAttribute("x", x); rc.setAttribute("y", y);
      rc.setAttribute("width", w); rc.setAttribute("height", h);
      rc.setAttribute("rx", "8"); rc.setAttribute("ry", "8");
      rc.setAttribute("fill", "#0f1530");
      rc.setAttribute("stroke", "rgba(255,255,255,0.1)");
      rc.setAttribute("stroke-width", "1");
      svg.appendChild(rc);

      const tx = document.createElementNS(svgNS, "text");
      tx.setAttribute("x", x + w/2);
      tx.setAttribute("y", y + h/2);
      tx.setAttribute("text-anchor", "middle");
      tx.setAttribute("dominant-baseline", "middle");
      tx.setAttribute("font-size", "13");
      tx.setAttribute("font-weight", "600");
      tx.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, Roboto, Arial");
      tx.setAttribute("fill", "#cfe3ff");
      tx.textContent = chip.textContent || "";
      svg.appendChild(tx);
    });

    // Çizgileri kutulardan yeniden hesapla (kayma çözümü)
    const EPS = 2;
    const colsX = [];
    boxes.forEach(b => {
      const x = b.x;
      const hit = colsX.find(v => Math.abs(v - x) <= EPS);
      if (!hit) colsX.push(x);
    });
    colsX.sort((a,b)=>a-b);

    const cols = colsX.map(x0 => boxes
      .filter(b => Math.abs(b.x - x0) <= EPS)
      .sort((a,b)=>a.y - b.y)
    );

    const strokeColor = "rgba(255,255,255,0.18)";
    const strokeW = 2;
    const orth = (x1,y1,x2,y2) => {
      const midX = (x1 + x2) / 2;
      return `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
    };

    for (let r = 1; r < cols.length; r++) {
      const L = cols[r-1];
      const R = cols[r];
      for (let i=0; i<R.length; i++){
        const A = L[i*2], B = L[i*2+1], T = R[i];
        if (!A || !B || !T) continue;

        const x1a = A.x + A.w, y1a = A.y + A.h/2;
        const x1b = B.x + B.w, y1b = B.y + B.h/2;
        const x2  = T.x,       y2  = T.y + T.h/2;

        const p1 = document.createElementNS(svgNS,"path");
        p1.setAttribute("d", orth(x1a, y1a, x2, y2));
        p1.setAttribute("fill","none");
        p1.setAttribute("stroke", strokeColor);
        p1.setAttribute("stroke-width", strokeW);
        p1.setAttribute("stroke-linejoin","round");
        p1.setAttribute("stroke-linecap","round");
        svg.appendChild(p1);

        const p2 = document.createElementNS(svgNS,"path");
        p2.setAttribute("d", orth(x1b, y1b, x2, y2));
        p2.setAttribute("fill","none");
        p2.setAttribute("stroke", strokeColor);
        p2.setAttribute("stroke-width", strokeW);
        p2.setAttribute("stroke-linejoin","round");
        p2.setAttribute("stroke-linecap","round");
        svg.appendChild(p2);
      }
    }
    return svg;
  }

  async function svgToPNGAndDownload(svg, filename = "fixture.png", maxPx = 4096, bgColor = "#0b1020") {
    const W = parseInt(svg.getAttribute("width"),10);
    const H = parseInt(svg.getAttribute("height"),10);
    const longest = Math.max(W, H);
    const scale = longest > maxPx ? (maxPx / longest) : 1;

    const canvas = document.createElement("canvas");
    canvas.width  = Math.max(1, Math.round(W * scale));
    canvas.height = Math.max(1, Math.round(H * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bgColor;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    await new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        res();
      };
      img.onerror = rej;
      img.src = url;
    });

    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }, "image/png");
  }

  async function exportWrapPNG(wrapEl, filename = "fixture.png", maxPx = 4096) {
    const svg = bracketWrapToSVG(wrapEl);
    const bg = getComputedStyle(wrapEl).backgroundColor || "#0b1020";
    await svgToPNGAndDownload(svg, filename, maxPx, bg);
  }

  async function exportDoubleElimPNG(root, filename = "fixture.png", maxPx = 4096) {
    const wraps = Array.from(root.querySelectorAll(".bracket-wrap"));
    if (!wraps.length) return;

    const svgs = wraps.map(w => bracketWrapToSVG(w));
    const dims = svgs.map(s => ({
      w: parseInt(s.getAttribute("width"),10),
      h: parseInt(s.getAttribute("height"),10),
    }));
    const titles = wraps.map(w => w.previousElementSibling?.classList?.contains("bracket-section")
      ? (w.previousElementSibling.textContent || "")
      : "");

    const titleH = 28, gap = 24;
    const totalH = dims.reduce((a,b) => a + b.h, 0) + (wraps.length - 1) * gap + titles.filter(Boolean).length * titleH + 32;
    const maxW   = Math.max(...dims.map(d => d.w)) + 32;

    const longest = Math.max(maxW, totalH);
    const scale = longest > maxPx ? (maxPx / longest) : 1;

    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(maxW * scale);
    canvas.height = Math.round(totalH * scale);
    const ctx = canvas.getContext("2d");
    const bg = getComputedStyle(root).backgroundColor || "#0b1020";
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    let y = Math.round(16 * scale);
    const titleFont = `${Math.round(16*scale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillStyle = "#cfe3ff";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";

    for (let i=0;i<svgs.length;i++){
      if (titles[i]) {
        ctx.font = `600 ${titleFont}`;
        ctx.fillText(titles[i], Math.round(16*scale), y);
        y += Math.round(titleH * scale);
      }
      const xml = new XMLSerializer().serializeToString(svgs[i]);
      const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      // eslint-disable-next-line no-await-in-loop
      await new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => {
          const dw = Math.round(dims[i].w * scale);
          const dh = Math.round(dims[i].h * scale);
          ctx.drawImage(img, Math.round(16*scale), y, dw, dh);
          y += dh + Math.round(gap * scale);
          URL.revokeObjectURL(url);
          res();
        };
        img.onerror = rej;
        img.src = url;
      });
    }

    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }, "image/png");
  }

  async function exportRoundRobinPNG(output, filename = "fixture.png", maxPx = 4096) {
    const rounds = output?.rounds || [];
    const padX = 24, padY = 24, gap = 16, lineGap = 4;
    const rowH = 20; // her satır metin yüksekliği
    const titleH = 26;

    const W = 1000;
    let H = padY;
    rounds.forEach(r => {
      H += titleH + lineGap;
      H += r.matches.length * (rowH + lineGap);
      H += gap;
    });
    H += padY;

    const longest = Math.max(W, H);
    const scale = longest > maxPx ? (maxPx / longest) : 1;

    const canvas = document.createElement("canvas");
    canvas.width  = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#0b1020";
    ctx.fillRect(0,0,canvas.width,canvas.height);

    let y = Math.round(padY * scale);
    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    rounds.forEach((r, idx) => {
      ctx.fillStyle = "#cfe3ff";
      ctx.font = `600 ${Math.round(18*scale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.fillText(r.name || `Hafta ${idx+1}`, Math.round(padX*scale), y);
      y += Math.round(titleH*scale);

      ctx.fillStyle = "#e9eefc";
      ctx.font = `${Math.round(14*scale)}px system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      r.matches.forEach(([a,b]) => {
        const line = `${a}  vs  ${b}`;
        ctx.fillText(line, Math.round(padX*scale), y);
        y += Math.round((rowH + lineGap) * scale);
      });

      y += Math.round(gap*scale);
    });

    canvas.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
    }, "image/png");
  }

  /* ------------ ÇIKTIYI YAZ (tek kaynak) ------------ */
  function renderFixtureOutput(output, mode){
    fixtureResults.style.display = "block";
    fixtureResults.innerHTML = "";

    // ---- TOP STICKY TOOLBAR ----
    const makeToolbar = () => {
      const bar = document.createElement("div");
      bar.className = "toolbar";

      // PNG
      const pngBtn = document.createElement("button");
      pngBtn.className = "btn btn-primary";
      pngBtn.textContent = "PNG indir";
      pngBtn.addEventListener("click", async () => {
        if (typeof showView === "function") showView("fixture");
        if (mode === "doubleelim") {
          await exportDoubleElimPNG(fixtureResults, "fixture.png", 4096);
        } else if (mode === "roundrobin") {
          await exportRoundRobinPNG(output, "fixture.png", 4096);
        } else {
          const target = fixtureResults.querySelector(".bracket-wrap");
          if (!target) { alert("Bracket bulunamadı."); return; }
          await exportWrapPNG(target, "fixture.png", 4096);
        }
      });
      bar.appendChild(pngBtn);

      // CSV
      const csvBtn = document.createElement("button");
      csvBtn.className = "btn btn-ghost";
      csvBtn.textContent = "CSV indir";
      csvBtn.addEventListener("click", () => {
        const headers = ["Round", "Home", "Away"];
        const csv = toCSV(headers, collectRows());
        downloadCSV("fixture.csv", csv);
      });
      bar.appendChild(csvBtn);

      // XLSX
      const xlsxBtn = document.createElement("button");
      xlsxBtn.className = "btn btn-ghost";
      xlsxBtn.textContent = "Excel indir";
      xlsxBtn.addEventListener("click", () => {
        if (!window.XLSX) { alert("SheetJS yok (xlsx)."); return; }
        const headers = ["Round", "Home", "Away"];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...collectRows()]);
        XLSX.utils.book_append_sheet(wb, ws, "Fixture");
        XLSX.writeFile(wb, "fixture.xlsx");
      });
      bar.appendChild(xlsxBtn);

      return bar;
    };

    // rows collector
    const collectRows = () => {
      const rows = [];
      if (output.sections){
        output.sections.forEach(sec => {
          sec.rounds.forEach(r => r.matches.forEach(([a,b]) => rows.push([`${sec.title} - ${r.name}`, a, b])));
        });
      } else {
        (output.rounds || []).forEach(r => r.matches.forEach(([a,b]) => rows.push([r.name, a, b])));
      }
      if (output.bye) rows.push(["BYE", output.bye, ""]);
      return rows;
    };

    // TOP toolbar
    const topBar = makeToolbar();
    fixtureResults.appendChild(topBar);

    // Başlık
    const title = document.createElement("h3");
    const modeTitle = mode === "doubleelim" ? "Fikstür (Çift Eleme)"
                      : mode === "roundrobin" ? "Fikstür (Lig Usulü)"
                      : "Fikstür (Eleme Usulü)";
    title.textContent = modeTitle;
    fixtureResults.appendChild(title);

    // Tek kaynak: metin listesinde toplanacak span'lar
    const LIST_SPANS = (window.__LIST_SPANS = []);

    // metin liste çizici
    const renderRoundsList = (rounds) => {
      rounds.forEach((round, idx) => {
        const box = document.createElement("div");
        box.className = "team";

        const h = document.createElement("div");
        h.className = "team-title";
        h.textContent = round.name || `Tur ${idx + 1}`;
        box.appendChild(h);

        const ul = document.createElement("ul");
        round.matches.forEach(([a, b]) => {
          const li = document.createElement("li");

          const sa = document.createElement("span");
          sa.className = "team-name";
          sa.dataset.full = a;
          sa.textContent = "???";

          const sb = document.createElement("span");
          sb.className = "team-name";
          sb.dataset.full = b;
          sb.textContent = "???";

          li.appendChild(sa);
          li.appendChild(document.createTextNode(" vs "));
          li.appendChild(sb);
          ul.appendChild(li);

          LIST_SPANS.push(sa, sb);
        });

        box.appendChild(ul);
        fixtureResults.appendChild(box);
      });
    };

    if (mode === "doubleelim" && output.sections) {
      const hints = output.labelHints || {};

      // --- Metin listeleri: UB/LB/GF
      output.sections.forEach(section => {
        const secH = document.createElement("h4");
        secH.style.marginTop = "10px";
        secH.textContent = section.title;
        secH.className = "bracket-section";
        fixtureResults.appendChild(secH);
        renderRoundsList(section.rounds);
      });

      if (output.bye){
        const byeBox = document.createElement("div");
        byeBox.className = "warn";
        byeBox.textContent = output.bye;
        fixtureResults.appendChild(byeBox);
      }

      // --- Görsel bracket'lar: UB/LB/GF
      output.sections.forEach(section => {
        const secH = document.createElement("h4");
        secH.textContent = section.title;
        secH.className = "bracket-section";
        fixtureResults.appendChild(secH);
        renderBracketColumns(fixtureResults, section.rounds, hints);
      });

    } else if (mode === "roundrobin") {
      renderRoundsList(output.rounds || []);
      if (output.bye){
        const byeBox = document.createElement("div");
        byeBox.className = "warn";
        byeBox.textContent = output.bye;
        fixtureResults.appendChild(byeBox);
      }
    } else {
      // tek eleme: metin + tek bracket
      const secH1 = document.createElement("h4");
      secH1.textContent = "Bracket";
      secH1.className = "bracket-section";
      fixtureResults.appendChild(secH1);
      renderRoundsList(output.rounds || []);

      const secH2 = document.createElement("h4");
      secH2.textContent = "Bracket";
      secH2.className = "bracket-section";
      fixtureResults.appendChild(secH2);
      renderBracketColumns(fixtureResults, output.rounds || []);
      if (output.bye){
        const byeBox = document.createElement("div");
        byeBox.className = "warn";
        byeBox.textContent = output.bye;
        fixtureResults.appendChild(byeBox);
      }
    }

    // --- REVEAL KUYRUĞU ---
    FIXTURE_QUEUE = [];
    FIXTURE_PTR = 0;

    const allBoxes = fixtureResults.querySelectorAll(".match-box");
    let listPtr = 0;

    allBoxes.forEach((b, i) => {
      const t1 = b.dataset.t1 || "";
      const t2 = b.dataset.t2 || "";
      FIXTURE_QUEUE.push({
        boxIndex: i, slot: 0, name: t1,
        listSpan: LIST_SPANS[listPtr++] || null
      });
      FIXTURE_QUEUE.push({
        boxIndex: i, slot: 1, name: t2,
        listSpan: LIST_SPANS[listPtr++] || null
      });
    });

    if (revealFixtureBtn) {
      revealFixtureBtn.disabled = false;
      revealFixtureBtn.textContent = "Sıradaki";
    }
  }

  // --- Fikstür "Sıradaki" davranışı ---
  function revealNextTeam() {
    if (FIXTURE_PTR >= FIXTURE_QUEUE.length) return;

    const item = FIXTURE_QUEUE[FIXTURE_PTR];

    // Bracket'ta aç
    const boxes = fixtureResults.querySelectorAll(".match-box");
    const box = boxes[item.boxIndex];
    if (box) {
      const span = box.querySelectorAll(".team-name")[item.slot];
      if (span) {
        span.textContent = item.name || "";
        span.setAttribute("data-full", item.name || "");
      }
    }

    // Metin listesinde aç
    if (item.listSpan) {
      item.listSpan.textContent = item.name || "";
      item.listSpan.setAttribute("data-full", item.name || "");
    }

    FIXTURE_PTR++;

    if (FIXTURE_PTR >= FIXTURE_QUEUE.length) {
      if (revealFixtureBtn) {
        revealFixtureBtn.textContent = "Bitti";
        revealFixtureBtn.disabled = true;
      }
    }
  }

  // Tek buton: İlk basışta fikstürü kur; sonra her basışta sıradaki
  revealFixtureBtn?.addEventListener("click", () => {
    // Queue boşsa önce fikstürü üret
    if (!FIXTURE_QUEUE.length) {
      const teams = readTeams();
      if (teams.length < 2) {
        renderFixtureOutput({ rounds: [], bye: null }, fixtureModeEl.value);
        return;
      }
      const base = (fixtureSeedingEl.value === "ordered")
        ? [...teams]
        : randShuffle([...teams]);

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
    }

    // Her tıklamada bir isim aç
    revealNextTeam();
  });

  /* ------------ Eventler ------------ */
  addTeamBtn?.addEventListener("click", () => addTeamField());
  clearTeamsBtn?.addEventListener("click", () => {
    fixtureFields.innerHTML = ""; addTeamField(); addTeamField();
    persistFixture(); fixtureResults.style.display = "none"; fixtureResults.innerHTML = "";
    FIXTURE_QUEUE = []; FIXTURE_PTR = 0;
    if (revealFixtureBtn) { revealFixtureBtn.textContent = "Sıradaki"; revealFixtureBtn.disabled = false; }
  });
  fixtureModeEl?.addEventListener("change", () => {
    doubleWrap.style.display = (fixtureModeEl.value === "roundrobin") ? "" : "none";
    // mod değişince mevcut kuyruğu sıfırla
    FIXTURE_QUEUE = []; FIXTURE_PTR = 0;
    if (revealFixtureBtn) { revealFixtureBtn.textContent = "Sıradaki"; revealFixtureBtn.disabled = false; }
    fixtureResults.style.display = "none"; fixtureResults.innerHTML = "";
  });

  // başlangıç
  restoreFixture();
  doubleWrap.style.display = (fixtureModeEl?.value === "roundrobin") ? "" : "none";
});
