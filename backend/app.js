import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { loadState, saveState } from './storage.js';

// ===== Stripe (live) — apenas no backend, via variável de ambiente =====
const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || '').trim();
const STRIPE_PUBLISHABLE_KEY = (process.env.STRIPE_PUBLISHABLE_KEY || '').trim();
const HAS_KEY = Boolean(STRIPE_SECRET_KEY);
const MODE = HAS_KEY ? 'stripe' : 'mock';
const WEBHOOK_READY = false;

const USDT_WALLET_ADDRESS = (process.env.USDT_WALLET_ADDRESS || '').trim() || 'TKrHKch9gjZwmcmLF3CiAgNVHh2i9mrx5L';
const USDT_NETWORK = 'TRON (TRC20)';

const MIN_DONATION = 10;
const MAX_DONATION = 10000;

const PAYMENT_METHODS = ['pix', 'usdt', 'credit_card'];
const SOCIAL_NETWORKS = ['instagram', 'youtube', 'linkedin', 'facebook', 'tiktok', 'kwai', 'x', 'site'];
const SOCIAL_BASE_URLS = {
  instagram: 'https://instagram.com/',
  youtube: 'https://youtube.com/',
  linkedin: 'https://linkedin.com/in/',
  facebook: 'https://facebook.com/',
  tiktok: 'https://tiktok.com/',
  kwai: 'https://www.kwai.com/',
  x: 'https://x.com/',
  site: 'https://',
};
const SOCIAL_LABELS = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  kwai: 'Kwai',
  x: 'X',
  site: 'Site ou Blogger',
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
  return { donations: [], charges: {}, comments: [], votes: [], promotions: [] };
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
    publishableKey: STRIPE_PUBLISHABLE_KEY || null,
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

function encodeForm(obj, prefix = '') {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(obj || {})) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      encodeForm(value, fullKey).forEach((v, k) => params.append(k, v));
    } else if (Array.isArray(value)) {
      value.forEach((item) => params.append(`${fullKey}[]`, item));
    } else if (value !== undefined && value !== null && value !== '') {
      params.append(fullKey, value);
    }
  }
  return params;
}

async function stripe(pathname, options = {}) {
  const body = options.body ? encodeForm(options.body).toString() : undefined;
  const res = await fetch('https://api.stripe.com/v1' + pathname, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    signal: AbortSignal.timeout(25000),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
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

// Webhook do Stripe — registrado ANTES do express.json()
app.get('/api/webhook/stripe', (req, res) => res.status(200).json({ ok: true }));

app.post('/api/webhook/stripe', express.json({ type: () => true }), async (req, res) => {
  const event = req.body || {};
  const intentId = event?.data?.object?.id;
  const eventType = event?.type;
  if (!intentId || eventType !== 'payment_intent.succeeded') return res.status(200).json({ ok: true, ignored: true });
  const charge = Object.values(state.charges).find((c) => c.stripeIntentId === intentId);
  if (!charge) return res.status(200).json({ ok: true, ignored: true });
  charge.status = 'PAID';
  await saveState(state);
  if (charge.type === 'promotion') await recordPromotion(charge);
  return res.status(200).json({ ok: true });
});

app.use(express.json());

app.get('/api/health', (req, res) =>
  res.json({
    ok: true,
    mode: MODE,
    webhookConfigured: WEBHOOK_READY,
    publishableKey: STRIPE_PUBLISHABLE_KEY || null,
  })
);

app.get('/api/state', (req, res) => res.json(computeState()));

// ===== divulgação paga (PIX/Cartão via Stripe / USDT TRC20 manual) =====
app.post('/api/promote', async (req, res) => {
  const { name, network, handle, amount, method } = req.body || {};
  const cleanName = String(name || '').trim().slice(0, 40);
  const cleanNetwork = String(network || '').trim().toLowerCase();
  const cleanHandle = String(handle || '').trim().slice(0, 120);
  const value = Number(amount);
  const cleanMethod = String(method || 'pix').trim().toLowerCase();

  if (!cleanName) return res.status(400).json({ error: 'Informe um nome para divulgar.' });
  if (!SOCIAL_NETWORKS.includes(cleanNetwork)) return res.status(400).json({ error: 'Rede social inválida.' });
  if (!cleanHandle) return res.status(400).json({ error: 'Informe seu usuário ou o link do perfil.' });
  if (!PAYMENT_METHODS.includes(cleanMethod)) return res.status(400).json({ error: 'Forma de pagamento inválida.' });
  if (!Number.isFinite(value) || value < MIN_DONATION || value > MAX_DONATION) {
    return res.status(422).json({ error: `Divulgação de R$ ${MIN_DONATION},00 a R$ ${MAX_DONATION},00.` });
  }

  const social = { name: cleanName, network: cleanNetwork, handle: cleanHandle };

  try {
    // ---- USDT (TRC20) — pagamento manual, sempre disponível ----
    if (cleanMethod === 'usdt') {
      const reference = newReference();
      const charge = {
        reference,
        type: 'promotion',
        method: 'usdt',
        amount: value,
        status: 'PENDING',
        manual: true,
        usdtAddress: USDT_WALLET_ADDRESS,
        usdtNetwork: USDT_NETWORK,
        mock: MODE !== 'stripe',
        ts: Date.now(),
        social,
      };
      state.charges[reference] = charge;
      await saveState(state);
      return res.json({ mode: MODE, ...charge });
    }

    // ---- modo demonstração (PIX/Cartão simulados) ----
    if (MODE !== 'stripe') {
      const reference = newReference();
      const charge = {
        reference,
        type: 'promotion',
        method: cleanMethod,
        amount: value,
        status: 'PENDING',
        mock: true,
        ts: Date.now(),
        social,
      };
      if (cleanMethod === 'pix') {
        charge.qrCodeText = `00020126580014BR.GOV.BCB.PIX0136${reference.toUpperCase()}52040000530398654${String(value.toFixed(2)).replace('.', '')}5802BR5913SIMULACAO6009DEMO2027622507DEMO0016304A01`;
      }
      state.charges[reference] = charge;
      await saveState(state);
      return res.json({ mode: 'mock', ...charge });
    }

    // ---- modo real (Stripe) ----
    const reference = newReference();
    const p = await stripe('/payment_intents', {
      method: 'POST',
      body: {
        amount: Math.round(value * 100),
        currency: 'brl',
        payment_method_types: [cleanMethod === 'credit_card' ? 'card' : 'pix'],
        metadata: { reference },
        description: `Divulgação · ${cleanName}`,
      },
    });
    if (p.status !== 200) {
      const msg = p.data?.error?.message || 'Stripe não aceitou a cobrança.';
      return res.status(502).json({ error: msg });
    }

    const charge = {
      reference,
      stripeIntentId: p.data.id,
      type: 'promotion',
      method: cleanMethod,
      amount: value,
      status: 'PENDING',
      social,
      ts: Date.now(),
    };

    state.charges[reference] = charge;
    await saveState(state);
    return res.json({ mode: 'stripe', clientSecret: p.data.client_secret, ...charge });
  } catch (err) {
    console.error('promote error:', err.message);
    return res.status(500).json({ error: 'Falha ao gerar a divulgação. Tente novamente.' });
  }
});

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

// ===== consultar status (promoção PIX/Cartão) =====
app.get('/api/charge/:reference', async (req, res) => {
  const { reference } = req.params;
  const charge = state.charges[reference];
  if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada.' });

  if (charge.mock) return res.json({ charge, state: computeState() });

  if (isPaidStatus(charge.status)) {
    if (charge.type === 'promotion') return res.json({ charge, ...(await recordPromotion(charge)) });
    return res.json({ charge, state: computeState() });
  }

  if (!charge.stripeIntentId) return res.json({ charge, state: computeState() });

  try {
    const q = await stripe(`/payment_intents/${charge.stripeIntentId}`);
    const newStatus = q.data?.status === 'succeeded' ? 'PAID' : 'PENDING';
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
  if (MODE === 'stripe') return res.status(403).json({ error: 'Simulação disponível apenas no modo demonstração.' });
  const charge = state.charges[req.params.reference];
  if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada.' });
  charge.status = 'PAID';
  await saveState(state);
  if (charge.type === 'promotion') return res.json({ charge, ...(await recordPromotion(charge)) });
  return res.json({ charge, state: computeState() });
});

// ===== confirmar pagamento manual (USDT) =====
app.post('/api/charge/:reference/confirm', async (req, res) => {
  const charge = state.charges[req.params.reference];
  if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada.' });
  if (isPaidStatus(charge.status)) {
    if (charge.type === 'promotion') return res.json({ charge, ...(await recordPromotion(charge)) });
    return res.json({ charge, state: computeState() });
  }
  if (!charge.manual) return res.status(403).json({ error: 'Esta cobrança não aceita confirmação manual.' });
  charge.status = 'PAID';
  charge.confirmedTs = Date.now();
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
