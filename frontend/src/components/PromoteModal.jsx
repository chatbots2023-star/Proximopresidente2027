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
  ['usdt', 'USDT (TRC20)', 'Rede TRON'],
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

  const [form, setForm] = useState({ name: '', network: 'instagram', handle: '', amount: '' });
  const [method, setMethod] = useState('credit_card');
  const [card, setCard] = useState({ holderName: '', number: '', expiry: '', ccv: '' });
  const [holder, setHolder] = useState({ email: '', cpfCnpj: '', postalCode: '', addressNumber: '', phone: '' });
  const [phase, setPhase] = useState('form');
  const [charge, setCharge] = useState(null);
  const [creating, setCreating] = useState(false);
  const [statusText, setStatusText] = useState('Aguardando pagamento…');
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState(null);
  const [paidResult, setPaidResult] = useState(null);
  const cardMountRef = useRef(null);
  const cardElRef = useRef(null);

  const countdownSeconds = isStripe ? 600 : 60;
  const { seconds, expired, setExpired } = useCountdown(phase === 'payment', countdownSeconds);

  const getStripe = useCallback(async () => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, [publishableKey]);

  // Monta o elemento de cartão (Stripe Elements) quando necessário
  useEffect(() => {
    if (phase !== 'card' || !isStripe || !stripeReady) return;
    let cancelled = false;
    (async () => {
      const stripe = await getStripe();
      if (!stripe || cancelled) return;
      const elements = stripe.elements({ locale: 'pt-BR' });
      const el = elements.create('card', {
        style: {
          base: { fontSize: '15px', color: '#e6edf3', '::placeholder': { color: '#8b949e' } },
          invalid: { color: '#f85149' },
        },
      });
      cardElRef.current = el;
      el.mount(cardMountRef.current);
    })();
    return () => {
      cancelled = true;
      try {
        cardElRef.current?.unmount();
        cardElRef.current?.destroy();
      } catch {
        /* noop */
      }
      cardElRef.current = null;
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
  const cardValid =
    card.holderName.trim() &&
    card.number.replace(/\D/g, '').length >= 13 &&
    card.expiry.trim() &&
    card.ccv.trim() &&
    holder.email.trim() &&
    holder.cpfCnpj.replace(/\D/g, '').length >= 11 &&
    holder.postalCode.replace(/\D/g, '').length === 8 &&
    holder.addressNumber.trim() &&
    holder.phone.replace(/\D/g, '').length >= 10;

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

      if (method === 'usdt') {
        setPhase('usdt');
        return;
      }

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
        });
        setCharge(ch);
        const stripe = await getStripe();
        if (!stripe || !cardElRef.current) {
          setError('A chave pública do Stripe ainda não foi configurada. Aviso o administrador do site.');
          return;
        }
        const { error: confirmErr, paymentIntent } = await stripe.confirmCardPayment(ch.clientSecret, {
          payment_method: {
            card: cardElRef.current,
            billing_details: {
              name: form.name.trim(),
              email: holder.email.trim(),
              tax_id: holder.cpfCnpj.replace(/\D/g, ''),
              phone: holder.phone.replace(/\D/g, ''),
              address: {
                postal_code: holder.postalCode.replace(/\D/g, ''),
                country: 'BR',
              },
            },
          },
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

  async function confirmUsdt() {
    if (!charge) return;
    setStatusText('Confirmando envio…');
    setCreating(true);
    try {
      const r = await api.confirm(charge.reference);
      setPaidResult(r);
      setPhase('done');
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
              <input
                type="number"
                min={10}
                max={10000}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="10"
              />
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
              <span>Cartão</span>
              <div ref={cardMountRef} className="stripe-card-element" />
            </label>
            <label className="field">
              <span>Nome impresso no cartão</span>
              <input
                value={card.holderName}
                onChange={(e) => setCard({ ...card, holderName: e.target.value })}
                placeholder="Como está no cartão"
              />
            </label>

            <div className="method-label">Dados do titular</div>
            <div className="card-row">
              <label className="field">
                <span>CPF</span>
                <input
                  value={holder.cpfCnpj}
                  onChange={(e) => setHolder({ ...holder, cpfCnpj: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </label>
              <label className="field">
                <span>CEP</span>
                <input
                  value={holder.postalCode}
                  onChange={(e) => setHolder({ ...holder, postalCode: e.target.value })}
                  placeholder="00000-000"
                />
              </label>
            </div>
            <div className="card-row">
              <label className="field">
                <span>Nº do endereço</span>
                <input
                  value={holder.addressNumber}
                  onChange={(e) => setHolder({ ...holder, addressNumber: e.target.value })}
                  placeholder="123"
                />
              </label>
              <label className="field">
                <span>Telefone (com DDD)</span>
                <input
                  value={holder.phone}
                  onChange={(e) => setHolder({ ...holder, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </label>
            </div>
            <label className="field">
              <span>E-mail do titular</span>
              <input
                type="email"
                value={holder.email}
                onChange={(e) => setHolder({ ...holder, email: e.target.value })}
                placeholder="voce@email.com"
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

        {phase === 'usdt' && charge && (
          <div className="pay-box">
            <div className="usdt-box">
              <div className="usdt-title">USDT · TRON (TRC20)</div>
              <div className="usdt-amount">Valor: {formatBRL(charge.amount)}</div>
              <div className="usdt-note">
                Envie o valor equivalente via USDT para o endereço abaixo usando a rede <strong>TRON (TRC20)</strong>.
                Após enviar, clique em "Já enviei o pagamento" para publicar seu link.
              </div>
              <div className="copy-row">
                <input readOnly value={charge.usdtAddress || ''} className="copy-input" onFocus={(e) => e.target.select()} />
                <button className="copy-btn" onClick={() => copy(charge.usdtAddress, 'usdt')}>
                  {copied === 'usdt' ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-block" onClick={confirmUsdt} disabled={creating}>
              {creating ? 'Confirmando…' : 'Já enviei o pagamento (USDT)'}
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
                <div className="usdt-box">
                  <div className="usdt-title">Cartão de Crédito</div>
                  <div className="usdt-amount">Valor: {formatBRL(charge.amount)}</div>
                  <div className="usdt-note">
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
