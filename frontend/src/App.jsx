import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api.js';
import { getCandidate, formatBRL, formatCompact } from './candidates.js';
import CanvasBackground from './components/CanvasBackground.jsx';
import Confetti from './components/Confetti.jsx';
import CandidateAvatar from './components/CandidateAvatar.jsx';
import UrnaEletronica from './components/UrnaEletronica.jsx';
import CheckoutModal from './components/CheckoutModal.jsx';
import Comments from './components/Comments.jsx';
import TopSupporters from './components/TopSupporters.jsx';

function useAnimatedNumber(target) {
  const [display, setDisplay] = useState(target || 0);
  useEffect(() => {
    const from = display;
    const to = target || 0;
    const diff = to - from;
    if (diff === 0) return;
    const dur = 700;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + diff * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return display;
}

function Ticker({ items }) {
  const line = items.map((d) => {
    const c = getCandidate(d.candidateId);
    const val = formatBRL(d.amount);
    return `${d.name} apoiou ${c ? c.short : 'um candidato'} com ${val}`;
  });
  if (!line.length) line.push('Seja a primeira pessoa a apoiar um candidato');
  const content = line.join('   •   ');
  return (
    <div className="ticker">
      <div className="ticker-track">
        <span>{content}</span>
        <span aria-hidden="true">{content}</span>
      </div>
    </div>
  );
}

const POSITION_META = {
  0: { label: '1º LUGAR', cls: 'pos-gold', medal: 'OURO' },
  1: { label: '2º LUGAR', cls: 'pos-silver', medal: 'PRATA' },
  2: { label: '3º LUGAR', cls: 'pos-bronze', medal: 'BRONZE' },
};

export default function App() {
  const [data, setData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [amount, setAmount] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
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
  const selected = getCandidate(selectedId);
  const maxTotal = useMemo(() => (candidates.length ? Math.max(...candidates.map((c) => c.total), 1) : 1), [candidates]);
  const animatedRaised = useAnimatedNumber(data?.totalRaised || 0);

  const processConfirm = useCallback(
    (res) => {
      if (!res || !res.ok) {
        showToast(res?.error || 'Não foi possível confirmar o pagamento.');
        return;
      }
      if (res.state) setData(res.state);
      if (res.already) {
        showToast('Este pagamento já foi registrado.');
        return;
      }
      setConfetti((n) => n + 1);
      setCelebration(res);
    },
    [showToast]
  );

  const selectCandidate = useCallback((id) => {
    setSelectedId(id);
    setAmount('');
    if (urnaRef.current && window.innerWidth < 1024) {
      urnaRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const onDigit = useCallback((d) => {
    setAmount((prev) => {
      const next = (prev || '') + d;
      if (next.length > 5) return prev;
      if (parseInt(next, 10) > 10000) return prev;
      return next;
    });
  }, []);

  const onBackspace = useCallback(() => setAmount((p) => (p || '').slice(0, -1)), []);
  const onCorrige = useCallback(() => setAmount(''), []);

  const onConfirm = useCallback(() => {
    const value = parseInt(amount, 10);
    if (!selected || !value || value < 10) return;
    setCheckoutOpen(true);
  }, [amount, selected]);

  const mode = data?.mode || 'mock';

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
            <span className={`mode-badge ${mode === 'pepper' ? 'stripe' : 'demo'}`}>
              {mode === 'pepper' ? 'Pepper · PIX' : 'Modo demonstração'}
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
            Eleição digital 100% justa e democratizada. Doe o valor que quiser ao seu candidato e veja o ranking subir ao
            vivo.
          </p>
          <div className="hero-stats">
            <div className="stat-card">
              <span className="stat-label">Arrecadado</span>
              <span className="stat-value">{formatBRL(animatedRaised)}</span>
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

        <Ticker items={data?.recent || []} />

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
                const pct = (c.total / maxTotal) * 100;
                const isSel = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    className={`rank-row ${meta ? meta.cls : ''} ${isSel ? 'selected' : ''}`}
                    onClick={() => selectCandidate(c.id)}
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
                        <span className="rank-bar-fill" style={{ width: `${Math.max(pct, c.total ? 2 : 0)}%`, background: c.color }} />
                      </span>
                    </span>
                    <span className="rank-total">
                      <span className="rank-total-value">{formatBRL(c.total)}</span>
                      <span className="rank-total-support">
                        {c.supporters} {c.supporters === 1 ? 'apoio' : 'apoios'}
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
              candidate={selected}
              amount={amount}
              onDigit={onDigit}
              onBackspace={onBackspace}
              onCorrige={onCorrige}
              onConfirm={onConfirm}
              processing={false}
            />
            <div className="urna-legend">
              <span><b>1</b> Escolha seu candidato</span>
              <span><b>2</b> Digite o valor R$</span>
              <span><b>3</b> Aperte ENTER</span>
              <span><b>4</b> Pague com PIX</span>
            </div>
          </div>

          <TopSupporters supporters={data?.topSupporters || []} />
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
                className={`candidate-card ${c.id === selectedId ? 'selected' : ''}`}
                onClick={() => selectCandidate(c.id)}
              >
                {i === 0 && <span className="card-crown">♛ TOP 1</span>}
                <span className="card-number" style={{ color: c.color }}>{c.number}</span>
                <span className="card-avatar">
                  <CandidateAvatar candidate={c} size={108} ring />
                </span>
                <span className="card-name">{c.short}</span>
                <span className="card-party" style={{ background: c.color }}>{c.party}</span>
                <span className="card-total">{formatBRL(c.total)}</span>
                <span className="card-action">APOIAR AGORA</span>
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
            Projeto demonstrativo de votação por doações. Pagamentos processados de forma segura via{' '}
            <strong>Pepper</strong> (PIX). Nenhum voto oficial é emitido neste site.
          </p>
        </div>
      </footer>

      {checkoutOpen && selected && (
        <CheckoutModal
          candidate={selected}
          amount={parseInt(amount, 10) || 0}
          siteMode={mode}
          onPaid={processConfirm}
          onClose={() => setCheckoutOpen(false)}
        />
      )}

      {celebration && (
        <div className="celebration" onClick={() => setCelebration(null)}>
          <div className="celebration-card">
            <div className="celebration-badge">PARABÉNS</div>
            <div className="celebration-avatar">
              <CandidateAvatar candidate={getCandidate(celebration.donation?.candidateId)} size={120} ring />
            </div>
            <div className="celebration-name">
              {getCandidate(celebration.donation?.candidateId)?.short || 'Seu candidato'}
            </div>
            <div className="celebration-amount">
              Doação de {formatBRL(celebration.donation?.amount || 0)} confirmada
            </div>
            {celebration.isTop1 ? (
              <div className="celebration-top1">TOP 1 DO RANKING</div>
            ) : celebration.promoted ? (
              <div className="celebration-move">
                Seu candidato subiu do <b>#{celebration.from}</b> para o <b>#{celebration.to}</b>
              </div>
            ) : (
              <div className="celebration-move">
                Seu candidato está na posição <b>#{celebration.to}</b> do ranking
              </div>
            )}
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
