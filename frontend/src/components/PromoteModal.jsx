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
  ['site', 'Site ou Blogger'],
];

const METHOD_OPTIONS = [
  ['pix', 'PIX', 'QR Code via Asaas'],
  ['usdt', 'USDT (TRC20)', 'Rede TRON'],
  ['credit_card', 'Cartão de Crédito', 'Visa, Master etc.'],
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
  const [method, setMethod] = useState('pix');
  const [card, setCard] = useState({ holderName: '', number: '', expiry: '', ccv: '' });
  const [holder, setHolder] = useState({ email: '', cpfCnpj: '', postalCode: '', addressNumber: '', phone: '' });
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
    const isAsaasMethod = charge?.method === 'pix' || charge?.method === 'credit_card';
    if (phase !== 'payment' || expired || siteMode !== 'asaas' || !charge || !isAsaasMethod) return;
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
    if (method === 'credit_card') {
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
      } else {
        setStatusText('Aguardando pagamento…');
        setPhase('payment');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function payWithCard() {
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
        card: {
          holderName: card.holderName.trim(),
          number: card.number.replace(/\D/g, ''),
          expiryMonth: expiry.expiryMonth,
          expiryYear: expiry.expiryYear,
          ccv: card.ccv.replace(/\D/g, ''),
        },
        cardHolder: {
          name: form.name.trim(),
          email: holder.email.trim(),
          cpfCnpj: holder.cpfCnpj.replace(/\D/g, ''),
          postalCode: holder.postalCode.replace(/\D/g, ''),
          addressNumber: holder.addressNumber.trim(),
          phone: holder.phone.replace(/\D/g, ''),
        },
      });
      setCharge(ch);
      if (ch.promotion) {
        setPaidResult(ch);
        setPhase('done');
      } else {
        setStatusText('Processando pagamento…');
        setPhase('payment');
      }
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

            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-block" onClick={startPayment} disabled={!baseValid || creating}>
              {creating ? 'Gerando…' : method === 'credit_card' ? 'Continuar para o cartão' : 'Gerar pagamento e divulgar'}
            </button>
          </div>
        )}

        {phase === 'card' && (
          <div className="checkout-form">
            <div className="checkout-note">
              Cartão de crédito processado com segurança pelo <strong>Asaas</strong>.
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
                <div className="expired-sub">Esta cobrança expirou após 1 minuto. Gere uma nova para continuar.</div>
                <button className="btn btn-primary btn-block" onClick={regenerate} disabled={creating}>
                  {creating ? 'Gerando…' : 'Gerar nova cobrança'}
                </button>
              </div>
            ) : (
              <>
                {charge.method === 'pix' ? (
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
                ) : (
                  <div className="usdt-box">
                    <div className="usdt-title">Cartão de Crédito</div>
                    <div className="usdt-amount">Valor: {formatBRL(charge.amount)}</div>
                    <div className="usdt-note">
                      Pagamento processado pelo Asaas. Assim que o cartão for aprovado, seu link entra no Top
                      Apoiadores.
                    </div>
                  </div>
                )}

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
