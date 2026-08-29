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
