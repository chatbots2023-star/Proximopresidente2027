import { useCallback, useEffect, useState } from 'react';
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
  const [card, setCard] = useState({ holderName: '', number: '', expiry: '', ccv: '' });
  const [phase, setPhase] = useState('form');
  const [charge, setCharge] = useState(null);
  const [creating, setCreating] = useState(false);
  const [statusText, setStatusText] = useState('Aguardando pagamento…');
  const [error, setError] = useState(null);
  const [paidResult, setPaidResult] = useState(null);

  const countdownSeconds = isStripe ? 600 : 60;
  const { seconds, expired, setExpired } = useCountdown(phase === 'payment', countdownSeconds);

  const getStripe = useCallback(async () => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, [publishableKey]);

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
  const cardValid =
    card.holderName.trim() &&
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
        const stripe = await getStripe();
        if (!stripe) {
          setError('A chave pública do Stripe ainda não foi configurada. Aviso o administrador do site.');
          return;
        }
        const { paymentMethod, error: pmErr } = await stripe.createPaymentMethod({
          type: 'card',
          card: {
            number: card.number.replace(/\D/g, ''),
            exp_month: expiry.expiryMonth,
            exp_year: expiry.expiryYear,
            cvc: card.ccv.replace(/\D/g, ''),
          },
          billing_details: {
            name: form.name.trim(),
          },
        });
        if (pmErr) {
          setError(pmErr.message || 'Dados do cartão inválidos.');
          return;
        }
        const { error: confirmErr, paymentIntent } = await stripe.confirmCardPayment(ch.clientSecret, {
          payment_method: paymentMethod.id,
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
              <input
                autoComplete="cc-number"
                value={card.number}
                onChange={(e) => setCard({ ...card, number: e.target.value })}
                placeholder="0000 0000 0000 0000"
              />
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
                <input
                  autoComplete="cc-exp"
                  value={card.expiry}
                  onChange={(e) => setCard({ ...card, expiry: e.target.value })}
                  placeholder="12/28"
                />
              </label>
              <label className="field">
                <span>CVV</span>
                <input
                  autoComplete="cc-csc"
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
