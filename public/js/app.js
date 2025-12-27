// Configuration
const METRICS = [
  { key: "artificial_analysis_intelligence_index", label: "AA Intel", title: "Intelligence Index" },
  { key: "artificial_analysis_coding_index", label: "AA Coding", title: "Coding Index" },
  { key: "artificial_analysis_math_index", label: "AA Math", title: "Math Index" },
  { key: "lcr", label: "LCR", title: "Long Context Reasoning" },
  { key: "hle", label: "HLE", title: "Humanities Last Exam" },
  { key: "mmlu_pro", label: "MMLU Pro", title: "MMLU Pro" },
  { key: "gpqa", label: "GPQA", title: "GPQA" },
  { key: "livecodebench", label: "LCB", title: "LiveCodeBench" },
  { key: "scicode", label: "SciCode", title: "Scientific Coding" },
  { key: "math_500", label: "Math 500", title: "Math 500" },
  { key: "aime", label: "AIME", title: "AIME Average" },
  { key: "aime_25", label: "AIME 25", title: "AIME 2025" },
  { key: "ifbench", label: "IFBench", title: "Instruction Following" },
  { key: "tau2", label: "TAU-2", title: "TAU-bench" },
  { key: "terminalbench_hard", label: "TermBench", title: "Terminal Bench Hard" },
];

const ADV_METRICS = [
  { key: "release_date", label: "Release", title: "Release Date" },
  { key: "price_blend", label: "Price (Blend)", title: "Price per 1M Tokens (Blend)" },
  { key: "price_input", label: "Price (In)", title: "Price per 1M Input" },
  { key: "price_output", label: "Price (Out)", title: "Price per 1M Output" },
  { key: "ops", label: "OPS", title: "Output Tokens/Sec" },
];

// State
let rawData = [];
let selectedMetrics = new Set(["lcr", "hle", "mmlu_pro", "gpqa", "aime_25", "ifbench", "scicode", "livecodebench"]);
let selectedAdvMetrics = new Set(["release_date", "price_blend"]);
let sortState = { key: "sum", dir: "desc" };

// Elements
const $metricsControls = document.getElementById("metricsControls");
const $advMetricsControls = document.getElementById("advMetricsControls");
const $resultsBody = document.getElementById("resultsBody");
const $cardsContainer = document.getElementById("cardsContainer");
const $summary = document.getElementById("summary");
const $refreshBtn = document.getElementById("refreshBtn");
const $refreshSpinner = document.getElementById("refreshSpinner");
const $searchInput = document.getElementById("searchInput");
const $nullZeroChk = document.getElementById("nullZeroChk");

// --- Initialization ---
function init() {
  createCheckboxes(METRICS, $metricsControls, selectedMetrics);
  createCheckboxes(ADV_METRICS, $advMetricsControls, selectedAdvMetrics);
  
  $refreshBtn.addEventListener("click", () => fetchData(true));
  $nullZeroChk.addEventListener("change", render);
  $searchInput.addEventListener("input", () => setTimeout(render, 300));
  document.getElementById("viewJsonBtn").addEventListener("click", () => window.open("/api/llms", "_blank"));

  fetchData(false);
}

function createCheckboxes(list, container, set) {
  list.forEach(m => {
    const div = document.createElement("div");
    div.className = "metric-checkbox";
    const id = `chk_${m.key}`;
    div.innerHTML = `<label title="${m.title}"><input type="checkbox" id="${id}" ${set.has(m.key) ? "checked" : ""}> ${m.label}</label>`;
    container.appendChild(div);
    document.getElementById(id).addEventListener("change", (e) => {
      e.target.checked ? set.add(m.key) : set.delete(m.key);
      render();
    });
  });
}

// --- Data Fetching ---
async function fetchData(refresh = false) {
  try {
    $refreshBtn.disabled = true;
    $refreshSpinner.style.display = "inline-block";
    
    const res = await fetch(`/api/llms?refresh=${refresh}`);
    const json = await res.json();
    
    if (res.status !== 200) throw new Error(json.error || "Fetch failed");
    
    rawData = json.data || [];
    render();
  } catch (err) {
    alert("Error loading data: " + err.message);
  } finally {
    $refreshBtn.disabled = false;
    $refreshSpinner.style.display = "none";
  }
}

// --- Helpers ---
const parseNum = (v) => (v !== null && v !== undefined && !isNaN(Number(v))) ? Number(v) : null;
const formatNum = (n) => n === null ? "—" : Number(n).toFixed(2).replace(/\.00$/, "");
const formatPrice = (n) => n === null ? "—" : "$" + Number(n).toFixed(2);

function getVal(item, key) {
  if (key === "sum") return item.sum_score;
  if (item.metric_values && item.metric_values[key] !== undefined) return item.metric_values[key];
  if (key === "release_date") return item.release_date;
  if (key === "ops") return item.ops;
  if (key.startsWith("price_") && item.pricing) {
    if (key === "price_blend") return item.pricing.price_1m_blended_3_to_1;
    if (key === "price_input") return item.pricing.price_1m_input_tokens;
    if (key === "price_output") return item.pricing.price_1m_output_tokens;
  }
  return null;
}

// --- Rendering ---
function render() {
  const query = $searchInput.value.toLowerCase();
  const treatNullAsZero = $nullZeroChk.checked;

  // 1. Process Data
  let list = rawData.map(item => {
    let sum = 0;
    let missing = [];
    METRICS.forEach(m => {
      if (selectedMetrics.has(m.key)) {
        const val = parseNum(item.metric_values[m.key]);
        if (val !== null) sum += val;
        else missing.push(m.label);
      }
    });
    return { ...item, computedSum: sum, missing };
  }).filter(item => {
    return (item.display_name || "").toLowerCase().includes(query) || 
           (item.creator?.name || "").toLowerCase().includes(query);
  });

  // 2. Sort
  list.sort((a, b) => {
    let va = sortState.key === "sum" ? a.computedSum : getVal(a, sortState.key);
    let vb = sortState.key === "sum" ? b.computedSum : getVal(b, sortState.key);
    
    // Handle nulls for sorting
    if (va === null) va = -Infinity;
    if (vb === null) vb = -Infinity;

    return sortState.dir === "asc" ? (va - vb) : (vb - va);
  });

  $summary.innerHTML = `Showing <strong>${list.length}</strong> models. Sorted by ${sortState.key === 'sum' ? 'Sum Score' : sortState.key}.`;

  renderTable(list);
  renderCards(list);
}

function renderTable(list) {
  // Header
  const thead = document.querySelector("#resultsTable thead");
  thead.innerHTML = "";
  const tr = document.createElement("tr");
  
  const addTh = (key, text, isStatic=false) => {
    const th = document.createElement("th");
    th.textContent = text;
    if(isStatic) th.className = key === "rank" ? "col-rank" : "col-model";
    if(sortState.key === key) th.classList.add("active-sort");
    th.onclick = () => {
      if(sortState.key === key) sortState.dir = sortState.dir === "desc" ? "asc" : "desc";
      else sortState = { key, dir: "desc" };
      render();
    };
    tr.appendChild(th);
  };

  addTh("rank", "#", true);
  addTh("model", "Model", true);
  addTh("sum", "Sum");
  METRICS.filter(m => selectedMetrics.has(m.key)).forEach(m => addTh(m.key, m.label));
  ADV_METRICS.filter(m => selectedAdvMetrics.has(m.key)).forEach(m => addTh(m.key, m.label));
  thead.appendChild(tr);

  // Body
  $resultsBody.innerHTML = "";
  list.forEach((item, idx) => {
    const row = document.createElement("tr");
    
    // Rank
    row.innerHTML += `<td class="col-rank">${idx + 1}</td>`;
    
    // Model Name
    let nameHtml = `<strong>${item.display_name || item.name}</strong>`;
    if(item.missing.length > 0) nameHtml += `<span class="badge-missing" title="Missing: ${item.missing.join(', ')}">${item.missing.length}⚠</span>`;
    row.innerHTML += `<td class="col-model">${nameHtml}<div style="font-size:0.8em;color:#666">${item.creator?.name || ''}</div></td>`;
    
    // Sum
    row.innerHTML += `<td><strong>${formatNum(item.computedSum)}</strong></td>`;

    // Metrics
    METRICS.filter(m => selectedMetrics.has(m.key)).forEach(m => {
      row.innerHTML += `<td>${formatNum(item.metric_values[m.key])}</td>`;
    });

    // Advanced
    ADV_METRICS.filter(m => selectedAdvMetrics.has(m.key)).forEach(m => {
      const val = getVal(item, m.key);
      let display = formatNum(val);
      if(m.key.includes("price")) display = formatPrice(val);
      if(m.key === "release_date") display = val || "—";
      row.innerHTML += `<td>${display}</td>`;
    });

    $resultsBody.appendChild(row);
  });
}

function renderCards(list) {
  $cardsContainer.innerHTML = "";
  list.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "card";
    
    // Build mini stats grid
    let statsHtml = "";
    METRICS.filter(m => selectedMetrics.has(m.key)).slice(0, 6).forEach(m => {
      const val = formatNum(item.metric_values[m.key]);
      statsHtml += `<div class="mini-stat"><span>${m.label}</span><strong>${val}</strong></div>`;
    });

    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-title">${item.display_name || item.name}</div>
          <div class="card-creator">${item.creator?.name || 'Unknown'}</div>
        </div>
        <div class="card-rank">#${idx + 1}</div>
      </div>
      <div class="card-main-stat">
        <span class="stat-label">Total Score</span>
        <span class="stat-value">${formatNum(item.computedSum)}</span>
      </div>
      <div class="card-grid">
        ${statsHtml}
      </div>
    `;
    $cardsContainer.appendChild(card);
  });
}

init();