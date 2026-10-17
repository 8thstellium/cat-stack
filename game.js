// game.js: physics, input, main loop, rendering, UI and the ?selftest page check.
(function () {
  'use strict';

  const { Engine, Bodies, Body, Composite, Events, Sleeping } = Matter;
  const C = window.CatStack.cats;
  const { WORLD } = C;

  const STEP = 1000 / 60;
  const MAX_STEPS = 4; // per frame; any extra backlog (e.g. after tab suspension) is dropped
  const DROP_Y = 56;
  const COOLDOWN_MS = 500;
  const BOX_TOP = 40;
  const WALL_T = 60;
  const AIM_SPEED = 320; // px/s with arrow keys
  const POP_MS = 180;
  const BEST_KEY = 'catStackBest';

  const CAT_BODY = {
    restitution: 0.15,
    friction: 0.5,
    frictionStatic: 0.8,
    frictionAir: 0.012,
    density: 0.0012,
    label: 'cat',
  };

  // ---------------------------------------------------------------- helpers

  function audio(method, arg) {
    const a = window.CatStack.audio;
    if (!a || typeof a[method] !== 'function') return undefined;
    try {
      return a[method](arg);
    } catch (err) {
      console.warn('audio.' + method + ' failed', err);
      return undefined;
    }
  }

  function loadBest() {
    try {
      return Math.max(0, parseInt(localStorage.getItem(BEST_KEY), 10) || 0);
    } catch (_) {
      return 0;
    }
  }

  function saveBest(v) {
    try {
      localStorage.setItem(BEST_KEY, String(v));
    } catch (_) {}
  }

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function easeOutBack(t) {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }

  // -------------------------------------------------------------------- DOM

  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  const nextCanvas = $('next');
  const nextCtx = nextCanvas.getContext('2d');
  const scoreEl = $('score');
  const bestEl = $('best');
  const muteBtn = $('mute');
  const overEl = $('over');

  let viewScale = 1;
  let dpr = 1;

  function layout() {
    const hud = $('hud').getBoundingClientRect().height || 56;
    const availW = window.innerWidth - 32;
    const availH = window.innerHeight - hud - 32;
    const w = Math.max(200, Math.min(availW, (availH * WORLD.W) / WORLD.H, 520));
    const h = (w * WORLD.H) / WORLD.W;
    document.documentElement.style.setProperty('--game-w', w + 'px');
    document.documentElement.style.setProperty('--game-h', h + 'px');
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    viewScale = w / WORLD.W;
  }

  // ----------------------------------------------------------------- physics

  const engine = Engine.create({ enableSleeping: true, positionIterations: 10, velocityIterations: 8 });
  engine.gravity.y = 1.2;
  const world = engine.world;

  const wallOpts = { isStatic: true, friction: 0.5, frictionStatic: 0.8, restitution: 0.1, label: 'wall' };
  Composite.add(world, [
    Bodies.rectangle(WORLD.left - WALL_T / 2, WORLD.H / 2, WALL_T, WORLD.H * 3, wallOpts),
    Bodies.rectangle(WORLD.right + WALL_T / 2, WORLD.H / 2, WALL_T, WORLD.H * 3, wallOpts),
    Bodies.rectangle(WORLD.W / 2, WORLD.floor + WALL_T / 2, WORLD.W * 2, WALL_T, wallOpts),
  ]);

  let cats = [];
  let nextId = 0;

  function addCat(kind, x, y, opts) {
    const r = C.kindInfo(kind).radius;
    const body = Bodies.circle(x, y, r, CAT_BODY, 32);
    body.cat = {
      id: ++nextId,
      kind,
      ageMs: 0,
      touched: !!(opts && opts.touched),
      popMs: opts && opts.pop ? 0 : POP_MS,
      sq: 0,
      sqv: 0,
    };
    Composite.add(world, body);
    cats.push(body);
    return body;
  }

  function removeCat(body) {
    Composite.remove(world, body);
    cats = cats.filter((b) => b !== body);
  }

  Events.on(engine, 'collisionStart', (e) => {
    for (const pair of e.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const n = pair.collision.normal;
      const impact = Math.abs((a.velocity.x - b.velocity.x) * n.x + (a.velocity.y - b.velocity.y) * n.y);
      for (const body of [a, b]) {
        if (!body.cat) continue;
        body.cat.touched = true;
        if (impact > 1.2) body.cat.sq = Math.max(-0.18, body.cat.sq - Math.min(0.16, impact * 0.025));
      }
    }
  });

  // Collect touching equal pairs after the physics step, then apply them, so no cat merges twice.
  function findMergePairs() {
    const pairs = [];
    const used = new Set();
    for (let i = 0; i < cats.length; i++) {
      const a = cats[i];
      if (used.has(a)) continue;
      for (let j = i + 1; j < cats.length; j++) {
        const b = cats[j];
        if (used.has(b) || a.cat.kind !== b.cat.kind) continue;
        const reach = a.circleRadius + b.circleRadius + 1.5;
        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        if (dx * dx + dy * dy <= reach * reach) {
          pairs.push([a, b]);
          used.add(a);
          used.add(b);
          break;
        }
      }
    }
    return pairs;
  }

  function applyMerges(pairs) {
    for (const [a, b] of pairs) {
      const kind = a.cat.kind;
      const mx = (a.position.x + b.position.x) / 2;
      const my = (a.position.y + b.position.y) / 2;
      const vx = (a.velocity.x + b.velocity.x) / 2;
      const vy = (a.velocity.y + b.velocity.y) / 2;
      removeCat(a);
      removeCat(b);
      addScore(C.mergeScore(kind));
      const into = C.mergeResult(kind);
      if (into === null) {
        burstConfetti(mx, my);
        audio('playMega');
        continue;
      }
      const r = C.kindInfo(into).radius;
      const x = clamp(mx, WORLD.left + r, WORLD.right - r);
      const y = Math.min(my, WORLD.floor - r);
      const nb = addCat(into, x, y, { touched: true, pop: true });
      Body.setVelocity(nb, { x: vx, y: vy });
      burstRing(x, y, r, C.kindInfo(into).color);
      audio('playMerge', into);
    }
    // Cats resting on the merged pair would otherwise hang in the air while asleep.
    if (pairs.length) for (const c of cats) Sleeping.set(c, false);
  }

  // ------------------------------------------------------------ game state

  let state = 'play'; // 'play' | 'over'
  let paused = false;
  let rng;
  let current;
  let next;
  let score = 0;
  let best = loadBest();
  let bestAtStart = best;
  let simMs = 0;
  let readyAt = 0;
  let dangerTimers = {};
  let dangerLevel = 0;
  let aimX = WORLD.W / 2;
  let particles = [];

  function addScore(n) {
    score += n;
    scoreEl.textContent = score;
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      saveBest(best);
    }
  }

  function clampAim() {
    const r = C.kindInfo(current).radius;
    aimX = clamp(aimX, WORLD.left + r + 1, WORLD.right - r - 1);
  }

  function drawNextPreview() {
    nextCtx.setTransform(1, 0, 0, 1, 0, 0);
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextCtx.translate(nextCanvas.width / 2, nextCanvas.height / 2 + 4);
    C.paintCat(nextCtx, next, 24);
  }

  function restart(seed) {
    for (const c of cats.slice()) removeCat(c);
    particles = [];
    score = 0;
    scoreEl.textContent = '0';
    bestAtStart = best;
    bestEl.textContent = best;
    rng = C.makeRng(seed === undefined ? (Date.now() ^ (Math.random() * 1e9)) >>> 0 : seed);
    current = C.nextKind(rng);
    next = C.nextKind(rng);
    dangerTimers = {};
    dangerLevel = 0;
    readyAt = simMs;
    state = 'play';
    overEl.classList.remove('show');
    clampAim();
    drawNextPreview();
  }

  function drop() {
    if (state !== 'play' || paused || simMs < readyAt) return;
    addCat(current, aimX, DROP_Y);
    audio('playDrop');
    current = next;
    next = C.nextKind(rng);
    readyAt = simMs + COOLDOWN_MS;
    clampAim();
    drawNextPreview();
  }

  function gameOver() {
    state = 'over';
    $('final').textContent = score;
    $('final-best').textContent = best;
    $('newbest').classList.toggle('show', score > bestAtStart && score > 0);
    overEl.classList.add('show');
    $('restart').focus();
  }

  function step() {
    Engine.update(engine, STEP);
    simMs += STEP;
    applyMerges(findMergePairs());
    for (const c of cats) c.cat.ageMs += STEP;

    const res = C.dangerStep(
      dangerTimers,
      STEP,
      cats.map((b) => ({
        id: b.cat.id,
        y: b.position.y,
        radius: b.circleRadius,
        speed: b.speed,
        spin: b.angularVelocity,
        touched: b.cat.touched,
        ageMs: b.cat.ageMs,
        active: false,
      }))
    );
    dangerTimers = res.timers;
    dangerLevel = res.level;
    if (res.lost) gameOver();
  }

  // -------------------------------------------------------------- particles

  function burstRing(x, y, r, color) {
    const n = 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3;
      const sp = 90 + r * 1.5;
      particles.push({
        x: x + Math.cos(a) * r * 0.8,
        y: y + Math.sin(a) * r * 0.8,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        g: 0,
        life: 0,
        max: 380,
        size: 3 + r * 0.06,
        color,
        rect: false,
        rot: 0,
        vr: 0,
      });
    }
  }

  function burstConfetti(x, y) {
    const colors = ['#FFB3BA', '#FFDFBA', '#FFF0A8', '#BAFFC9', '#BAE1FF', '#D7BAFF', '#F6CF5C'];
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 260;
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 180,
        g: 520,
        life: 0,
        max: 1400 + Math.random() * 600,
        size: 4 + Math.random() * 4,
        color: colors[i % colors.length],
        rect: true,
        rot: Math.random() * 6,
        vr: (Math.random() - 0.5) * 12,
      });
    }
  }

  function updateParticles(dt) {
    const s = dt / 1000;
    for (const p of particles) {
      p.life += dt;
      p.vy += p.g * s;
      p.vx *= 0.985;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.vr * s;
    }
    particles = particles.filter((p) => p.life < p.max);
  }

  // -------------------------------------------------------------- rendering

  function boxPath() {
    const l = WORLD.left - 4;
    const r = WORLD.right + 4;
    const b = WORLD.floor + 4;
    const rad = 26;
    ctx.beginPath();
    ctx.moveTo(l, BOX_TOP);
    ctx.lineTo(l, b - rad);
    ctx.arcTo(l, b, l + rad, b, rad);
    ctx.lineTo(r - rad, b);
    ctx.arcTo(r, b, r, b - rad, rad);
    ctx.lineTo(r, BOX_TOP);
  }

  function drawBox() {
    boxPath();
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 253, 248, 0.75)';
    ctx.fill();
    boxPath();
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#EDC3D4';
    ctx.stroke();
  }

  function drawDangerLine(now) {
    const pulse = dangerLevel > 0.3 ? 0.5 + 0.5 * Math.sin(now / 90) : 0;
    ctx.save();
    ctx.setLineDash([8, 8]);
    ctx.lineWidth = 2 + pulse * 2 * dangerLevel;
    ctx.strokeStyle = dangerLevel > 0.3 ? `rgba(240, 110, 150, ${0.5 + 0.5 * pulse})` : 'rgba(237, 160, 190, 0.45)';
    ctx.beginPath();
    ctx.moveTo(WORLD.left + 6, WORLD.dangerY);
    ctx.lineTo(WORLD.right - 6, WORLD.dangerY);
    ctx.stroke();
    ctx.restore();
  }

  function drawSprite(kind, x, y, angle, sx, sy, pop, alpha) {
    const s = C.getSprite(kind, viewScale * dpr);
    const r = C.kindInfo(kind).radius;
    ctx.save();
    ctx.globalAlpha = alpha;
    // squash anchored at the cat's bottom, pop scale around its centre
    ctx.translate(x, y + r);
    ctx.scale(sx, sy);
    ctx.translate(0, -r);
    ctx.scale(pop, pop);
    ctx.rotate(angle);
    ctx.drawImage(s.canvas, -s.half, -s.half, s.half * 2, s.half * 2);
    ctx.restore();
  }

  function render(now, dt) {
    ctx.setTransform(dpr * viewScale, 0, 0, dpr * viewScale, 0, 0);
    ctx.clearRect(0, 0, WORLD.W, WORLD.H);
    drawBox();
    drawDangerLine(now);

    const ready = simMs >= readyAt;
    if (state === 'play') {
      const r = C.kindInfo(current).radius;
      ctx.save();
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = 'rgba(140, 116, 135, 0.28)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(aimX, DROP_Y + r + 4);
      ctx.lineTo(aimX, WORLD.floor);
      ctx.stroke();
      ctx.restore();
    }

    const s = dt / 1000;
    for (const b of cats) {
      const c = b.cat;
      // render-only squash spring
      if (!paused) {
        c.sqv += (-180 * c.sq - 14 * c.sqv) * s;
        c.sq += c.sqv * s;
        c.popMs = Math.min(POP_MS, c.popMs + dt);
      }
      const pop = 0.7 + 0.3 * easeOutBack(c.popMs / POP_MS);
      drawSprite(c.kind, b.position.x, b.position.y, b.angle, 1 - c.sq * 0.8, 1 + c.sq, pop, 1);
    }

    if (state === 'play') drawSprite(current, aimX, DROP_Y, 0, 1, 1, 1, ready ? 1 : 0.35);

    for (const p of particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      if (p.rect) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * a), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------------- loop

  const keys = { left: false, right: false };
  let lastT = null;
  let acc = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (lastT === null) lastT = now;
    const dt = Math.min(100, now - lastT);
    lastT = now;

    if (!paused) {
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (dir && state === 'play') {
        aimX += (dir * AIM_SPEED * dt) / 1000;
        clampAim();
      }
      if (state === 'play') {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < MAX_STEPS && state === 'play') {
          step();
          acc -= STEP;
          steps++;
        }
        if (steps === MAX_STEPS) acc = 0;
      }
      updateParticles(dt);
    }
    render(now, paused ? 0 : dt);
  }

  // ------------------------------------------------------------------ input

  function toWorldX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return ((clientX - rect.left) / rect.width) * WORLD.W;
  }

  let pointerDown = false;

  canvas.addEventListener('pointerdown', (e) => {
    audio('start');
    pointerDown = true;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
    if (state === 'play') {
      aimX = toWorldX(e.clientX);
      clampAim();
    }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (state !== 'play') return;
    if (e.pointerType === 'mouse' || pointerDown) {
      aimX = toWorldX(e.clientX);
      clampAim();
    }
  });

  canvas.addEventListener('pointerup', (e) => {
    if (!pointerDown) return;
    pointerDown = false;
    if (state === 'play') {
      aimX = toWorldX(e.clientX);
      clampAim();
      drop();
    }
  });

  canvas.addEventListener('pointercancel', () => {
    pointerDown = false;
  });

  window.addEventListener('keydown', (e) => {
    audio('start');
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
    else if (k === ' ' || k === 'ArrowDown' || k === 'Enter') {
      if (state === 'over') {
        if (!e.repeat) restart();
      } else if (!e.repeat) drop();
    } else if (k === 'm' || k === 'M') toggleMute();
    else if ((k === 'r' || k === 'R') && state === 'over') restart();
    else return;
    e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
    if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
  });

  window.addEventListener('pointerdown', () => audio('start'));

  function updateMuteButton() {
    const muted = !!audio('isMuted');
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.textContent = muted ? '✕' : '♪';
    muteBtn.setAttribute('aria-label', muted ? 'Unmute music' : 'Mute music');
  }

  function toggleMute() {
    audio('toggleMute');
    updateMuteButton();
  }

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMute();
    muteBtn.blur();
  });

  $('restart').addEventListener('click', () => {
    audio('start');
    restart();
  });

  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    lastT = null;
    acc = 0;
    keys.left = keys.right = false;
  });

  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', layout);

  // --------------------------------------------------------------- selftest

  function selftest() {
    const out = [];
    const check = (name, ok) => out.push((ok ? 'PASS ' : 'FAIL ') + name);
    const K = C.KINDS;
    check('at least 8 kinds', K.length >= 8);
    check('radii strictly increase', K.every((k, i) => i === 0 || k.radius > K[i - 1].radius));
    check('colours distinct', new Set(K.map((k) => k.color.toLowerCase())).size === K.length);
    check('two top cats fit side by side', 4 * K[K.length - 1].radius <= WORLD.right - WORLD.left);
    check('largest drop kind fits on screen', DROP_Y - K[C.DROP_KINDS - 1].radius >= 0);
    check('mergeResult ladder', K.every((k) => C.mergeResult(k.kind) === (k.kind < C.MAX_KIND ? k.kind + 1 : null)));
    check('mergeScore 1->2 is 3', C.mergeScore(1) === 3);
    check('mega bonus', C.mergeScore(C.MAX_KIND) === C.MEGA_BONUS);
    const r1 = C.makeRng(42);
    const r2 = C.makeRng(42);
    check('rng deterministic', [1, 2, 3, 4, 5].every(() => r1() === r2()));
    const rr = C.makeRng(7);
    let okRange = true;
    for (let i = 0; i < 2000; i++) {
      const k = C.nextKind(rr);
      if (k < 1 || k > C.DROP_KINDS) okRange = false;
    }
    check('nextKind in 1..DROP_KINDS', okRange);
    const resting = { id: 1, y: 60, radius: 20, speed: 0, spin: 0, touched: true, ageMs: 5000, active: false };
    let t = {};
    let lost = false;
    for (let i = 0; i < 61 && !lost; i++) {
      const r = C.dangerStep(t, STEP, [resting]);
      t = r.timers;
      lost = r.lost;
    }
    check('resting cat above line loses after ~1 s', lost);
    check('moving cat does not count', !C.dangerStep({ 1: 900 }, 200, [{ ...resting, speed: 3 }]).lost);
    check('falling (untouched) cat does not count', !C.dangerStep({}, 2000, [{ ...resting, touched: false }]).lost);
    check('young cat in grace does not count', !C.dangerStep({}, 2000, [{ ...resting, ageMs: 100 }]).lost);
    const frozen = { 1: 500 };
    C.dangerStep(frozen, 10, [resting]);
    check('dangerStep is pure', frozen[1] === 500);
    let drewAll = true;
    for (const k of K) {
      try {
        C.getSprite(k.kind, 2);
      } catch (err) {
        drewAll = false;
      }
    }
    check('every kind draws', drewAll);
    check('audio api present', !!window.CatStack.audio);

    const fails = out.filter((l) => l.startsWith('FAIL')).length;
    out.unshift(fails ? `SELFTEST: ${fails} FAILED` : 'SELFTEST: all passed');
    const el = $('selftest');
    el.textContent = out.join('\n');
    el.style.display = 'block';
    el.title = 'click to hide';
    el.onclick = () => (el.style.display = 'none');
    console.log(out.join('\n'));
    return fails === 0;
  }

  // ------------------------------------------------------------------ boot

  layout();
  bestEl.textContent = best;
  restart();
  updateMuteButton();
  requestAnimationFrame(frame);

  // Small debug handle for the console and the selftest.
  window.CatStack.game = {
    get score() {
      return score;
    },
    get state() {
      return state;
    },
    get catCount() {
      return cats.length;
    },
    get bodies() {
      return cats.slice();
    },
    spawn: (kind, x, y) => addCat(kind, x, y, { touched: true }),
    restart,
    selftest,
  };

  if (/[?&]selftest\b/.test(location.search)) selftest();
})();
