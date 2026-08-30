import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
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
  ['site', 'Site ou Blogger'],
];

const METHOD_OPTIONS = [
  ['credit_card', 'Cartão de Crédito', 'Visa, Master etc.'],
];

function useCountdown(active, duration = 60) {
  const [seconds, setSeconds] = useState(duration);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    if (!active) return;
    setSeconds(duration);
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
  }, [active, duration]);
  return { seconds, expired, setExpired };
}

export default function PromoteModal({ siteMode, publishableKey, onPaid, onClose }) {
  const isStripe = siteMode === 'stripe';
  const stripeReady = isStripe && Boolean(publishableKey);

  const [form, setForm] = useState({ name: '', network: 'instagram', handle: '', amount: 10 });
  const [method, setMethod] = useState('credit_card');
  const [card, setCard] = useState({
    holderName: '',
    number: '',
    expiry: '',
    ccv: '',
    email: '',
    taxId: '',
    cep: '',
    address: '',
    city: '',
    state: '',
  });
  const [phase, setPhase] = useState('form');
  const [charge, setCharge] = useState(null);
  const [creating, setCreating] = useState(false);
  const [statusText, setStatusText] = useState('Aguardando pagamento…');
  const [error, setError] = useState(null);
  const [paidResult, setPaidResult] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);
  const cardNumberRef = useRef(null);
  const cardExpiryRef = useRef(null);
  const cardCvcRef = useRef(null);
  const cardNumberEl = useRef(null);
  const cardExpiryEl = useRef(null);
  const cardCvcEl = useRef(null);
  const stripeRef = useRef(null);

  const countdownSeconds = isStripe ? 600 : 60;
  const { seconds, expired, setExpired } = useCountdown(phase === 'payment', countdownSeconds);

  const getStripe = useCallback(async () => {
    if (!publishableKey) return null;
    if (stripeRef.current?.key !== publishableKey) {
      stripeRef.current = { key: publishableKey, instance: await loadStripe(publishableKey) };
    }
    return stripeRef.current.instance;
  }, [publishableKey]);

  // Monta os elementos de cartão do Stripe (número, validade, CVV) quando necessário
  useEffect(() => {
    if (phase !== 'card' || !isStripe || !stripeReady) return;
    let cancelled = false;
    (async () => {
      const stripe = await getStripe();
      if (!stripe || cancelled) return;
      const elements = stripe.elements({ locale: 'pt-BR' });
      const style = {
        base: {
          fontSize: '15px',
          color: '#e6edf3',
          '::placeholder': { color: '#8b949e' },
          '::selection': { backgroundColor: 'rgba(0,200,83,0.3)' },
        },
        invalid: { color: '#f85149' },
      };
      const numberEl = elements.create('cardNumber', { style, showIcon: true });
      const expiryEl = elements.create('cardExpiry', { style });
      const cvcEl = elements.create('cardCvc', { style });
      cardNumberEl.current = numberEl;
      cardExpiryEl.current = expiryEl;
      cardCvcEl.current = cvcEl;
      const state = { number: false, expiry: false, cvc: false };
      const refreshComplete = () => setCardComplete(state.number && state.expiry && state.cvc);
      numberEl.on('change', (e) => {
        state.number = e.complete;
        refreshComplete();
      });
      expiryEl.on('change', (e) => {
        state.expiry = e.complete;
        refreshComplete();
      });
      cvcEl.on('change', (e) => {
        state.cvc = e.complete;
        refreshComplete();
      });
      if (cardNumberRef.current) numberEl.mount(cardNumberRef.current);
      if (cardExpiryRef.current) expiryEl.mount(cardExpiryRef.current);
      if (cardCvcRef.current) cvcEl.mount(cardCvcRef.current);
    })();
    return () => {
      cancelled = true;
      try {
        cardNumberEl.current?.unmount();
        cardExpiryEl.current?.unmount();
        cardCvcEl.current?.unmount();
        cardNumberEl.current?.destroy();
        cardExpiryEl.current?.destroy();
        cardCvcEl.current?.destroy();
      } catch {
        /* noop */
      }
      cardNumberEl.current = null;
      cardExpiryEl.current = null;
      cardCvcEl.current = null;
    };
  }, [phase, isStripe, stripeReady, getStripe]);

  useEffect(() => {
    const isChargedMethod = charge?.method === 'credit_card';
    if (phase !== 'payment' || expired || !isStripe || !charge || !isChargedMethod) return;
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
  }, [phase, expired, isStripe, charge]);

  const value = Number(form.amount);
  const baseValid = form.name.trim() && form.handle.trim() && Number.isFinite(value) && value >= 10;
  const expiryParsed = parseExpiry(card.expiry);
  const cardValid = isStripe
    ? card.holderName.trim() &&
      cardComplete &&
      /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(card.email.trim()) &&
      card.taxId.replace(/\D/g, '').length >= 11 &&
      card.cep.replace(/\D/g, '').length === 8 &&
      card.address.trim().length >= 4 &&
      card.city.trim().length >= 2 &&
      card.state.trim().length >= 2
    : card.holderName.trim() &&
      card.number.replace(/\D/g, '').length >= 13 &&
      Boolean(expiryParsed) &&
      card.ccv.replace(/\D/g, '').length >= 3;

  function parseExpiry(exp) {
    const m = String(exp || '').match(/^\s*(\d{1,2})\s*[\/\-\s]\s*(\d{2,4})\s*$/);
    if (!m) return null;
    let month = m[1].padStart(2, '0');
    let year = m[2].length === 2 ? '20' + m[2] : m[2];
    return { expiryMonth: month, expiryYear: year };
  }

  async function startPayment() {
    setError(null);
    if (method === 'credit_card' && isStripe) {
      setPhase('card');
      return;
    }
    setCreating(true);
    try {
      const ch = await api.promote({
        name: form.name.trim(),
        network: form.network,
        handle: form.handle.trim(),
        amount: value,
        method,
      });
      setCharge(ch);

      setStatusText('Aguardando pagamento…');
      setPhase('payment');
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function payWithCard() {
    if (isStripe) {
      setError(null);
      setCreating(true);
      try {
        const ch = await api.promote({
          name: form.name.trim(),
          network: form.network,
          handle: form.handle.trim(),
          amount: value,
          method: 'credit_card',
          email: card.email.trim(),
        });
        setCharge(ch);
        const stripe = await getStripe();
        if (!stripe || !cardNumberEl.current) {
          setError('A chave pública do Stripe ainda não foi configurada. Aviso o administrador do site.');
          return;
        }
        const { paymentMethod, error: pmErr } = await stripe.createPaymentMethod({
          type: 'card',
          card: cardNumberEl.current,
          billing_details: {
            name: card.holderName.trim(),
            email: card.email.trim(),
            tax_id: card.taxId.replace(/\D/g, ''),
            address: {
              line1: card.address.trim(),
              city: card.city.trim(),
              state: card.state.trim().toUpperCase(),
              postal_code: card.cep.replace(/\D/g, ''),
              country: 'BR',
            },
          },
        });
        if (pmErr) {
          setError(pmErr.message || 'Dados do cartão inválidos.');
          return;
        }
        const { error: confirmErr, paymentIntent } = await stripe.confirmCardPayment(ch.clientSecret, {
          payment_method: paymentMethod.id,
          receipt_email: card.email.trim(),
        });
        if (confirmErr) {
          setError(confirmErr.message || 'Pagamento recusado.');
          return;
        }
        if (paymentIntent?.status === 'succeeded') {
          const r = await api.chargeStatus(ch.reference);
          if (r.promotion) {
            setPaidResult(r);
            setPhase('done');
            return;
          }
        }
        setStatusText('Processando pagamento…');
        setPhase('payment');
      } catch (e) {
        setError(e.message);
      } finally {
        setCreating(false);
      }
      return;
    }

    // modo demonstração
    const expiry = parseExpiry(card.expiry);
    if (!expiry) {
      setError('Validade do cartão inválida. Use o formato MM/AA.');
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const ch = await api.promote({
        name: form.name.trim(),
        network: form.network,
        handle: form.handle.trim(),
        amount: value,
        method: 'credit_card',
      });
      setCharge(ch);
      setStatusText('Processando pagamento…');
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
    await startPayment();
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

  function backToForm() {
    setPhase('form');
    setError(null);
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
              Pague para divulgar seu link no topo da lista (a partir de <strong>R$ 10,00</strong>). Quem paga mais
              fica no topo.
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
              <span>Categoria</span>
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
                placeholder="ex.: @seuperfil ou https://seusite.com.br"
              />
            </label>
            <label className="field">
              <span>Valor da divulgação (R$)</span>
              <div className="amount-stepper">
                <button
                  type="button"
                  className="step-btn"
                  onClick={() => setForm({ ...form, amount: Math.max(10, Math.round((value - 0.1) * 100) / 100) })}
                  disabled={value <= 10}
                  aria-label="Diminuir valor"
                >
                  −
                </button>
                <input
                  className="step-input"
                  type="text"
                  value={form.amount}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const cleaned = raw.replace(/[^\d.,]/g, '');
                    const lastDot = cleaned.lastIndexOf('.');
                    const lastComma = cleaned.lastIndexOf(',');
                    let norm;
                    if (lastDot >= 0 || lastComma >= 0) {
                      const sepIdx = Math.max(lastDot, lastComma);
                      const intPart = cleaned.slice(0, sepIdx).replace(/[.,]/g, '');
                      const decPart = cleaned.slice(sepIdx + 1).replace(/[.,]/g, '').slice(0, 2);
                      norm = decPart ? `${intPart}.${decPart}` : `${intPart}.`;
                    } else {
                      norm = cleaned.replace(/[.,]/g, '');
                    }
                    if (norm.split('.')[0].length > 5) return;
                    const n = parseFloat(norm);
                    if (n > 10000) return;
                    setForm({ ...form, amount: norm });
                  }}
                  placeholder="10.00"
                  aria-label="Valor da divulgação em reais"
                />
                <button
                  type="button"
                  className="step-btn"
                  onClick={() => setForm({ ...form, amount: Math.min(10000, Math.round((value + 0.1) * 100) / 100) })}
                  disabled={value >= 10000}
                  aria-label="Aumentar valor"
                >
                  +
                </button>
              </div>
            </label>

            <div className="method-label">Forma de pagamento</div>
            <div className="method-tabs">
              {METHOD_OPTIONS.map(([id, label, sub]) => (
                <button
                  key={id}
                  type="button"
                  className={`method-tab ${method === id ? 'active' : ''}`}
                  onClick={() => setMethod(id)}
                >
                  <span className="method-name">{label}</span>
                  <span className="method-sub">{sub}</span>
                </button>
              ))}
            </div>

            {isStripe && !publishableKey && (
              <div className="form-error">
                A chave pública do Stripe (pk_live) ainda não foi configurada. O administrador precisa adicioná-la
                para processar pagamentos.
              </div>
            )}

            {error && <div className="form-error">{error}</div>}
            <button
              className="btn btn-primary btn-block"
              onClick={startPayment}
              disabled={!baseValid || creating}
            >
              {creating ? 'Gerando…' : method === 'credit_card' && isStripe ? 'Continuar para o cartão' : 'Gerar pagamento e divulgar'}
            </button>
          </div>
        )}

        {phase === 'card' && isStripe && (
          <div className="checkout-form">
            <div className="checkout-note">
              Cartão de crédito processado com segurança pelo <strong>Stripe</strong>.
            </div>
            <label className="field">
              <span>Número do cartão</span>
              <div ref={cardNumberRef} className="stripe-card-element" />
            </label>
            <label className="field">
              <span>Nome impresso no cartão</span>
              <input
                autoComplete="cc-name"
                value={card.holderName}
                onChange={(e) => setCard({ ...card, holderName: e.target.value })}
                placeholder="Como está no cartão"
              />
            </label>
            <div className="card-row">
              <label className="field">
                <span>Validade (MM/AA)</span>
                <div ref={cardExpiryRef} className="stripe-card-element" />
              </label>
              <label className="field">
                <span>CVV</span>
                <div ref={cardCvcRef} className="stripe-card-element" />
              </label>
            </div>
            <div className="card-row">
              <label className="field">
                <span>CPF ou CNPJ</span>
                <input
                  autoComplete="off"
                  inputMode="numeric"
                  value={card.taxId}
                  onChange={(e) => setCard({ ...card, taxId: e.target.value })}
                  placeholder="Somente números"
                />
              </label>
              <label className="field">
                <span>CEP</span>
                <input
                  autoComplete="postal-code"
                  inputMode="numeric"
                  value={card.cep}
                  onChange={(e) => setCard({ ...card, cep: e.target.value })}
                  placeholder="00000-000"
                />
              </label>
            </div>
            <label className="field">
              <span>Endereço de cobrança</span>
              <input
                autoComplete="street-address"
                value={card.address}
                onChange={(e) => setCard({ ...card, address: e.target.value })}
                placeholder="Rua, número, complemento"
              />
            </label>
            <div className="card-row">
              <label className="field">
                <span>Cidade</span>
                <input
                  autoComplete="address-level2"
                  value={card.city}
                  onChange={(e) => setCard({ ...card, city: e.target.value })}
                  placeholder="Cidade"
                />
              </label>
              <label className="field">
                <span>Estado (UF)</span>
                <input
                  autoComplete="address-level1"
                  value={card.state}
                  onChange={(e) => setCard({ ...card, state: e.target.value.toUpperCase() })}
                  placeholder="SP"
                  maxLength={2}
                />
              </label>
            </div>
            <label className="field">
              <span>E-mail para o recibo</span>
              <input
                autoComplete="email"
                type="email"
                value={card.email}
                onChange={(e) => setCard({ ...card, email: e.target.value })}
                placeholder="seu@email.com"
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-block" onClick={payWithCard} disabled={!cardValid || creating}>
              {creating ? 'Processando…' : `Pagar ${formatBRL(value)} no cartão`}
            </button>
            <button className="btn btn-ghost btn-block" onClick={backToForm} disabled={creating}>
              Voltar
            </button>
          </div>
        )}

        {phase === 'card' && !isStripe && (
          <div className="checkout-form">
            <div className="checkout-note">
              Cartão de crédito <strong>(modo demonstração)</strong> — nenhum valor é cobrado.
            </div>
            <label className="field">
              <span>Número do cartão</span>
              <input
                value={card.number}
                onChange={(e) => setCard({ ...card, number: e.target.value })}
                placeholder="0000 0000 0000 0000"
              />
            </label>
            <label className="field">
              <span>Nome impresso no cartão</span>
              <input
                value={card.holderName}
                onChange={(e) => setCard({ ...card, holderName: e.target.value })}
                placeholder="Como está no cartão"
              />
            </label>
            <div className="card-row">
              <label className="field">
                <span>Validade (MM/AA)</span>
                <input
                  value={card.expiry}
                  onChange={(e) => setCard({ ...card, expiry: e.target.value })}
                  placeholder="12/28"
                />
              </label>
              <label className="field">
                <span>CVV</span>
                <input
                  value={card.ccv}
                  onChange={(e) => setCard({ ...card, ccv: e.target.value })}
                  placeholder="123"
                />
              </label>
            </div>
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-block" onClick={payWithCard} disabled={!cardValid || creating}>
              {creating ? 'Processando…' : `Pagar ${formatBRL(value)} no cartão`}
            </button>
            <button className="btn btn-ghost btn-block" onClick={backToForm} disabled={creating}>
              Voltar
            </button>
          </div>
        )}

        {phase === 'payment' && charge && (
          <div className="pay-box">
            {expired ? (
              <div className="expired-box">
                <div className="expired-title">Tempo esgotado</div>
                <div className="expired-sub">Esta cobrança expirou. Gere uma nova para continuar.</div>
                <button className="btn btn-primary btn-block" onClick={regenerate} disabled={creating}>
                  {creating ? 'Gerando…' : 'Gerar nova cobrança'}
                </button>
              </div>
            ) : (
              <>
                <div className="pay-box-inner">
                  <div className="pay-box-title">Cartão de Crédito</div>
                  <div className="pay-box-amount">Valor: {formatBRL(charge.amount)}</div>
                  <div className="pay-box-note">
                    Pagamento processado pelo Stripe. Assim que o cartão for aprovado, seu link entra no Top
                    Apoiadores.
                  </div>
                </div>

                <div className="pay-status">
                  <span className="status-dot" />
                  {statusText}
                </div>

                <div className={`countdown ${seconds <= 60 ? 'warn' : ''}`}>
                  <span className="countdown-label">Tempo restante</span>
                  <span className="countdown-time">{mmss}</span>
                </div>

                {!isStripe && (
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
