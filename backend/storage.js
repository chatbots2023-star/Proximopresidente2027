import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));

// Netlify Blobs — armazenamento persistente nativo do Netlify
let blobsStore = null;
let blobsTried = false;

async function getBlobsStore() {
  if (blobsTried) return blobsStore;
  blobsTried = true;
  try {
    const { getStore } = await import('@netlify/blobs');
    blobsStore = getStore({ name: 'proximopresidente' });
    await blobsStore.get('__ping__');
  } catch (err) {
    console.error('Netlify Blobs indisponível:', err.message);
    blobsStore = null;
  }
  return blobsStore;
}

const DATA_DIR = path.join(CURRENT_DIR, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function emptyState() {
  return { donations: [], charges: {}, comments: [] };
}

export async function loadState() {
  try {
    const store = await getBlobsStore();
    if (store) {
      const raw = await store.get('state', { type: 'text' });
      if (raw) return { ...emptyState(), ...JSON.parse(raw) };
      return emptyState();
    }
  } catch (err) {
    console.error('Blobs load error:', err.message);
  }
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    return { ...emptyState(), ...JSON.parse(raw) };
  } catch {
    return emptyState();
  }
}

export async function saveState(state) {
  try {
    const store = await getBlobsStore();
    if (store) {
      await store.set('state', JSON.stringify(state));
      return;
    }
  } catch (err) {
    console.error('Blobs save error:', err.message);
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
