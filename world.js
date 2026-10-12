/* Petri v2 — the dish: depth layers, background life, organisms, light modes */
(function () {
  'use strict';
  const P = window.Petri;
  const { TAU, clamp, rand, pick, nz, hex, mix, rgba, smooth } = P;

  const LIFE_COLS = ['#1fb5b0', '#58cbe6', '#3b6fe0', '#a58cff', '#ff86c2', '#ff6b6b', '#ffab76', '#d9d24a', '#6fd6a8'];
  const MODES = [
    { id: 'pastel', theme: 'day', label: 'Light field · Pastel', wash: ['#ff9ac8', '#8fd0ff', '#c4b2ff', '#ffcf98', '#86e2cc', '#efe882', '#ff8f8f'] },
    { id: 'lagoon', theme: 'day', label: 'Light field · Lagoon', wash: ['#58cbe6', '#1fb5b0', '#3b6fe0', '#8fe0b4', '#b8a6ff', '#7fd8ff'] },
    { id: 'night', theme: 'night', label: 'Dark field · Fluorescence', wash: ['#2a4bff', '#6a3cff', '#11a7c9', '#c23cff', '#1fd1a0'] },
  ];
  const PAPER = '#f3f2ee';
  const STORE = 'petri.culture.v11';
  const QUALITY = [{ name: 'high', dpr: 1.25, ms: 8 }, { name: 'medium', dpr: 1.0, ms: 5 }, { name: 'low', dpr: 0.8, ms: 3 }];
  const MODE_PERIOD = 120;

  class Specimen {
    constructor(dish, g, pos) {
      this.dish = dish; this.g = g;
      this.m = new P.Microbe(g, { res: 88 });
      this.built = -1;
      this.x = pos ? pos.x : 0; this.y = pos ? pos.y : 0;
      this.heading = rand(0, TAU); this.speed = 0;
      this.zph = rand(0, TAU); this.ph = rand(0, TAU);
      this.state = 'arriving'; this.timer = 0; this.alpha = 0; this.scale = 0.2;
      this.runT = 0; this.running = true; this.tumbleDir = 1; this.target = null; this.targetT = 0;
      this.emitted = 0; this.frame = Math.floor(Math.random() * 2);
      this.tag = null;
      this.ivx = 0; this.ivy = 0; this.wobble = 0; this.bumpCool = 0; this.cool = 0; this.contactT = 0; this.lastTarget = null;
      this.orbitDir = Math.random() < 0.5 ? -1 : 1;
      const m = this.m;
      this.col = { c0: m.c0.slice(), c1: m.c1.slice(), c2: m.c2.slice(), cr: m.cr.slice(), cr2: m.cr2.slice(), app: m.appRGB.slice(), aura: hex(m.pal.aura) };
      this.base = JSON.parse(JSON.stringify(this.col));
      this.home = null; this.homeT = 0; this.soloT = rand(14, 26); this.solo = 0;
    }
    get rad() { return this.m.rMax * this.dish.U * this.g.size * this.dish.crowdK; }
  }

  class Dish {
    constructor(root) {
      this.root = root;
      root.classList.add('dish-root');
      root.innerHTML = '';
      this.scene = document.createElement('canvas'); this.scene.className = 'dish-scene';
      this.grain = document.createElement('div'); this.grain.className = 'dish-grain';
      this.overlay = document.createElement('canvas'); this.overlay.className = 'dish-overlay';
      this.labels = document.createElement('div'); this.labels.className = 'dish-labels';
      this.hud = document.createElement('div'); this.hud.className = 'dish-hud';
            root.append(this.scene, this.grain, this.overlay, this.labels, this.hud);
      this.ctx = this.scene.getContext('2d', { alpha: false });
      const mk = () => { const c = document.createElement('canvas'); return [c, c.getContext('2d')]; };
      [this.far, this.fctx] = mk(); [this.near, this.nctx] = mk(); [this.glow, this.gctx] = mk();
      [this.tmp, this.tctx] = mk(); [this.hsrc, this.hsctx] = mk(); [this.haloAcc, this.hactx] = mk(); [this.halo, this.hctx] = mk(); [this.defo, this.dctx] = mk(); [this.dmask, this.dmctx] = mk();
      this.hud.innerHTML = `
        <div class="hud-tl"><div class="hud-title">Culture No. 07</div><div class="hud-mode"></div></div>
        <div class="hud-tr"><div>Objective ×40 · 0.65 NA</div><div class="hud-fps"></div></div>
        <div class="hud-bl"><div class="hud-count"></div><div class="hud-scale"><span></span>50 µm</div></div>
        <div class="hud-br"><div class="hud-time"></div></div>`;
      this.$mode = this.hud.querySelector('.hud-mode');
      this.$count = this.hud.querySelector('.hud-count');
      this.$time = this.hud.querySelector('.hud-time');
      this.$fps = this.hud.querySelector('.hud-fps');
      this.makeGrain();

      this.max = 14; this.crowdK = 1; this.floorSeed = (Math.random() * 1e9) | 0;
      this.specimens = [];
      this.fig = 0;
      this.t = 0; this.start = performance.now();
      this.modeIndex = 0; this.modeClock = 0; this.mode = MODES[0];
      this.ripples = []; this.particles = [];
      this.R = 0;
      this.resize();
      new ResizeObserver(() => this.resize()).observe(root);
      this.initWorld();
      this.applyMode(0);
      this.load();
      this.last = performance.now(); this.fpsAcc = 0; this.fpsN = 0; this.frameN = 0;
      requestAnimationFrame((n) => this.loop(n));
    }

    get night() { return this.mode.theme === 'night'; }

    /* ------------ sizing ------------ */
    resize() {
      const r = this.root.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, QUALITY[this.q || 0].dpr);
      const W = Math.max(50, Math.round(r.width * dpr)), H = Math.max(50, Math.round(r.height * dpr));
      if (W === this.W && H === this.H) return;
      const oldR = this.R;
      this.dpr = dpr; this.W = W; this.H = H;
      this.scene.width = W; this.scene.height = H;
      this.cx = W / 2; this.cy = H / 2;
      this.R = Math.min(W * 0.4, H * 0.44);
      this.u = this.R / 100;
      this.U = this.R * 0.085;
      this.far.width = this.tmp.width = Math.ceil(W / 3); this.far.height = this.tmp.height = Math.ceil(H / 3);
      this.near.width = this.glow.width = this.haloAcc.width = this.halo.width = this.defo.width = this.hsrc.width = Math.ceil(W / 4);
      this.near.height = this.glow.height = this.haloAcc.height = this.halo.height = this.defo.height = this.hsrc.height = Math.ceil(H / 4);
      this.needWarm = true; // buffers were cleared: warm them up before the next visible frame (no blink)
      this.dmask.width = Math.ceil(W / 10); this.dmask.height = Math.ceil(H / 10);
      if (oldR && this.cocci) {
        const k = this.R / oldR;
        const sc = (o) => { o.x *= k; o.y *= k; };
        [this.cocci, this.rods, this.tads, this.rings, this.spots, this.bubbles, this.food, this.farItems, this.nearItems, this.particles, this.specimens, this.ripples].forEach((a) => a.forEach(sc));
        this.fils.forEach((f) => f.pts.forEach(sc));
      }
      this.floor = null;
      this.drawOverlay();
    }

    /* fine grain that flickers in place (no crawling) */
    makeGrain() {
      const S = 192, urls = [];
      for (let f = 0; f < 4; f++) {
        const c = document.createElement('canvas'); c.width = c.height = S;
        const x = c.getContext('2d'), im = x.createImageData(S, S);
        for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() < 0.5 ? 0 : 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = Math.random() * 26; }
        x.putImageData(im, 0, 0); urls.push(`url(${c.toDataURL()})`);
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.grain.style.backgroundSize = `${S / dpr}px ${S / dpr}px`;
      let k = 0;
      this.grain.style.backgroundImage = urls[0];
      setInterval(() => { k = (k + 1) % urls.length; this.grain.style.backgroundImage = urls[k]; }, 110);
    }

    drawOverlay() {
      const o = this.overlay, W = this.W, H = this.H, R = this.R, cx = this.cx, cy = this.cy;
      o.width = W; o.height = H;
      const c = o.getContext('2d');
      c.clearRect(0, 0, W, H);
      if (this.mode && this.night) {
        const g = c.createRadialGradient(cx, cy, R * 0.6, cx, cy, R);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0.85)');
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
      } else {
        const g = c.createRadialGradient(cx, cy, R * 0.75, cx, cy, R);
        g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.35)');
        c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
      }
      c.lineWidth = 1 * this.dpr; c.strokeStyle = 'rgba(40,46,60,0.45)';
      c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
    }

    /* ------------ dish floor ------------ */
    makeFloor() {
      // seeded: regenerating (after a resize / quality change) gives exactly the same floor, no colour jumps
      const RNG = P.mulberry((this.floorSeed || 1) + this.modeIndex * 7919), rand = (a, b) => a + RNG() * (b - a), pick = (arr) => arr[Math.floor(RNG() * arr.length)];
      const S = 640, c = document.createElement('canvas'); c.width = c.height = S;
      const x = c.getContext('2d'), h = S / 2, night = this.night, cols = this.mode.wash;
      let g = x.createRadialGradient(h, h, 0, h, h, h);
      if (night) { g.addColorStop(0, '#070a1e'); g.addColorStop(0.6, '#04050f'); g.addColorStop(1, '#010104'); }
      else { g.addColorStop(0, '#fbfaf7'); g.addColorStop(0.7, '#eff0f2'); g.addColorStop(1, '#e6e8ee'); }
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      x.globalCompositeOperation = night ? 'lighter' : 'source-over';
      const N = night ? 6 : 11;
      for (let k = 0; k < N; k++) {
        const a = rand(0, TAU), d = Math.sqrt(RNG()) * S * 0.36;
        const px = h + Math.cos(a) * d, py = h + Math.sin(a) * d;
        const rr = rand(0.1, 0.3) * S, col = hex(cols[k % cols.length]);
        const A = night ? 0.13 : rand(0.22, 0.42);
        g = x.createRadialGradient(px, py, 0, px, py, rr);
        g.addColorStop(0, rgba(col, A)); g.addColorStop(0.55, rgba(col, A * 0.45)); g.addColorStop(1, rgba(col, 0));
        x.fillStyle = g; x.beginPath(); x.arc(px, py, rr, 0, TAU); x.fill();
        // growth rings of the colony
        for (let i = 0; i < 3; i++) {
          const rr2 = rr * rand(0.35, 0.9);
          x.strokeStyle = rgba(night ? mix(col, [255, 255, 255], 0.3) : col, rand(0.05, 0.12)); x.lineWidth = rand(1, 3);
          x.beginPath();
          for (let s = 0; s <= 64; s++) { const an = (s / 64) * TAU, w = rr2 * (1 + (nz(Math.cos(an) * 2 + k, Math.sin(an) * 2) - 0.5) * 0.25); const X = px + Math.cos(an) * w, Y = py + Math.sin(an) * w; s ? x.lineTo(X, Y) : x.moveTo(X, Y); }
          x.stroke();
        }
      }
      // hairline fibres
      x.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 26; i++) {
        let px = h + rand(-0.6, 0.6) * h, py = h + rand(-0.6, 0.6) * h, an = rand(0, TAU);
        x.strokeStyle = night ? `rgba(200,220,255,${rand(0.05, 0.12).toFixed(2)})` : `rgba(${pick(['190,150,120', '120,150,170', '255,255,255'])},${rand(0.15, 0.35).toFixed(2)})`;
        x.lineWidth = rand(0.5, 1.1); x.beginPath(); x.moveTo(px, py);
        for (let s = 0; s < 12; s++) { an += rand(-0.6, 0.6); px += Math.cos(an) * 9; py += Math.sin(an) * 9; x.lineTo(px, py); }
        x.stroke();
      }
      const b = document.createElement('canvas'); b.width = b.height = S;
      const bx = b.getContext('2d'); bx.filter = `blur(${night ? 6 : 10}px)`; bx.drawImage(c, 0, 0);
      bx.filter = 'none'; bx.globalAlpha = night ? 0 : 0.45; bx.drawImage(c, 0, 0); // keep a little of the fibre detail
      this.floor = b;
    }

    /* ------------ population ------------ */
    rp(maxK) { const a = rand(0, TAU), d = Math.sqrt(Math.random()) * this.R * (maxK || 0.85); return { x: Math.cos(a) * d, y: Math.sin(a) * d }; }
    newCoccus(p, col, r) { const q = p || this.rp(); return { x: q.x, y: q.y, vx: 0, vy: 0, r: r || rand(0.6, 1.5) * this.u, col: col || pick(LIFE_COLS), grow: rand(0.02, 0.06), link: null, ph: rand(0, TAU), deep: Math.random() < 0.3 }; }
    newFil(p) {
      const q = p || this.rp(0.8), pts = [], n = Math.floor(rand(6, 12)), seg = 1.3 * this.u, h = rand(0, TAU);
      for (let i = 0; i < n; i++) pts.push({ x: q.x - Math.cos(h) * seg * i, y: q.y - Math.sin(h) * seg * i });
      return { pts, seg, h, speed: rand(2.5, 5) * this.u, col: pick(LIFE_COLS), id: rand(0, 100), growT: rand(4, 9), deep: Math.random() < 0.3 };
    }
    newFood(p) { const q = p || this.rp(0.9); return { x: q.x, y: q.y, vx: 0, vy: 0, r: rand(0.3, 0.65) * this.u, col: pick(['#ffffff', '#fff1c2', '#bff3ff', '#ffd0ec']), ph: rand(0, TAU), alive: true, born: this.t || -9 }; }
    initWorld() {
      const u = this.u;
      this.hubs = []; for (let i = 0; i < 6; i++) this.hubs.push({ ra: rand(0.15, 0.6), w: rand(0.006, 0.016) * (Math.random() < 0.5 ? -1 : 1), ph: (i / 6) * TAU + rand(-0.4, 0.4), ph2: rand(0, TAU), r: rand(0.16, 0.28) });
      this.hubP = this.hubs.map((h, i) => this.hubPos(i, 0));
      this.cocci = []; for (let i = 0; i < 110; i++) this.cocci.push(this.assign(this.newCoccus()));
      this.fils = []; for (let i = 0; i < 13; i++) this.fils.push(this.newFil());
      this.rods = []; for (let i = 0; i < 29; i++) { const q = this.rp(); this.rods.push(this.assign({ x: q.x, y: q.y, a: rand(0, TAU), len: rand(3.2, 5.5) * u, w: rand(1.1, 1.7) * u, col: pick(LIFE_COLS), speed: rand(4, 7) * u, t: rand(0, 3), run: true, target: null, ph: rand(0, TAU), deep: Math.random() < 0.3, vx: 0, vy: 0 })); }
      this.tads = []; for (let i = 0; i < 32; i++) { const q = this.rp(); this.tads.push(this.assign({ x: q.x, y: q.y, vx: rand(-5, 5) * u, vy: rand(-5, 5) * u, s: rand(0.6, 1.0) * u, col: pick(LIFE_COLS), ph: rand(0, TAU), fav: null, favT: rand(5, 20), deep: Math.random() < 0.25 })); }
      this.rings = []; for (let i = 0; i < 13; i++) { const q = this.rp(); this.rings.push({ x: q.x, y: q.y, vx: 0, vy: 0, r: rand(2, 3.6) * u, tilt: rand(0, TAU), ts: rand(0.2, 0.5), rot: rand(0, TAU), col: pick(['#3b6fe0', '#1fb5b0', '#a58cff', '#ff86c2']), ph: rand(0, TAU) }); }
      // colour accents: concentric scent marks
      this.spots = []; for (let i = 0; i < 9; i++) { const q = this.rp(0.85); this.spots.push({ x: q.x, y: q.y, vx: 0, vy: 0, r: rand(5, 12) * u, col: pick(LIFE_COLS), ph: rand(0, TAU), dot: Math.random() < 0.6 }); }
      this.bubbles = []; for (let i = 0; i < 5; i++) { const q = this.rp(); this.bubbles.push({ x: q.x, y: q.y, vx: 0, vy: 0, r: rand(1.0, 2.6) * u, ph: rand(0, TAU) }); }
      this.food = []; for (let i = 0; i < 125; i++) this.food.push(this.assign(this.newFood()));
      this.farItems = []; for (let i = 0; i < 90; i++) { const q = this.rp(1); this.farItems.push({ x: q.x, y: q.y, r: rand(3, 14) * u, col: pick(LIFE_COLS), kind: pick(['soft', 'soft', 'rings', 'ring', 'soft']), a: rand(0.12, 0.35), ph: rand(0, TAU), vx: rand(-0.5, 0.5) * u, vy: rand(-0.5, 0.5) * u }); }
      this.nearItems = []; this.nearClock = rand(6, 14);
    }

    /* ------------ organisms ------------ */
    pickArrival() {
      const q = this.rp(0.45);
      const rect = this.root.getBoundingClientRect();
      return { x: q.x, y: q.y, clientX: rect.left + (this.cx + q.x) / this.dpr, clientY: rect.top + (this.cy + q.y) / this.dpr, cssScale: this.U / this.dpr };
    }
    spawn(genome, pos, opts) {
      opts = opts || {};
      const g = Object.assign({}, genome);
      if (!g.name) g.name = P.makeName();
      g.fig = g.fig || ++this.fig;
      if (g.fig > this.fig) this.fig = g.fig;
      if (opts.seed) g.seedling = true;
      g.size = g.size || (g.seedling ? rand(0.55, 0.68) : P.lerp(0.95, 1.55, g.scale == null ? 0.5 : g.scale) * rand(0.96, 1.04));
      g.seed = g.seed || (Math.random() * 1e9) | 0;
      const s = new Specimen(this, g, pos || this.rp(opts.instant ? 0.75 : 0.45));
      if (opts.instant) { s.state = 'alive'; s.alpha = 1; s.scale = 1; }
      else {
        this.ripples.push({ x: s.x, y: s.y, t: 0 });
        this.pushAway(s.x, s.y, 22 * this.u, 30 * this.u);
        this.showTag(s, 12);
      }
      this.specimens.push(s);
      const alive = this.specimens.filter((q) => q.state !== 'dying');
      if (alive.length > this.max) this.kill(alive.find((q) => q.g.seedling) || alive[0]); // starter organisms leave first
      this.save();
      return g;
    }
    kill(s) { s.state = 'dying'; s.timer = 0; this.save(); }
    clear() { this.specimens.forEach((s) => s.state !== 'dying' && this.kill(s)); }
    pushAway(x, y, rad, force) {
      const push = (o) => { const dx = o.x - x, dy = o.y - y, d = Math.hypot(dx, dy); if (d < rad && d > 0.01) { const k = (1 - d / rad) * force; o.vx = (o.vx || 0) + (dx / d) * k; o.vy = (o.vy || 0) + (dy / d) * k; } };
      this.cocci.forEach(push); this.tads.forEach(push); this.food.forEach(push); this.rings.forEach(push); this.spots.forEach(push);
    }
    showTag(s, secs) {
      if (!s.tag) {
        s.tag = document.createElement('div'); s.tag.className = 'tag';
        s.tag.innerHTML = `<i></i><b>Fig. ${s.g.fig}.</b> <span>${escapeHtml(s.g.name)}</span><em>${P.latinName(s.g)}</em><small>${temperName(s.g.temperament)}</small>`;
        this.labels.appendChild(s.tag);
      }
      s.tagUntil = this.t + secs;
    }
    save() {
      try { localStorage.setItem(STORE, JSON.stringify({ fig: this.fig, list: this.specimens.filter((s) => s.state !== 'dying').map((s) => s.g) })); } catch (e) { /* ok */ }
    }
    load() {
      // every launch starts fresh: three starter organisms, no history from the previous session
      for (let i = 0; i < 3; i++) this.spawn(P.randomGenome(), null, { instant: true, seed: true });
    }

    /* ------------ light modes ------------ */
    applyMode(i) {
      this.modeIndex = (i + MODES.length) % MODES.length;
      this.mode = MODES[this.modeIndex];
      this.floor = null; this.modeClock = 0;
      this.$mode.textContent = this.mode.label;
      this.root.classList.toggle('night', this.night);
      (this.modeListeners || []).forEach((fn) => fn(this.modeIndex));
      this.drawOverlay();
    }
    /* instant switch; buffers are re-warmed before the next visible frame */
    setMode(i) {
      if ((i + MODES.length) % MODES.length === this.modeIndex) return;
      this.applyMode(i);
      this.needWarm = true; this.haloReset = true;
    }
    renderFrame() {
      if (this.needWarm) { this.needWarm = false; this.render(); this.haloReset = true; }
      this.render();
    }
    nextMode() { this.setMode(this.modeIndex + 1); }
    onMode(fn) { this.modeListeners = (this.modeListeners || []).concat(fn); }
    setQuality(q, manual) { this.q = clamp(q, 0, 2); if (manual !== undefined) this.autoQ = !manual; this.W = 0; this.resize(); this.slow = 0; }
    cycleQuality() { // auto -> high -> medium -> low -> auto
      if (this.autoQ !== false) this.setQuality(0, true);
      else if (this.q < 2) this.setQuality(this.q + 1, true);
      else this.setQuality(0, false);
    }

    /* ------------ loop ------------ */
    loop(now) {
      let dt = (now - this.last) / 1000; this.last = now;
      if (dt > 0.1) dt = 0.1;
      this.fpsAcc += dt; this.fpsN++;
      if (this.fpsAcc > 1) {
        const fps = Math.round(this.fpsN / this.fpsAcc);
        this.$fps.textContent = fps + ' fps · ' + (this.autoQ !== false ? 'auto ' : '') + QUALITY[this.q || 0].name;
        this.slow = fps < 42 ? (this.slow || 0) + 1 : 0;
        if (this.slow >= 3 && (this.q || 0) < 2 && this.autoQ !== false && this.autoLite !== false) this.setQuality((this.q || 0) + 1);
        this.fpsAcc = 0; this.fpsN = 0;
      }
      this.t += dt;
      if (this.autoMode === true) { this.modeClock += dt; if (this.modeClock > MODE_PERIOD) this.nextMode(); }
      this.update(dt);
      this.renderFrame();
      this.updateHud();
      this.frameN++;
      requestAnimationFrame((n) => this.loop(n));
    }

    flow(x, y, t) {
      const s = 0.0045 / this.u, X = x * s + 3.1 + t * 0.03, Y = y * s - t * 0.022, e = 0.12, k = 14 * this.u;
      const dy = nz(X, Y + e) - nz(X, Y - e), dx = nz(X + e, Y) - nz(X - e, Y);
      let vx = dy * k, vy = -dx * k;
      // near the glass the current slides along the wall instead of pressing into it (no piling up at the rim)
      const r = Math.hypot(x, y), r0 = this.R * 0.62;
      if (r > r0) {
        const nx = x / r, ny = y / r, vr = vx * nx + vy * ny, w = smooth(r0, this.R * 0.88, r);
        if (vr > 0) { vx -= nx * vr * (w * 1.6); vy -= ny * vr * (w * 1.6); }
      }
      return [vx, vy];
    }
    /* clusters: slowly wandering hubs that loosely hold groups of life together */
    hubPos(i, t) { const h = this.hubs[i]; return { x: Math.cos(t * h.w + h.ph) * h.ra * this.R + Math.sin(t * h.w * 0.7 + h.ph2) * this.R * 0.08, y: Math.sin(t * h.w * 0.8 + h.ph) * h.ra * this.R * 0.9 }; }
    tether(o, dt, k) {
      if (o.hub == null || o.hub < 0) return;
      const h = this.hubP[o.hub], dx = h.x - o.x, dy = h.y - o.y, d = Math.hypot(dx, dy), lim = this.hubs[o.hub].r * this.R;
      if (d > lim) { const f = ((d - lim) / d) * (k || 0.35) * dt; o.vx = (o.vx || 0) + dx * f; o.vy = (o.vy || 0) + dy * f; }
    }
    assign(o, p) { // put a new object into a cluster (or leave it free-roaming)
      if (Math.random() < 0.45) {
        o.hub = Math.floor(Math.random() * this.hubs.length);
        if (!p) { const h = this.hubPos(o.hub, this.t), a = rand(0, TAU), d = Math.abs(gauss()) * this.hubs[o.hub].r * this.R; o.x = h.x + Math.cos(a) * d; o.y = h.y + Math.sin(a) * d; }
      } else o.hub = -1;
      return o;
    }
    contain(o, k) {
      const d = Math.hypot(o.x, o.y), lim = this.R * (k || 0.9);
      if (d > lim) { const f = (d - lim) * 2; o.vx = (o.vx || 0) - (o.x / d) * f; o.vy = (o.vy || 0) - (o.y / d) * f; if (d > lim + 10 * this.u) { o.x *= (lim + 10 * this.u) / d; o.y *= (lim + 10 * this.u) / d; } }
    }
    pickHome(s) {
      let best = null, bs = -1;
      for (let i = 0; i < 16; i++) {
        const q = this.rp(0.62); let m = 1e9;
        for (const o of this.specimens) { if (o === s || o.state === 'dying') continue; if (o.home) m = Math.min(m, dist(o.home, q)); m = Math.min(m, dist(o, q) * 1.2); }
        if (m > bs) { bs = m; best = q; }
      }
      return best;
    }
    /* colour borrowing (curious) */
    targetCol(o) {
      if (o.col && o.col.c0) return o.col;
      if (!o._col) { const c = hex(o.col), W = [255, 255, 255]; o._col = { c0: c, c1: mix(c, W, 0.35), c2: mix(c, W, 0.8), cr: mix(c, [20, 30, 60], 0.25), cr2: mix(c, W, 0.2), app: c, aura: mix(c, W, 0.3) }; }
      return o._col;
    }
    blendCol(s, tc, k) {
      for (const key of ['c0', 'c1', 'c2', 'cr', 'cr2', 'app', 'aura']) { const a = s.col[key], b = tc[key]; for (let i = 0; i < 3; i++) a[i] += (b[i] - a[i]) * k; }
      const m = s.m, W = [255, 255, 255];
      m.c0 = s.col.c0; m.c1 = s.col.c1; m.c2 = s.col.c2; m.cr = s.col.cr; m.cr2 = s.col.cr2; m.appRGB = s.col.app;
      m.appHi = mix(s.col.app, W, 0.55); m.hotRGB = mix(s.col.c2, W, 0.4);
    }
    avoid(o, s, k, force) {
      const dx = o.x - s.x, dy = o.y - s.y, d = Math.hypot(dx, dy), rad = s.rad * k;
      if (d < rad && d > 0.01) { const f = (1 - d / rad) * force * this.u; o.vx = (o.vx || 0) + (dx / d) * f * 0.1; o.vy = (o.vy || 0) + (dy / d) * f * 0.1; }
    }
    nearestFood(o, maxD) { let best = null, bd = maxD * maxD; for (const f of this.food) { const d = (f.x - o.x) ** 2 + (f.y - o.y) ** 2; if (d < bd) { bd = d; best = f; } } return best; }

    update(dt) {
      const t = this.t, u = this.u, sp = this.specimens;
      for (let i = 0; i < this.hubs.length; i++) this.hubP[i] = this.hubPos(i, t);
      for (const c of this.cocci) {
        const f = this.flow(c.x, c.y, t);
        c.vx += (f[0] - c.vx) * dt * 0.8 + rand(-1, 1) * u * dt * 5;
        c.vy += (f[1] - c.vy) * dt * 0.8 + rand(-1, 1) * u * dt * 5;
        if (c.link) {
          const l = c.link, dx = l.x - c.x, dy = l.y - c.y, d = Math.hypot(dx, dy) || 1, tgt = (c.r + l.r) * 0.92, k = (d - tgt) * 10 * dt;
          c.vx += (dx / d) * k; c.vy += (dy / d) * k; l.vx -= (dx / d) * k; l.vy -= (dy / d) * k;
          if (Math.random() < dt * 0.008 || d > tgt * 4 || l.dead) c.link = null;
        }
        this.tether(c, dt);
        if (!c.deep) for (const s of sp) this.avoid(c, s, 1.2, 40);
        this.contain(c);
        c.x += c.vx * dt; c.y += c.vy * dt;
        c.r += c.grow * u * dt * 0.12;
        // slow turnover: some cells fade out and reappear elsewhere, so nothing piles up over time
        if (c.a == null) c.a = 1;
        if (!c.recycle && Math.random() < dt * 0.012) c.recycle = true;
        if (c.recycle) {
          c.a -= dt * 0.5;
          if (c.a <= 0) { const q = this.newCoccus(); this.assign(q); c.x = q.x; c.y = q.y; c.hub = q.hub; c.vx = c.vy = 0; c.link = null; c.r = q.r; c.recycle = false; c.a = 0; }
        } else if (c.a < 1) c.a = Math.min(1, c.a + dt * 0.5);
        if (c.r > 1.6 * u) {
          if (this.cocci.length < 145) {
            c.r *= 0.74; const a = rand(0, TAU);
            const n = this.newCoccus({ x: c.x + Math.cos(a) * c.r, y: c.y + Math.sin(a) * c.r }, c.col, c.r);
            n.deep = c.deep; n.hub = c.hub; n.link = c; this.cocci.push(n);
          } else { c.r = 0.6 * u; c.recycle = true; }
        }
      }
      for (let i = this.fils.length - 1; i >= 0; i--) {
        const f = this.fils[i], hd = f.pts[0];
        f.h += (nz(t * 0.15 + f.id, f.id) - 0.5) * dt * 3;
        for (const s of sp) { const dx = hd.x - s.x, dy = hd.y - s.y, d = Math.hypot(dx, dy); if (d < s.rad * 2.2) f.h += angDiff(f.h, Math.atan2(dy, dx)) * dt * 3; }
        if (Math.hypot(hd.x, hd.y) > this.R * 0.82) f.h += angDiff(f.h, Math.atan2(-hd.y, -hd.x)) * dt * 2;
        hd.x += Math.cos(f.h) * f.speed * dt; hd.y += Math.sin(f.h) * f.speed * dt;
        for (let k = 1; k < f.pts.length; k++) { const a = f.pts[k], b = f.pts[k - 1], dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy) || 1; a.x = b.x + (dx / d) * f.seg; a.y = b.y + (dy / d) * f.seg; }
        f.growT -= dt;
        if (f.growT < 0) {
          f.growT = rand(4, 9);
          const tl = f.pts[f.pts.length - 1]; f.pts.push({ x: tl.x, y: tl.y });
          if (f.pts.length > 26) {
            const tail = f.pts.splice(13);
            if (this.fils.length < 19) { const nf = this.newFil(tail[0]); nf.pts = tail.reverse(); nf.col = f.col; nf.h = f.h + Math.PI; nf.deep = f.deep; this.fils.push(nf); }
          }
        }
      }
      for (let i = this.food.length - 1; i >= 0; i--) {
        const fd = this.food[i];
        if (!fd.alive) { this.food.splice(i, 1); continue; }
        const f = this.flow(fd.x, fd.y, t);
        fd.vx += (f[0] - fd.vx) * dt; fd.vy += (f[1] - fd.vy) * dt; this.tether(fd, dt, 0.2);
        this.contain(fd, 0.93); fd.x += fd.vx * dt; fd.y += fd.vy * dt;
      }
      if (this.food.length < 118 && Math.random() < dt * 3) this.food.push(this.assign(this.newFood()));
      for (const r of this.rods) {
        r.t -= dt;
        if (!r.target || !r.target.alive) { if (Math.random() < dt * 2) r.target = this.nearestFood(r, 30 * u); }
        let want = r.a;
        if (r.target) {
          want = Math.atan2(r.target.y - r.y, r.target.x - r.x);
          if (Math.hypot(r.target.x - r.x, r.target.y - r.y) < r.len * 0.6) { r.target.alive = false; r.target = null; }
          r.run = true;
        } else if (r.t < 0) { r.run = !r.run; r.t = r.run ? rand(1.5, 4) : rand(0.4, 1); }
        if (!r.run && !r.target) want = r.a + 2.5;
        if (!r.deep) for (const s of sp) { if (Math.hypot(r.x - s.x, r.y - s.y) < s.rad * 1.6) want = Math.atan2(r.y - s.y, r.x - s.x); }
        if (Math.hypot(r.x, r.y) > this.R * 0.8) want = Math.atan2(-r.y, -r.x);
        r.a += angDiff(r.a, want) * dt * (r.run ? 1.5 : 3);
        const v = r.run ? r.speed : r.speed * 0.15, f = this.flow(r.x, r.y, t);
        r.vx *= 1 - dt; r.vy *= 1 - dt; this.tether(r, dt, 0.25);
        r.x += Math.cos(r.a) * v * dt + (f[0] * 0.5 + r.vx) * dt; r.y += Math.sin(r.a) * v * dt + (f[1] * 0.5 + r.vy) * dt;
      }
      for (const a of this.tads) {
        let ax = 0, ay = 0, cx = 0, cy = 0, sx = 0, sy = 0, n = 0;
        for (const b of this.tads) {
          if (a === b) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 < (18 * u) ** 2) { ax += b.vx; ay += b.vy; cx += dx; cy += dy; n++; if (d2 < (4 * u) ** 2) { sx -= dx; sy -= dy; } }
        }
        if (n) { a.vx += ((ax / n - a.vx) * 0.6 + (cx / n) * 0.4 + sx * 2) * dt; a.vy += ((ay / n - a.vy) * 0.6 + (cy / n) * 0.4 + sy * 2) * dt; }
        a.favT -= dt;
        if (a.favT < 0) { a.fav = sp.length && Math.random() < 0.5 ? pick(sp) : null; a.favT = rand(8, 25); }
        if (a.fav && a.fav.state !== 'dying') { const dx = a.fav.x - a.x, dy = a.fav.y - a.y, d = Math.hypot(dx, dy) || 1, want = a.fav.rad * 2.2; const k = (d - want) / d; a.vx += dx * k * dt * 0.8; a.vy += dy * k * dt * 0.8; }
        this.tether(a, dt, 0.5);
        for (const s of sp) this.avoid(a, s, 1.15, 80);
        a.vx += (nz(t * 0.3 + a.ph, 0) - 0.5) * 40 * u * dt; a.vy += (nz(0, t * 0.3 + a.ph) - 0.5) * 40 * u * dt;
        const v = Math.hypot(a.vx, a.vy), mx = 14 * u, mn = 5 * u;
        if (v > mx) { a.vx *= mx / v; a.vy *= mx / v; } else if (v < mn && v > 0) { a.vx *= mn / v; a.vy *= mn / v; }
        this.contain(a, 0.86);
        a.x += a.vx * dt; a.y += a.vy * dt;
      }
      const drift = (o, k, av) => {
        const f = this.flow(o.x, o.y, t); o.vx += (f[0] * k - o.vx) * dt * 0.5; o.vy += (f[1] * k - o.vy) * dt * 0.5;
        if (av) for (const s of sp) this.avoid(o, s, 1.3, 20);
        this.contain(o, 0.85); o.x += o.vx * dt; o.y += o.vy * dt;
      };
      for (const r of this.rings) { r.tilt += r.ts * dt; r.rot += 0.05 * dt; drift(r, 0.6, true); }
      for (const s of this.spots) drift(s, 0.3, false);
      for (const b of this.bubbles) {
        const f = this.flow(b.x, b.y, t);
        b.vx += (f[0] * 1.2 + Math.sin(t * 0.9 + b.ph) * 1.5 * u - b.vx) * dt; b.vy += (f[1] * 1.2 - 2.2 * u - b.vy) * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (Math.hypot(b.x, b.y) > this.R * 0.92) { const q = this.rp(0.5); b.x = q.x; b.y = Math.abs(q.y) + this.R * 0.3; b.vx = b.vy = 0; b.born = t; }
      }
      for (const f of this.farItems) { f.x += f.vx * dt; f.y += f.vy * dt; if (Math.hypot(f.x, f.y) > this.R * 1.05) { f.x *= -0.95; f.y *= -0.95; } }
      this.nearClock -= dt;
      if (this.nearClock < 0) {
        this.nearClock = rand(14, 30);
        const a = rand(0, TAU), d = this.R * 1.25;
        this.nearItems.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, vx: -Math.cos(a + rand(-0.4, 0.4)) * rand(10, 18) * u, vy: -Math.sin(a + rand(-0.4, 0.4)) * rand(10, 18) * u, r: rand(14, 30) * u, col: pick(LIFE_COLS), kind: pick(['soft', 'ring', 'soft']), life: 0 });
      }
      for (let i = this.nearItems.length - 1; i >= 0; i--) { const n = this.nearItems[i]; n.x += n.vx * dt; n.y += n.vy * dt; n.life += dt; if (n.life > 40) this.nearItems.splice(i, 1); }
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i]; p.life += dt;
        const f = this.flow(p.x, p.y, t);
        p.vx += (f[0] - p.vx) * dt * 0.4; p.vy += (f[1] - p.vy) * dt * 0.4;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.life > p.max) { this.particles.splice(i, 1); if (!p.nofood && this.food.length < 140 && Math.random() < 0.4) { const fd = this.newFood({ x: p.x, y: p.y }); fd.hub = -1; this.food.push(fd); } }
      }
      for (let i = this.ripples.length - 1; i >= 0; i--) { this.ripples[i].t += dt; if (this.ripples[i].t > 3) this.ripples.splice(i, 1); }
      this.updateSpecimens(dt);
    }

    updateSpecimens(dt) {
      const t = this.t, u = this.u, sp = this.specimens;
      // when the dish gets busy everyone shrinks a little, so 14 still fit comfortably
      const nAlive = sp.filter((q) => q.state !== 'dying' && !q.g.seedling).length;
      this.crowdK += (clamp(Math.sqrt(8 / Math.max(8, nAlive)), 0.76, 1) - this.crowdK) * Math.min(1, dt * 0.4);
      for (let i = sp.length - 1; i >= 0; i--) {
        const s = sp[i], g = s.g;
        s.timer += dt;
        if (s.state === 'arriving') {
          const k = Math.min(1, s.timer / 2.4);
          s.alpha = Math.min(1, s.timer / 1.2); s.scale = elastic(k);
          if (k >= 1) { s.state = 'alive'; s.scale = 1; }
        }
        if (s.state === 'dying') {
          const k = s.timer / 5;
          s.alpha = Math.max(0, 1 - k * 1.1); s.scale = 1 + k * 0.15;
          const want = Math.floor(Math.min(1, k * 1.4) * (this.particles.length > 500 ? 30 : 70));
          const cols = [toHex(s.col.c0), toHex(s.col.c1), toHex(s.col.c2), toHex(s.col.cr), toHex(s.col.app)];
          while (s.emitted < want) {
            s.emitted++;
            if (this.particles.length > 650) continue;
            const a = rand(0, TAU), d = Math.sqrt(Math.random()) * s.rad;
            this.particles.push({ x: s.x + Math.cos(a) * d, y: s.y + Math.sin(a) * d, vx: Math.cos(a) * rand(2, 9) * u, vy: Math.sin(a) * rand(2, 9) * u, life: 0, max: rand(6, 14), col: pick(cols), r: rand(0.3, 0.9) * u });
          }
          if (s.timer > 5) {
            for (let k2 = 0; k2 < 3; k2++) { const a = rand(0, TAU); this.cocci.push(this.newCoccus({ x: s.x + Math.cos(a) * s.rad * 0.5, y: s.y + Math.sin(a) * s.rad * 0.5 }, toHex(s.col.c0), rand(0.8, 1.3) * u)); }
            if (s.tag) s.tag.remove();
            sp.splice(i, 1);
            continue;
          }
        }
        const base = ({ drifter: 4.5, curious: 5, hyper: 8, social: 5 }[g.temperament] || 4) * u * (1 + (g.flagella | 0) * 0.25);
        let want = s.heading, speed = base;
        const T = g.temperament, others = sp.filter((o) => o !== s && o.state !== 'dying');
        s.bumpCool -= dt; s.cool -= dt; s.touching = false;
        s.homeT -= dt;
        if (!s.home || s.homeT < 0) { s.home = this.pickHome(s); s.homeT = rand(40, 70); }
        const hdx = s.home.x - s.x, hdy = s.home.y - s.y, hd = Math.hypot(hdx, hdy), toHome = Math.atan2(hdy, hdx);
        if (T === 'social' || T === 'curious') { s.soloT -= dt; if (s.soloT < 0) { s.solo = rand(6, 10); s.soloT = rand(18, 30); s.target = null; } }
        if (s.solo > 0 && T !== 'drifter' && T !== 'hyper') {
          // a little time alone: swim back to its own patch of the dish
          s.solo -= dt; want = hd > 6 * u ? toHome : s.heading + 0.6 * dt; speed = base * (hd > 6 * u ? 1 : 0.4);
        } else if (T === 'drifter') {
          // slow circles: radius breathes, the centre wanders with the current
          const rOrb = (s.rad * 0.6 + 4 * u) * (0.75 + 0.6 * nz(t * 0.05 + s.ph * 7, s.ph));
          s.heading += s.orbitDir * (s.speed / rOrb) * dt;
          if (hd > this.R * 0.18) s.heading += angDiff(s.heading, toHome) * dt * 0.5;
          want = s.heading;
        } else if (T === 'hyper') {
          // darts at others and bumps them away
          s.runT -= dt;
          if (s.runT < 0) {
            s.running = !s.running; s.runT = s.running ? rand(1.2, 2.6) : rand(0.4, 0.9); s.tumbleDir = Math.random() < 0.5 ? -1 : 1;
            s.target = s.running && others.length && Math.random() < 0.75 ? pick(others) : null;
          }
          if (s.running) { speed = base * 1.8; if (s.target && s.target.state !== 'dying') want = Math.atan2(s.target.y - s.y, s.target.x - s.x); }
          else { want = s.heading + s.tumbleDir * 1.1; speed = base * 0.25; }
          if (s.bumpCool <= 0) for (const o of others) {
            const dx = o.x - s.x, dy = o.y - s.y, d = Math.hypot(dx, dy), m = (s.rad + o.rad) * 0.95;
            if (d < m && d > 0.01) {
              const nx = dx / d, ny = dy / d;
              const ja = Math.atan2(ny, nx) + rand(-0.75, 0.75), imp = (26 + (s.speed / u) * 1.8) * u * rand(0.8, 1.45);
              o.ivx += Math.cos(ja) * imp; o.ivy += Math.sin(ja) * imp; o.wobble = 1;
              const jb = Math.atan2(-ny, -nx) + rand(-0.9, 0.9), ib = imp * rand(0.45, 0.7);
              s.ivx += Math.cos(jb) * ib; s.ivy += Math.sin(jb) * ib; s.wobble = 0.8;
              s.bumpCool = 0.8; s.running = false; s.runT = rand(0.6, 1.0); s.target = null;
              this.ripples.push({ x: s.x + nx * s.rad, y: s.y + ny * s.rad, t: 0, scale: 0.35 });
              break;
            }
          }
          if (s.speed > base) this.pushAway(s.x, s.y, s.rad * 1.6, 30 * u * dt);
        } else if (T === 'curious') {
          // visits others and borrows their colour
          s.targetT -= dt;
          if (!s.target || s.target.state === 'dying' || s.targetT < 0) {
            s.targetT = rand(9, 15); s.contactT = 0;
            const pool = others.filter((o) => o !== s.lastTarget);
            s.target = pool.length && Math.random() < 0.8 ? pick(pool) : pick(this.spots);
          }
          if (s.target) {
            const tg = s.target, dx = tg.x - s.x, dy = tg.y - s.y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx);
            const near = (s.rad + (tg.rad || tg.r || 10 * u)) * 1.15;
            if (d > near) want = a;
            else {
              want = a + (Math.PI / 2) * s.orbitDir; speed = base * 0.35;
              s.contactT += dt; s.touching = true;
              this.blendCol(s, this.targetCol(tg), 1 - Math.exp(-dt * 0.7));
              if (Math.random() < dt * 7) {
                const tc = this.targetCol(tg), rr = (tg.rad || tg.r || 5 * u) * 0.6, aa = rand(0, TAU), px0 = tg.x + Math.cos(aa) * rr, py0 = tg.y + Math.sin(aa) * rr;
                const ddx = s.x - px0, ddy = s.y - py0, dd = Math.hypot(ddx, ddy) || 1;
                this.particles.push({ x: px0, y: py0, vx: (ddx / dd) * dd * 0.9, vy: (ddy / dd) * dd * 0.9, life: 0, max: 1.1, col: toHex(tc.c1), r: rand(0.4, 0.8) * u, nofood: true, quick: true });
              }
              if (s.contactT > 4.5) { s.lastTarget = tg; s.target = null; s.solo = rand(4, 7); }
            }
          }
        } else {
          // social: drawn to the nearest organism, then hangs out beside it
          s.targetT -= dt;
          if (!s.target || s.target.state === 'dying' || s.targetT < 0) {
            s.targetT = rand(10, 18);
            const fans = (o) => sp.filter((q) => q !== s && q.target === o && q.g.temperament === 'social').length;
            const pool = others.filter((o) => fans(o) < 2 && o.target !== s);
            s.target = pool.length ? pool.reduce((a, b) => (dist(a, s) < dist(b, s) ? a : b)) : null;
          }
          if (s.target) {
            const tg = s.target, dx = tg.x - s.x, dy = tg.y - s.y, d = Math.hypot(dx, dy), a = Math.atan2(dy, dx), keep = (s.rad + tg.rad) * 1.45;
            if (d > keep * 1.7) { want = a; speed = base * 1.4; }
            else { want = lerpAng(a + (Math.PI / 2) * s.orbitDir, tg.heading, 0.55); speed = base * clamp((d - keep) / keep + 0.45, 0.15, 1); }
          } else want = s.heading + (nz(t * 0.08 + s.ph * 10, s.ph) - 0.5) * 2;
        }
        // crowd avoidance: if three or more gather, steer out of the bunch
        let cn = 0, ccx = 0, ccy = 0;
        for (const o of others) { if (o === s.target) continue; const d = dist(o, s); if (d < (s.rad + o.rad) * 2.4) { cn++; ccx += o.x; ccy += o.y; } }
        if (cn >= (T === 'social' ? 3 : 2)) { const away = Math.atan2(s.y - ccy / cn, s.x - ccx / cn); want = lerpAng(want, away, 0.65); if (T === 'drifter') s.heading += angDiff(s.heading, away) * dt * 0.8; }
        if (T !== 'drifter' && !s.touching && !(T === 'hyper' && s.running && s.target) && hd > this.R * 0.22) want = lerpAng(want, toHome, clamp((hd - this.R * 0.22) / (this.R * 0.25), 0.2, 0.6));
        const dc = Math.hypot(s.x, s.y), lim = this.R * 0.84 - s.rad;
        if (dc > lim) want = lerpAng(want, Math.atan2(-s.y, -s.x), clamp((dc - lim) / (s.rad + 1), 0, 1));
        if (s.wantS == null) s.wantS = s.heading;
        s.wantS = lerpAng(s.wantS, want, Math.min(1, dt * 2.5)); // smoothed goal: no flip-flopping between rules
        if (T !== 'drifter' || dc > lim) { const turn = clamp(angDiff(s.heading, s.wantS) * (T === 'hyper' ? 1.6 : 1.2), -1.8, 1.8); s.heading += turn * dt; }
        s.speed += (speed - s.speed) * dt * 1.5;
        let px = 0, py = 0;
        for (const o of sp) { if (o === s) continue; const dx = s.x - o.x, dy = s.y - o.y, d = Math.hypot(dx, dy), m = (s.rad + o.rad) * 0.9; if (d < m && d > 0.01) { px += (dx / d) * (m - d) * 2; py += (dy / d) * (m - d) * 2; } }
        const f = this.flow(s.x, s.y, t);
        const kI = Math.exp(-2.2 * dt);
        s.x += (Math.cos(s.heading) * s.speed + px + f[0] * 0.3 + s.ivx) * dt;
        s.y += (Math.sin(s.heading) * s.speed + py + f[1] * 0.3 + s.ivy) * dt;
        s.ivx *= kI; s.ivy *= kI; s.wobble *= Math.exp(-2.5 * dt);
        if (!s.touching) this.blendCol(s, s.base, 1 - Math.exp(-dt * 0.07));
        if (Math.hypot(s.x, s.y) > this.R * 0.9) { const k = this.R * 0.9 / Math.hypot(s.x, s.y); s.x *= k; s.y *= k; s.ivx *= -0.5; s.ivy *= -0.5; }
        s.m.motion = clamp(s.speed / base, 0.2, 1.6);
        s.z = s.state === 'alive' ? Math.sin(t * 0.06 + s.zph) * Math.max(0, Math.sin(t * 0.021 + s.zph * 2)) : 0;
      }
    }

    /* ------------ rendering ------------ */
    cam() { const t = this.t, R = this.R; return { x: Math.sin(t * 0.031) * R * 0.03 + Math.sin(t * 0.013) * R * 0.02, y: Math.cos(t * 0.024) * R * 0.025 }; }

    blurSmall(src, px) {
      const t = this.tmp, x = this.tctx;
      if (t.width !== src.width || t.height !== src.height) { t.width = src.width; t.height = src.height; }
      x.clearRect(0, 0, t.width, t.height); x.filter = `blur(${px.toFixed(2)}px)`; x.drawImage(src, 0, 0); x.filter = 'none';
      return t;
    }

    render() {
      const c = this.ctx, W = this.W, H = this.H, R = this.R, cx = this.cx, cy = this.cy, t = this.t, u = this.u, night = this.night;
      if (!this.floor) this.makeFloor();
      const cam = this.cam();
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; c.filter = 'none';
      c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
      // (no glow outside the rim: the dish ends cleanly at its line)
      c.save();
      c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
      c.save(); c.translate(cx - cam.x * 0.15, cy - cam.y * 0.15); c.rotate(t * 0.004);
      c.drawImage(this.floor, -R * 1.15, -R * 1.15, R * 2.3, R * 2.3);
      if ((this.q || 0) < 2) {
      c.globalCompositeOperation = night ? 'lighter' : 'multiply'; c.globalAlpha = night ? 0.12 : 0.18; c.rotate(-t * 0.011); c.scale(-1.2, 1.2);
      c.drawImage(this.floor, -R * 1.15, -R * 1.15, R * 2.3, R * 2.3);
      }
      c.restore();
      // far plane
      this.renderFar(cam);
      c.globalCompositeOperation = night ? 'lighter' : 'source-over'; c.globalAlpha = 1;
      c.drawImage(this.blurSmall(this.far, (0.9 + Math.sin(t * 0.05) * 0.4) * this.dpr), 0, 0, W, H);
      // mid plane
      c.save(); c.translate(cx - cam.x, cy - cam.y);
      this.renderMid(c, t, u);
      c.restore();
      // capture a soft copy of the scene
      const g = this.gctx;
      g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, this.glow.width, this.glow.height);
      g.filter = 'blur(2px)'; g.drawImage(this.scene, 0, 0, this.glow.width, this.glow.height); g.filter = 'none';
      if (night) { c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.3; c.drawImage(this.glow, 0, 0, W, H); }
      // patches of defocus drifting across the field + softer edges
      this.renderDefocus();
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.drawImage(this.defo, 0, 0, W, H);
      // near plane
      this.renderNear(cam);
      c.globalCompositeOperation = night ? 'lighter' : 'source-over'; c.globalAlpha = 1;
      if (this.nearItems.length) c.drawImage(this.blurSmall(this.near, 1.8 * this.dpr), 0, 0, W, H);
      c.globalCompositeOperation = 'source-over';
      c.restore();
    }

    renderHalo() {
      const h = this.hctx, w = this.halo.width, hh = this.halo.height, k = w / this.W, R = this.R * k, cx = this.cx * k, cy = this.cy * k;
      h.globalCompositeOperation = 'source-over'; h.clearRect(0, 0, w, hh);
      const hs = this.hsctx;
      hs.clearRect(0, 0, w, hh); hs.save(); hs.beginPath(); hs.arc(cx, cy, R * 0.985, 0, TAU); hs.clip();
      hs.drawImage(this.glow, 0, 0); hs.restore();
      h.filter = `blur(${(this.night ? 3 : 5) * this.dpr}px)`;
      const s = 1.14;
      h.drawImage(this.hsrc, cx - cx * s, cy - cy * s, w * s, hh * s);
      h.filter = 'none';
      h.globalCompositeOperation = 'destination-in';
      const g = h.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.28);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      h.fillStyle = g; h.fillRect(0, 0, w, hh);
      h.globalCompositeOperation = 'source-over';
      const a = this.hactx;
      if (this.haloReset) { a.globalAlpha = 1; a.clearRect(0, 0, w, hh); a.drawImage(this.halo, 0, 0); this.haloReset = false; }
      else { // slow moving average (fade old content out, blend new in)
        a.globalCompositeOperation = 'destination-out'; a.globalAlpha = 0.05; a.fillRect(0, 0, w, hh);
        a.globalCompositeOperation = 'source-over'; a.drawImage(this.halo, 0, 0); a.globalAlpha = 1;
      }
      const c = this.ctx;
      c.globalAlpha = this.night ? 0.16 : 0.65;
      c.drawImage(this.haloAcc, 0, 0, this.W, this.H);
      c.globalAlpha = 1;
    }

    renderDefocus() {
      const d = this.dctx, w = this.defo.width, h = this.defo.height;
      // mask (low-res noise), refreshed every few frames
      {
        const m = this.dmctx, mw = this.dmask.width, mh = this.dmask.height;
        if (!this.dmImg || this.dmImg.width !== mw || this.dmImg.height !== mh) this.dmImg = m.createImageData(mw, mh);
        const md = this.dmImg.data, t = this.t, Rm = this.R / 10, cxm = this.cx / 10, cym = this.cy / 10;
        for (let y = 0, i = 0; y < mh; y++) for (let x = 0; x < mw; x++, i += 4) {
          const rx = (x - cxm) / Rm, ry = (y - cym) / Rm, rr = Math.sqrt(rx * rx + ry * ry);
          const n = nz(rx * 0.9 + t * 0.025, ry * 0.9 - t * 0.018 + 4);
          const a = Math.max(smooth(0.7, 0.84, n) * 0.7, smooth(0.84, 1.0, rr));
          md[i] = md[i + 1] = md[i + 2] = 0; md[i + 3] = a * 255;
        }
        m.putImageData(this.dmImg, 0, 0); this.dmaskReady = true;
      }
      d.globalCompositeOperation = 'source-over'; d.clearRect(0, 0, w, h);
      d.filter = `blur(${1.5 * this.dpr}px)`; d.drawImage(this.glow, 0, 0); d.filter = 'none';
      d.globalCompositeOperation = 'destination-in'; d.imageSmoothingEnabled = true;
      d.drawImage(this.dmask, 0, 0, w, h);
      d.globalCompositeOperation = 'source-over';
    }

    renderFar(cam) {
      const f = this.fctx, k = this.far.width / this.W, t = this.t, night = this.night, u = this.u;
      f.setTransform(1, 0, 0, 1, 0, 0); f.clearRect(0, 0, this.far.width, this.far.height);
      f.setTransform(k, 0, 0, k, (this.cx - cam.x * 0.4) * k, (this.cy - cam.y * 0.4) * k);
      f.globalCompositeOperation = night ? 'lighter' : 'source-over';
      for (const it of this.farItems) {
        f.globalAlpha = it.a * (0.7 + 0.3 * Math.sin(t * 0.3 + it.ph)) * (night ? 1 : 0.8);
        const s = P.orb(it.col, it.kind); f.drawImage(s, it.x - it.r, it.y - it.r, it.r * 2, it.r * 2);
      }
      // deep-lying organisms, out of focus
      const kind = night ? 'orb' : 'dorb';
      f.globalAlpha = 0.6;
      for (const c of this.cocci) if (c.deep) { f.globalAlpha = 0.6 * (c.a == null ? 1 : c.a); f.drawImage(P.orb(c.col, kind), c.x - c.r * 1.6, c.y - c.r * 1.6, c.r * 3.2, c.r * 3.2); }
      f.globalAlpha = 0.6;
      for (const r of this.rods) if (r.deep) { f.strokeStyle = r.col; f.lineCap = 'round'; f.lineWidth = r.w; f.beginPath(); f.moveTo(r.x - Math.cos(r.a) * r.len / 2, r.y - Math.sin(r.a) * r.len / 2); f.lineTo(r.x + Math.cos(r.a) * r.len / 2, r.y + Math.sin(r.a) * r.len / 2); f.stroke(); }
      for (const a of this.tads) if (a.deep) f.drawImage(P.orb(a.col, 'soft'), a.x - a.s * 2, a.y - a.s * 2, a.s * 4, a.s * 4);
      for (const fl of this.fils) if (fl.deep) { f.strokeStyle = fl.col; f.lineWidth = 0.8 * u; f.beginPath(); fl.pts.forEach((p, i) => (i ? f.lineTo(p.x, p.y) : f.moveTo(p.x, p.y))); f.stroke(); }
      f.globalAlpha = 1;
    }

    renderNear(cam) {
      const n = this.nctx, k = this.near.width / this.W;
      n.setTransform(1, 0, 0, 1, 0, 0); n.clearRect(0, 0, this.near.width, this.near.height);
      n.setTransform(k, 0, 0, k, (this.cx - cam.x * 2) * k, (this.cy - cam.y * 2) * k);
      n.globalCompositeOperation = this.night ? 'lighter' : 'source-over';
      for (const it of this.nearItems) {
        n.globalAlpha = Math.min(1, it.life / 4) * (this.night ? 0.28 : 0.22);
        n.drawImage(P.orb(it.col, it.kind), it.x - it.r, it.y - it.r, it.r * 2, it.r * 2);
      }
      n.globalAlpha = 1;
    }

    renderMid(c, t, u) {
      const night = this.night, blend = night ? 'lighter' : 'source-over', ok = night ? 'orb' : 'dorb';
      // colour accents
      c.globalCompositeOperation = blend;
      for (const s of this.spots) {
        const r = s.r * (1 + Math.sin(t * 0.5 + s.ph) * 0.06);
        c.globalAlpha = night ? 0.3 : 0.5;
        c.drawImage(P.orb(s.col, 'rings'), s.x - r, s.y - r, r * 2, r * 2);
        if (s.dot) { c.globalAlpha = night ? 0.6 : 0.5; c.fillStyle = night ? '#ffffff' : '#4a4f5c'; c.beginPath(); c.arc(s.x, s.y, 0.45 * u, 0, TAU); c.fill(); }
      }
      c.globalAlpha = 1;
      // bubbles: white pearl with a teal fleck
      for (const b of this.bubbles) {
        if (night) {
          c.lineWidth = Math.max(1, b.r * 0.08); c.strokeStyle = 'rgba(235,245,255,0.35)'; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.stroke();
        } else {
          const fade = b.born != null ? Math.min(1, (t - b.born) / 2) : 1, r = b.r * (1 + Math.sin(t * 2 + b.ph) * 0.03);
          c.globalAlpha = fade;
          c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.arc(b.x, b.y, r, 0, TAU); c.fill();
          c.strokeStyle = 'rgba(70,95,130,0.22)'; c.lineWidth = Math.max(1, r * 0.07); c.stroke();
          c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = Math.max(1, r * 0.08);
          c.beginPath(); c.arc(b.x, b.y, r * 0.72, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
          c.globalAlpha = 1;
        }
      }
      // food
      c.globalCompositeOperation = night ? 'lighter' : 'source-over';
      for (const f of this.food) {
        c.globalAlpha = Math.min(1, (t - f.born) / 1.5) * (0.65 + 0.3 * Math.sin(t * 1.1 + f.ph)) * (night ? 1 : 0.8);
        const col = night ? f.col : '#ffffff';
        c.drawImage(P.orb(col, 'soft'), f.x - f.r * 2.5, f.y - f.r * 2.5, f.r * 5, f.r * 5);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = blend;
      // tiny rings
      for (const r of this.rings) {
        const sy = Math.max(0.08, Math.abs(Math.cos(r.tilt))), pulse = 1 + Math.sin(t * 1.4 + r.ph) * 0.04;
        c.save(); c.translate(r.x, r.y); c.rotate(r.rot);
        c.strokeStyle = night ? '#e8f4ff' : r.col; c.globalAlpha = 0.55; c.lineWidth = 0.3 * u;
        c.setLineDash([0.4 * u, 0.6 * u]);
        c.beginPath(); c.ellipse(0, 0, r.r * pulse, r.r * sy * pulse, 0, 0, TAU); c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 0.7; c.fillStyle = night ? '#ffffff' : r.col; c.beginPath(); c.arc(0, 0, 0.35 * u, 0, TAU); c.fill();
        c.restore();
      }
      c.globalAlpha = 1;
      // threads
      for (const f of this.fils) {
        if (f.deep) continue;
        const col = hex(f.col), n = f.pts.length;
        const pts = f.pts.map((p, i) => {
          if (i === 0 || i === n - 1) return p;
          const a = f.pts[i - 1], b = f.pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, w = Math.sin(i * 0.7 - t * 3 + f.id) * 0.7 * u;
          return { x: p.x - (dy / d) * w, y: p.y + (dx / d) * w };
        });
        c.beginPath(); c.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < n - 1; i++) { const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2; c.quadraticCurveTo(pts[i].x, pts[i].y, mx, my); }
        c.lineTo(pts[n - 1].x, pts[n - 1].y);
        c.lineWidth = 1.3 * u; c.strokeStyle = rgba(col, 0.16); c.stroke();
        c.lineWidth = 0.32 * u; c.strokeStyle = rgba(night ? mix(col, [255, 255, 255], 0.4) : mix(col, [30, 40, 70], 0.15), 0.7); c.stroke();
        c.fillStyle = rgba(col, 0.75);
        for (let i = 0; i < n; i += 3) { c.beginPath(); c.arc(pts[i].x, pts[i].y, 0.45 * u, 0, TAU); c.fill(); }
      }
      // cocci
      c.globalAlpha = night ? 0.65 : 0.85;
      const ca0 = c.globalAlpha;
      for (const k of this.cocci) { if (k.deep) continue; c.globalAlpha = ca0 * (k.a == null ? 1 : k.a); const r = k.r * (1 + Math.sin(t * 1.3 + k.ph) * 0.04); c.drawImage(P.orb(k.col, ok), k.x - r * 1.28, k.y - r * 1.28, r * 2.56, r * 2.56); }
      // rods
      c.globalAlpha = 0.75;
      for (const r of this.rods) {
        if (r.deep) continue;
        const col = hex(r.col), ca = Math.cos(r.a), sa = Math.sin(r.a), hl = r.len / 2;
        const x0 = r.x - ca * hl, y0 = r.y - sa * hl, x1 = r.x + ca * hl, y1 = r.y + sa * hl;
        c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
        c.lineWidth = r.w; c.strokeStyle = rgba(col, night ? 0.35 : 0.3); c.stroke();
        c.lineWidth = r.w * 0.4; c.strokeStyle = rgba(night ? mix(col, [255, 255, 255], 0.5) : mix(col, [30, 40, 70], 0.2), 0.45); c.stroke();
        c.lineWidth = 0.15 * u; c.strokeStyle = rgba(col, 0.55); c.beginPath();
        for (let i = 0; i < 8; i++) {
          const s = (i % 4) / 3 - 0.5, side = i < 4 ? 1 : -1;
          const bx = r.x + ca * s * r.len * 0.8 - sa * side * r.w * 0.5, by = r.y + sa * s * r.len * 0.8 + ca * side * r.w * 0.5;
          const sw = Math.sin(t * 9 + i + r.ph) * 0.4;
          c.moveTo(bx, by); c.lineTo(bx - sa * side * 1.0 * u - ca * sw * u, by + ca * side * 1.0 * u - sa * sw * u);
        }
        c.stroke();
      }
      // tadpoles
      for (const a of this.tads) {
        if (a.deep) continue;
        const col = hex(a.col), v = Math.hypot(a.vx, a.vy) || 1, dx = a.vx / v, dy = a.vy / v;
        c.lineWidth = 0.25 * u; c.strokeStyle = rgba(col, 0.6); c.beginPath(); c.moveTo(a.x, a.y);
        for (let i = 1; i <= 5; i++) { const s = i * 0.9 * u, w = Math.sin(t * 14 + a.ph - i * 0.9) * i * 0.18 * u; c.lineTo(a.x - dx * s - dy * w, a.y - dy * s + dx * w); }
        c.stroke();
        c.drawImage(P.orb(a.col, ok), a.x - a.s * 1.3, a.y - a.s * 1.3, a.s * 2.6, a.s * 2.6);
      }
      c.globalAlpha = 1;
      // dissolving organisms
      for (const p of this.particles) {
        c.globalAlpha = Math.max(0, p.quick ? Math.min(1, p.life / 0.15, (p.max - p.life) / 0.35) : Math.min(1, p.life / 0.6, (p.max - p.life) / 3)) * 0.8;
        c.drawImage(P.orb(p.col, 'soft'), p.x - p.r * 2.5, p.y - p.r * 2.5, p.r * 5, p.r * 5);
      }
      c.globalAlpha = 1;
      // drop ripples
      for (const r of this.ripples) {
        const k = r.t / 3;
        for (let j = 0; j < 3; j++) {
          const kk = k - j * 0.12; if (kk <= 0) continue;
          c.strokeStyle = night ? `rgba(220,240,255,${(0.5 * (1 - kk)).toFixed(3)})` : `rgba(60,90,130,${(0.35 * (1 - kk)).toFixed(3)})`;
          c.lineWidth = (1.5 - kk) * u * 0.4;
          c.beginPath(); c.arc(r.x, r.y, kk * 34 * u * (r.scale || 1), 0, TAU); c.stroke();
        }
      }
      // organisms: aura + concentric breath + body
      const U = this.U;
      // organism bodies are rebuilt within a time budget per frame (oldest first); on a normal machine that is every
      // body every frame, on a slow one the newest image dissolves out of the previous one so nothing steps
      const now = performance.now(), t0 = now, msBudget = QUALITY[this.q || 0].ms;
      const rebuild = (s) => {
        const tt = t + s.ph * 50;
        s.m.update(tt); s.size = s.m.drawSprite(tt, U * s.g.size, true); s.img = s.m.compose(tt);
        if (s.tBuilt) s.interval = s.interval ? s.interval * 0.8 + (now - s.tBuilt) * 0.2 : now - s.tBuilt;
        s.tBuilt = now; s.built = this.frameN;
      };
      for (const s of this.specimens) if (!s.img || s.state !== 'alive') rebuild(s);
      const queue = this.specimens.filter((s) => s.state === 'alive' && s.built !== this.frameN).sort((a, b) => a.built - b.built);
      // steady cadence: how many bodies fit in the budget is estimated from the measured average cost,
      // so each body is refreshed at a regular rhythm instead of whenever time happens to be left over
      const cost = this.bodyCost || 1.5, n = clamp(Math.floor(msBudget / cost), 2, queue.length);
      for (let k = 0; k < n && k < queue.length; k++) rebuild(queue[k]);
      if (n > 0 && queue.length) { const per = (performance.now() - t0) / Math.max(1, Math.min(n, queue.length)); this.bodyCost = this.bodyCost ? this.bodyCost * 0.95 + per * 0.05 : per; }
      for (const s of this.specimens) {
        const tt = t + s.ph * 50, aura = s.g.aura == null ? 0.6 : s.g.aura;
        const R0 = s.m.rMax * U * s.g.size * s.scale * this.crowdK;
        if (aura > 0.02) {
          c.globalCompositeOperation = blend;
          c.globalAlpha = s.alpha * aura * (night ? 0.35 : 0.5);
          const ar = R0 * (2.3 + Math.sin(t * 0.7 + s.ph) * 0.12);
          c.drawImage(P.orb(toHex(s.col.aura), 'soft'), s.x - ar, s.y - ar, ar * 2, ar * 2);
          const rc = s.col.cr;
          c.lineWidth = 0.3 * u;
          for (let k = 0; k < 2; k++) {
            const ph = ((t * 0.1 + k / 2 + s.ph) % 1);
            const rr = R0 * (1.2 + ph * 0.8);
            c.globalAlpha = s.alpha * aura * 0.3 * Math.sin(ph * Math.PI) * (night ? 0.8 : 0.6);
            c.strokeStyle = rgba(night ? mix(rc, [255, 255, 255], 0.5) : rc, 1);
            c.beginPath(); c.arc(s.x, s.y, rr, 0, TAU); c.stroke();
          }
        }
        c.globalCompositeOperation = 'source-over';
        const size = s.size, img = s.img;
        const blur = Math.abs(s.z || 0) * 1.2 * this.dpr;
        c.save();
        c.translate(s.x, s.y); c.rotate(s.heading + Math.sin(t * 1.1 + s.ph) * 0.07);
        const wb = 1 + s.wobble * 0.045 * Math.sin(s.timer * 9);
        c.scale(s.scale * this.crowdK * wb, s.scale * this.crowdK / wb);
        c.globalAlpha = s.alpha;
        if (blur > 0.12) c.filter = `blur(${blur.toFixed(2)}px)`;
        // appendages animate every frame; the heavy body image is refreshed on a budget
        const Us = U * s.g.size;
        c.save(); c.scale(Us, Us); c.globalAlpha = s.alpha * 0.92; s.m.drawLiveApps(c, tt, night); c.restore();
        c.globalAlpha = s.alpha;
        c.drawImage(img, -size / 2, -size / 2);
        c.restore();
      }
    }

    updateHud() {
      const alive = this.specimens.filter((s) => s.state !== 'dying').length;
      this.$count.textContent = `Specimens ${String(alive).padStart(2, '0')} / ${this.max}`;
      const sec = Math.floor((performance.now() - this.start) / 1000);
      this.$time.textContent = `T + ${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor(sec / 60) % 60).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
      const cam = this.cam();
      for (const s of this.specimens) {
        if (!s.tag) continue;
        const show = this.showAllTags || (s.tagUntil && this.t < s.tagUntil);
        s.tag.classList.toggle('on', !!show && s.state !== 'dying');
        if (show) {
          const x = (this.cx + s.x - cam.x + s.rad * 0.9) / this.dpr, y = (this.cy + s.y - cam.y - s.rad * 0.6) / this.dpr;
          s.tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
        }
      }
    }
    toggleTags() {
      this.showAllTags = !this.showAllTags;
      this.specimens.forEach((s) => { if (!s.tag) this.showTag(s, 0); });
    }
  }

  function temperName(id) { const t = P.TEMPERS.find((q) => q.id === id); return t ? t.name : ''; }
  function toHex(c) { const q = (v) => Math.max(0, Math.min(255, Math.round(v / 8) * 8)).toString(16).padStart(2, '0'); return '#' + q(c[0]) + q(c[1]) + q(c[2]); }
  function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.4; }
  function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
  function lerpAng(a, b, t) { return a + angDiff(a, b) * t; }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function elastic(k) { if (k <= 0) return 0.2; if (k >= 1) return 1; return 1 - Math.pow(2, -9 * k) * Math.cos(k * 9) * 0.8; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
  P.escapeHtml = escapeHtml;
  P.Dish = Dish;
  P.MODES = MODES;
})();
