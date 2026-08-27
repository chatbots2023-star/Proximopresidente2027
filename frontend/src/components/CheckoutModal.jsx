import { useCallback, useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import CandidateAvatar from './CandidateAvatar.jsx';
import { formatBRL } from '../candidates.js';
import { api } from '../api.js';

const METHODS = [{ id: 'pix', label: 'PIX', desc: 'QR Code na hora' }];

const SOCIAL_OPTIONS = [
  ['instagram', 'Instagram'],
  ['youtube', 'YouTube'],
  ['linkedin', 'LinkedIn'],
  ['facebook', 'Facebook'],
  ['tiktok', 'TikTok'],
  ['kwai', 'Kwai'],
  ['x', 'X (Twitter)'],
];

function statusLabel(status) {
  switch (status) {
    case 'PAID':
    case 'FINISHED':
      return 'Pagamento confirmado!';
    case 'PENDING':
    case 'WAITING':
      return 'Aguardando pagamento…';
    case 'CONFIRMING':
      return 'Confirmando pagamento…';
    case 'CANCELED':
      return 'Cobrança cancelada.';
    case 'EXPIRED':
      return 'Cobrança expirada.';
    case 'REFUSED':
      return 'Pagamento recusado.';
    case 'REFUNDED':
      return 'Pagamento estornado.';
    default:
      return 'Aguardando pagamento…';
  }
}

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

export default function CheckoutModal({ candidate, amount, siteMode, onPaid, onClose }) {
  const [method, setMethod] = useState('pix');
  const [phase, setPhase] = useState('form'); // 'form' | 'payment'
  const [charge, setCharge] = useState(null);
  const [creating, setCreating] = useState(false);
  const [statusText, setStatusText] = useState('Aguardando pagamento…');
  const [copied, setCopied] = useState(null);
  const [error, setError] = useState(null);
  const [paidResult, setPaidResult] = useState(null);
  const [socialForm, setSocialForm] = useState({ name: '', network: 'instagram', handle: '' });
  const [socialError, setSocialError] = useState(null);
  const [submittingSocial, setSubmittingSocial] = useState(false);
  const qrRef = useRef(null);

  const { seconds, expired, setExpired } = useCountdown(phase === 'payment');

  const isPix = true;

  const handlePaid = useCallback((result) => {
    setPaidResult(result);
    setPhase('social');
  }, []);

  // renderiza o QR Code a partir do qrCodeText
  useEffect(() => {
    if (phase !== 'payment' || !isPix || !charge?.qrCodeText || !qrRef.current) return;
    QRCode.toCanvas(qrRef.current, charge.qrCodeText, { width: 216, margin: 1, errorCorrectionLevel: 'M' }).catch(() => {});
  }, [phase, isPix, charge]);

  // polling de status enquanto aguarda pagamento
  useEffect(() => {
    if (phase !== 'payment' || expired || siteMode !== 'pepper' || !charge) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await api.chargeStatus(charge.reference);
        if (!alive) return;
        if (r.donation) {
          handlePaid(r);
          return;
        }
        if (r.charge?.status) setStatusText(statusLabel(r.charge.status));
      } catch {
        /* mantém o estado atual */
      }
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [phase, expired, siteMode, charge, handlePaid]);

  async function handleCreate() {
    setError(null);
    setCreating(true);
    try {
      const payload = { method, candidateId: candidate.id, amount };
      const ch = await api.checkout(payload);
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
    setStatusText('Aguardando pagamento…');
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
      handlePaid(r);
    } catch (e) {
      setError(e.message);
    }
  }

  async function submitSocial() {
    setSocialError(null);
    if (!socialForm.name.trim()) return setSocialError('Informe seu nome ou apelido.');
    if (!socialForm.handle.trim()) return setSocialError('Informe seu usuário ou o link do perfil.');
    setSubmittingSocial(true);
    try {
      await api.donationSocial(paidResult?.donation?.reference, socialForm);
      onPaid(paidResult);
      onClose();
    } catch (e) {
      setSocialError(e.message);
      setSubmittingSocial(false);
    }
  }

  function skipSocial() {
    onPaid(paidResult);
    onClose();
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="checkout checkout-pepper" onClick={(e) => e.stopPropagation()}>
        <div className="checkout-header">
          <span className="checkout-shield">PAGAMENTO PIX</span>
          <button className="checkout-close" onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div className="checkout-summary">
          <div className="checkout-avatar">
            <CandidateAvatar candidate={candidate} size={64} />
          </div>
          <div className="checkout-summary-text">
            <div className="checkout-candidate">{candidate.short}</div>
            <div className="checkout-party">
              {candidate.party} · Nº {candidate.number}
            </div>
            <div className="checkout-amount">{formatBRL(amount)}</div>
          </div>
        </div>

        {phase === 'form' && (
          <>
            <div className="checkout-form">
              <div className="checkout-note">
                Você vai doar <strong>{formatBRL(amount)}</strong>. O QR Code PIX será gerado na hora, sem precisar
                informar seus dados.
              </div>
              <button className="btn btn-primary btn-block" onClick={handleCreate} disabled={creating}>
                {creating ? 'Gerando…' : `Gerar PIX de ${formatBRL(amount)}`}
              </button>
            </div>
            {error && <div className="form-error">{error}</div>}
          </>
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
                    <input readOnly value={charge.qrCodeText || ''} className="copy-input" onFocus={(e) => e.target.select()} />
                    <button className="copy-btn" onClick={() => copy(charge.qrCodeText, 'code')}>
                      {copied === 'code' ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                  <div className="pay-amount">Valor: {formatBRL(amount)}</div>
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

        {phase === 'social' && paidResult && (
          <div className="social-box">
            <div className="social-title">Pagamento confirmado!</div>
            <div className="social-sub">
              Divulgue seu apoio na lista de <strong>Top Apoiadores</strong> (opcional). Escolha <strong>UMA</strong> rede
              social:
            </div>
            <div className="social-networks">
              {SOCIAL_OPTIONS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  className={`social-network ${socialForm.network === id ? 'active' : ''}`}
                  onClick={() => setSocialForm({ ...socialForm, network: id })}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="field">
              <span>Nome que vai aparecer na lista</span>
              <input
                value={socialForm.name}
                onChange={(e) => setSocialForm({ ...socialForm, name: e.target.value })}
                placeholder="Seu nome ou apelido"
              />
            </label>
            <label className="field">
              <span>Usuário ou link do perfil</span>
              <input
                value={socialForm.handle}
                onChange={(e) => setSocialForm({ ...socialForm, handle: e.target.value })}
                placeholder="ex.: @seuperfil"
              />
            </label>
            {socialError && <div className="form-error">{socialError}</div>}
            <button className="btn btn-primary btn-block" onClick={submitSocial} disabled={submittingSocial}>
              {submittingSocial ? 'Salvando…' : 'Divulgar na lista'}
            </button>
            <button className="btn-ghost btn-block" onClick={skipSocial}>
              Pular por enquanto
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
