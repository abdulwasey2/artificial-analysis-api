const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const PORT = process.env.PORT || 3000;
// Hosting URL zaroor set karein taake self-ping kaam kare
const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`; 
const API_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models';
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '600', 10);
const OVERRIDES_PATH = path.join(__dirname, 'overrides.json');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// --- Keep-Alive Mechanism (Cron Job Solution) ---
// Har 14 minute (840000 ms) baad khud ko ping karega
const KEEP_ALIVE_INTERVAL = 14 * 60 * 1000; 

function startKeepAlive() {
  setInterval(async () => {
    try {
      console.log(`[Keep-Alive] Pinging ${APP_URL}/api/ping to keep server awake...`);
      const resp = await fetch(`${APP_URL}/api/ping`);
      if (resp.ok) {
        console.log(`[Keep-Alive] Ping successful at ${new Date().toISOString()}`);
      } else {
        console.warn(`[Keep-Alive] Ping returned status: ${resp.status}`);
      }
    } catch (err) {
      console.error(`[Keep-Alive] Ping failed: ${err.message}`);
    }
  }, KEEP_ALIVE_INTERVAL);
}

// Lightweight endpoint for keep-alive
app.get('/api/ping', (req, res) => {
  res.status(200).send('pong');
});

// --- Main Application Logic ---

const METRICS = [
  'artificial_analysis_intelligence_index',
  'artificial_analysis_coding_index',
  'artificial_analysis_math_index',
  'lcr', 'hle', 'mmlu_pro', 'gpqa', 'livecodebench',
  'scicode', 'math_500', 'aime', 'aime_25',
  'ifbench', 'tau2', 'terminalbench_hard'
];

let cache = null;
let cacheTimestamp = 0;
let overridesIndex = {}; 

function loadOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_PATH)) {
      const txt = fs.readFileSync(OVERRIDES_PATH, 'utf8');
      const raw = JSON.parse(txt);
      overridesIndex = {};
      for (const k of Object.keys(raw)) {
        overridesIndex[String(k).toLowerCase()] = raw[k];
      }
      console.log(`Loaded overrides.json (${Object.keys(raw).length} keys)`);
    }
  } catch (e) {
    console.error('Failed to load overrides.json:', e);
  }
}
loadOverrides();

function parseNumberLike(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const match = v.match(/-?[\d,.]+/);
    if (!match) return null;
    const n = Number(match[0].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function findOverrideForModel(m) {
  const candidates = [];
  if (m.id) candidates.push(String(m.id));
  if (m.slug) candidates.push(String(m.slug));
  if (m.name) candidates.push(String(m.name));
  if (m.model_creator && m.model_creator.id && m.slug) candidates.push(`${m.model_creator.id}/${m.slug}`);
  
  for (const c of candidates) {
    const lc = String(c).toLowerCase();
    if (lc in overridesIndex) return { data: overridesIndex[lc] };
  }
  return null;
}

app.get('/api/llms', async (req, res) => {
  try {
    const refresh = req.query.refresh === 'true';
    
    if (cache && !refresh && (Date.now() - cacheTimestamp) < CACHE_TTL_SECONDS * 1000) {
      return res.json(cache);
    }

    const API_KEY = process.env.AA_API_KEY;
    const headers = { 'Accept': 'application/json' };
    if (API_KEY) headers['x-api-key'] = API_KEY;

    console.log(`Fetching data from upstream...`);
    const resp = await fetch(API_URL, { headers });
    
    if (resp.status !== 200) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: 'Upstream error', body: text });
    }

    const body = await resp.json();
    const rawData = body.data || [];

    const processed = rawData.map(m => {
      const evals = m.evaluations || {};
      let sum = 0;
      const missing_keys = [];
      const values = {};

      METRICS.forEach(k => {
        const v = evals[k];
        const num = parseNumberLike(v);
        if (num !== null) {
          values[k] = num;
          sum += num;
        } else {
          values[k] = null;
          missing_keys.push(k);
        }
      });

      // Defaults
      let release_date = m.release_date ?? null;
      let pricing = m.pricing ?? null;
      let ops = m.median_output_tokens_per_second ?? null;
      let ttf = m.median_time_to_first_token_seconds ?? null;
      let ttfa = m.median_time_to_first_answer_token ?? null;

      // Overrides
      const ovMatch = findOverrideForModel(m);
      if (ovMatch && ovMatch.data) {
        const ov = ovMatch.data;
        if (ov.pricing !== undefined) pricing = ov.pricing;
        if (ov.median_output_tokens_per_second !== undefined) ops = ov.median_output_tokens_per_second;
        if (ov.release_date !== undefined) release_date = ov.release_date;
        // Added override support for TTF and TTFA
        if (ov.median_time_to_first_token_seconds !== undefined) ttf = ov.median_time_to_first_token_seconds;
        if (ov.median_time_to_first_answer_token !== undefined) ttfa = ov.median_time_to_first_answer_token;
      }

      return {
        id: m.id,
        name: m.name,
        display_name: m.display_name || m.name,
        creator: m.model_creator,
        metric_values: values,
        missing_keys,
        sum_score: sum,
        release_date,
        pricing,
        ops, ttf, ttfa
      };
    });

    processed.sort((a, b) => b.sum_score - a.sum_score);

    const result = {
      status: 200,
      fetched_at: new Date().toISOString(),
      data: processed
    };

    cache = result;
    cacheTimestamp = Date.now();
    res.json(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}/`);
  // Server start hote hi keep-alive shuru karein
  startKeepAlive();
});