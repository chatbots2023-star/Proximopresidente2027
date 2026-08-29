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
  const totals = {};
  const counts = {};
  for (const d of state.donations) {
    totals[d.candidateId] = (totals[d.candidateId] || 0) + d.amount;
    counts[d.candidateId] = (counts[d.candidateId] || 0) + 1;
  }
  const candidates = CANDIDATES.map((c) => ({
    ...c,
    total: totals[c.id] || 0,
    supporters: counts[c.id] || 0,
  })).sort((a, b) => b.total - a.total || a.number.localeCompare(b.number));

  const totalRaised = state.donations.reduce((s, d) => s + d.amount, 0);
  const recent = state.donations
    .slice(-12)
    .reverse()
    .map((d) => ({ id: d.id, candidateId: d.candidateId, amount: d.amount, method: d.method || 'pix', ts: d.ts, name: d.name || 'Apoiador(a)' }));

  const topSupporters = state.donations
    .filter((d) => d.network && d.profileUrl)
    .slice(-20)
    .sort((a, b) => b.amount - a.amount)
    .map((d) => ({
      id: d.id,
      name: d.name,
      network: d.network,
      networkLabel: SOCIAL_LABELS[d.network] || d.network,
      handle: d.handle,
      profileUrl: d.profileUrl,
      amount: d.amount,
      candidateId: d.candidateId,
      method: d.method,
      ts: d.ts,
    }));

  return { mode: MODE, webhookConfigured: WEBHOOK_READY, totalRaised, totalSupporters: state.donations.length, candidates, recent, topSupporters };
}

// ===== helpers Pepper =====
function newReference() {
  return 'br' + crypto.randomBytes(10).toString('hex');
}

function siteUrl(req) {
  const proto = req.get('x-forwarded-proto') || 'https';
  const host = req.get('x-forwarded-host') || req.get('host') || 'localhost:3001';
  return `${proto}://${host}`;
}

async function pepper(pathname, options = {}) {
  const res = await fetch(PEPPER_BASE + pathname, {
    method: options.method || 'GET',
    headers: {
      Authorization: `Bearer ${PEPPER_API_TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
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

function mapPepperStatus(status) {
  switch (status) {
    case 'paid':
      return 'PAID';
    case 'refunded':
      return 'REFUNDED';
    case 'refused':
      return 'REFUSED';
    case 'cancelled':
      return 'CANCELED';
    case 'chargeback':
      return 'CHARGEBACK';
    default:
      return 'PENDING';
  }
}

function isPaidStatus(status) {
  return status === 'PAID';
}

async function recordDonation(charge) {
  if (state.donations.some((d) => d.id === charge.reference)) {
    return { already: true, state: computeState() };
  }
  const before = computeState();
  state.donations.push({
    id: charge.reference,
    candidateId: charge.candidateId,
    amount: charge.amount,
    method: charge.method,
    mode: MODE,
    ts: Date.now(),
  });
  await saveState(state);
  const after = computeState();
  const fromIdx = before.candidates.findIndex((c) => c.id === charge.candidateId);
  const toIdx = after.candidates.findIndex((c) => c.id === charge.candidateId);
  return {
    donation: { reference: charge.reference, candidateId: charge.candidateId, amount: charge.amount, method: charge.method },
    from: fromIdx + 1,
    to: toIdx + 1,
    promoted: toIdx < fromIdx,
    isTop1: toIdx === 0,
    state: after,
  };
}

// ===== app =====
const app = express();

// OPTIONS explícito (200) — o adaptador Netlify não aceita 204, e o preflight de
// validadores externos cai no OPTIONS. Deve ser registrado ANTES do cors() e de qualquer rota.
app.options('*', (req, res) => res.status(200).end());

app.use(cors());

// Webhook da Pepper (versão 2.0 do payload) — registrado ANTES do express.json()
app.get('/api/webhook/pepper', (req, res) => res.status(200).json({ ok: true }));

app.post('/api/webhook/pepper', express.json({ type: 'application/json' }), async (req, res) => {
  const event = req.body || {};
  const transactionId = event?.transaction?.id;
  if (!transactionId) {
    return res.status(200).json({ ok: true, ignored: true, reason: 'sem transaction.id' });
  }

  const charge = Object.values(state.charges).find(
    (c) => c.pepperHash === transactionId || c.pepperTransactionId === transactionId
  );
  if (!charge) return res.status(200).json({ ok: true, ignored: true });

  const status = mapPepperStatus(event?.status || event?.transaction?.status || charge.status);
  if (status !== charge.status) {
    charge.status = status;
    await saveState(state);
  }
  if (isPaidStatus(status)) {
    await recordDonation(charge);
  }
  return res.status(200).json({ ok: true });
});

app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true, mode: MODE, webhookConfigured: WEBHOOK_READY }));

// Diagnóstico temporário — remove antes do deploy final
app.get('/api/debug/pepper', async (req, res) => {
  try {
    const r = await pepper('/');
    const body = {
      api_token: PEPPER_API_TOKEN,
      amount: 10000,
      payment_method: 'pix',
      installments: 1,
      cart: [{ title: 'Apoio · Teste', price: 10000, quantity: 1, operation_type: 1 }],
      customer: {
        name: 'Apoiador(a) Eleitoral',
        email: 'apoiador.presidente2027@gmail.com',
        phone_number: '11999999999',
        document: '52998224725',
      },
      webhook_url: 'https://proximopresidente2027br.netlify.app/api/webhook/pepper',
    };
    const p = await pepper('/transactions', { method: 'POST', body });
    const prod = await pepper('/products?perPage=50');
    res.json({ status: r.status, data: r.data, postStatus: p.status, postData: p.data, errors: p.data?.errors || null, products: prod.data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/state', (req, res) => res.json(computeState()));

// ===== criar cobrança =====
app.post('/api/checkout', async (req, res) => {
  const { method, candidateId, amount } = req.body || {};
  const candidate = getCandidate(candidateId);
  const value = Number(amount);

  if (!candidate) return res.status(400).json({ error: 'Candidato inválido.' });
  if (!Number.isFinite(value) || value <= 0) return res.status(400).json({ error: 'Valor inválido.' });
  if (value < MIN_DONATION || value > MAX_DONATION) {
    return res.status(422).json({ error: `Doações de R$ ${MIN_DONATION},00 a R$ ${MAX_DONATION},00.` });
  }
  if (method !== 'pix') return res.status(400).json({ error: 'Método de pagamento inválido.' });

  try {
    // ---- modo demonstração (sem token Pepper) ----
    if (MODE !== 'pepper') {
      const reference = newReference();
      const charge = {
        reference,
        method: 'pix',
        network: null,
        candidateId,
        amount: value,
        status: 'PENDING',
        mock: true,
        ts: Date.now(),
      };
      charge.qrCodeText = `00020126580014BR.GOV.BCB.PIX0136${reference.toUpperCase()}52040000530398654${String(value.toFixed(2)).replace('.', '')}5802BR5913SIMULACAO6009DEMO2027622507DEMO0016304A01`;
      state.charges[reference] = charge;
      await saveState(state);
      return res.json({ mode: 'mock', ...charge });
    }

    const reference = newReference();
    const amountCents = Math.round(value * 100);
    const body = {
      api_token: PEPPER_API_TOKEN,
      amount: amountCents,
      payment_method: 'pix',
      cart: [
        {
          title: `Apoio · ${candidate.name} (${candidate.party})`,
          price: amountCents,
          quantity: 1,
          operation_type: 1,
        },
      ],
      customer: {
        name: 'Apoiador(a) Eleitoral',
        email: 'apoiador@proximopresidente.com.br',
        phone_number: '11999999999',
        document: '52998224725',
      },
      webhook_url: `${siteUrl(req)}/api/webhook/pepper`,
    };

    const r = await pepper('/transactions', { method: 'POST', body });
    if (r.status === 401 || r.status === 403) {
      return res.status(500).json({ error: 'Token Pepper inválido ou sem permissão.' });
    }
    if (r.status === 400) {
      const msg = r.data?.message || 'Dados inválidos para a Pepper.';
      const detail = Array.isArray(r.data?.errors) ? ` ${r.data.errors.join('; ')}` : '';
      return res.status(422).json({ error: msg + detail });
    }
    if (r.status === 429) {
      return res.status(429).json({ error: 'Limite de requisições atingido. Aguarde um instante.' });
    }
    if (r.status !== 200) {
      return res.status(502).json({ error: 'Pepper indisponível no momento. Tente novamente.' });
    }

    const charge = {
      reference,
      pepperHash: r.data?.hash || null,
      pepperTransactionId: r.data?.transaction || null,
      method: 'pix',
      network: null,
      candidateId,
      amount: value,
      status: mapPepperStatus(r.data?.payment_status),
      qrCodeText: r.data?.pix?.pix_qr_code || null,
      qrCodeUrl: r.data?.pix?.pix_url || null,
      ts: Date.now(),
    };
    state.charges[reference] = charge;
    await saveState(state);
    return res.json({ mode: 'pepper', ...charge });
  } catch (err) {
    console.error('checkout error:', err.message);
    return res.status(500).json({ error: 'Falha ao criar a cobrança. Tente novamente.' });
  }
});

// ===== consultar status =====
app.get('/api/charge/:reference', async (req, res) => {
  const { reference } = req.params;
  const charge = state.charges[reference];
  if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada.' });

  if (charge.mock) {
    return res.json({ charge, state: computeState() });
  }

  if (isPaidStatus(charge.status)) {
    return res.json({ charge, ...(await recordDonation(charge)) });
  }

  if (!charge.pepperHash) {
    return res.json({ charge, state: computeState() });
  }

  try {
    const q = await pepper(`/transactions/${charge.pepperHash}`);
    const newStatus = mapPepperStatus(q.data?.payment_status || charge.status);
    if (newStatus !== charge.status) {
      charge.status = newStatus;
      await saveState(state);
    }
    if (isPaidStatus(newStatus)) {
      return res.json({ charge, ...(await recordDonation(charge)) });
    }
    return res.json({ charge, state: computeState() });
  } catch (err) {
    return res.json({ charge, state: computeState(), queryError: true });
  }
});

// ===== simular pagamento (somente em modo demonstração) =====
app.post('/api/charge/:reference/simulate', async (req, res) => {
  if (MODE === 'pepper') return res.status(403).json({ error: 'Simulação disponível apenas no modo demonstração.' });
  const charge = state.charges[req.params.reference];
  if (!charge) return res.status(404).json({ error: 'Cobrança não encontrada.' });
  charge.status = 'PAID';
  await saveState(state);
  return res.json({ charge, ...(await recordDonation(charge)) });
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

// ===== divulgar rede social de uma doação confirmada =====
app.post('/api/donations/:reference/social', async (req, res) => {
  const { reference } = req.params;
  const donation = state.donations.find((d) => d.id === reference);
  if (!donation) return res.status(404).json({ error: 'Doação não encontrada.' });

  const { name, network, handle } = req.body || {};
  const cleanName = String(name || '').trim().slice(0, 40);
  const cleanNetwork = String(network || '').trim().toLowerCase();
  const cleanHandle = String(handle || '').trim().slice(0, 120);
  if (!cleanName) return res.status(400).json({ error: 'Informe um nome para divulgar.' });
  if (!SOCIAL_NETWORKS.includes(cleanNetwork)) return res.status(400).json({ error: 'Rede social inválida.' });
  if (!cleanHandle) return res.status(400).json({ error: 'Informe seu usuário ou o link do perfil.' });

  donation.name = cleanName;
  donation.network = cleanNetwork;
  donation.handle = cleanHandle;
  donation.profileUrl = buildProfileUrl(cleanNetwork, cleanHandle);
  donation.socialTs = Date.now();
  await saveState(state);
  return res.json({ ok: true, donation });
});

export { app };
