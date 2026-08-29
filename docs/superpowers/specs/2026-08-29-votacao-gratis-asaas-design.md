# Votação grátis (1 voto por IP) + Divulgação paga via Asaas (PIX)

Data: 2026-08-29

## Objetivo

Reformular o site Próximo Presidente 2027:
- Voto passa a ser **grátis** e **único por IP** (no site todo).
- Pagamento PIX (via **Asaas sandbox**, com split de 100% para uma carteira) é usado **somente** para divulgar o link do apoiador no Top.
- Ranking dos candidatos passa a mostrar **porcentagem (%) de votos**, não valores em R$.

## Contexto atual

- Frontend: Vite/React em `frontend/`, implantado na Netlify (`https://proximopresidente2027br.netlify.app/`).
- Backend: Express em `backend/app.js`, executado como função Netlify (`netlify/functions/api.mjs`), persistência via Netlify Blobs (`backend/storage.js`).
- Gateway atual: Pepper (PIX). Será **substituído** pelo Asaas.
- Estado salvo: `{ donations, charges, comments }` em `backend/storage.js`.

## Novos requisitos

### 1. Voto grátis, único por IP
- Usuário digita o **número do candidato** na urna e aperta CONFIRMA. Sem valor.
- Backend registra `{ ip, candidateId, ts }` em `state.votes`.
- Se o IP já consta em `state.votes` (qualquer candidato): retorna `{ already: true }` e o frontend mostra a mensagem fixa:
  **"Agradecemos pelo seu voto, Obrigado!"**
- O IP deve ser obtido dos headers da Netlify: `x-nf-client-connection-ip` (fallback: `x-forwarded-for` → `connection.remoteAddress`).

### 2. Ranking e estatísticas por % de votos
- `computeState`:
  - `votes` por candidato = contagem de `state.votes`.
  - `totalVotes` = `state.votes.length`.
  - `totalSupporters` = `state.votes.length`.
  - Cada candidato retorna `votes` e `pct` (porcentagem = votes/totalVotes*100, arredondada a 1 casa; se totalVotes=0 → 0).
  - Ranking ordenado por `votes` desc (desempate por `number`).
- Frontend:
  - Card do candidato mostra `pct%` (ex.: "12,5%") em vez de valor R$.
  - Barra de progresso usa `pct`.
  - Hero stats: substituir "Arrecadado (R$)" por "Votos" (`totalVotes`); manter "Apoiadores" e "Candidatos" (Apoiadores = totalVotes).
  - Ticker e textos de doação removidos/ajustados.

### 3. Pagamento PIX via Asaas (sandbox) — somente para divulgação
- Nova variável de ambiente: `ASAAS_API_TOKEN`, `ASAAS_WALLET_ID` (= `d5369da6-f663-48fa-b132-288f30ea3c40`), `ASAAS_BASE_URL` (default `https://api-sandbox.asaas.com/v3`).
- Novo endpoint `POST /api/promote` recebe `{ name, network, handle, amount }`:
  - `amount` entre R$ 10 e R$ 10.000.
  - Garante um cliente Asaas genérico "Apoiador(a) Eleitoral" (CPF fixo válido `52998224725`, e-mail fixo) — criado uma vez e reutilizado (cache em memória/estado).
  - Cria cobrança: `POST /payments` com `{ customer, billingType: 'PIX', value, dueDate (hoje), description: 'Divulgação · <nome>', externalReference: <reference>, split: [{ walletId, percentualValue: 100 }] }`.
  - Busca QR Code: `GET /payments/{id}/pixQrCode` → `payload` (código copia-e-cola) e `encodedImage` (imagem base64).
  - Guarda charge em `state.charges` com `asaasId` e `type: 'promotion'`, dados sociais (name/network/handle).
  - Retorna `{ reference, qrCodeText: payload, qrCodeUrl: invoiceUrl, amount, ... }`.
- `GET /api/charge/:reference`: consulta status no Asaas (`GET /payments/{id}`). Se `status` ∈ `{RECEIVED, CONFIRMED}` → registra promoção paga em `state.promotions`.
- Webhook `POST /api/webhook/asaas` (events `PAYMENT_RECEIVED`, `PAYMENT_CONFIRMED`): atualiza charge/promoção; responde sempre 2xx.

### 4. Top Apoiadores (promoções pagas)
- `state.promotions` = `[{ id, name, network, handle, profileUrl, amount, ts }]`.
- `topSupporters` em `computeState` vem de `state.promotions`, ordenado por `amount` desc (quem paga mais no topo), últimos 20.
- Sem a nota "últimos 20 pagantes" antiga — usar "Maior valor no topo".

### 5. Botão de divulgação
- Na coluna direita, **abaixo do TOP APOIADORES**, botão **"Divulgue seu link aqui"**.
- Abre `PromoteModal`: formulário `nome`, `rede social`, `link/handle`, `valor (R$ 10+)` → gera PIX (Asaas) → polling de status → ao confirmar, entra no Top com confete.

### 6. Frontend — urna simplificada
- `UrnaEletronica.jsx`: remover campo de valor; tela mostra número digitado e o candidato correspondente; CONFIRMA vota.
- Tela "candidato não encontrado" para número inválido.
- Fluxo: selecionar → confirmar → `POST /api/vote` → sucesso (confete/parabéns) ou `already` (mensagem de agradecimento).
- Manter keyboard handlers (dígitos, Enter, CORRIGE).

## Mudanças em arquivos

### Backend
- `backend/app.js`:
  - Remover: Pepper (`PEPPER_*`, `pepper()`, `/api/webhook/pepper`, `/api/debug/pepper`, checkout de doação).
  - Adicionar: Asaas (`asaas()`, `/api/promote`, `/api/webhook/asaas`, consulta de status), `POST /api/vote`, `state.votes`, `state.promotions`, `computeState` por votos/%.
  - `emptyState()` → `{ donations: [], charges: {}, comments: [], votes: [], promotions: [] }`.
- `backend/server.js`: nomear modo `asaas`/`mock`.
- `backend/.env` e `backend/.env.example`: `ASAAS_API_TOKEN`, `ASAAS_WALLET_ID`, `ASAAS_BASE_URL`.

### Frontend
- `frontend/src/App.jsx`: novo fluxo de voto, stats por votos, textos sem R$/Pepper, integra `PromoteModal` e seção de divulgação.
- `frontend/src/components/UrnaEletronica.jsx`: sem valor; CONFIRMA vota.
- `frontend/src/components/TopSupporters.jsx`: lista promoções pagas (valor), nota "Maior valor no topo".
- `frontend/src/components/PromoteModal.jsx` (novo): formulário nome+rede+link+valor → PIX → polling → sucesso.
- `frontend/src/components/PromoteSection.jsx` (novo) ou botão embutido no `App.jsx` abaixo do Top: "Divulgue seu link aqui".
- `frontend/src/api.js`: `vote`, `promote`, `promotionStatus`, `webhook` não muda (back-end).
- `frontend/src/styles.css`: estilos do modal de promoção, botão, percentuais.

## Erros e tratamento

- Voto duplicado → HTTP 200 `{ already: true }` (frontend mostra "Agradecemos pelo seu voto, Obrigado!").
- Candidato inválido → 400.
- Asaas falha → mensagem amigável ("Não foi possível gerar o PIX, tente novamente.").
- Asaas devolve erro 400/401/403 → retorna `{ error }` legível.
- Modo `mock` (sem `ASAAS_API_TOKEN`): `POST /api/promote` gera QR Code fake; `POST /api/vote` funciona normalmente; botão "Simular pagamento (demo)" no modal.

## Não escopo (YAGNI)

- Não manter histórico de doações em R$ (remover `donations` da UI; estado antigo pode ser ignorado).
- Não implementar antifraude além do voto único por IP.
- Não criar paginação avançada.

## Testes

- Local: `node --env-file=.env server.js` (mock) — voto único por IP, promote mock, ranking em %.
- Netlify: após deploy, `curl` para `/api/vote` (2× mesmo IP → `already`), `/api/health` (`mode: asaas`).
- Teste PIX real no sandbox Asaas (QR Code copia-e-cola aparece no modal).

## Implantação (passos do usuário)

1. Painel Asaas (sandbox) → Integrações → gerar chave de API (se ainda não tiver).
2. Na Netlify: adicionar variáveis `ASAAS_API_TOKEN`, `ASAAS_WALLET_ID`, `ASAAS_BASE_URL` e redeploy.
3. (Opcional) Cadastrar webhook no Asaas apontando para `https://proximopresidente2027br.netlify.app/api/webhook/asaas`.
4. Validar voto único e pagamento no site publicado.
