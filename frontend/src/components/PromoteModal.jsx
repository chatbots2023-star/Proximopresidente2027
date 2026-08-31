import { useEffect, useRef, useState } from 'react';
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

const METHOD_OPTIONS = [['pix', 'PIX', 'QR Code na hora']];

function statusLabel(status) {
  switch (status) {
    case 'PAID':
      return 'Pagamento confirmado!';
    case 'CANCELED':
      return 'Cobrança cancelada.';
    case 'EXPIRED':
      return 'Cobrança expirada.';
    default:
      return 'Aguardando pagamento…';
  }
}

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

export default function PromoteModal({ siteMode, onPaid, onClose }) {
  const isLive = siteMode === 'pushin';

  const [form, setForm] = useState({ name: '', network: 'instagram', handle: '', amount: 10 });
  const [method, setMethod] = useState('pix');
  const [phase, setPhase] = useState('form');
  const [charge, setCharge] = useState(null);
  const [creating, setCreating] = useState(false);
  const [statusText, setStatusText] = useState('Aguardando pagamento…');
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState(null);
  const [paidResult, setPaidResult] = useState(null);
  const qrRef = useRef(null);

  const countdownSeconds = isLive ? 600 : 60;
  const { seconds, expired, setExpired } = useCountdown(phase === 'payment', countdownSeconds);

  // renderiza o QR Code a partir do código PIX (EMV)
  useEffect(() => {
    if (phase !== 'payment' || !charge?.qr_code || !qrRef.current) return;
    QRCode.toCanvas(qrRef.current, charge.qr_code, { width: 214, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {});
  }, [phase, charge]);

  // polling de status enquanto aguarda pagamento
  useEffect(() => {
    if (phase !== 'payment' || expired || !charge) return;
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
        if (r.charge?.status) setStatusText(statusLabel(r.charge.status));
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
  }, [phase, expired, charge]);

  const value = Number(form.amount);
  const baseValid = form.name.trim() && form.handle.trim() && Number.isFinite(value) && value >= 10;

  async function startPayment() {
    setError(null);
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

  async function regenerate() {
    setCharge(null);
    setExpired(false);
    await startPayment();
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied('code');
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
              Pague via <strong>PIX</strong> para divulgar seu link no topo da lista (a partir de{' '}
              <strong>R$ 10,00</strong>). Quem paga mais fica no topo.
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

            {isLive && (
              <div className="pushin-disclaimer">
                A PUSHIN PAY atua exclusivamente como processadora de pagamentos e não possui qualquer responsabilidade
                pela entrega, suporte, conteúdo, qualidade ou cumprimento das obrigações relacionadas aos produtos ou
                serviços oferecidos pelo vendedor. Termos:{' '}
                <a href="https://pushinpay.com.br/termos-de-uso" target="_blank" rel="noopener noreferrer">
                  pushinpay.com.br/termos-de-uso
                </a>
              </div>
            )}

            {error && <div className="form-error">{error}</div>}
            <button className="btn btn-primary btn-block" onClick={startPayment} disabled={!baseValid || creating}>
              {creating ? 'Gerando…' : `Gerar PIX de ${formatBRL(value)}`}
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
                  <div className="pay-box-title">Pagamento via PIX</div>
                  <div className="pay-box-amount">Valor: {formatBRL(charge.amount)}</div>
                </div>

                {charge.qr_code_base64 ? (
                  <img className="qr-img" src={charge.qr_code_base64} alt="QR Code PIX" />
                ) : (
                  <div className="qr-box">
                    <canvas ref={qrRef} className="qr-canvas" />
                  </div>
                )}

                {charge.qr_code && (
                  <div className="copy-row">
                    <input
                      readOnly
                      value={charge.qr_code}
                      className="copy-input"
                      onFocus={(e) => e.target.select()}
                    />
                    <button className="copy-btn" onClick={() => copy(charge.qr_code)}>
                      {copied === 'code' ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                )}

                <div className="pay-box-note">
                  Abra o app do seu banco, escaneie o QR Code (ou cole o código) e confirme o pagamento. Assim que o
                  PIX for pago, seu link entra no Top Apoiadores.
                </div>

                <div className="pay-status">
                  <span className="status-dot" />
                  {statusText}
                </div>

                <div className={`countdown ${seconds <= 60 ? 'warn' : ''}`}>
                  <span className="countdown-label">Tempo restante</span>
                  <span className="countdown-time">{mmss}</span>
                </div>

                {!isLive && (
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
