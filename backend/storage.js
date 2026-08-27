import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Vercel KV (Upstash) — usado quando as variáveis estão presentes
const KV_URL = process.env.KV_REST_API_URL || process.env.KV_URL || '';
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.KV_TOKEN || '';
const USE_KV = Boolean(KV_URL && KV_TOKEN);

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function emptyState() {
  return { donations: [], charges: {}, comments: [] };
}

async function kvGet(key) {
  const res = await fetch(`${KV_URL}/get/${key}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const data = await res.json();
  return data?.result && data.result !== 'null' ? data.result : null;
}

async function kvSet(key, value) {
  await fetch(`${KV_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  });
}

export async function loadState() {
  if (USE_KV) {
    try {
      const raw = await kvGet('state');
      if (raw) return { ...emptyState(), ...JSON.parse(raw) };
    } catch (err) {
      console.error('KV load error:', err.message);
    }
    return emptyState();
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    return emptyState();
  }
}

export async function saveState(state) {
  if (USE_KV) {
    try {
      await kvSet('state', JSON.stringify(state));
      return;
    } catch (err) {
      console.error('KV save error:', err.message);
    }
  }
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = STATE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
    fs.renameSync(tmp, STATE_FILE);
  } catch (err) {
    console.error('file save error:', err.message);
  }
}
