# Votação Grátis (1 voto/IP) + Divulgação Paga via Asaas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the site into free voting (1 vote per IP, ranking by % of votes) with paid PIX promotion of supporter links via Asaas (sandbox), replacing the Pepper donation flow.

**Architecture:** Backend Express (`backend/app.js`) switches gateway from Pepper to Asaas sandbox, adds `POST /api/vote` (unique by IP), and reuses `state.charges` for promotion PIX charges (split 100% to a wallet). `computeState()` ranks candidates by vote percentage and builds `topSupporters` from paid promotions. Frontend (`App.jsx`) simplifies the urna to number+CONFIRMA, shows vote %, and adds a "Divulgue seu link aqui" button below TOP APOIADORES opening a `PromoteModal`.

**Tech Stack:** Node.js 20+, Express, Netlify Blobs, React 18 + Vite, Asaas API v3 (sandbox).

## Global Constraints

- Gateway: Asaas sandbox base `https://api-sandbox.asaas.com/v3` (configurable via `ASAAS_BASE_URL`).
- Split: `percentualValue: 100` for wallet `d5369da6-f663-48fa-b132-288f30ea3c40` (`ASAAS_WALLET_ID`).
- Promotion amount: R$ 10–10.000 (`MIN_DONATION = 10`, `MAX_DONATION = 10000`).
- Unique vote: an IP may vote exactly once (any candidate); repeat returns message `Agradecemos pelo seu voto, Obrigado!`.
- Client IP source on Netlify: header `x-nf-client-connection-ip`, fallback `x-forwarded-for` first value, fallback `req.socket.remoteAddress`.
- Ranking: candidates ordered by `votes` desc, each shows `pct` (votes/totalVotes*100, 1 decimal, 0 when totalVotes=0).
- Top Apoiadores: from `state.promotions`, ordered by `amount` desc, last 20, label "Maior valor no topo".
- No secrets in committed files. Real `ASAAS_API_TOKEN` value goes only in local `backend/.env` and Netlify env vars.
- Generic Asaas customer: name `Apoiador(a) Eleitoral`, CPF `52998224725`, email `apoiador@proximopresidente.com.br`, cached in `state.asaasCustomerId`.
- Frontend copy must not mention Pepper or donations in R$; stats show Votos / Apoiadores / Candidatos.
- Mode badge: `asaas` → `Asaas · PIX`, otherwise `Modo demonstração`.

---

### Task 1: Backend storage and server mode for votes/promotions

**Files:**
- Modify: `backend/storage.js:28-30` (emptyState)
- Modify: `backend/server.js:5-15` (mode naming)
- Modify: `backend/app.js:6-14` (env block + mode) and `backend/app.js:63-67` (emptyState)

**Interfaces:**
- Produces: `emptyState()` now returns `{ donations: [], charges: {}, comments: [], votes: [], promotions: [], asaasCustomerId: null }`.
- Produces: `MODE` is `'asaas'` when `ASAAS_API_TOKEN` and `ASAAS_WALLET_ID` are set, else `'mock'`.

- [ ] **Step 1: Update `backend/storage.js` emptyState**

Replace:
```js
function emptyState() {
  return { donations: [], charges: {}, comments: [] };
}
```
with:
```js
function emptyState() {
  return { donations: [], charges: {}, comments: [], votes: [], promotions: [], asaasCustomerId: null };
}
```

- [ ] **Step 2: Update `backend/app.js` env block and emptyState**

Replace (lines 6-11):
```js
// ===== Pepper (apenas no backend, via variável de ambiente) =====
const PEPPER_API_TOKEN = (process.env.PEPPER_API_TOKEN || '').trim();
const PEPPER_BASE = 'https://api.cloud.pepperpay.com.br/public/v1';
const HAS_KEY = Boolean(PEPPER_API_TOKEN);
const MODE = HAS_KEY ? 'pepper' : 'mock';
const WEBHOOK_READY = HAS_KEY;
```
with:
```js
// ===== Asaas (sandbox) — apenas no backend, via variável de ambiente =====
const ASAAS_API_TOKEN = (process.env.ASAAS_API_TOKEN || '').trim();
const ASAAS_WALLET_ID = (process.env.ASAAS_WALLET_ID || '').trim();
const ASAAS_BASE = (process.env.ASAAS_BASE_URL || 'https://api-sandbox.asaas.com/v3').replace(/\/+$/, '');
const HAS_KEY = Boolean(ASAAS_API_TOKEN) && Boolean(ASAAS_WALLET_ID);
const MODE = HAS_KEY ? 'asaas' : 'mock';
const WEBHOOK_READY = HAS_KEY;

const ASAAS_GENERIC_CPF = '52998224725';
const ASAAS_GENERIC_EMAIL = 'apoiador@proximopresidente.com.br';
```

Replace `emptyState()` in `backend/app.js`:
```js
function emptyState() {
  return { donations: [], charges: {}, comments: [] };
}
```
with:
```js
function emptyState() {
  return { donations: [], charges: {}, comments: [], votes: [], promotions: [], asaasCustomerId: null };
}
```

- [ ] **Step 3: Update `backend/server.js` mode naming**

Replace the whole file body after imports:
```js
const PORT = process.env.PORT || 3001;

const PEPPER_API_TOKEN = (process.env.PEPPER_API_TOKEN || '').trim();
const HAS_KEY = Boolean(PEPPER_API_TOKEN);
const MODE = HAS_KEY ? 'pepper' : 'mock';

app.listen(PORT, () => {
  console.log(`API Próximo Presidente rodando em http://localhost:${PORT} (modo: ${MODE})`);
  if (MODE === 'pepper') {
    console.log('Pepper conectada. Cobranças PIX serão geradas pela Pepper.');
  } else {
    console.log('Sem token Pepper válido -> modo demonstração com PIX simulado.');
  }
});
```
with:
```js
const PORT = process.env.PORT || 3001;

const ASAAS_API_TOKEN = (process.env.ASAAS_API_TOKEN || '').trim();
const ASAAS_WALLET_ID = (process.env.ASAAS_WALLET_ID || '').trim();
const MODE = Boolean(ASAAS_API_TOKEN) && Boolean(ASAAS_WALLET_ID) ? 'asaas' : 'mock';

app.listen(PORT, () => {
  console.log(`API Próximo Presidente rodando em http://localhost:${PORT} (modo: ${MODE})`);
  if (MODE === 'asaas') {
    console.log('Asaas conectado. Cobranças PIX (divulgação) serão geradas pelo Asaas sandbox.');
  } else {
    console.log('Sem token Asaas válido -> modo demonstração com PIX simulado.');
  }
});
```

- [ ] **Step 4: Verify backend boots in mock mode**

Run: `cd /workspace/backend && node server.js` (no `.env` or with empty token)
Expected: prints `(modo: mock)` and `Sem token Asaas válido -> modo demonstração com PIX simulado.` Kill it (`Ctrl-C`).

- [ ] **Step 5: Commit**

```bash
git add backend/storage.js backend/server.js backend/app.js
git commit -m "feat(backend): state com votes/promotions e modo asaas/mock"
```

---

### Task 2: Backend core — vote endpoint, computeState by %, promotions Top

**Files:**
- Modify: `backend/app.js` — replace `computeState()`, replace `recordDonation()` with `recordPromotion()`, replace `/api/checkout` and `/api/charge/:reference` and `/api/charge/:reference/simulate` and `/api/donations/:reference/social`, add `/api/vote`.

**Interfaces:**
- Consumes: `state.votes`, `state.promotions`, `MODE`, `SOCIAL_LABELS`, `buildProfileUrl()`.
- Produces:
  - `POST /api/vote` body `{ candidateId }` → `{ ok, already, message?, vote?, state }`.
  - `computeState()` → `{ mode, webhookConfigured, totalVotes, totalSupporters, candidates: [{...c, votes, pct}], topSupporters, recent: [] }`.
  - `GET /api/charge/:reference` → `{ charge, promotion?, state }` for promotions.
  - `recordPromotion(charge)` → `{ promotion, state }`.

- [ ] **Step 1: Replace `computeState()`**

Replace the whole `computeState` function (currently lines 73-110) with:
```js
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
```

- [ ] **Step 2: Replace `recordDonation()` with `recordPromotion()`**

Replace the whole `recordDonation` function (lines 165-190) with:
```js
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
```

- [ ] **Step 3: Replace donation endpoints with vote + promotion charge status**

Replace the whole `/api/checkout` block (from `// ===== criar cobrança =====` through the end of the `/api/charge/:reference` handler, and the `simulate` handler and `donations/:reference/social` handler) with:
```js
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
```

- [ ] **Step 4: Remove the Pepper webhook and debug endpoints**

Replace the `app.get('/api/webhook/pepper', ...)` + `app.post('/api/webhook/pepper', ...)` block and the whole `app.get('/api/debug/pepper', ...)` block with nothing (delete them). Keep `app.options('*', ...)` and `app.use(cors())`.

- [ ] **Step 5: Verify vote uniqueness locally**

Start: `cd /workspace/backend && node server.js` (mock). Then:
```bash
curl -s -X POST http://localhost:3001/api/vote -H "Content-Type: application/json" -H "x-forwarded-for: 1.2.3.4" -d '{"candidateId":"lula"}'
curl -s -X POST http://localhost:3001/api/vote -H "Content-Type: application/json" -H "x-forwarded-for: 1.2.3.4" -d '{"candidateId":"marcal"}'
curl -s http://localhost:3001/api/state
```
Expected: first returns `{"ok":true,"already":false,...}`, second returns `{"ok":false,"already":true,"message":"Agradecemos pelo seu voto, Obrigado!",...}`, and `state.candidates[0].pct` is a number. Kill the server.

- [ ] **Step 6: Commit**

```bash
git add backend/app.js
git commit -m "feat(backend): voto unico por IP e ranking por % de votos"
```

---

### Task 3: Backend — Asaas helper, promote endpoint, Asaas webhook

**Files:**
- Modify: `backend/app.js` — add `asaas()` helper and `ensureAsaasCustomer()`, add `POST /api/promote`, add `/api/webhook/asaas` GET/POST.
- Modify: `backend/.env.example`
- Create: `backend/.env` (local only, gitignored)

**Interfaces:**
- Consumes: `ASAAS_API_TOKEN`, `ASAAS_WALLET_ID`, `ASAAS_BASE`, `ASAAS_GENERIC_CPF`, `ASAAS_GENERIC_EMAIL`, `state.asaasCustomerId`, `MIN_DONATION`, `MAX_DONATION`, `SOCIAL_NETWORKS`, `newReference()`.
- Produces:
  - `asaas(pathname, { method?, body? })` → `{ status, data }`.
  - `ensureAsaasCustomer()` → customer `id` string (creates or reuses).
  - `POST /api/promote` body `{ name, network, handle, amount }` → `{ mode, reference, qrCodeText, amount, status, social }` (charge).
  - `POST /api/webhook/asaas` accepts `{ event, payment: { id } }` and marks the matching charge `PAID`.

- [ ] **Step 1: Add Asaas helper functions**

Insert after `newReference()`:
```js
async function asaas(pathname, options = {}) {
  const res = await fetch(ASAAS_BASE + pathname, {
    method: options.method || 'GET',
    headers: {
      access_token: ASAAS_API_TOKEN,
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

async function ensureAsaasCustomer() {
  if (state.asaasCustomerId) return state.asaasCustomerId;
  const list = await asaas(`/customers?cpfCnpj=${ASAAS_GENERIC_CPF}`);
  if (list.status === 200 && Array.isArray(list.data?.data) && list.data.data.length) {
    state.asaasCustomerId = list.data.data[0].id;
    await saveState(state);
    return state.asaasCustomerId;
  }
  const created = await asaas('/customers', {
    method: 'POST',
    body: {
      name: 'Apoiador(a) Eleitoral',
      cpfCnpj: ASAAS_GENERIC_CPF,
      email: ASAAS_GENERIC_EMAIL,
    },
  });
  if (created.status !== 200 || !created.data?.id) {
    throw new Error('Falha ao criar cliente no Asaas.');
  }
  state.asaasCustomerId = created.data.id;
  await saveState(state);
  return state.asaasCustomerId;
}
```

- [ ] **Step 2: Add the Asaas webhook routes**

Replace the Pepper webhook block area (before `app.use(express.json())`) with:
```js
// Webhook do Asaas — registrado ANTES do express.json()
app.get('/api/webhook/asaas', (req, res) => res.status(200).json({ ok: true }));

app.post('/api/webhook/asaas', express.json({ type: () => true }), async (req, res) => {
  const event = req.body || {};
  const paymentId = event?.payment?.id;
  const eventType = event?.event;
  if (!paymentId) return res.status(200).json({ ok: true, ignored: true, reason: 'sem payment.id' });
  const charge = Object.values(state.charges).find((c) => c.asaasId === paymentId);
  if (!charge) return res.status(200).json({ ok: true, ignored: true });
  if (eventType === 'PAYMENT_RECEIVED' || eventType === 'PAYMENT_CONFIRMED') {
    charge.status = 'PAID';
    await saveState(state);
    if (charge.type === 'promotion') await recordPromotion(charge);
  }
  return res.status(200).json({ ok: true });
});
```

- [ ] **Step 3: Add `POST /api/promote`**

Insert after the `/api/state` route:
```js
// ===== divulgação paga (PIX via Asaas) =====
app.post('/api/promote', async (req, res) => {
  const { name, network, handle, amount } = req.body || {};
  const cleanName = String(name || '').trim().slice(0, 40);
  const cleanNetwork = String(network || '').trim().toLowerCase();
  const cleanHandle = String(handle || '').trim().slice(0, 120);
  const value = Number(amount);

  if (!cleanName) return res.status(400).json({ error: 'Informe um nome para divulgar.' });
  if (!SOCIAL_NETWORKS.includes(cleanNetwork)) return res.status(400).json({ error: 'Rede social inválida.' });
  if (!cleanHandle) return res.status(400).json({ error: 'Informe seu usuário ou o link do perfil.' });
  if (!Number.isFinite(value) || value < MIN_DONATION || value > MAX_DONATION) {
    return res.status(422).json({ error: `Divulgação de R$ ${MIN_DONATION},00 a R$ ${MAX_DONATION},00.` });
  }

  try {
    // ---- modo demonstração ----
    if (MODE !== 'asaas') {
      const reference = newReference();
      const charge = {
        reference,
        type: 'promotion',
        method: 'pix',
        amount: value,
        status: 'PENDING',
        mock: true,
        ts: Date.now(),
        social: { name: cleanName, network: cleanNetwork, handle: cleanHandle },
      };
      charge.qrCodeText = `00020126580014BR.GOV.BCB.PIX0136${reference.toUpperCase()}52040000530398654${String(value.toFixed(2)).replace('.', '')}5802BR5913SIMULACAO6009DEMO2027622507DEMO0016304A01`;
      state.charges[reference] = charge;
      await saveState(state);
      return res.json({ mode: 'mock', ...charge });
    }

    // ---- modo real (Asaas sandbox) ----
    const customerId = await ensureAsaasCustomer();
    const reference = newReference();
    const dueDate = new Date().toISOString().slice(0, 10);
    const body = {
      customer: customerId,
      billingType: 'PIX',
      value,
      dueDate,
      description: `Divulgação · ${cleanName}`,
      externalReference: reference,
      split: [{ walletId: ASAAS_WALLET_ID, percentualValue: 100 }],
    };

    const p = await asaas('/payments', { method: 'POST', body });
    if (p.status !== 200) {
      const msg = p.data?.errors?.[0]?.description || p.data?.message || 'Asaas não aceitou a cobrança.';
      return res.status(502).json({ error: msg });
    }
    const paymentId = p.data.id;

    const q = await asaas(`/payments/${paymentId}/pixQrCode`);
    const payload = q.data?.payload || null;
    if (q.status !== 200 || !payload) {
      return res.status(502).json({ error: 'Não foi possível gerar o QR Code PIX.' });
    }

    const charge = {
      reference,
      asaasId: paymentId,
      type: 'promotion',
      method: 'pix',
      amount: value,
      status: 'PENDING',
      qrCodeText: payload,
      social: { name: cleanName, network: cleanNetwork, handle: cleanHandle },
      ts: Date.now(),
    };
    state.charges[reference] = charge;
    await saveState(state);
    return res.json({ mode: 'asaas', ...charge });
  } catch (err) {
    console.error('promote error:', err.message);
    return res.status(500).json({ error: 'Falha ao gerar o PIX. Tente novamente.' });
  }
});
```

- [ ] **Step 4: Update `.env.example`**

Replace the whole file content with:
```env
# Copie para .env SOMENTE para desenvolvimento local.
# Na Netlify, configure as variáveis no painel: Site settings > Environment variables.

# Token de API do Asaas (sandbox: https://sandbox.asaas.com/customerApiAccessToken/index)
ASAAS_API_TOKEN=seu_token_asaas_aqui

# Carteira que recebe o split (100% do valor de cada divulgação)
ASAAS_WALLET_ID=d5369da6-f663-48fa-b132-288f30ea3c40

# Base da API (sandbox por padrão; produção: https://api.asaas.com/v3)
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3

# Porta da API (apenas desenvolvimento local)
PORT=3001
```

- [ ] **Step 5: Create local `backend/.env` (not committed)**

Run (substituting the token you generated at `https://sandbox.asaas.com/customerApiAccessToken/index`):
```bash
cat > /workspace/backend/.env <<'EOF'
ASAAS_API_TOKEN=SEU_TOKEN_AQUI
ASAAS_WALLET_ID=d5369da6-f663-48fa-b132-288f30ea3c40
ASAAS_BASE_URL=https://api-sandbox.asaas.com/v3
PORT=3001
EOF
```
Verify `backend/.env` is in `.gitignore` (it is). Do NOT commit this file.

- [ ] **Step 6: Verify promote (mock) locally**

Start: `cd /workspace/backend && node server.js` (mock, no token). Then:
```bash
curl -s -X POST http://localhost:3001/api/promote -H "Content-Type: application/json" -d '{"name":"Joao","network":"instagram","handle":"@joao","amount":50}'
```
Expected: `{"mode":"mock",...,"qrCodeText":"000201...","status":"PENDING"}`. Kill the server.

- [ ] **Step 7: Commit**

```bash
git add backend/app.js backend/.env.example
git commit -m "feat(backend): promote PIX via Asaas sandbox com split 100% e webhook"
```

---

### Task 4: Frontend API client

**Files:**
- Modify: `frontend/src/api.js`

**Interfaces:**
- Produces:
  - `api.vote(body)` → POST `/api/vote`.
  - `api.promote(body)` → POST `/api/promote`.
  - `api.chargeStatus(reference)` → GET `/api/charge/:reference` (exists).
  - `api.simulate(reference)` → POST `/api/charge/:reference/simulate` (exists).

- [ ] **Step 1: Replace `frontend/src/api.js`**

Replace the whole file with:
```js
async function request(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || 'Erro na comunicação com o servidor.');
  }
  return data;
}

export const api = {
  state: () => request('/api/state'),
  vote: (body) =>
    request('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  promote: (body) =>
    request('/api/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  chargeStatus: (reference) => request(`/api/charge/${reference}`),
  simulate: (reference) =>
    request(`/api/charge/${reference}/simulate`, { method: 'POST' }),
  comments: () => request('/api/comments'),
  postComment: (body) =>
    request('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
};
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd /workspace/frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api.js
git commit -m "feat(frontend): api client com vote e promote"
```

---

### Task 5: Frontend — simplified urna (number + CONFIRMA)

**Files:**
- Modify: `frontend/src/components/UrnaEletronica.jsx`

**Interfaces:**
- Consumes: `candidate` (matched candidate or null), `digits` (string), `onDigit(d)`, `onBackspace()`, `onCorrige()`, `onConfirm()`, `processing`.
- Produces: keyboard handler (digits/Backspace/Enter) and CONFIRMA enabled when `candidate` is set and not processing.

- [ ] **Step 1: Replace `frontend/src/components/UrnaEletronica.jsx`**

Replace the whole file with:
```jsx
import { useEffect } from 'react';
import CandidateAvatar from './CandidateAvatar.jsx';

export default function UrnaEletronica({ candidate, digits, onDigit, onBackspace, onCorrige, onConfirm, processing }) {
  const canConfirm = !!candidate && !processing;

  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        onDigit(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (canConfirm) onConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canConfirm, onDigit, onBackspace, onConfirm]);

  const digitsList = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="urna">
      <div className="urna-top">
        <div className="urna-brand">
          <span className="urna-brand-dot" />
          URNA ELETRÔNICA · 2027
        </div>
      </div>

      <div className="urna-screen">
        <div className="screen-inner">
          {candidate ? (
            <>
              <div className="screen-candidate">
                <div className="screen-avatar">
                  <CandidateAvatar candidate={candidate} size={84} />
                </div>
                <div className="screen-candidate-info">
                  <div className="screen-candidate-name">{candidate.short}</div>
                  <div className="screen-candidate-party">
                    {candidate.party} · Nº <strong>{candidate.number}</strong>
                  </div>
                </div>
              </div>
              <div className="screen-amount-label">VOCÊ CONFIRMA O SEU VOTO?</div>
              <div className={`screen-amount ${digits ? 'has-value' : ''}`}>
                {digits ? (
                  <span className="screen-amount-num">{digits}</span>
                ) : (
                  <span className="screen-cursor">▋</span>
                )}
              </div>
              <div className="screen-hint ok">Aperte CONFIRMA para votar em {candidate.short}</div>
            </>
          ) : digits ? (
            <div className="screen-empty">
              <div className="screen-empty-title">NÚMERO INVÁLIDO</div>
              <div className="screen-empty-sub">Digite o número de um candidato (2 dígitos)</div>
            </div>
          ) : (
            <div className="screen-empty">
              <div className="screen-empty-title">DIGITE O NÚMERO</div>
              <div className="screen-empty-sub">Digite o número do candidato e aperte CONFIRMA</div>
            </div>
          )}
        </div>
      </div>

      <div className="urna-keypad">
        <div className="keypad-grid">
          {digitsList.map((d) => (
            <button key={d} className="key key-num" onClick={() => onDigit(String(d))}>
              {d}
            </button>
          ))}
          <button className="key key-corrige" onClick={onCorrige}>
            CORRIGE
          </button>
          <button className="key key-num" onClick={() => onDigit('0')}>
            0
          </button>
          <button
            className={`key key-confirma ${canConfirm ? 'active' : ''}`}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            CONFIRMA
          </button>
        </div>
        <div className="urna-foot">
          <span className="urna-foot-hint">Digite o número · aperte <kbd>ENTER</kbd> ou <kbd>CONFIRMA</kbd></span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /workspace/frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/UrnaEletronica.jsx
git commit -m "feat(frontend): urna simplificada (numero + confirma)"
```

---

### Task 6: Frontend — PromoteModal (form + PIX + polling)

**Files:**
- Create: `frontend/src/components/PromoteModal.jsx`

**Interfaces:**
- Consumes: `api.promote`, `api.chargeStatus`, `api.simulate`, `candidates` not needed, `SOCIAL_OPTIONS` local, `formatBRL`.
- Produces: `{ candidateId, amount, onPaid, onClose, siteMode }` — actually component renders its own form; props: `onPaid(promotionResult)`, `onClose()`, `siteMode`.
- Phases: `form` (name/network/handle/amount) → `payment` (QR + copy + countdown + polling) → `done`.

- [ ] **Step 1: Create `frontend/src/components/PromoteModal.jsx`**

```jsx
import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { formatBRL } from '../candidates.js';
import { api } from '../api.js';

const SOCIAL_OPTIONS = [
  ['instagram', 'Instagram'],
  ['youtube', 'YouTube'],
  ['linkedin', 'LinkedIn'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['kwai', 'Kwai'],
  ['x', 'X (Twitter)'],
];

function useCountdown(active) {
  const [seconds, setSeconds] = useState(60);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!active) return;
    setSeconds(60);
    setExpired(false);
    const iv = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          clearInterval(iv);
          setExpired(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [active]);
  return { seconds, expired, setExpired };
}

export default function PromoteModal({ siteMode, onPaid, onClose }) {
  const [form, setForm] = useState({ name: '', network: 'instagram', handle: '', amount: '' });
  const [phase, setPhase] = useState('form');
  const [charge, setCharge] = useState(null);
  const [creating, setCreating] = useState(false);
  const [statusText, setStatusText] = useState('Aguardando pagamento…');
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState(null);
  const [paidResult, setPaidResult] = useState(null);
  const qrRef = useRef(null);

  const { seconds, expired, setExpired } = useCountdown(phase === 'payment');

  useEffect(() => {
    if (phase !== 'payment' || !charge?.qrCodeText || !qrRef.current) return;
    QRCode.toCanvas(qrRef.current, charge.qrCodeText, { width: 216, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {});
  }, [phase, charge]);

  useEffect(() => {
    if (phase !== 'payment' || expired || siteMode !== 'asaas' || !charge) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await api.chargeStatus(charge.reference);
        if (!alive) return;
        if (r.promotion) {
          setPaidResult(r);
          setPhase('done');
          return;
        }
      } catch {
        /* mantém estado */
      }
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [phase, expired, siteMode, charge]);

  const value = Number(form.amount);
  const canSubmit = form.name.trim() && form.handle.trim() && Number.isFinite(value) && value >= 10 && !creating;

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const ch = await api.promote({ name: form.name.trim(), network: form.network, handle: form.handle.trim(), amount: value });
      setCharge(ch);
      setStatusText('Aguardando pagamento…');
      setPhase('payment');
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function regenerate() {
    setCharge(null);
    setExpired(false);
    await handleCreate();
  }

  async function copy(text, which) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied('error');
    }
  }

  async function simulatePayment() {
    if (!charge) return;
    setStatusText('Confirmando pagamento…');
    try {
      const r = await api.simulate(charge.reference);
      setPaidResult(r);
      setPhase('done');
    } catch (e) {
      setError(e.message);
    }
  }

  function finish() {
    onPaid(paidResult);
    onClose();
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="checkout checkout-pepper" onClick={(e) => e.stopPropagation()}>
        <div className="checkout-header">
          <span className="checkout-shield">DIVULGUE SEU LINK</span>
          <button className="checkout-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        {phase === 'form' && (
          <div className="checkout-form">
            <div className="checkout-note">
              Pague via PIX (a partir de <strong>R$ 10,00</strong>) para divulgar seu link no topo da lista. Quem paga
              mais fica no topo.
            </div>
            <label className="field">
              <span>Nome que vai aparecer na lista</span>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Seu nome ou apelido"
              />
            </label>
            <label className="field">
              <span>Rede social</span>
              <select
                className="comment-select"
                value={form.network}
                onChange={(e) => setForm({ ...form, network: e.target.value })}
              >
                {SOCIAL_OPTIONS.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Link ou usuário do perfil</span>
              <input
                value={form.handle}
                onChange={(e) => setForm({ ...form, handle: e.target.value })}
                placeholder="ex.: @seuperfil"
              />
            </label>
            <label className="field">
              <span>Valor da divulgação (R$)</span>
              <input
                type="number"
                min={10}
                max={10000}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="10"
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-block" onClick={handleCreate} disabled={!canSubmit}>
              {creating ? 'Gerando…' : 'Gerar PIX e divulgar'}
            </button>
          </div>
        )}

        {phase === 'payment' && charge && (
          <div className="pay-box">
            {expired ? (
              <div className="expired-box">
                <div className="expired-title">Tempo esgotado</div>
                <div className="expired-sub">Esta cobrança expirou após 1 minuto. Gere uma nova para continuar.</div>
                <button className="btn btn-primary btn-block" onClick={regenerate} disabled={creating}>
                  {creating ? 'Gerando…' : 'Gerar nova cobrança'}
                </button>
              </div>
            ) : (
              <>
                <div className="pix-pay">
                  <div className="qr-box">
                    <canvas ref={qrRef} className="qr-canvas" />
                  </div>
                  <div className="copy-row">
                    <input
                      readOnly
                      value={charge.qrCodeText || ''}
                      className="copy-input"
                      onFocus={(e) => e.target.select()}
                    />
                    <button className="copy-btn" onClick={() => copy(charge.qrCodeText, 'code')}>
                      {copied === 'code' ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <div className="pay-amount">Valor: {formatBRL(charge.amount)}</div>
                </div>

                <div className="pay-status">
                  <span className="status-dot" />
                  {statusText}
                </div>

                <div className={`countdown ${seconds <= 10 ? 'warn' : ''}`}>
                  <span className="countdown-label">Tempo restante</span>
                  <span className="countdown-time">{mmss}</span>
                </div>

                {siteMode === 'mock' && (
                  <button className="btn btn-primary btn-block" onClick={simulatePayment}>
                    Simular pagamento concluído (demo)
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {phase === 'done' && paidResult && (
          <div className="social-box">
            <div className="social-title">Divulgação confirmada!</div>
            <div className="social-sub">
              Seu link já está na lista <strong>Top Apoiadores</strong>. Quanto maior o valor, mais alto no topo.
            </div>
            <div className="social-amount">
              Pagamento de {formatBRL(paidResult.promotion?.amount || 0)} confirmado
            </div>
            <button className="btn btn-primary btn-block" onClick={finish}>
              Concluir
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `cd /workspace/frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PromoteModal.jsx
git commit -m "feat(frontend): modal de divulgacao paga com PIX"
```

---

### Task 7: Frontend — TopSupporters shows paid promotions

**Files:**
- Modify: `frontend/src/components/TopSupporters.jsx`

**Interfaces:**
- Consumes: `supporters` array (from `state.topSupporters`, already built from promotions).
- Produces: list sorted by amount desc with note "Maior valor no topo".

- [ ] **Step 1: Update `TopSupporters.jsx` texts**

In `frontend/src/components/TopSupporters.jsx`:
- Replace the empty-state block:
```jsx
          <div className="supporters-empty">
            Nenhum apoiador divulgado ainda.
            <br />
            Pague e divulgue seu perfil!
          </div>
```
with:
```jsx
          <div className="supporters-empty">
            Nenhum link divulgado ainda.
            <br />
            Divulgue seu link pagando via PIX!
          </div>
```
- Replace the note:
```jsx
      <div className="supporters-note">Maior valor no topo · últimos 20 pagantes</div>
```
with:
```jsx
      <div className="supporters-note">Maior valor no topo</div>
```

- [ ] **Step 2: Verify build**

Run: `cd /workspace/frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/TopSupporters.jsx
git commit -m "feat(frontend): top apoiadores mostra divulgacoes pagas"
```

---

### Task 8: Frontend — App.jsx wire-up (vote flow, %, promote section)

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: `api.vote`, `api.state`, `PromoteModal`, `TopSupporters`, `UrnaEletronica`, `candidates`, `formatBRL`.
- Produces: vote-by-number flow (digits match candidate), celebration on success, "already voted" toast, % in ranking, stats by votes, promote section below TOP APOIADORES.

- [ ] **Step 1: Rewrite `frontend/src/App.jsx`**

Replace the whole file with:
```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { getCandidate } from './candidates.js';
import CanvasBackground from './components/CanvasBackground.jsx';
import Confetti from './components/Confetti.jsx';
import CandidateAvatar from './components/CandidateAvatar.jsx';
import UrnaEletronica from './components/UrnaEletronica.jsx';
import PromoteModal from './components/PromoteModal.jsx';
import Comments from './components/Comments.jsx';
import TopSupporters from './components/TopSupporters.jsx';

const POSITION_META = {
  0: { label: '1º LUGAR', cls: 'pos-gold', medal: 'OURO' },
  1: { label: '2º LUGAR', cls: 'pos-silver', medal: 'PRATA' },
  2: { label: '3º LUGAR', cls: 'pos-bronze', medal: 'BRONZE' },
};

export default function App() {
  const [data, setData] = useState(null);
  const [digits, setDigits] = useState('');
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [celebration, setCelebration] = useState(null);
  const [confetti, setConfetti] = useState(0);
  const [toast, setToast] = useState(null);
  const urnaRef = useRef(null);

  const showToast = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4200);
  }, []);

  const loadState = useCallback(async () => {
    try {
      setData(await api.state());
    } catch (e) {
      showToast(e.message);
    }
  }, [showToast]);

  useEffect(() => {
    loadState();
    const iv = setInterval(loadState, 6000);
    return () => clearInterval(iv);
  }, [loadState]);

  const candidates = useMemo(() => {
    if (!data) return [];
    return data.candidates.map((c) => ({ ...(getCandidate(c.id) || {}), ...c }));
  }, [data]);

  const matchedCandidate = useMemo(() => {
    if (!digits) return null;
    return candidates.find((c) => c.number === digits) || null;
  }, [digits, candidates]);

  const mode = data?.mode || 'mock';

  const onDigit = useCallback((d) => {
    setDigits((prev) => {
      const next = (prev || '') + d;
      if (next.length > 2) return prev;
      return next;
    });
  }, []);

  const onBackspace = useCallback(() => setDigits((p) => (p || '').slice(0, -1)), []);
  const onCorrige = useCallback(() => setDigits(''), []);

  const onConfirm = useCallback(async () => {
    if (!matchedCandidate) return;
    try {
      const r = await api.vote({ candidateId: matchedCandidate.id });
      if (r.already) {
        showToast(r.message || 'Agradecemos pelo seu voto, Obrigado!');
        return;
      }
      if (r.state) setData(r.state);
      setDigits('');
      setConfetti((n) => n + 1);
      setCelebration(r.vote);
    } catch (e) {
      showToast(e.message);
    }
  }, [matchedCandidate, showToast]);

  const handlePromotePaid = useCallback(
    (res) => {
      if (res?.state) setData(res.state);
      setConfetti((n) => n + 1);
    },
    []
  );

  return (
    <div className="app">
      <CanvasBackground />
      <Confetti burst={confetti} />

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="flag-mini" aria-hidden="true" />
            <span className="brand-text">PRÓXIMO <b>PRESIDENTE</b></span>
          </div>
          <div className="topbar-right">
            <span className="live-badge">
              <span className="live-dot" /> AO VIVO
            </span>
            <span className={`mode-badge ${mode === 'asaas' ? 'stripe' : 'demo'}`}>
              {mode === 'asaas' ? 'Asaas · PIX' : 'Modo demonstração'}
            </span>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="hero">
          <div className="flag hero-flag" aria-hidden="true">
            <div className="flag-band" />
            <div className="flag-diamond" />
            <div className="flag-circle" />
          </div>
          <h1 className="hero-title">
            Brasil, escolha o seu <span className="grad">Presidente</span>
          </h1>
          <p className="hero-sub">
            Eleição digital 100% justa e democratizada. Voto grátis (1 por pessoa) e divulgação do seu link paga via
            PIX.
          </p>
          <div className="hero-stats">
            <div className="stat-card">
              <span className="stat-label">Votos</span>
              <span className="stat-value">{data?.totalVotes ?? 0}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Apoiadores</span>
              <span className="stat-value">{data?.totalSupporters ?? 0}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Candidatos</span>
              <span className="stat-value">{candidates.length}</span>
            </div>
          </div>
        </section>

        <section className="play-area">
          <div className="ranking-col">
            <div className="panel-title">
              <span className="panel-title-line" />
              RANKING AO VIVO
              <span className="panel-title-line" />
            </div>
            <div className="ranking-list">
              {candidates.map((c, i) => {
                const meta = POSITION_META[i];
                const isSel = c.id === matchedCandidate?.id;
                return (
                  <button
                    key={c.id}
                    className={`rank-row ${meta ? meta.cls : ''} ${isSel ? 'selected' : ''}`}
                    onClick={() => setDigits(c.number)}
                  >
                    <span className={`rank-pos ${i === 0 ? 'top1' : ''}`}>{i + 1}</span>
                    {i === 0 && <span className="crown" title="Top 1">♛</span>}
                    <span className="rank-avatar">
                      <CandidateAvatar candidate={c} size={46} />
                    </span>
                    <span className="rank-body">
                      <span className="rank-name">{c.short}</span>
                      <span className="rank-party">{c.party}</span>
                      <span className="rank-bar">
                        <span className="rank-bar-fill" style={{ width: `${Math.max(c.pct, c.votes ? 2 : 0)}%`, background: c.color }} />
                      </span>
                    </span>
                    <span className="rank-total">
                      <span className="rank-total-value">{String(c.pct).replace('.', ',')}%</span>
                      <span className="rank-total-support">
                        {c.votes} {c.votes === 1 ? 'voto' : 'votos'}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="urna-col" ref={urnaRef}>
            <div className="panel-title">
              <span className="panel-title-line" />
              URNA ELETRÔNICA
              <span className="panel-title-line" />
            </div>
            <UrnaEletronica
              candidate={matchedCandidate}
              digits={digits}
              onDigit={onDigit}
              onBackspace={onBackspace}
              onCorrige={onCorrige}
              onConfirm={onConfirm}
              processing={false}
            />
            <div className="urna-legend">
              <span><b>1</b> Escolha seu candidato</span>
              <span><b>2</b> Digite o número</span>
              <span><b>3</b> Aperte CONFIRMA</span>
              <span><b>4</b> Pronto, voto registrado!</span>
            </div>
          </div>

          <div className="supporters-col">
            <TopSupporters supporters={data?.topSupporters || []} />
            <button className="promote-button" onClick={() => setPromoteOpen(true)}>
              Divulgue seu link aqui
            </button>
          </div>
        </section>

        <section className="candidates-section">
          <div className="panel-title">
            <span className="panel-title-line" />
            ESCOLHA SEU CANDIDATO
            <span className="panel-title-line" />
          </div>
          <div className="candidates-grid">
            {candidates.map((c, i) => (
              <button
                key={c.id}
                className={`candidate-card ${c.id === matchedCandidate?.id ? 'selected' : ''}`}
                onClick={() => setDigits(c.number)}
              >
                {i === 0 && <span className="card-crown">♛ TOP 1</span>}
                <span className="card-number" style={{ color: c.color }}>{c.number}</span>
                <span className="card-avatar">
                  <CandidateAvatar candidate={c} size={108} ring />
                </span>
                <span className="card-name">{c.short}</span>
                <span className="card-party" style={{ background: c.color }}>{c.party}</span>
                <span className="card-total">{String(c.pct).replace('.', ',')}%</span>
                <span className="card-action">VOTAR AGORA</span>
              </button>
            ))}
          </div>
        </section>

        <Comments candidates={candidates} />
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <p className="footer-title">Próximo Presidente · Eleição justa e democratizada · Brasil 2027</p>
          <p className="footer-sub">
            Projeto demonstrativo de votação digital. Divulgações pagas processadas de forma segura via{' '}
            <strong>Asaas</strong> (PIX). Nenhum voto oficial é emitido neste site.
          </p>
          <p className="footer-contact">
            Suporte: <a href="mailto:chatbots2023@gmail.com">chatbots2023@gmail.com</a>
          </p>
        </div>
      </footer>

      {promoteOpen && <PromoteModal siteMode={mode} onPaid={handlePromotePaid} onClose={() => setPromoteOpen(false)} />}

      {celebration && (
        <div className="celebration" onClick={() => setCelebration(null)}>
          <div className="celebration-card">
            <div className="celebration-badge">VOTO CONFIRMADO</div>
            <div className="celebration-avatar">
              <CandidateAvatar candidate={getCandidate(celebration.candidateId)} size={120} ring />
            </div>
            <div className="celebration-name">
              {getCandidate(celebration.candidateId)?.short || 'Seu candidato'}
            </div>
            <div className="celebration-amount">Seu voto foi registrado com sucesso!</div>
            <button className="btn btn-primary" onClick={() => setCelebration(null)}>
              Continuar
            </button>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Add promote button style to `frontend/src/styles.css`**

Append at the end of the file:
```css
.promote-button {
  display: block;
  width: 100%;
  margin-top: 16px;
  padding: 14px 16px;
  font-family: var(--font-disp);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 1.5px;
  color: #fff;
  background: linear-gradient(135deg, #1b9e4b, #0e7c86);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 10px;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.promote-button:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(27, 158, 75, 0.35);
}
```

- [ ] **Step 3: Verify build**

Run: `cd /workspace/frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Verify full local flow (mock)**

Start backend: `cd /workspace/backend && node server.js` in one terminal; start frontend: `cd /workspace/frontend && npm run dev` in another. Open `http://localhost:5173`, vote by typing a candidate number (e.g., 13) + CONFIRMA, then vote again with same IP → expect "Agradecemos pelo seu voto, Obrigado!". Click "Divulgue seu link aqui", fill form, submit → QR appears; click "Simular pagamento concluído (demo)" → done screen; refresh state shows the promotion in Top.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/styles.css
git commit -m "feat(frontend): fluxo de voto por numero, ranking %, e secao divulgue seu link"
```

---

### Task 9: End-to-end verification on Netlify + deployment checklist

**Files:**
- None (verification + docs).

**Interfaces:**
- Confirms `/api/health` reports `mode: asaas` after env vars are set.

- [ ] **Step 1: Push to GitHub**

```bash
git push origin master
```

- [ ] **Step 2: User adds env vars on Netlify**

In `app.netlify.com` → site → **Site configuration → Environment variables**, add:
- `ASAAS_API_TOKEN` = the token from `https://sandbox.asaas.com/customerApiAccessToken/index`
- `ASAAS_WALLET_ID` = `d5369da6-f663-48fa-b132-288f30ea3c40`
- `ASAAS_BASE_URL` = `https://api-sandbox.asaas.com/v3`

Then **Deploys → Trigger deploy**.

- [ ] **Step 3: Verify health**

Run: `curl -s https://proximopresidente2027br.netlify.app/api/health`
Expected: `{"ok":true,"mode":"asaas","webhookConfigured":true}`

- [ ] **Step 4: Verify unique vote via curl (same IP)**

```bash
curl -s -X POST https://proximopresidente2027br.netlify.app/api/vote -H "Content-Type: application/json" -d '{"candidateId":"lula"}'
curl -s -X POST https://proximopresidente2027br.netlify.app/api/vote -H "Content-Type: application/json" -d '{"candidateId":"marcal"}'
```
Expected: second response includes `"already":true` and the fixed message.

- [ ] **Step 5: (Optional) Register Asaas webhook**

In Asaas (sandbox) → **Integrações → Webhooks**, add URL `https://proximopresidente2027br.netlify.app/api/webhook/asaas` and enable events `PAYMENT_RECEIVED` and `PAYMENT_CONFIRMED`. (Without it, polling in `PromoteModal` still works.)

- [ ] **Step 6: Update design doc status**

Edit `docs/superpowers/specs/2026-08-29-votacao-gratis-asaas-design.md` — no content change required; optionally mark implemented. Commit if changed.

- [ ] **Step 7: Commit any doc changes**

```bash
git add -A
git commit -m "docs: verificação final da migração para votação grátis + Asaas"
git push origin master
```
