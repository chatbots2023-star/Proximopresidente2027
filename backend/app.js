import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { loadState, saveState } from './storage.js';

// ===== Asaas (sandbox) — apenas no backend, via variável de ambiente =====
const ASAAS_API_TOKEN = (process.env.ASAAS_API_TOKEN || '').trim();
const ASAAS_WALLET_ID = (process.env.ASAAS_WALLET_ID || '').trim();
const ASAAS_BASE = (process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/+$/, '');
const HAS_KEY = Boolean(ASAAS_API_TOKEN) && Boolean(ASAAS_WALLET_ID);
const MODE = HAS_KEY ? 'asaas' : 'mock';
const WEBHOOK_READY = HAS_KEY;

const ASAAS_GENERIC_CPF = '52998224725';
const ASAAS_GENERIC_EMAIL = 'apoiador@proximopresidente.com.br';

const MIN_DONATION = 10;
const MAX_DONATION = 10000;

const SOCIAL_NETWORKS = ['instagram', 'youtube', 'linkedin', 'facebook', 'tiktok', 'kwai', 'x'];
const SOCIAL_BASE_URLS = {
  instagram: 'https://instagram.com/',
  youtube: 'https://youtube.com/',
  linkedin: 'https://linkedin.com/in/',
  facebook: 'https://facebook.com/',
  tiktok: 'https://tiktok.com/',
  kwai: 'https://www.kwai.com/',
  x: 'https://x.com/',
};
const SOCIAL_LABELS = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  kwai: 'Kwai',
  x: 'X',
};
const SOCIAL_NEEDS_AT = ['youtube', 'tiktok', 'kwai'];

function buildProfileUrl(network, input) {
  const raw = String(input || '').trim();
  if (/^https?:\/\//i.test(raw) || raw.startsWith('www.')) {
    return /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
  }
  const handle = raw.replace(/^@/, '');
  const prefix = SOCIAL_BASE_URLS[network] || SOCIAL_BASE_URLS.instagram;
  return prefix + (SOCIAL_NEEDS_AT.includes(network) ? '@' : '') + handle;
}

const CANDIDATES = [
  { id: 'lula', number: '13', name: 'Luiz Inácio Lula da Silva', short: 'Lula', party: 'PT', color: '#D00027' },
  { id: 'flavio-bolsonaro', number: '22', name: 'Flávio Bolsonaro', short: 'Flávio Bolsonaro', party: 'PL', color: '#2A3B8F' },
  { id: 'caiado', number: '55', name: 'Ronaldo Caiado', short: 'Caiado', party: 'PSD', color: '#0B5BA5' },
  { id: 'renan-santos', number: '90', name: 'Renan Santos', short: 'Renan Santos', party: 'Missão', color: '#6C3AB8' },
  { id: 'zema', number: '30', name: 'Romeu Zema', short: 'Zema', party: 'Novo', color: '#F5821F' },
  { id: 'marcal', number: '28', name: 'Pablo Marçal', short: 'Marçal', party: 'PRTB', color: '#1B9E4B' },
  { id: 'edmilson-costa', number: '21', name: 'Edmilson Costa', short: 'Edmilson Costa', party: 'PCB', color: '#C8102E' },
  { id: 'cury', number: '70', name: 'Augusto Cury', short: 'Augusto Cury', party: 'Avante', color: '#0E7C86' },
  { id: 'barao', number: '27', name: 'Clariana Barão', short: 'Clariana Barão', party: 'DC', color: '#3A5BA0' },
  { id: 'hertz-dias', number: '16', name: 'Hertz Dias', short: 'Hertz Dias', party: 'PSTU', color: '#B3001B' },
  { id: 'pimenta', number: '29', name: 'Rui Costa Pimenta', short: 'Rui Costa Pimenta', party: 'PCO', color: '#A00000' },
  { id: 'samara-martins', number: '80', name: 'Samara Martins', short: 'Samara Martins', party: 'UP', color: '#8E1E3C' },
  { id: 'wilson-grassi', number: '10', name: 'Wilson Grassi', short: 'Wilson Grassi', party: 'Democrata', color: '#123C74' },
];

function emptyState() {
  return { donations: [], charges: {}, comments: [], votes: [], promotions: [], asaasCustomerId: null };
}

let state = await loadState();

function getCandidate(id) {
  return CANDIDATES.find((c) => c.id === id);
}

function computeState() {
  const totalVotes = state.votes.length;
  const counts = {};
  for (const v of state.votes) {
    counts[v.candidateId] = (counts[v.candidateId] || 0) + 1;
  }
  const candidates = CANDIDATES.map((c) => ({
    ...c,
    votes: counts[c.id] || 0,
    pct: totalVotes ? Math.round(((counts[c.id] || 0) / totalVotes) * 1000) / 10 : 0,
  })).sort((a, b) => b.votes - a.votes || a.number.localeCompare(b.number));

  const topSupporters = state.promotions
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20)
    .map((p) => ({
      id: p.id,
      name: p.name,
      network: p.network,
      networkLabel: SOCIAL_LABELS[p.network] || p.network,
      handle: p.handle,
      profileUrl: p.profileUrl,
      amount: p.amount,
      ts: p.ts,
    }));

  return {
    mode: MODE,
    webhookConfigured: WEBHOOK_READY,
    totalVotes,
    totalSupporters: totalVotes,
    candidates,
    topSupporters,
    recent: [],
  };
}

// ===== helpers =====
function newReference() {
  return 'br' + crypto.randomBytes(10).toString('hex');
}

function isPaidStatus(status) {
  return status === 'PAID';
}

async function recordPromotion(charge) {
  if (state.promotions.some((p) => p.id === charge.reference)) {
    return { already: true, state: computeState() };
  }
  const promotion = {
    id: charge.reference,
    name: charge.social.name,
    network: charge.social.network,
    handle: charge.social.handle,
    profileUrl: buildProfileUrl(charge.social.network, charge.social.handle),
    amount: charge.amount,
    ts: Date.now(),
  };
  state.promotions.push(promotion);
  await saveState(state);
  return { promotion, state: computeState() };
}

// ===== app =====
const app = express();

// OPTIONS explícito (200) — o adaptador Netlify não aceita 204, e o preflight de
// validadores externos cai no OPTIONS. Deve ser registrado ANTES do cors() e de qualquer rota.
app.options('*', (req, res) => res.status(200).end());

app.use(cors());

app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, mode: MODE, webhookConfigured: WEBHOOK_READY }));

app.get('/api/state', (req, res) => res.json(computeState()));

// ===== voto único por IP =====
function clientIp(req) {
  return (
    req.get('x-nf-client-connection-ip') ||
    (req.get('x-forwarded-for') || '').split(',')[0].trim() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

app.post('/api/vote', async (req, res) => {
  const { candidateId } = req.body || {};
  const candidate = getCandidate(candidateId);
  if (!candidate) return res.status(400).json({ error: 'Candidato inválido.' });

  const ip = clientIp(req);
  if (state.votes.some((v) => v.ip === ip)) {
    return res.json({
      ok: false,
      already: true,
      message: 'Agradecemos pelo seu voto, Obrigado!',
      state: computeState(),
    });
  }
  state.votes.push({ ip, candidateId, ts: Date.now() });
  await saveState(state);
  return res.json({ ok: true, already: false, vote: { candidateId }, state: computeState() });
});

// ===== consultar status (promoção PIX) =====
app.get('/api/charge/:reference', async (req, res) => {
  const { reference } = req.params;
  const charge = state.charges[reference];
  if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada.' });

  if (charge.mock) return res.json({ charge, state: computeState() });

  if (isPaidStatus(charge.status)) {
    if (charge.type === 'promotion') return res.json({ charge, ...(await recordPromotion(charge)) });
    return res.json({ charge, state: computeState() });
  }

  if (!charge.asaasId) return res.json({ charge, state: computeState() });

  try {
    const q = await asaas(`/payments/${charge.asaasId}`);
    const newStatus = q.data?.status === 'RECEIVED' || q.data?.status === 'CONFIRMED' ? 'PAID' : 'PENDING';
    if (newStatus !== charge.status) {
      charge.status = newStatus;
      await saveState(state);
    }
    if (isPaidStatus(newStatus) && charge.type === 'promotion') {
      return res.json({ charge, ...(await recordPromotion(charge)) });
    }
    return res.json({ charge, state: computeState() });
  } catch (err) {
    return res.json({ charge, state: computeState(), queryError: true });
  }
});

// ===== simular pagamento (somente em modo demonstração) =====
app.post('/api/charge/:reference/simulate', async (req, res) => {
  if (MODE === 'asaas') return res.status(403).json({ error: 'Simulação disponível apenas no modo demonstração.' });
  const charge = state.charges[req.params.reference];
  if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada.' });
  charge.status = 'PAID';
  await saveState(state);
  if (charge.type === 'promotion') return res.json({ charge, ...(await recordPromotion(charge)) });
  return res.json({ charge, state: computeState() });
});

// ===== comentários =====
app.get('/api/comments', (req, res) => {
  res.json({ comments: state.comments.slice(-60).reverse() });
});

app.post('/api/comments', async (req, res) => {
  const { name, message, candidateId } = req.body || {};
  const cleanName = String(name || '').trim().slice(0, 40);
  const cleanMsg = String(message || '').trim().slice(0, 280);
  if (!cleanName) return res.status(400).json({ error: 'Digite seu nome.' });
  if (!cleanMsg) return res.status(400).json({ error: 'Digite uma mensagem.' });

  const comment = {
    id: 'c' + crypto.randomBytes(6).toString('hex'),
    name: cleanName,
    message: cleanMsg,
    candidateId: getCandidate(candidateId) ? candidateId : null,
    ts: Date.now(),
  };
  state.comments.push(comment);
  await saveState(state);
  return res.status(201).json({ comment });
});

export { app };
