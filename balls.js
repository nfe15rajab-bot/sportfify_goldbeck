/**
 * balls.js — Sportify background ball physics & animation
 * Each sport has a unique ball drawn on a canvas layer behind the UI.
 * Physics: gravity, bounce damping, wall reflection, spin.
 */

const BALL_DEFS = {
  polyvalent: {
    draw(ctx, x, y, r, spin) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#e8943a";
      ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, -0.3, 0.3);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    },
    bounce: 0.62, gravity: 0.55, speed: 3.2,
  },

  basketball: {
    draw(ctx, x, y, r, spin) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      g.addColorStop(0, "#f09030");
      g.addColorStop(1, "#c05a00");
      ctx.fillStyle = g;
      ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.strokeStyle = "rgba(0,0,0,0.4)";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(r, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(0, r); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.65, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, r * 0.65, Math.PI / 2, Math.PI * 1.5); ctx.stroke();
      ctx.restore();
    },
    bounce: 0.72, gravity: 0.6, speed: 3.8,
  },

  handball: {
    draw(ctx, x, y, r, spin) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#3060c0";
      ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      const pts = 5, outerR = r * 0.9, innerR = r * 0.45;
      ctx.beginPath();
      for (let i = 0; i < pts * 2; i++) {
        const ang = (i * Math.PI / pts) - Math.PI / 2;
        const rr = i % 2 === 0 ? outerR : innerR;
        i === 0
          ? ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr)
          : ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
      }
      ctx.closePath();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,100,0.4)"; ctx.lineWidth = 1.5; ctx.stroke();
    },
    bounce: 0.58, gravity: 0.52, speed: 3.5,
  },

  volleyball: {
    draw(ctx, x, y, r, spin) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#f5f0e8";
      ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      ctx.strokeStyle = "rgba(50,80,180,0.7)";
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 3; i++) {
        const a = i * Math.PI / 1.5;
        ctx.beginPath();
        ctx.arc(r * 0.35 * Math.cos(a), r * 0.35 * Math.sin(a), r * 0.7, a + 0.4, a + Math.PI - 0.4);
        ctx.stroke();
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(200,180,120,0.5)"; ctx.lineWidth = 1; ctx.stroke();
    },
    bounce: 0.55, gravity: 0.45, speed: 2.8,
  },

  badminton: {
    draw(ctx, x, y, r, spin) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      const cr = r * 0.45;
      ctx.beginPath(); ctx.arc(0, r * 0.4, cr, 0, Math.PI * 2);
      ctx.fillStyle = "#f0f0f5"; ctx.fill();
      ctx.strokeStyle = "rgba(100,100,120,0.5)"; ctx.lineWidth = 1; ctx.stroke();
      const feathers = 8;
      for (let i = 0; i < feathers; i++) {
        const a = (i / feathers) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, r * 0.4 - cr);
        const fx = Math.cos(a - Math.PI / 2) * r;
        const fy = Math.sin(a - Math.PI / 2) * r;
        ctx.quadraticCurveTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, fx, fy);
        ctx.strokeStyle = "rgba(220,220,240,0.9)"; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(fx, fy);
        const nx = Math.cos((i + 1) / feathers * Math.PI * 2 - Math.PI / 2) * r;
        const ny = Math.sin((i + 1) / feathers * Math.PI * 2 - Math.PI / 2) * r;
        ctx.lineTo(nx, ny);
        ctx.strokeStyle = "rgba(180,180,200,0.6)"; ctx.lineWidth = 1; ctx.stroke();
      }
      ctx.restore();
    },
    bounce: 0.3, gravity: 0.3, speed: 2.2,
  },

  football: {
    draw(ctx, x, y, r, spin) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = "#f5f5f5"; ctx.fill();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(spin);
      const hexR = r * 0.38;
      const hexCenters = [
        [0, 0], [0, -r * 0.62],
        [r * 0.54, -r * 0.31], [r * 0.54, r * 0.31],
        [0, r * 0.62], [-r * 0.54, r * 0.31], [-r * 0.54, -r * 0.31],
      ];
      hexCenters.forEach(([hx, hy], i) => {
        ctx.beginPath();
        for (let j = 0; j < 6; j++) {
          const a = j * Math.PI / 3;
          j === 0
            ? ctx.moveTo(hx + Math.cos(a) * hexR, hy + Math.sin(a) * hexR)
            : ctx.lineTo(hx + Math.cos(a) * hexR, hy + Math.sin(a) * hexR);
        }
        ctx.closePath();
        ctx.fillStyle = i === 0 ? "#111" : "#f5f5f5"; ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.2)"; ctx.lineWidth = 1; ctx.stroke();
      });
      ctx.restore();
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(0,0,0,0.15)"; ctx.lineWidth = 1; ctx.stroke();
    },
    bounce: 0.65, gravity: 0.5, speed: 3.0,
  },
};

/* ── Physics engine ── */
const bgCanvas = document.getElementById("bg-canvas");
const ctx2 = bgCanvas.getContext("2d");
let balls = [];
let W = 0, H = 0;

function resizeBgCanvas() {
  W = bgCanvas.offsetWidth;
  H = bgCanvas.offsetHeight;
  bgCanvas.width = W;
  bgCanvas.height = H;
}

function spawnBall(sport) {
  const def = BALL_DEFS[sport];
  const r = 13 + Math.random() * 7;
  const side = Math.random() < 0.5 ? 1 : -1;
  balls.push({
    sport, x: W / 2 + (Math.random() - 0.5) * 80, y: -r * 2,
    vx: (1 + Math.random() * 1.5) * side * def.speed * 0.4,
    vy: 0, r,
    spin: 0, spinV: (Math.random() - 0.5) * 0.12,
    age: 0, maxAge: 260 + Math.random() * 80,
    def,
  });
}

function spawnBurst(sport) {
  const n = sport === "polyvalent" ? 4 : 3;
  for (let i = 0; i < n; i++) setTimeout(() => spawnBall(sport), i * 80);
}

/* ── Confetti burst — celebrates a fully rule-compliant generated layout ── */
let confetti = [];
const CONFETTI_COLORS = ["#ff9f43", "#3d6fff", "#0ea355", "#9c4fe0", "#ef4444", "#ffd93d"];

function spawnConfetti() {
  for (let i = 0; i < 46; i++) {
    confetti.push({
      x: W / 2 + (Math.random() - 0.5) * 80,
      y: H * 0.32,
      vx: (Math.random() - 0.5) * 7,
      vy: -5 - Math.random() * 4,
      size: 4 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 0.35,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      age: 0, maxAge: 85 + Math.random() * 35,
    });
  }
}

let lastTime = 0;
function animationLoop(ts) {
  Math.min(ts - lastTime, 32); lastTime = ts;
  ctx2.clearRect(0, 0, W, H);
  balls.forEach(b => {
    b.vy += b.def.gravity;
    b.x += b.vx;
    b.y += b.vy;
    b.spin += b.spinV + (b.vx > 0 ? 0.03 : -0.03);
    b.age++;
    if (b.y + b.r >= H) { b.y = H - b.r; b.vy *= -b.def.bounce; b.vx *= 0.96; b.spinV *= 0.85; if (Math.abs(b.vy) < 0.8) b.vy = 0; }
    if (b.x - b.r < 0)  { b.x = b.r;    b.vx *= -0.7; }
    if (b.x + b.r > W)  { b.x = W - b.r; b.vx *= -0.7; }
    const fade = Math.max(0, 1 - (b.age / b.maxAge));
    ctx2.globalAlpha = Math.min(fade * 0.55, 0.55);
    b.def.draw(ctx2, b.x, b.y, b.r, b.spin);
  });
  ctx2.globalAlpha = 1;
  balls = balls.filter(b => b.age < b.maxAge);

  confetti.forEach(c => {
    c.vy += 0.18;
    c.x += c.vx; c.y += c.vy; c.rot += c.rotV; c.age++;
    ctx2.save();
    ctx2.globalAlpha = Math.max(0, 1 - c.age / c.maxAge);
    ctx2.translate(c.x, c.y);
    ctx2.rotate(c.rot);
    ctx2.fillStyle = c.color;
    ctx2.fillRect(-c.size / 2, -c.size / 2, c.size, c.size);
    ctx2.restore();
  });
  confetti = confetti.filter(c => c.age < c.maxAge);

  requestAnimationFrame(animationLoop);
}

// Init
resizeBgCanvas();
const ro = new ResizeObserver(() => resizeBgCanvas());
ro.observe(document.documentElement);
requestAnimationFrame(animationLoop);
