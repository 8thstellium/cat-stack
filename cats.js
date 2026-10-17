// cats.js: the cat ladder, pure game rules, and procedural cat drawing.
// Works as a plain <script> (window.CatStack.cats) and as a node module (require('./cats.js')).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) {
    root.CatStack = root.CatStack || {};
    root.CatStack.cats = api;
  }
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  // ---------------------------------------------------------------- ladder

  const KINDS = [
    { kind: 1, name: 'Mochi', color: '#F9C6D3', radius: 14 },
    { kind: 2, name: 'Peach', color: '#FFD3B0', radius: 19 },
    { kind: 3, name: 'Butter', color: '#FFF0A8', radius: 25 },
    { kind: 4, name: 'Mint', color: '#C6EFD6', radius: 32 },
    { kind: 5, name: 'Sky', color: '#BFE2F7', radius: 40 },
    { kind: 6, name: 'Lilac', color: '#D8C7F4', radius: 48 },
    { kind: 7, name: 'Berry', color: '#F2A2C8', radius: 57 },
    { kind: 8, name: 'Sage', color: '#CFE2B6', radius: 66 },
    { kind: 9, name: 'Calico', color: '#F4E6D2', radius: 75 },
    { kind: 10, name: 'Mega Loaf', color: '#E9DAFB', radius: 84 },
  ];

  const MAX_KIND = KINDS.length;
  const DROP_KINDS = 5;
  const MEGA_BONUS = 100;

  // Logical world in px. The container's inner width is right - left = 360.
  const WORLD = { W: 400, H: 640, left: 20, right: 380, floor: 620, dangerY: 100 };

  const DANGER = { LOSE_MS: 1000, GRACE_MS: 600, REST_SPEED: 0.3, REST_SPIN: 0.05 };

  function kindInfo(k) {
    if (!Number.isInteger(k) || k < 1 || k > MAX_KIND) throw new RangeError('bad cat kind: ' + k);
    return KINDS[k - 1];
  }

  // Kind produced by merging two kind-k cats; null means the pair vanishes (two Mega Loafs).
  function mergeResult(k) {
    kindInfo(k);
    return k < MAX_KIND ? k + 1 : null;
  }

  // Points for merging two kind-k cats: triangular number of the new kind, Suika style.
  function mergeScore(k) {
    kindInfo(k);
    if (k === MAX_KIND) return MEGA_BONUS;
    const n = k + 1;
    return (n * (n + 1)) / 2;
  }

  // mulberry32: small, fast, deterministic.
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function nextKind(rng) {
    return 1 + Math.min(DROP_KINDS - 1, Math.floor(rng() * DROP_KINDS));
  }

  // One tick of the game-over rule. Pure: returns fresh timers, never mutates its inputs.
  // A cat counts only while it is resting with its top edge above the danger line.
  function dangerStep(timers, dtMs, cats) {
    const next = {};
    let worst = 0;
    for (const c of cats) {
      const counts =
        !c.active &&
        c.touched &&
        c.ageMs >= DANGER.GRACE_MS &&
        c.speed < DANGER.REST_SPEED &&
        Math.abs(c.spin) < DANGER.REST_SPIN &&
        c.y - c.radius < WORLD.dangerY;
      if (!counts) continue;
      const t = (timers[c.id] || 0) + dtMs;
      next[c.id] = t;
      if (t > worst) worst = t;
    }
    return {
      timers: next,
      lost: worst >= DANGER.LOSE_MS,
      level: Math.max(0, Math.min(1, worst / DANGER.LOSE_MS)),
    };
  }

  // --------------------------------------------------------------- drawing

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function mix(hex, toHex, t) {
    const a = hexToRgb(hex);
    const b = hexToRgb(toHex);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return 'rgb(' + c.join(',') + ')';
  }

  const lighten = (hex, t) => mix(hex, '#FFFFFF', t);
  const shade = (hex, t) => mix(hex, '#6B4A5E', t);

  const INK = '#5B4756';
  const EAR_PINK = 'rgba(248,165,190,0.75)';

  function polar(r, a) {
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  function drawEars(ctx, color, r) {
    ctx.lineJoin = 'round';
    for (const s of [-1, 1]) {
      const a = -Math.PI / 2 + s * 0.72;
      const b1 = polar(0.86 * r, a - 0.36);
      const b2 = polar(0.86 * r, a + 0.36);
      const tip = polar(1.28 * r, a + s * 0.06);
      ctx.beginPath();
      ctx.moveTo(b1[0], b1[1]);
      ctx.lineTo(tip[0], tip[1]);
      ctx.lineTo(b2[0], b2[1]);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.strokeStyle = shade(color, 0.22);
      ctx.lineWidth = Math.max(1.2, 0.05 * r);
      ctx.fill();
      ctx.stroke();

      // inner ear, pulled toward the ear's centroid
      const cx = (b1[0] + b2[0] + tip[0]) / 3;
      const cy = (b1[1] + b2[1] + tip[1]) / 3;
      const k = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx + (b1[0] - cx) * k, cy + (b1[1] - cy) * k);
      ctx.lineTo(cx + (tip[0] - cx) * k, cy + (tip[1] - cy) * k);
      ctx.lineTo(cx + (b2[0] - cx) * k, cy + (b2[1] - cy) * k);
      ctx.closePath();
      ctx.fillStyle = EAR_PINK;
      ctx.fill();
    }
  }

  function drawBody(ctx, info, r) {
    const g = ctx.createRadialGradient(-0.3 * r, -0.35 * r, 0.1 * r, 0, 0, 1.05 * r);
    if (info.kind === MAX_KIND) {
      g.addColorStop(0, '#F8F1FF');
      g.addColorStop(0.55, '#E6D6FA');
      g.addColorStop(1, '#FBCFE4');
    } else {
      g.addColorStop(0, lighten(info.color, 0.4));
      g.addColorStop(0.6, info.color);
      g.addColorStop(1, shade(info.color, 0.06));
    }
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  }

  function drawMarkings(ctx, info, r) {
    const k = info.kind;
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    if (k >= 4 && k <= 6) {
      // tabby forehead stripes
      ctx.strokeStyle = shade(info.color, 0.16);
      ctx.lineWidth = 0.06 * r;
      ctx.lineCap = 'round';
      for (const dx of [-0.18, 0, 0.18]) {
        ctx.beginPath();
        ctx.moveTo(dx * r, -0.95 * r);
        ctx.lineTo(dx * 0.75 * r, -(dx === 0 ? 0.62 : 0.7) * r);
        ctx.stroke();
      }
    }
    if (k === 8) {
      ctx.fillStyle = lighten(info.color, 0.55);
      ctx.beginPath();
      ctx.ellipse(0, 0.62 * r, 0.48 * r, 0.34 * r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (k === 9) {
      ctx.fillStyle = '#F7C08A';
      ctx.beginPath();
      ctx.ellipse(-0.6 * r, -0.42 * r, 0.48 * r, 0.4 * r, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(0.32 * r, -0.86 * r, 0.26 * r, 0.2 * r, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#BDB6C6';
      ctx.beginPath();
      ctx.ellipse(0.62 * r, 0.72 * r, 0.44 * r, 0.34 * r, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawOutline(ctx, info, r) {
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.strokeStyle = info.kind === MAX_KIND ? '#C9A9E6' : shade(info.color, 0.22);
    ctx.lineWidth = Math.max(1.2, 0.045 * r);
    ctx.stroke();

    // soft top-left highlight
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(-0.42 * r, -0.5 * r, 0.17 * r, 0.09 * r, -0.65, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFace(ctx, r) {
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // closed happy eyes: ^ ^
    const w = 0.13 * r;
    const ey = 0.04 * r;
    ctx.lineWidth = Math.max(1.1, 0.055 * r);
    for (const s of [-1, 1]) {
      const ex = s * 0.34 * r;
      ctx.beginPath();
      ctx.moveTo(ex - w, ey + w * 0.35);
      ctx.quadraticCurveTo(ex, ey - w * 0.95, ex + w, ey + w * 0.35);
      ctx.stroke();
    }

    // little "w" mouth
    ctx.lineWidth = Math.max(0.9, 0.04 * r);
    ctx.beginPath();
    ctx.moveTo(-0.1 * r, 0.19 * r);
    ctx.quadraticCurveTo(-0.05 * r, 0.29 * r, 0, 0.2 * r);
    ctx.quadraticCurveTo(0.05 * r, 0.29 * r, 0.1 * r, 0.19 * r);
    ctx.stroke();

    // cheeks
    ctx.fillStyle = 'rgba(255,128,160,0.38)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 0.57 * r, 0.22 * r, 0.17 * r, 0.11 * r, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawBow(ctx, x, y, size, fill, rainbow) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.35);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1, size * 0.12);
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(s * size * 1.1, -size * 0.9, s * size * 1.1, 0);
      ctx.quadraticCurveTo(s * size * 1.1, size * 0.9, 0, 0);
      ctx.closePath();
      if (rainbow) {
        const g = ctx.createLinearGradient(0, -size, 0, size);
        ['#FFB3BA', '#FFDFBA', '#FFFFBA', '#BAFFC9', '#BAE1FF', '#D7BAFF'].forEach((c, i, a) =>
          g.addColorStop(i / (a.length - 1), c)
        );
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = fill;
      }
      ctx.strokeStyle = 'rgba(91,71,86,0.55)';
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = rainbow ? '#FFF6D6' : shade(fill, 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  function drawCrown(ctx, r) {
    const w = 0.36 * r;
    const base = -0.9 * r;
    const h = 0.3 * r;
    ctx.beginPath();
    ctx.moveTo(-w, base);
    ctx.lineTo(-w, base - h * 0.75);
    ctx.lineTo(-w * 0.5, base - h * 0.35);
    ctx.lineTo(0, base - h);
    ctx.lineTo(w * 0.5, base - h * 0.35);
    ctx.lineTo(w, base - h * 0.75);
    ctx.lineTo(w, base);
    ctx.closePath();
    ctx.fillStyle = '#F6CF5C';
    ctx.strokeStyle = '#D4A23A';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.2, 0.03 * r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#F59AB8';
    for (const gx of [-0.55, 0, 0.55]) {
      ctx.beginPath();
      ctx.arc(gx * w, base - h * 0.2, 0.04 * r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Paint one cat centred on (0,0), facing up, at radius r (in the current transform's units).
  function paintCat(ctx, kind, r) {
    const info = kindInfo(kind);
    r = r || info.radius;
    const earColor = kind === MAX_KIND ? '#EBDDFB' : info.color;
    drawEars(ctx, earColor, r);
    drawBody(ctx, info, r);
    drawMarkings(ctx, info, r);
    drawOutline(ctx, info, r);
    drawFace(ctx, r);
    if (kind === 7) drawBow(ctx, 0.56 * r, -0.74 * r, 0.2 * r, '#8FD3F4');
    if (kind === 8) drawBow(ctx, 0.56 * r, -0.74 * r, 0.2 * r, '#F59AB8');
    if (kind === MAX_KIND) {
      drawBow(ctx, -0.58 * r, -0.72 * r, 0.2 * r, null, true);
      drawCrown(ctx, r);
    }
  }

  // Sprites extend past the body for ears and crown.
  const SPRITE_EXTENT = 1.42;
  const spriteCache = new Map();

  // Returns { canvas, half } where half is the sprite's half-size in world units.
  // pxPerUnit = device pixels per world px; cached per kind and (rounded) scale.
  function getSprite(kind, pxPerUnit) {
    const ppu = Math.max(0.25, Math.round(pxPerUnit * 4) / 4);
    const key = kind + '@' + ppu;
    let s = spriteCache.get(key);
    if (s) return s;
    const r = kindInfo(kind).radius;
    const side = Math.ceil(2 * SPRITE_EXTENT * r * ppu) + 4;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = side;
    const ctx = canvas.getContext('2d');
    ctx.translate(side / 2, side / 2);
    ctx.scale(ppu, ppu);
    paintCat(ctx, kind, r);
    s = { canvas, half: side / 2 / ppu };
    spriteCache.set(key, s);
    return s;
  }

  return {
    KINDS,
    MAX_KIND,
    DROP_KINDS,
    MEGA_BONUS,
    WORLD,
    DANGER,
    kindInfo,
    mergeResult,
    mergeScore,
    makeRng,
    nextKind,
    dangerStep,
    paintCat,
    getSprite,
  };
});
