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
            <span className={`mode-badge ${mode === 'pushin' ? 'pushin' : 'demo'}`}>
              {mode === 'pushin' ? 'Pushin Pay · PIX' : 'Modo demonstração'}
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
              disabled={promoteOpen}
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
            <strong>Pushin Pay</strong> (PIX). Nenhum voto oficial é emitido neste site.
          </p>
          <p className="footer-contact">
            Suporte: <a href="mailto:chatbots2023@gmail.com">chatbots2023@gmail.com</a>
          </p>
        </div>
      </footer>

      {promoteOpen && (
        <PromoteModal
          siteMode={mode}
          onPaid={handlePromotePaid}
          onClose={() => setPromoteOpen(false)}
        />
      )}

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
