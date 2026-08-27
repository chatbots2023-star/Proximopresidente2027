import { formatBRL } from '../candidates.js';

export const TOP_COLORS = ['#39FF14', '#00A2FF', '#FFD700', '#A855F7', '#FF3B3B'];

function positionColor(index) {
  return index < 4 ? TOP_COLORS[index] : TOP_COLORS[4];
}

function initials(name) {
  return (
    (name || '?')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('') || '?'
  );
}

export default function TopSupporters({ supporters }) {
  return (
    <div className="supporters-col">
      <div className="panel-title">
        <span className="panel-title-line" />
        TOP APOIADORES
        <span className="panel-title-line" />
      </div>
      <div className="supporters-list">
        {supporters.length === 0 ? (
          <div className="supporters-empty">
            Nenhum apoiador divulgado ainda.
            <br />
            Pague e divulgue seu perfil!
          </div>
        ) : (
          supporters.map((s, i) => (
            <a
              key={s.id}
              href={s.profileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="supporter-row"
              style={{ '--pos-color': positionColor(i) }}
            >
              <span className="supporter-pos" style={{ background: positionColor(i) }}>
                {i + 1}
              </span>
              <span className="supporter-avatar">{initials(s.name)}</span>
              <span className="supporter-body">
                <span className="supporter-name">{s.name}</span>
                <span className="supporter-meta">
                  <span className="supporter-network">{s.networkLabel}</span>
                  <span className="supporter-amount">
                    {formatBRL(s.amount)}
                  </span>
                </span>
              </span>
            </a>
          ))
        )}
      </div>
      <div className="supporters-note">Maior valor no topo · últimos 20 pagantes</div>
    </div>
  );
}
