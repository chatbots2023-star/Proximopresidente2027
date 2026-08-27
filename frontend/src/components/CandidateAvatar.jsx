import { useState } from 'react';

function shade(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (n >> 16) + amt));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
  return `rgb(${r},${g},${b})`;
}

export default function CandidateAvatar({ candidate, size = 120, className = '', ring = false }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const s = candidate.style || {};

  if (candidate.photo && !photoFailed) {
    return (
      <img
        src={candidate.photo}
        width={size}
        height={size}
        alt={candidate.name}
        loading="lazy"
        className={className}
        onError={() => setPhotoFailed(true)}
        style={{
          borderRadius: '50%',
          objectFit: 'cover',
          objectPosition: 'center top',
          background: candidate.color,
          boxShadow: ring ? `0 0 0 3px ${candidate.color}` : undefined,
        }}
      />
    );
  }
  const color = candidate.color || '#666';
  const bgId = `bg-${candidate.id}`;
  const suitId = `suit-${candidate.id}`;

  const hairPath = (style) => {
    switch (style) {
      case 'bald':
        return null;
      case 'short':
        return (
          <path
            d="M63 74 A36 42 0 0 1 137 74 Q139 62 128 56 Q100 44 72 56 Q61 62 63 74 Z"
            fill={s.hairColor}
          />
        );
      case 'curly':
        return (
          <g fill={s.hairColor}>
            <circle cx="100" cy="46" r="12" />
            <circle cx="82" cy="50" r="10" />
            <circle cx="118" cy="50" r="10" />
            <circle cx="70" cy="60" r="9" />
            <circle cx="130" cy="60" r="9" />
            <path d="M64 78 A36 42 0 0 1 136 78 Q138 62 126 56 Q100 44 74 56 Q62 62 64 78 Z" />
          </g>
        );
      case 'long':
        return (
          <g fill={s.hairColor}>
            <path d="M60 84 Q56 66 66 58 Q82 42 100 42 Q118 42 134 58 Q144 66 140 84 Q136 116 128 128 Q124 136 118 138 L118 122 Q124 118 126 104 L122 88 Q120 66 100 66 Q80 66 78 88 L74 104 Q76 118 82 122 L82 138 Q76 136 72 128 Q64 116 60 84 Z" />
            <path d="M62 74 A36 42 0 0 1 138 74 Q140 62 130 56 Q100 44 70 56 Q60 62 62 74 Z" />
          </g>
        );
      default: // medium
        return (
          <g fill={s.hairColor}>
            <path d="M62 74 A36 42 0 0 1 138 74 Q139 62 128 56 Q100 44 72 56 Q61 62 62 74 Z" />
            <path d="M62 80 Q60 96 62 108 L74 106 Q72 92 72 82 Z" />
            <path d="M138 80 Q140 96 138 108 L126 106 Q128 92 128 82 Z" />
          </g>
        );
    }
  };

  const eyes = (
    <g>
      <ellipse cx="80" cy="86" rx="4.6" ry="3.8" fill="#241f1c" />
      <ellipse cx="120" cy="86" rx="4.6" ry="3.8" fill="#241f1c" />
      <circle cx="81.5" cy="84.6" r="1.3" fill="#fff" />
      <circle cx="121.5" cy="84.6" r="1.3" fill="#fff" />
    </g>
  );

  const glasses = (
    <g>
      <circle cx="80" cy="86" r="9" fill="rgba(0,0,0,0.10)" stroke="#1a1a1a" strokeWidth="2.2" />
      <circle cx="120" cy="86" r="9" fill="rgba(0,0,0,0.10)" stroke="#1a1a1a" strokeWidth="2.2" />
      <path d="M89 86 L111 86" stroke="#1a1a1a" strokeWidth="2.2" />
      <path d="M71 84 L62 81" stroke="#1a1a1a" strokeWidth="2.2" />
      <path d="M129 84 L138 81" stroke="#1a1a1a" strokeWidth="2.2" />
    </g>
  );

  const beard = s.beard ? (
    <path
      d="M70 106 Q68 132 100 136 Q132 132 130 106 Q126 118 100 120 Q74 118 70 106 Z"
      fill={shade(s.hairColor || '#666', -20)}
    />
  ) : null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label={candidate.name}
    >
      <defs>
        <radialGradient id={bgId} cx="35%" cy="28%" r="85%">
          <stop offset="0%" stopColor={shade(color, 70)} />
          <stop offset="55%" stopColor={color} />
          <stop offset="100%" stopColor={shade(color, -70)} />
        </radialGradient>
        <linearGradient id={suitId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b3b5e" />
          <stop offset="100%" stopColor="#16213a" />
        </linearGradient>
        <clipPath id={`clip-${candidate.id}`}>
          <circle cx="100" cy="100" r={ring ? 97 : 100} />
        </clipPath>
      </defs>

      <g clipPath={`url(#clip-${candidate.id})`}>
        <rect width="200" height="200" fill={`url(#${bgId})`} />

        <circle cx="100" cy="100" r="76" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="58" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />

        {s.gender === 'f' && (
          <path
            d="M52 112 Q48 60 72 46 Q100 34 128 46 Q152 60 148 112 Q144 150 124 168 L118 168 L118 140 Q126 128 128 104 Q128 74 100 74 Q72 74 72 104 Q74 128 82 140 L82 168 L76 168 Q56 150 52 112 Z"
            fill={s.hairColor}
          />
        )}

        <path d="M28 200 L28 160 Q100 122 172 160 L172 200 Z" fill={`url(#${suitId})`} />

        <path d="M100 138 L72 152 L100 164 L128 152 Z" fill="#f4f4f4" />
        <path d="M100 140 L80 150 L100 158 L120 150 Z" fill="#e3e3e3" />

        <path d="M90 142 L110 142 L116 168 Q108 176 100 176 Q92 176 84 168 Z" fill={s.tie || '#FFDF00'} />
        <rect x="90" y="138" width="20" height="8" rx="3" fill={shade(s.tie || '#FFDF00', -40)} />

        <rect x="88" y="116" width="24" height="30" rx="10" fill={s.skin} />

        <ellipse cx="100" cy="82" rx="36" ry="42" fill={s.skin} />
        <ellipse cx="63" cy="86" rx="7" ry="11" fill={s.skin} />
        <ellipse cx="137" cy="86" rx="7" ry="11" fill={s.skin} />

        {hairPath(s.hair)}

        <path d="M70 72 Q80 66 90 71" stroke={s.gender === 'f' ? '#5c3a26' : '#4a3527'} strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M110 71 Q120 66 130 72" stroke={s.gender === 'f' ? '#5c3a26' : '#4a3527'} strokeWidth="3" fill="none" strokeLinecap="round" />

        {eyes}

        {s.glasses ? glasses : null}

        <path d="M100 88 Q96 97 100 102 Q104 97 100 88" fill="none" stroke="#a97a55" strokeWidth="2.4" strokeLinecap="round" />

        {s.gender === 'f' ? (
          <path d="M92 112 Q100 120 108 112 Q100 122 92 112 Z" fill="#b0434a" />
        ) : (
          <path d="M92 112 Q100 118 108 112" fill="none" stroke="#8a4a3b" strokeWidth="2.6" strokeLinecap="round" />
        )}

        {beard}
      </g>

      {ring && (
        <circle cx="100" cy="100" r="96" fill="none" stroke={candidate.color} strokeWidth="3" />
      )}
    </svg>
  );
}
