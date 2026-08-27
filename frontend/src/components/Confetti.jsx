import { useEffect, useRef } from 'react';

const COLORS = ['#FFDF00', '#009C3B', '#2F7FFF', '#FF5C00', '#FF2E63', '#00E5FF', '#B4FF39', '#FFFFFF'];

export default function Confetti({ burst }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!burst) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    const pieces = [];

    for (let i = 0; i < 220; i++) {
      pieces.push({
        x: w / 2,
        y: h * 0.4,
        vx: (Math.random() - 0.5) * 18,
        vy: Math.random() * -16 - 4,
        g: 0.45 + Math.random() * 0.25,
        r: 4 + Math.random() * 7,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        shape: Math.random() > 0.5 ? 'rect' : 'circle',
        life: 1,
      });
    }

    let raf = 0;
    const start = performance.now();

    const tick = (now) => {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      let alive = false;
      for (const p of pieces) {
        p.vy += p.g;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life -= 0.012;
        if (p.y < h + 40 && p.life > 0) alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
        else {
          ctx.beginPath();
          ctx.arc(0, 0, p.r / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (alive && t < 7) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [burst]);

  return <canvas ref={ref} className="confetti-canvas" aria-hidden="true" />;
}
