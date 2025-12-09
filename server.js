// server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

const PORT = process.env.PORT || 3000;
const API_URL = 'https://artificialanalysis.ai/api/v2/data/llms/models';
const CACHE_TTL_SECONDS = parseInt(process.env.CACHE_TTL_SECONDS || '600', 10);
const OVERRIDES_PATH = path.join(__dirname, 'overrides.json');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Updated Metrics List based on your request
const METRICS = [
  'artificial_analysis_intelligence_index',
  'artificial_analysis_coding_index',
  'artificial_analysis_math_index',
  'lcr',
  'hle',
  'mmlu_pro',
  'gpqa',
  'livecodebench',
  'scicode',
  'math_500',
  'aime',
  'aime_25',
  'ifbench',
  'tau2',
  'terminalbench_hard'
];

let cache = null;
let cacheTimestamp = 0;

let overridesRaw = {};
let overridesIndex = {}; 

function loadOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_PATH)) {
      const txt = fs.readFileSync(OVERRIDES_PATH, 'utf8');
      overridesRaw = JSON.parse(txt);
      overridesIndex = {};
      for (const k of Object.keys(overridesRaw)) {
        overridesIndex[String(k).toLowerCase()] = overridesRaw[k];
      }
      console.log(`Loaded overrides.json (${Object.keys(overridesRaw).length} keys)`);
    } else {
      console.log('No overrides.json found — continuing without overrides.');
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
  if (m.model_creator && m.model_creator.slug && m.slug) candidates.push(`${m.model_creator.slug}/${m.slug}`);
  
  for (const c of candidates) {
    const lc = String(c).toLowerCase();
    if (lc in overridesIndex) {
      return { key: c, data: overridesIndex[lc] };
    }
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
    if (!API_KEY) {
      console.warn("Warning: AA_API_KEY missing in .env file.");
      return res.status(500).json({ error: 'API Key missing on server' });
    }

    const headers = { 'Accept': 'application/json' };
    if (API_KEY) headers['x-api-key'] = API_KEY;

    console.log(`Fetching data from ${API_URL}...`);
    const resp = await fetch(API_URL, { headers });
    const text = await resp.text();
    
    let body;
    try { body = JSON.parse(text); } catch (e) { 
      return res.status(502).json({ error: 'Invalid JSON from upstream', body: text });
    }

    if (resp.status !== 200) {
      return res.status(resp.status).json({ error: body.error || 'Upstream error', body });
    }

    const rawData = body.data || [];
    console.log(`Fetched ${rawData.length} models.`);

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

      let release_date = m.release_date ?? null;
      let pricing = m.pricing ?? null;
      
      let median_output_tokens_per_second = m.median_output_tokens_per_second;
      if (median_output_tokens_per_second === undefined) median_output_tokens_per_second = null;

      let median_time_to_first_token_seconds = m.median_time_to_first_token_seconds;
      if (median_time_to_first_token_seconds === undefined) median_time_to_first_token_seconds = null;

      let median_time_to_first_answer_token = m.median_time_to_first_answer_token;
      if (median_time_to_first_answer_token === undefined) median_time_to_first_answer_token = null;

      const overrideMatch = findOverrideForModel(m);
      if (overrideMatch && overrideMatch.data) {
        const ov = overrideMatch.data;
        if (ov.pricing !== undefined) pricing = ov.pricing;
        if (ov.median_output_tokens_per_second !== undefined) median_output_tokens_per_second = ov.median_output_tokens_per_second;
        if (ov.median_time_to_first_token_seconds !== undefined) median_time_to_first_token_seconds = ov.median_time_to_first_token_seconds;
        if (ov.median_time_to_first_answer_token !== undefined) median_time_to_first_answer_token = ov.median_time_to_first_answer_token;
        if (ov.release_date !== undefined) release_date = ov.release_date;
      }

      return {
        id: m.id,
        name: m.name,
        display_name: m.display_name || m.name,
        slug: m.slug,
        creator: m.model_creator,
        evaluations: evals,
        metric_values: values,
        missing_keys,
        missing_count: missing_keys.length,
        sum_score: sum,
        release_date,
        pricing,
        median_output_tokens_per_second,
        median_time_to_first_token_seconds,
        median_time_to_first_answer_token
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
  console.log(`Server listening on http://localhost:${PORT}`);
});