import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { getCandidate } from '../candidates.js';
import CandidateAvatar from './CandidateAvatar.jsx';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'agora mesmo';
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

export default function Comments({ candidates }) {
  const [comments, setComments] = useState([]);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.comments();
      setComments(r.comments || []);
    } catch {
      /* silencioso */
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || !message.trim()) {
      setError('Preencha seu nome e uma mensagem.');
      return;
    }
    setSending(true);
    try {
      await api.postComment({ name: name.trim(), message: message.trim(), candidateId: candidateId || null });
      setName('');
      setMessage('');
      setCandidateId('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="comments-section">
      <div className="panel-title">
        <span className="panel-title-line" />
        COMENTÁRIOS
        <span className="panel-title-line" />
      </div>

      <form className="comment-form" onSubmit={submit}>
        <div className="comment-form-top">
          <input
            className="comment-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Seu nome"
            maxLength={40}
          />
          <select
            className="comment-select"
            value={candidateId}
            onChange={(e) => setCandidateId(e.target.value)}
            aria-label="Candidato (opcional)"
          >
            <option value="">Candidato (opcional)</option>
            {(candidates || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.short} · {c.party}
              </option>
            ))}
          </select>
        </div>
        <div className="comment-form-bottom">
          <textarea
            className="comment-textarea"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Deixe seu apoio e interaja com outros eleitores…"
            maxLength={280}
            rows={2}
          />
          <button className="btn btn-primary comment-send" type="submit" disabled={sending}>
            {sending ? 'Enviando…' : 'Enviar'}
          </button>
        </div>
        {error && <div className="form-error">{error}</div>}
      </form>

      <div className="comment-list">
        {comments.length === 0 && (
          <div className="comment-empty">Seja a primeira pessoa a comentar. Deixe seu apoio ao seu candidato!</div>
        )}
        {comments.map((c) => {
          const cand = getCandidate(c.candidateId);
          return (
            <div className="comment-item" key={c.id}>
              <div className="comment-avatar">
                {cand ? (
                  <CandidateAvatar candidate={cand} size={40} />
                ) : (
                  <span className="comment-avatar-fallback">{c.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-name">{c.name}</span>
                  {cand && <span className="comment-candidate" style={{ background: cand.color }}>{cand.short}</span>}
                  <span className="comment-time">{timeAgo(c.ts)}</span>
                </div>
                <p className="comment-message">{c.message}</p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
