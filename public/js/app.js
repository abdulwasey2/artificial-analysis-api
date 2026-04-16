// Configuration
const METRICS = [
  {
    key: "artificial_analysis_intelligence_index",
    label: "AA Intel",
    title: "Intelligence Index",
  },
  {
    key: "artificial_analysis_coding_index",
    label: "AA Coding",
    title: "Coding Index",
  },
  {
    key: "artificial_analysis_math_index",
    label: "AA Math",
    title: "Math Index",
  },
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
  {
    key: "terminalbench_hard",
    label: "TermBench",
    title: "Terminal Bench Hard",
  },
];

const ADV_METRICS = [
  { key: "release_date", label: "Release", title: "Release Date" },
  {
    key: "price_blend",
    label: "Price (Blend)",
    title: "Price per 1M Tokens (Blend)",
  },
  { key: "price_input", label: "Price (In)", title: "Price per 1M Input" },
  { key: "price_output", label: "Price (Out)", title: "Price per 1M Output" },
  { key: "ops", label: "OPS", title: "Output Tokens/Sec" },
  { key: "ttf", label: "TTFT (s)", title: "Time to First Token (Seconds)" },
  {
    key: "perf_avg",
    label: "Avg Speed (s)",
    title: "Average of TTFA and Output Tokens/Sec",
  },

  { key: "ttfa", label: "TTFA (s)", title: "Time to First Answer (Seconds)" },
];

// State
let rawData = [];
let selectedMetrics = new Set([
  "lcr",
  "hle",
  "mmlu_pro",
  "gpqa",
  "aime_25",
  "ifbench",
  "scicode",
  "livecodebench",
]);
let selectedAdvMetrics = new Set([
  "release_date",
  "price_blend",
  "price_input",
  "price_output",
  "perf_avg",

  "ops",
]); // Added ops and ttf as default for visibility
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
let debounceTimer = null;

let currentCategory = "llms";

const MEDIA_METRICS = [
  { key: "elo", label: "ELO Rating", title: "ELO Rating" },
  { key: "appearances", label: "Appearances", title: "Number of Matches" },
  { key: "rank", label: "Rank", title: "Leaderboard Rank" },
];

const MEDIA_ADV_METRICS = [
  { key: "release_date", label: "Release", title: "Release Date" },
  { key: "ci95", label: "95% CI", title: "95% Confidence Interval" },
];

const ORIGINAL_METRICS = [...METRICS];
const ORIGINAL_ADV_METRICS = [...ADV_METRICS];
let originalSelectedMetrics = new Set();
let originalSelectedAdvMetrics = new Set();

function switchCategory(cat) {
  if (currentCategory === "llms" && cat !== "llms") {
    originalSelectedMetrics = new Set(selectedMetrics);
    originalSelectedAdvMetrics = new Set(selectedAdvMetrics);
  }
  currentCategory = cat;

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.cat === cat);
  });

  METRICS.length = 0;
  ADV_METRICS.length = 0;
  selectedMetrics.clear();
  selectedAdvMetrics.clear();

  if (cat === "llms") {
    METRICS.push(...ORIGINAL_METRICS);
    ADV_METRICS.push(...ORIGINAL_ADV_METRICS);
    sortState = { key: "sum", dir: "desc" };
    originalSelectedMetrics.forEach((k) => selectedMetrics.add(k));
    originalSelectedAdvMetrics.forEach((k) => selectedAdvMetrics.add(k));
    $nullZeroChk.closest(".controls-options").style.display = "block";
  } else {
    METRICS.push(...MEDIA_METRICS);
    ADV_METRICS.push(...MEDIA_ADV_METRICS);
    sortState = { key: "elo", dir: "desc" };
    MEDIA_METRICS.forEach((m) => selectedMetrics.add(m.key));
    MEDIA_ADV_METRICS.forEach((m) => selectedAdvMetrics.add(m.key));
    $nullZeroChk.closest(".controls-options").style.display = "none";
  }

  $metricsControls.innerHTML = "";
  $advMetricsControls.innerHTML = "";
  createCheckboxes(METRICS, $metricsControls, selectedMetrics);
  createCheckboxes(ADV_METRICS, $advMetricsControls, selectedAdvMetrics);

  fetchData(false);
}

// --- Initialization ---
function init() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => switchCategory(e.target.dataset.cat));
  });

  createCheckboxes(METRICS, $metricsControls, selectedMetrics);
  createCheckboxes(ADV_METRICS, $advMetricsControls, selectedAdvMetrics);

  $refreshBtn.addEventListener("click", () => fetchData(true));
  $nullZeroChk.addEventListener("change", render);
  $searchInput.addEventListener("input", () => setTimeout(render, 300));
  document
    .getElementById("viewJsonBtn")
    .addEventListener("click", () => window.open("/api/llms", "_blank"));

  document.getElementById("viewJsonBtn").addEventListener(
    "click",
    (e) => {
      if (currentCategory !== "llms") {
        e.stopPropagation();
        window.open("/api/media/" + currentCategory, "_blank");
      }
    },
    true,
  );

  document.getElementById("selectAllBtn").addEventListener("click", () => {
    // Benchmark Metrics (Summed)
    METRICS.forEach((m) => {
      selectedMetrics.add(m.key);
      const el = document.getElementById(`chk_${m.key}`);
      if (el) el.checked = true;
    });

    // Advanced Info
    ADV_METRICS.forEach((m) => {
      selectedAdvMetrics.add(m.key);
      const el = document.getElementById(`chk_${m.key}`);
      if (el) el.checked = true;
    });

    render();
  });

  fetchData(false);
}

function createCheckboxes(list, container, set) {
  list.forEach((m) => {
    const div = document.createElement("div");
    div.className = "metric-checkbox";
    const id = `chk_${m.key}`;
    div.innerHTML = `<label title="${m.title}"><input type="checkbox" id="${id}" ${set.has(m.key) ? "checked" : ""}> ${m.label}</label>`;
    container.appendChild(div);
    document.getElementById(id).addEventListener("change", (e) => {
      e.target.checked ? set.add(m.key) : set.delete(m.key);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(render, 300);
      render();
    });
  });
}

// --- Data Fetching ---
async function fetchData(refresh = false) {
  try {
    $refreshBtn.disabled = true;
    $refreshSpinner.style.display = "inline-block";
    const targetEndpoint =
      currentCategory === "llms"
        ? `/api/llms?refresh=${refresh}`
        : `/api/media/${currentCategory}?refresh=${refresh}`;
    const _fetch = window.fetch;
    window.fetch = async (url) => {
      window.fetch = _fetch;
      return _fetch(url.includes("/api/llms") ? targetEndpoint : url);
    };

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
const parseNum = (v) =>
  v !== null && v !== undefined && !isNaN(Number(v)) ? Number(v) : null;
const formatNum = (n) =>
  n === null ? "—" : Number(n).toFixed(2).replace(/\.00$/, "");
const formatPrice = (n) => (n === null ? "—" : "$" + Number(n).toFixed(2));

const parseReleaseDate = (dateStr) => {
  if (!dateStr) return null;
  // Handle ISO format "YYYY-MM-DD" or "YYYY-MM"
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1; // JS months are 0-indexed
    const day = isoMatch[3] ? parseInt(isoMatch[3], 10) : 1;
    return new Date(year, month, day).getTime();
  }
  // Handle "Mon YYYY" format like "Apr 2025"
  const namedMatch = dateStr.match(/^([A-Za-z]{3})\s+(\d{4})$/);
  if (namedMatch) {
    const months = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const month = months[namedMatch[1].toLowerCase().slice(0, 3)];
    const year = parseInt(namedMatch[2], 10);
    if (month !== undefined) return new Date(year, month, 1).getTime();
  }
  // Fallback: try native Date parsing
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed.getTime();
};

function getVal(item, key) {
  if (key === "sum") return item.sum_score;
  if (key === "perf_avg") {
    let t = item.ttfa;
    let o = item.ops;
    return t !== null && o !== null ? (t + o) / 2 : null;
  }
  if (key === "elo") return item.metric_values?.elo ?? null;
  if (key === "appearances") return item.metric_values?.appearances ?? null;
  if (key === "rank") return item.metric_values?.rank ?? null;
  if (key === "ci95") return item.ci95 ?? null;

  if (item.metric_values && item.metric_values[key] !== undefined)
    return item.metric_values[key];
  if (key === "release_date") return item.release_date;
  if (key === "ops") return item.ops;
  if (key === "ttf") return item.ttf;
  if (key === "ttfa") return item.ttfa;

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
  let list = rawData
    .map((item) => {
      let sum = 0;
      let missing = [];
      METRICS.forEach((m) => {
        if (selectedMetrics.has(m.key)) {
          const val = parseNum(item.metric_values[m.key]);
          if (val !== null) sum += val;
          else missing.push(m.label);
        }
      });
      // Advanced Info columns bhi missing count mein include (taake jis column mein "—" aa raha ho badge match kare)
      ADV_METRICS.forEach((m) => {
        if (selectedAdvMetrics.has(m.key)) {
          const rawVal = getVal(item, m.key);

          const isMissing =
            m.key === "release_date"
              ? rawVal === null || rawVal === undefined || rawVal === ""
              : parseNum(rawVal) === null;

          if (isMissing) missing.push(m.label);

          if (m.key === "ci95" && rawVal !== null && rawVal !== "")
            missing.splice(missing.indexOf(m.label), 1);
        }
      });
      return { ...item, computedSum: sum, missing };
    })
    .filter((item) => {
      return (
        (item.display_name || "").toLowerCase().includes(query) ||
        (item.creator?.name || "").toLowerCase().includes(query)
      );
    });

  // 2. Sort
  list.sort((a, b) => {
    let va = sortState.key === "sum" ? a.computedSum : getVal(a, sortState.key);
    let vb = sortState.key === "sum" ? b.computedSum : getVal(b, sortState.key);

    // Handle nulls for sorting

    // Special handling for release_date sorting
    if (sortState.key === "release_date") {
      const dateA = parseReleaseDate(va);
      const dateB = parseReleaseDate(vb);
      if (dateA === null && dateB === null) return 0;
      if (dateA === null) return sortState.dir === "asc" ? 1 : -1;
      if (dateB === null) return sortState.dir === "asc" ? -1 : 1;
      return sortState.dir === "asc" ? dateA - dateB : dateB - dateA;
    }

    // For all other keys, ensure nulls sort to bottom
    if (va === null) va = -Infinity;
    if (vb === null) vb = -Infinity;

    if (va === null) va = -Infinity;
    if (vb === null) vb = -Infinity;

    if (typeof va === "string" || typeof vb === "string")
      return sortState.dir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));

    return sortState.dir === "asc" ? va - vb : vb - va;
  });

  $summary.innerHTML = `Showing <strong>${list.length}</strong> models. Sorted by ${sortState.key === "sum" ? "Sum Score" : sortState.key}.`;

  renderTable(list);
  renderCards(list);
}

function renderTable(list) {
  // Header
  const thead = document.querySelector("#resultsTable thead");
  thead.innerHTML = "";
  const tr = document.createElement("tr");

  const addTh = (key, text, isStatic = false) => {
    const th = document.createElement("th");
    th.textContent = text;
    if (isStatic) th.className = key === "rank" ? "col-rank" : "col-model";
    if (sortState.key === key) th.classList.add("active-sort");
    th.onclick = () => {
      if (sortState.key === key)
        sortState.dir = sortState.dir === "desc" ? "asc" : "desc";
      else sortState = { key, dir: "desc" };
      render();
    };
    tr.appendChild(th);
  };

  addTh("rank", "#", true);
  addTh("model", "Model", true);

  if (currentCategory === "llms") {
    addTh("sum", "Sum");
  }

  METRICS.filter((m) => selectedMetrics.has(m.key)).forEach((m) =>
    addTh(m.key, m.label),
  );
  ADV_METRICS.filter((m) => selectedAdvMetrics.has(m.key)).forEach((m) =>
    addTh(m.key, m.label),
  );
  thead.appendChild(tr);

  // Body
  $resultsBody.innerHTML = "";
  list.forEach((item, idx) => {
    const row = document.createElement("tr");

    // Rank
    row.innerHTML += `<td class="col-rank">${idx + 1}</td>`;

    // Model Name
    const modelName = item.display_name || item.name || "";
    const creatorName = item.creator?.name || "";

    const badgeHtml =
      item.missing.length > 0
        ? `<span class="badge-missing" title="Missing: ${item.missing.join(", ")}">${item.missing.length} missing</span>`
        : "";

    row.innerHTML += `
      <td class="col-model">
        <div class="model-cell">
          <div class="model-top">
            <span class="model-name">${modelName}</span>
            ${badgeHtml}
          </div>
          <div class="model-creator">${creatorName}</div>
        </div>
      </td>
    `;
    if (currentCategory === "llms") {
      // Sum
      row.innerHTML += `<td><strong>${formatNum(item.computedSum)}</strong></td>`;
    }

    // Metrics
    METRICS.filter((m) => selectedMetrics.has(m.key)).forEach((m) => {
      row.innerHTML += `<td>${formatNum(item.metric_values[m.key])}</td>`;
    });

    // Advanced
    ADV_METRICS.filter((m) => selectedAdvMetrics.has(m.key)).forEach((m) => {
      const val = getVal(item, m.key);
      let display = formatNum(val);
      if (m.key.includes("price")) display = formatPrice(val);

      if (m.key === "ci95") display = val || "—";

      if (m.key === "release_date") {
        if (!val) {
          display = "—";
        } else {
          // Parse and format as dd-mm-yyyy
          const date = new Date(val);
          if (!isNaN(date.getTime())) {
            const dd = String(date.getDate()).padStart(2, "0");
            const mm = String(date.getMonth() + 1).padStart(2, "0");
            const yyyy = date.getFullYear();
            display = `${dd}-${mm}-${yyyy}`;
          } else {
            display = val; // fallback to raw value
          }
        }
      }
      row.innerHTML += `<td>${display}</td>`;
    });

    $resultsBody.appendChild(row);
  });
}

function renderCards(list) {
  const isMedia = currentCategory !== "llms";
  document.documentElement.style.setProperty(
    "--media-view-display",
    isMedia ? "none" : "flex",
  );

  $cardsContainer.innerHTML = "";
  list.forEach((item, idx) => {
    const card = document.createElement("div");
    card.className = "card";

    // Build mini stats grid
    let statsHtml = "";
    METRICS.filter((m) => selectedMetrics.has(m.key))
      .slice(0, 6)
      .forEach((m) => {
        const val = formatNum(item.metric_values[m.key]);
        statsHtml += `<div class="mini-stat"><span>${m.label}</span><strong>${val}</strong></div>`;
      });

    // Add release date to card if selected
    if (selectedAdvMetrics.has("release_date")) {
      const rawDate = getVal(item, "release_date");
      let dateDisplay = "—";
      if (rawDate) {
        const date = new Date(rawDate);
        if (!isNaN(date.getTime())) {
          const dd = String(date.getDate()).padStart(2, "0");
          const mm = String(date.getMonth() + 1).padStart(2, "0");
          const yyyy = date.getFullYear();
          dateDisplay = `${dd}-${mm}-${yyyy}`;
        }
      }
      statsHtml += `<div class="mini-stat"><span>Released</span><strong>${dateDisplay}</strong></div>`;
    }

    card.innerHTML = `
      <div class="card-header">
        <div>
          <div class="card-title">${item.display_name || item.name}</div>
          <div class="card-creator">${item.creator?.name || "Unknown"}</div>
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
