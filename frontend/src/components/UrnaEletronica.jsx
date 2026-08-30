import { useEffect } from 'react';
import CandidateAvatar from './CandidateAvatar.jsx';

export default function UrnaEletronica({ candidate, digits, onDigit, onBackspace, onCorrige, onConfirm, processing, disabled }) {
  const canConfirm = !!candidate && !processing && !disabled;

  useEffect(() => {
    if (disabled) return undefined;
    const handler = (e) => {
      const tag = e.target?.tagName;
      const editable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || e.target?.isContentEditable;
      if (editable) return;
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        onDigit(e.key);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        onBackspace();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (canConfirm) onConfirm();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [disabled, canConfirm, onDigit, onBackspace, onConfirm]);

  const digitsList = [1, 2, 3, 4, 5, 6, 7, 8, 9];

  return (
    <div className="urna">
      <div className="urna-top">
        <div className="urna-brand">
          <span className="urna-brand-dot" />
          URNA ELETRÔNICA · 2027
        </div>
      </div>

      <div className="urna-screen">
        <div className="screen-inner">
          {candidate ? (
            <>
              <div className="screen-candidate">
                <div className="screen-avatar">
                  <CandidateAvatar candidate={candidate} size={84} />
                </div>
                <div className="screen-candidate-info">
                  <div className="screen-candidate-name">{candidate.short}</div>
                  <div className="screen-candidate-party">
                    {candidate.party} · Nº <strong>{candidate.number}</strong>
                  </div>
                </div>
              </div>
              <div className="screen-amount-label">VOCÊ CONFIRMA O SEU VOTO?</div>
              <div className={`screen-amount ${digits ? 'has-value' : ''}`}>
                {digits ? (
                  <span className="screen-amount-num">{digits}</span>
                ) : (
                  <span className="screen-cursor">▋</span>
                )}
              </div>
              <div className="screen-hint ok">Aperte CONFIRMA para votar em {candidate.short}</div>
            </>
          ) : digits ? (
            <div className="screen-empty">
              <div className="screen-empty-title">NÚMERO INVÁLIDO</div>
              <div className="screen-empty-sub">Digite o número de um candidato (2 dígitos)</div>
            </div>
          ) : (
            <div className="screen-empty">
              <div className="screen-empty-title">DIGITE O NÚMERO</div>
              <div className="screen-empty-sub">Digite o número do candidato e aperte CONFIRMA</div>
            </div>
          )}
        </div>
      </div>

      <div className="urna-keypad">
        <div className="keypad-grid">
          {digitsList.map((d) => (
            <button key={d} className="key key-num" onClick={() => onDigit(String(d))}>
              {d}
            </button>
          ))}
          <button className="key key-corrige" onClick={onCorrige}>
            CORRIGE
          </button>
          <button className="key key-num" onClick={() => onDigit('0')}>
            0
          </button>
          <button
            className={`key key-confirma ${canConfirm ? 'active' : ''}`}
            onClick={onConfirm}
            disabled={!canConfirm}
          >
            CONFIRMA
          </button>
        </div>
        <div className="urna-foot">
          <span className="urna-foot-hint">Digite o número · aperte <kbd>ENTER</kbd> ou <kbd>CONFIRMA</kbd></span>
        </div>
      </div>
    </div>
  );
}
