import { useEffect } from 'react';
import CandidateAvatar from './CandidateAvatar.jsx';
import { formatBRL } from '../candidates.js';

function groupThousands(digits) {
  if (!digits) return '0';
  return Number(digits).toLocaleString('pt-BR');
}

export default function UrnaEletronica({ candidate, amount, onDigit, onBackspace, onCorrige, onConfirm, processing }) {
  const value = amount ? parseInt(amount, 10) : 0;
  const canConfirm = !!candidate && value >= 10 && !processing;

  useEffect(() => {
    const handler = (e) => {
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
  }, [canConfirm, onDigit, onBackspace, onConfirm]);

  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];

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
              <div className="screen-amount-label">DIGITE O VALOR R$</div>
              <div className={`screen-amount ${value ? 'has-value' : ''}`}>
                <span className="screen-currency">R$</span>
                {amount ? (
                  <span className="screen-amount-num">{groupThousands(amount)}</span>
                ) : (
                  <span className="screen-cursor">▋</span>
                )}
              </div>
              {value >= 10 ? (
                <div className="screen-hint ok">Aperte CONFIRMA para gerar o pagamento de {formatBRL(value)}</div>
              ) : (
                <div className="screen-hint">Digite o valor (R$ 10 a R$ 10.000) e aperte ENTER</div>
              )}
            </>
          ) : (
            <div className="screen-empty">
              <div className="screen-empty-title">SELECIONE UM CANDIDATO</div>
              <div className="screen-empty-sub">Clique em um candidato da lista ao lado para começar</div>
            </div>
          )}
        </div>
      </div>

      <div className="urna-keypad">
        <div className="keypad-grid">
          {digits.map((d) => (
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
          <span className="urna-foot-hint">Valor R$ · aperte <kbd>ENTER</kbd> ou <kbd>CONFIRMA</kbd></span>        </div>
      </div>
    </div>
  );
}
