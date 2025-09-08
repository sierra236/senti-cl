document.addEventListener("DOMContentLoaded", () => {
  /* ---------- DOM ---------- */
  const addBtn = document.getElementById("addFieldBtn");
  const clearBtn = document.getElementById("clearAllBtn");
  const formatDialog = document.getElementById("formatDialog");
  const changeFormatBtn = document.getElementById("changeFormatBtn");

  const makeTeamsBtn = document.getElementById("makeTeamsBtn");
  const resultsEl = document.getElementById("results");

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
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      addOneToAllVisibleTiers();
    });
  }

  if (clearBtn) clearBtn.addEventListener("click", clearAll);

  changeFormatBtn?.addEventListener("click", () => {
    // güvene almak istersen son hali kaydet
    persist();
    // diyaloğu göster
    if (formatDialog) formatDialog.style.display = "";
  });


  /* ---------- Format diyaloğu ---------- */
  const saved = loadData();
  const defaultFormat = saved?.format || 1;

  formatDialog?.querySelectorAll(".format-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const n = Number(btn.dataset.format);
      const snap = snapshotFromDOM();   // ekrandaki en güncel isimlerle çalış
      restoreToFormat(n, snap);
      formatDialog.style.display = "none";
    });
  });

  // Sayfa ilk yüklenince (arka planda) varsayılanı uygula, diyaloğu göster
  restoreToFormat(defaultFormat, saved);
  if (formatDialog) formatDialog.style.display = "";

  /* ===================== TAKIM OLUŞTURMA ===================== */
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function readFilled() {
    const data = {};
    for (const key of Object.keys(containers)) {
      data[key] = [...containers[key].querySelectorAll("input")]
        .map(i => i.value.trim())
        .filter(Boolean);
    }
    return data;
  }

  // Her görünür tier'dan birer oyuncu çekerek takımları kur
  function buildTeams() {
    const vis = visibleTierKeys(); // örn 4v4 => ["t1","t2","t3","t4"]
    const data = readFilled();
    const pools = {};
    for (const k of vis) pools[k] = shuffle([...data[k]]);

    // Her görünür tier boş değil mi?
    for (const k of vis) {
      if ((pools[k]?.length || 0) === 0) {
        return { ok: false, error: `Tier ${k.slice(1)} boş. En az bir isim gir.`, teams: [] };
      }
    }

    // En küçük havuz kadar takım
    const maxTeams = Math.min(...vis.map(k => pools[k].length));
    const teams = [];
    for (let i = 0; i < maxTeams; i++) {
      const members = vis.map(k => ({ tier: k, name: pools[k].pop() }));
      teams.push(members);
    }
    return { ok: true, teams };
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
