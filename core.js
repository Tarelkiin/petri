/* Petri v2 — core: noise, palettes, genome, procedural microbe renderer */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const P = (window.Petri = {});
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  P.TAU = TAU; P.clamp = clamp; P.lerp = lerp; P.smooth = smooth;
  P.rand = (a, b) => a + Math.random() * (b - a);
  P.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  P.mulberry = mulberry;

  /* ---------- periodic value noise ---------- */
  const NS = 256, NM = 255;
  const ntex = new Float32Array(NS * NS);
  (function () {
    const r = mulberry(1337);
    function lattice(freq) {
      const g = new Float32Array(freq * freq);
      for (let i = 0; i < g.length; i++) g[i] = r();
      return (u, v) => {
        const fx = u * freq, fy = v * freq;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const i0 = ix % freq, i1 = (ix + 1) % freq, j0 = iy % freq, j1 = (iy + 1) % freq;
        const a = g[j0 * freq + i0], b = g[j0 * freq + i1], c = g[j1 * freq + i0], d = g[j1 * freq + i1];
        return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
      };
    }
    const o1 = lattice(8), o2 = lattice(16), o3 = lattice(32);
    let mn = 9, mx = -9;
    for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) {
      const u = x / NS, v = y / NS;
      const n = o1(u, v) * 0.55 + o2(u, v) * 0.3 + o3(u, v) * 0.15;
      ntex[y * NS + x] = n; if (n < mn) mn = n; if (n > mx) mx = n;
    }
    for (let i = 0; i < ntex.length; i++) ntex[i] = (ntex[i] - mn) / (mx - mn);
  })();
  function nz(x, y) {
    x *= 32; y *= 32;
    let ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    ix &= NM; iy &= NM;
    const ix1 = (ix + 1) & NM, iy1 = (iy + 1) & NM;
    const a = ntex[iy * NS + ix], b = ntex[iy * NS + ix1], c = ntex[iy1 * NS + ix], d = ntex[iy1 * NS + ix1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  P.nz = nz;

  /* ---------- colour ---------- */
  function hex(h) { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  function mix(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
  function rgba(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + a.toFixed(3) + ')'; }
  P.hex = hex; P.mix = mix; P.rgba = rgba;

  // one gamut shared by organisms and the dish (pastel-neon, from the scent-map references)
  P.palettes = [
    { id: 'lagoon', name: 'Lagoon', edge: '#1fb5b0', mid: '#86e8de', hot: '#fffbe2', rim: '#0f8fa8', rim2: '#7d6bff', app: '#3b6fe0', aura: '#7fdcd4' },
    { id: 'blush', name: 'Blush', edge: '#ff6fae', mid: '#ffb09a', hot: '#fff3c6', rim: '#f2408c', rim2: '#ffae3d', app: '#a58cff', aura: '#ffb3d4' },
    { id: 'lilac', name: 'Lilac', edge: '#9179ff', mid: '#d8b6ff', hot: '#ffffff', rim: '#5f45ff', rim2: '#ff7fc0', app: '#4fc6e6', aura: '#c4b4ff' },
    { id: 'cobalt', name: 'Cobalt', edge: '#2c5ce0', mid: '#62c6ff', hot: '#ecfcff', rim: '#1a3ccf', rim2: '#2fdcbc', app: '#ff86c2', aura: '#8eb0ff' },
    { id: 'coral', name: 'Coral', edge: '#ff5560', mid: '#ff9b5e', hot: '#ffeaa2', rim: '#e42c50', rim2: '#ff6fd0', app: '#1fb5b0', aura: '#ffa79e' },
    { id: 'lemon', name: 'Lemon', edge: '#a9d43c', mid: '#f1ea62', hot: '#ffffff', rim: '#6fae1e', rim2: '#2fcfae', app: '#ff853a', aura: '#e8ec86' },
    { id: 'prism', name: 'Prism', edge: '#58cbe6', mid: '#ffb0e4', hot: '#fffbd2', rim: '#6a5cff', rim2: '#ff5e9e', app: '#e8de4a', aura: '#d6c6ff' },
    { id: 'ember', name: 'Ember', edge: '#ff8538', mid: '#ff5c9e', hot: '#fff0b2', rim: '#df4a2f', rim2: '#8f78ff', app: '#2c5ce0', aura: '#ffbd96' },
  ];
  P.appSwatches = ['auto', '#3b6fe0', '#1fb5b0', '#7d6bff', '#ff6fae', '#ff853a', '#e8de4a', '#86e8de', '#ffffff'];

  P.SHAPES = [
    { id: 'round', name: 'Sphere' }, { id: 'capsule', name: 'Rod' }, { id: 'dumbbell', name: 'Dividing' },
    { id: 'liquid', name: 'Liquid' }, { id: 'ring', name: 'Ring' }, { id: 'colony', name: 'Colony' },
  ];
  P.APPS = [
    { id: 'none', name: 'None' }, { id: 'villi', name: 'Villi' }, { id: 'cilia', name: 'Cilia' },
    { id: 'spikes', name: 'Spines' }, { id: 'tentacles', name: 'Tentacles' },
  ];
  P.TEXTURES = [{ id: 'smooth', name: 'Smooth' }, { id: 'spots', name: 'Spots' }, { id: 'veins', name: 'Veins' }, { id: 'dots', name: 'Halftone' }];
  P.TEMPERS = [
    { id: 'drifter', name: 'Drifter', desc: 'swims in slow circles' },
    { id: 'curious', name: 'Curious', desc: 'borrows colour from others' },
    { id: 'hyper', name: 'Restless', desc: 'bumps others away' },
    { id: 'social', name: 'Social', desc: 'drifts close, hangs out' },
  ];

  const BASE = {
    shape: 'round', scale: 0.5, length: 0.5, width: 0.5, pinch: 0.5, fluidity: 0.3, lumpiness: 0.15,
    transparency: 0.45, rim: 0.7, haze: 0.35, aura: 0.6,
    nuclei: 1, nucleusSize: 0.5, glow: 0.8, granules: 0.4, texture: 'smooth',
    appType: 'villi', appCount: 0.5, appLength: 0.4, appThickness: 0.5, appCurl: 0.4, appSpeed: 0.4,
    flagella: 0, flagLength: 0.5,
    palette: 0, appColor: 'auto', temperament: 'drifter',
  };
  P.presets = [
    { name: 'Coccus', g: { shape: 'round', length: 0.45, width: 0.6, fluidity: 0.25, lumpiness: 0.2, nuclei: 1, nucleusSize: 0.65, glow: 0.9, texture: 'dots', granules: 0.5, appType: 'villi', appCount: 0.4, appLength: 0.3, appThickness: 0.45, palette: 0, temperament: 'drifter' } },
    { name: 'Bacillus', g: { shape: 'capsule', length: 0.6, width: 0.45, fluidity: 0.2, lumpiness: 0.05, nuclei: 2, nucleusSize: 0.4, appType: 'cilia', appCount: 0.7, appLength: 0.35, appThickness: 0.35, flagella: 1, flagLength: 0.6, palette: 3, temperament: 'hyper' } },
    { name: 'Diplo', g: { shape: 'dumbbell', length: 0.55, width: 0.65, pinch: 0.6, nuclei: 2, nucleusSize: 0.55, glow: 1, appType: 'villi', appCount: 0.55, appLength: 0.42, appThickness: 0.6, appCurl: 0.5, palette: 2, temperament: 'curious' } },
    { name: 'Amoeba', g: { shape: 'liquid', length: 0.5, width: 0.6, fluidity: 0.85, lumpiness: 0.35, nuclei: 3, nucleusSize: 0.45, texture: 'veins', granules: 0.5, haze: 0.5, appType: 'none', palette: 1, temperament: 'drifter' } },
    { name: 'Annulus', g: { shape: 'ring', length: 0.5, width: 0.45, nuclei: 0, granules: 0.95, transparency: 0.55, rim: 0.9, appType: 'cilia', appCount: 0.35, appLength: 0.2, palette: 6, temperament: 'social' } },
    { name: 'Colony', g: { shape: 'colony', width: 0.55, lumpiness: 0.4, nuclei: 3, nucleusSize: 0.5, granules: 0.6, texture: 'spots', appType: 'cilia', appCount: 0.4, appLength: 0.25, appThickness: 0.3, palette: 7, temperament: 'drifter' } },
    { name: 'Anemone', g: { shape: 'round', scale: 0.5, length: 0.5, width: 0.5, nuclei: 1, nucleusSize: 0.7, glow: 0.8, texture: 'veins', appType: 'tentacles', appCount: 0.75, appLength: 0.55, appThickness: 0.45, appCurl: 0.3, appSpeed: 0.25, palette: 4, temperament: 'curious' } },
  ];
  P.makeGenome = function (over) {
    const g = Object.assign({}, BASE, over || {});
    if (!g.seed) g.seed = (Math.random() * 1e9) | 0;
    return g;
  };
  const NUM_KEYS = ['scale', 'length', 'width', 'pinch', 'fluidity', 'lumpiness', 'transparency', 'rim', 'haze', 'aura', 'nucleusSize', 'glow', 'granules', 'appCount', 'appLength', 'appThickness', 'appCurl', 'appSpeed', 'flagLength'];
  P.randomGenome = function () {
    const pr = P.pick(P.presets);
    const g = P.makeGenome(pr.g);
    NUM_KEYS.forEach((k) => (g[k] = clamp(g[k] + (Math.random() - 0.5) * 0.4, 0, 1)));
    if (Math.random() < 0.5) g.palette = Math.floor(Math.random() * P.palettes.length);
    if (Math.random() < 0.3) g.nuclei = Math.floor(Math.random() * 5);
    if (Math.random() < 0.25) g.flagella = Math.floor(Math.random() * 3);
    if (Math.random() < 0.3) g.texture = P.pick(P.TEXTURES).id;
    g.temperament = P.pick(P.TEMPERS).id;
    g.seed = (Math.random() * 1e9) | 0;
    g.name = P.makeName();
    return g;
  };

  const CODES = ['b0b', 'r4y', 'zz', '42', 'n0va', 'ix', 'mo', 'k1t', 'lux', '00', 'p1p', 'w4v', 'gl0', 'yum', 'fizz', 'b52', 'tip', 'x3', 'boi', 'r3x', 'dot', 'q7', 'neo', 'ufo'];
  P.makeName = function () {
    const L = 'ABCDEFGHJKLMNPQRSTVWXYZ';
    return L[Math.floor(Math.random() * L.length)] + '-' + P.pick(CODES);
  };
  const GENUS = { round: 'Coccus', capsule: 'Bacillus', dumbbell: 'Diplococcus', liquid: 'Amoeba', ring: 'Annulus', colony: 'Colonia' };
  const SPECIES = ['lagunae', 'rubescens', 'lilacina', 'cobaltica', 'corallina', 'citrina', 'iridescens', 'ignea'];
  P.latinName = (g) => (GENUS[g.shape] || 'Microbium') + ' ' + SPECIES[g.palette % SPECIES.length];

  /* ---------- shared sprites for background life ---------- */
  const spriteCache = new Map();
  P.orb = function (col, kind) {
    const key = col + '|' + kind;
    if (spriteCache.has(key)) return spriteCache.get(key);
    if (spriteCache.size > 500) spriteCache.clear();
    const S = 96, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d'), rgb = hex(col), h = S / 2, W = [255, 255, 255];
    let g;
    if (kind === 'soft') {
      g = x.createRadialGradient(h, h, 0, h, h, h);
      g.addColorStop(0, rgba(rgb, 1)); g.addColorStop(0.35, rgba(rgb, 0.55)); g.addColorStop(1, rgba(rgb, 0));
      x.fillStyle = g; x.fillRect(0, 0, S, S);
    } else if (kind === 'rings') { // concentric "scent" mark
      g = x.createRadialGradient(h, h, 0, h, h, h);
      g.addColorStop(0, rgba(rgb, 0.9)); g.addColorStop(0.25, rgba(rgb, 0.55)); g.addColorStop(0.7, rgba(rgb, 0.18)); g.addColorStop(1, rgba(rgb, 0));
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      for (let i = 1; i <= 6; i++) {
        x.strokeStyle = rgba(mix(rgb, W, 0.35), 0.35 * (1 - i / 7)); x.lineWidth = 1.2;
        x.beginPath(); x.arc(h, h, (i / 7) * h, 0, TAU); x.stroke();
      }
    } else if (kind === 'ring') { // bokeh ring
      g = x.createRadialGradient(h, h, 0, h, h, h);
      g.addColorStop(0, rgba(rgb, 0.16)); g.addColorStop(0.72, rgba(rgb, 0.28)); g.addColorStop(0.86, rgba(mix(rgb, W, 0.3), 0.85)); g.addColorStop(1, rgba(rgb, 0));
      x.fillStyle = g; x.fillRect(0, 0, S, S);
    } else if (kind === 'dorb') { // translucent cell, darker rim (for light field)
      const dk = mix(rgb, [20, 30, 60], 0.28);
      g = x.createRadialGradient(h * 0.85, h * 0.85, 0, h, h, h);
      g.addColorStop(0, rgba(mix(rgb, W, 0.55), 0.7)); g.addColorStop(0.5, rgba(rgb, 0.35)); g.addColorStop(0.7, rgba(rgb, 0.5));
      g.addColorStop(0.8, rgba(dk, 0.75)); g.addColorStop(0.88, rgba(rgb, 0.25)); g.addColorStop(1, rgba(rgb, 0));
      x.fillStyle = g; x.fillRect(0, 0, S, S);
    } else { // orb (glowing rim)
      g = x.createRadialGradient(h * 0.85, h * 0.85, 0, h, h, h);
      g.addColorStop(0, rgba(mix(rgb, W, 0.35), 0.75)); g.addColorStop(0.45, rgba(rgb, 0.35)); g.addColorStop(0.68, rgba(rgb, 0.45));
      g.addColorStop(0.78, rgba(mix(rgb, W, 0.25), 0.95)); g.addColorStop(0.86, rgba(rgb, 0.35)); g.addColorStop(1, rgba(rgb, 0));
      x.fillStyle = g; x.fillRect(0, 0, S, S);
    }
    spriteCache.set(key, c);
    return c;
  };

  /* ================= Microbe ================= */
  const T0 = 0.371;
  const APP_LEN_MULT = { none: 0, villi: 1, cilia: 0.8, spikes: 1.2, tentacles: 1.35 };

  class Microbe {
    constructor(g, opts) {
      opts = opts || {};
      this.N = opts.res || 112;
      this.body = document.createElement('canvas');
      this.body.width = this.body.height = this.N;
      this.bctx = this.body.getContext('2d');
      this.img = this.bctx.createImageData(this.N, this.N);
      this.sprite = document.createElement('canvas'); this.sctx = this.sprite.getContext('2d');
      this.out = document.createElement('canvas'); this.octx = this.out.getContext('2d');
      this.out2 = document.createElement('canvas'); this.octx2 = this.out2.getContext('2d'); // double buffer: previous image stays valid
      this.mk = document.createElement('canvas'); this.mctx = this.mk.getContext('2d');
      this.mask = document.createElement('canvas'); this.mask.width = this.mask.height = 48;
      this.maskCtx = this.mask.getContext('2d'); this.maskImg = this.maskCtx.createImageData(48, 48);
      this.maskT = -99;
      this.motion = 1;
      this.setGenome(g);
    }
    setGenome(g) { this.g = g; this.build(); this.update(0); }

    build() {
      const g = this.g, r = mulberry(g.seed || 1);
      const balls = [];
      const B = (x, y, rad, amp) => balls.push({ x, y, r: rad, amp: amp == null ? 1 : amp, f: lerp(0.25, 0.7, r()), ph: r() * TAU, f2: lerp(0.2, 0.6, r()), ph2: r() * TAU });
      const L = lerp(0.35, 1.25, g.length), W = lerp(0.5, 1.0, g.width);
      let fluidK = 0.15;
      switch (g.shape) {
        case 'capsule': {
          const n = Math.max(3, Math.round(2 + L * 4));
          for (let i = 0; i < n; i++) B(lerp(-L, L, i / (n - 1)), 0, W * 0.78);
          break;
        }
        case 'dumbbell': {
          const LL = L * 0.9 + 0.2;
          B(-LL, 0, W); B(LL, 0, W);
          const mr = W * lerp(0.9, 0.32, g.pinch);
          B(-LL * 0.45, 0, lerp(W, mr, 0.5)); B(0, 0, mr); B(LL * 0.45, 0, lerp(W, mr, 0.5));
          break;
        }
        case 'liquid': {
          fluidK = 0.38;
          B(0, 0, W * 0.95);
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU + r() * 0.8, d = lerp(0.35, 0.75, r()) * (0.7 + L * 0.5);
            B(Math.cos(a) * d * 1.2, Math.sin(a) * d, lerp(0.45, 0.7, r()) * W);
          }
          break;
        }
        case 'ring': {
          const Rr = lerp(0.75, 1.3, g.length), br = lerp(0.28, 0.5, g.width), n = 14;
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU; B(Math.cos(a) * Rr, Math.sin(a) * Rr * 0.92, br); }
          break;
        }
        case 'colony': {
          const rc = lerp(0.45, 0.68, g.width), n = 3 + Math.floor(r() * 3) + Math.round(g.length * 1.5);
          B(0, 0, rc);
          for (let i = 1; i < n; i++) {
            const base = balls[Math.floor(r() * balls.length)];
            const a = r() * TAU, d = rc * lerp(1.15, 1.45, r());
            let x = base.x + Math.cos(a) * d, y = base.y + Math.sin(a) * d * 0.85;
            const m = Math.hypot(x, y); if (m > 1.8) { x *= 1.8 / m; y *= 1.8 / m; }
            B(x, y, rc * lerp(0.75, 1.05, r()));
          }
          let cx = 0, cy = 0; balls.forEach((b) => { cx += b.x; cy += b.y; }); cx /= balls.length; cy /= balls.length;
          balls.forEach((b) => { b.x -= cx; b.y -= cy; });
          break;
        }
        default: {
          const R0 = lerp(0.85, 1.25, g.width) * lerp(0.9, 1.12, g.length);
          B(0, 0, R0, 0.3);
          for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + r(); B(Math.cos(a) * R0 * 0.5, Math.sin(a) * R0 * 0.5, R0 * 0.5); }
        }
      }
      balls.forEach((b) => (b.amp *= g.fluidity * fluidK * b.r * 2.2));
      this.balls = balls;
      const nb = balls.length;
      this.nb = nb;
      this.bx = new Float32Array(nb); this.by = new Float32Array(nb); this.bs2 = new Float32Array(nb);
      let rb = 0;
      balls.forEach((b) => { rb = Math.max(rb, Math.hypot(b.x, b.y) + b.r + b.amp); });
      this.rMax = rb * 1.12 + 0.08;
      this.E = this.rMax * 1.22;

      const nn = g.nuclei | 0;
      const nuc = [];
      const sig = lerp(0.16, 0.42, g.nucleusSize) * (g.shape === 'colony' ? 0.75 : g.shape === 'ring' ? 0.6 : 1);
      const sorted = balls.map((b, i) => i).sort((a, b) => balls[b].r - balls[a].r);
      for (let k = 0; k < nn; k++) {
        let bi, ox = 0, oy = 0;
        if (g.shape === 'round' || g.shape === 'liquid') { bi = 0; const a = r() * TAU, d = nn > 1 ? lerp(0.25, 0.5, r()) * balls[0].r : 0; ox = Math.cos(a) * d; oy = Math.sin(a) * d; }
        else if (g.shape === 'capsule') { bi = clamp(Math.round(((k + 0.5) / nn) * (nb - 1)), 0, nb - 1); oy = (r() - 0.5) * 0.2; }
        else if (g.shape === 'dumbbell') { bi = k % 2; ox = (r() - 0.5) * 0.3 * Math.floor(k / 2); oy = (r() - 0.5) * 0.4 * Math.floor(k / 2); }
        else if (g.shape === 'ring') { bi = Math.floor((k / nn) * nb); }
        else { bi = sorted[k % nb]; }
        nuc.push({ bi, ox, oy, s: sig * lerp(0.85, 1.15, r()), ph: r() * TAU });
      }
      this.nuc = nuc;
      this.nx = new Float32Array(nn); this.ny = new Float32Array(nn); this.ninv = new Float32Array(nn);
      nuc.forEach((n, i) => (this.ninv[i] = 1 / (n.s * n.s)));

      for (let i = 0; i < nb; i++) { this.bx[i] = balls[i].x; this.by[i] = balls[i].y; this.bs2[i] = (balls[i].r * 1.6) ** 2; }
      const gn = Math.round(g.granules * 46);
      this.gran = [];
      let guard = 0;
      while (this.gran.length < gn && guard++ < 3000) {
        const x = (r() * 2 - 1) * this.rMax, y = (r() * 2 - 1) * this.rMax;
        if (this.field(x, y) > T0 * 1.25) {
          let bi = 0, bd = 1e9; for (let i = 0; i < nb; i++) { const d = (x - balls[i].x) ** 2 + (y - balls[i].y) ** 2; if (d < bd) { bd = d; bi = i; } }
          this.gran.push({ bi, ox: x - balls[bi].x, oy: y - balls[bi].y, ph: r() * TAU, f: lerp(0.5, 1.6, r()), s: lerp(0.018, 0.05, r()), w: r() });
        }
      }

      const at = g.appType;
      const cnt = at === 'villi' ? lerp(6, 34, g.appCount) : at === 'cilia' ? lerp(18, 110, g.appCount) : at === 'spikes' ? lerp(8, 36, g.appCount) : at === 'tentacles' ? lerp(8, 46, g.appCount) : 0;
      const n = Math.round(cnt * (g.shape === 'colony' ? 1.2 : 1));
      this.appLen = lerp(0.18, 0.95, g.appLength) * (APP_LEN_MULT[at] || 0);
      this.apps = [];
      for (let i = 0; i < n; i++) this.apps.push({ a: ((i + r() * 0.6) / n) * TAU, len: this.appLen * lerp(0.7, 1.25, r()), ph: r() * TAU, bx: 0, by: 0, nx: 1, ny: 0 });
      this.flagLen = lerp(1.2, 3.6, g.flagLength);
      this.flag = [];
      const fn = g.flagella | 0;
      for (let k = 0; k < fn; k++) this.flag.push({ a: Math.PI + (k - (fn - 1) / 2) * 0.5, ph: r() * TAU, len: this.flagLen * lerp(0.85, 1.1, r()), bx: 0, by: 0, nx: -1, ny: 0 });

      const pal = P.palettes[g.palette % P.palettes.length];
      this.pal = pal;
      this.c0 = hex(pal.edge); this.c1 = hex(pal.mid); this.c2 = hex(pal.hot); this.cr = hex(pal.rim); this.cr2 = hex(pal.rim2);
      this.appRGB = hex(g.appColor && g.appColor !== 'auto' ? g.appColor : pal.app);
      this.appHi = mix(this.appRGB, [255, 255, 255], 0.55);
      this.hotRGB = mix(this.c2, [255, 255, 255], 0.4);
      this.tex = { spots: 1, veins: 2, dots: 3 }[g.texture] || 0;
      this.seedOff = (g.seed % 997) / 37;

      const outer = Math.max(at === 'none' ? 0 : this.appLen * 1.3, this.flag.length ? this.flagLen * 1.05 : 0);
      this.half = this.rMax + outer + 0.45;
    }

    field(x, y) {
      let v = 0;
      const bx = this.bx, by = this.by, bs = this.bs2;
      for (let k = 0; k < this.nb; k++) {
        const dx = x - bx[k], dy = y - by[k], d2 = dx * dx + dy * dy, s2 = bs[k];
        if (d2 < s2) { const q = 1 - d2 / s2; v += q * q; }
      }
      return v;
    }

    boundary(a, o) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const step = this.rMax / 18;
      let rr = this.rMax;
      while (rr > 0 && this.field(rr * ca, rr * sa) < T0) rr -= step;
      let lo = Math.max(rr, 0), hi = rr + step;
      for (let i = 0; i < 3; i++) { const m = (lo + hi) / 2; if (this.field(m * ca, m * sa) >= T0) lo = m; else hi = m; }
      const x = lo * ca, y = lo * sa, e = 0.04;
      let gx = this.field(x + e, y) - this.field(x - e, y), gy = this.field(x, y + e) - this.field(x, y - e);
      let m = Math.hypot(gx, gy);
      if (m < 1e-6) { gx = -ca; gy = -sa; m = 1; }
      o.bx = x; o.by = y; o.nx = -gx / m; o.ny = -gy / m;
    }

    update(t) {
      this.t = t;
      const b = this.balls;
      for (let i = 0; i < this.nb; i++) {
        const q = b[i];
        this.bx[i] = q.x + Math.sin(t * q.f + q.ph) * q.amp;
        this.by[i] = q.y + Math.cos(t * q.f2 + q.ph2) * q.amp;
        const br = q.r * (1 + Math.sin(t * 0.7 + q.ph) * 0.03);
        this.bs2[i] = (br * 1.6) ** 2;
      }
      for (let k = 0; k < this.nuc.length; k++) {
        const n = this.nuc[k];
        this.nx[k] = this.bx[n.bi] + n.ox + Math.sin(t * 0.35 + n.ph) * 0.06;
        this.ny[k] = this.by[n.bi] + n.oy + Math.cos(t * 0.29 + n.ph) * 0.06;
      }
      for (const a of this.apps) this.boundary(a.a, a);
      for (const f of this.flag) this.boundary(f.a, f);
      this.renderBody(t);
    }

    renderBody(t) {
      const N = this.N, E = this.E, d = this.img.data, step = (2 * E) / N;
      const nb = this.nb, bx = this.bx, by = this.by, bs = this.bs2;
      const g = this.g;
      const lump = g.lumpiness * 0.8;
      const nn = this.nuc.length, nx = this.nx, ny = this.ny, ninv = this.ninv;
      const glow = lerp(0.35, 1.15, g.glow);
      const c0 = this.c0, c1 = this.c1, c2 = this.c2, cr = this.cr, cr2 = this.cr2;
      const bodyA = 1 - g.transparency * 0.75;
      const rimS = lerp(0.3, 1.15, g.rim);
      const tex = this.tex, tw = t * 0.6;
      let i = 0;
      for (let py = 0; py < N; py++) {
        const y = -E + (py + 0.5) * step;
        for (let px = 0; px < N; px++, i += 4) {
          const x = -E + (px + 0.5) * step;
          let v = 0;
          for (let k = 0; k < nb; k++) {
            const dx = x - bx[k], dy = y - by[k], d2 = dx * dx + dy * dy, s2 = bs[k];
            if (d2 < s2) { const q = 1 - d2 / s2; v += q * q; }
          }
          if (v < 0.13) { d[i + 3] = 0; continue; }
          const Te = lump > 0 ? T0 * (1 + lump * (nz(x * 1.7 + t * 0.11, y * 1.7 - t * 0.07) - 0.5)) : T0;
          const s = v / Te;
          // iridescent rim colour, shifts around the perimeter
          const iw = 0.5 + 0.5 * Math.sin(Math.atan2(y, x) * 2 + tw);
          const rr = cr[0] + (cr2[0] - cr[0]) * iw, rg = cr[1] + (cr2[1] - cr[1]) * iw, rb = cr[2] + (cr2[2] - cr[2]) * iw;
          if (s < 1) {
            if (s < 0.45) { d[i + 3] = 0; continue; }
            const h = (s - 0.45) / 0.55;
            d[i] = rr; d[i + 1] = rg; d[i + 2] = rb; d[i + 3] = h * h * h * 0.45 * rimS * 255;
            continue;
          }
          const depth = Math.min(1, (s - 1) / 1.6);
          const rim = Math.exp(-depth * 8) * rimS;
          let heat = 0;
          for (let k = 0; k < nn; k++) { const dx = x - nx[k], dy = y - ny[k]; heat += Math.exp(-(dx * dx + dy * dy) * ninv[k]); }
          heat *= glow;
          let tt = 0.12 + depth * 0.34 + heat * 0.85;
          tt += (nz(x * 0.8 + t * 0.045 + 5.3, y * 0.8 - t * 0.03) - 0.5) * 0.55;
          let texA = 0;
          if (tex === 1) { const m = smooth(0.56, 0.74, nz(x * 2.6 + 11, y * 2.6 + t * 0.05)); tt += m * 0.28; texA = m * 0.22; }
          else if (tex === 2) { const vn = nz(x * 2.0 + 3, y * 2.0 - t * 0.04); let rd = 1 - Math.abs(2 * vn - 1); rd = rd * rd; rd = rd * rd; rd = rd * rd; tt += rd * 0.45; texA = rd * 0.38; }
          else if (tex === 3) {
            const gx = x * 7 + 0.5, gy = y * 7 + 0.5, fx = gx - Math.floor(gx) - 0.5, fy = gy - Math.floor(gy) - 0.5;
            const dd = Math.sqrt(fx * fx + fy * fy), rad = 0.12 + 0.3 * (1 - depth * 0.6) + heat * 0.1;
            const m = smooth(rad + 0.06, rad - 0.04, dd);
            tt += m * 0.12; texA = (m - 0.55) * 0.42;
          }
          tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
          let r, gg, b;
          if (tt < 0.5) { const u = tt * 2; r = c0[0] + (c1[0] - c0[0]) * u; gg = c0[1] + (c1[1] - c0[1]) * u; b = c0[2] + (c1[2] - c0[2]) * u; }
          else { const u = (tt - 0.5) * 2; r = c1[0] + (c2[0] - c1[0]) * u; gg = c1[1] + (c2[1] - c1[1]) * u; b = c1[2] + (c2[2] - c1[2]) * u; }
          if (heat > 0.8) { const w = Math.min(1, (heat - 0.8) * 1.4) * 0.38; r += (255 - r) * w; gg += (255 - gg) * w; b += (255 - b) * w; }
          const rm = rim > 0.85 ? 0.85 : rim;
          r += (rr - r) * rm; gg += (rg - gg) * rm; b += (rb - b) * rm;
          let a = bodyA * (0.38 + 0.62 * (1 - depth)) + rim * 0.65 + heat * 0.45 + texA;
          const edge = s < 1.08 ? (s - 1) / 0.08 : 1;
          a = a * edge + (1 - edge) * 0.45 * rimS;
          d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = (a > 1 ? 1 : a < 0 ? 0 : a) * 255;
        }
      }
      this.bctx.putImageData(this.img, 0, 0);
    }

    /* sharp sprite: appendages + body + granules + nucleus flare. Heading = +x */
    drawSprite(t, U, noApps) {
      const half = this.half, size = Math.ceil(half * 2 * U);
      const c = this.sctx;
      if (this.sprite.width !== size) { this.sprite.width = this.sprite.height = size; }
      this.U = U;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.clearRect(0, 0, size, size);
      c.setTransform(U, 0, 0, U, size / 2, size / 2);
      c.lineCap = 'round'; c.lineJoin = 'round';
      const sp = lerp(0.5, 3.2, this.g.appSpeed) * (0.6 + 0.4 * this.motion);
      if (!noApps) { this.drawFlagella(c, t); this.drawApps(c, t, sp); }
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.globalCompositeOperation = 'source-over';
      c.drawImage(this.body, -this.E, -this.E, this.E * 2, this.E * 2);
      c.globalCompositeOperation = 'lighter';
      const hot = this.hotRGB;
      for (const q of this.gran) {
        const x = this.bx[q.bi] + q.ox + Math.sin(t * q.f + q.ph) * 0.05;
        const y = this.by[q.bi] + q.oy + Math.cos(t * q.f * 0.8 + q.ph) * 0.05;
        const a = 0.45 + 0.45 * Math.sin(t * 2.2 * q.f + q.ph);
        c.fillStyle = rgba(q.w > 0.6 ? [255, 255, 255] : hot, a);
        c.beginPath(); c.arc(x, y, q.s, 0, TAU); c.fill();
      }
      // flare on the brightest nucleus
      if (this.nuc.length && this.g.glow > 0.35) {
        const k = 0, x = this.nx[k], y = this.ny[k], L = lerp(0.25, 0.75, this.g.glow) * (0.85 + 0.15 * Math.sin(t * 1.3));
        let gr = c.createRadialGradient(x, y, 0, x, y, L * 0.6);
        gr.addColorStop(0, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = gr; c.beginPath(); c.arc(x, y, L * 0.6, 0, TAU); c.fill();
        c.save(); c.translate(x, y); c.rotate(0.6 + t * 0.05);
        for (let j = 0; j < 2; j++) {
          c.rotate(Math.PI / 2);
          gr = c.createLinearGradient(-L, 0, L, 0);
          gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = gr; c.beginPath(); c.moveTo(-L, 0); c.lineTo(0, -0.025); c.lineTo(L, 0); c.lineTo(0, 0.025); c.closePath(); c.fill();
        }
        c.restore();
      }
      c.globalCompositeOperation = 'source-over';
      return size;
    }

    /* noise-masked defocus: parts of the organism slip out of focus */
    compose(t) {
      [this.out, this.out2] = [this.out2, this.out]; [this.octx, this.octx2] = [this.octx2, this.octx];
      const size = this.sprite.width, hz = this.g.haze == null ? 0.5 : this.g.haze;
      if (this.out.width !== size) this.out.width = this.out.height = size;
      if (this.mk.width !== size) this.mk.width = this.mk.height = size;
      const o = this.octx;
      o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = 'source-over'; o.globalAlpha = 1;
      o.clearRect(0, 0, size, size);
      if (hz < 0.03) { o.drawImage(this.sprite, 0, 0); return this.out; }
      // refresh the mask a few times per second
      { // recomputed on every rebuild: the sharp/blurred areas drift continuously
        this.maskT = t;
        const M = 48, md = this.maskImg.data, lo = -0.04 + hz * 0.22, hi = lo + 0.2, so = this.seedOff;
        for (let y = 0, i = 0; y < M; y++) for (let x = 0; x < M; x++, i += 4) {
          const ux = x / M - 0.5, uy = y / M - 0.5, rr = Math.sqrt(ux * ux + uy * uy) * 2;
          const n = nz(ux * 2.2 + so + t * 0.03, uy * 2.2 - so * 0.5 - t * 0.025) + (0.42 - rr) * 0.75;
          md[i] = md[i + 1] = md[i + 2] = 255; md[i + 3] = smooth(lo, hi, n) * 255;
        }
        this.maskCtx.putImageData(this.maskImg, 0, 0);
      }
      const m = this.mctx;
      m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = 'source-over';
      m.clearRect(0, 0, size, size); m.drawImage(this.sprite, 0, 0);
      m.globalCompositeOperation = 'destination-in'; m.imageSmoothingEnabled = true;
      m.drawImage(this.mask, 0, 0, size, size);
      m.globalCompositeOperation = 'source-over';
      const b = Math.max(0.5, hz * this.U * 0.12);
      o.filter = `blur(${b.toFixed(1)}px)`; o.globalAlpha = 0.95;
      o.drawImage(this.sprite, 0, 0);
      o.filter = 'none'; o.globalAlpha = 1;
      o.drawImage(this.mk, 0, 0);
      return this.out;
    }

    /* appendages only, drawn live every frame (cheap vector strokes), caller sets the transform in body units */
    drawLiveApps(c, t, night) {
      this.glowOp = 'source-over'; void night;
      c.lineCap = 'round'; c.lineJoin = 'round'; c.globalCompositeOperation = 'source-over';
      const sp = lerp(0.5, 3.2, this.g.appSpeed) * (0.6 + 0.4 * this.motion);
      this.drawFlagella(c, t); this.drawApps(c, t, sp);
      c.globalCompositeOperation = 'source-over'; this.glowOp = null;
    }
    appPt(a, s, L, t, sp, curl) {
      const along = s * L;
      const off = Math.sin(t * sp + a.ph + s * 2.4) * curl * 0.5 * L * s;
      const bx = a.bx - a.nx * 0.06, by = a.by - a.ny * 0.06;
      return [bx + a.nx * along - a.ny * off, by + a.ny * along + a.nx * off];
    }

    drawApps(c, t, sp) {
      const g = this.g, at = g.appType, col = this.appRGB, hi = this.appHi;
      if (at === 'none' || !this.apps.length) return;
      const curl = g.appCurl;
      if (at === 'villi') {
        const w = lerp(0.07, 0.26, g.appThickness);
        const paths = [];
        for (const a of this.apps) { const pts = []; for (let k = 0; k <= 6; k++) pts.push(this.appPt(a, k / 6, a.len, t, sp, curl)); paths.push(pts); }
        const stroke = (lw, style, to) => {
          c.lineWidth = lw; c.strokeStyle = style; c.beginPath();
          for (const pts of paths) { c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k <= to; k++) c.lineTo(pts[k][0], pts[k][1]); }
          c.stroke();
        };
        stroke(w * 1.8, rgba(col, 0.12), 6);
        stroke(w, rgba(col, 0.55), 6);
        stroke(w * 1.05, rgba(col, 0.3), 3);
        stroke(w * 0.38, rgba(hi, 0.6), 5);
      } else if (at === 'cilia') {
        const w = lerp(0.018, 0.06, g.appThickness);
        c.lineWidth = w; c.strokeStyle = rgba(col, 0.75); c.beginPath();
        for (const a of this.apps) {
          const p0 = this.appPt(a, 0, a.len, t, sp * 1.6, curl + 0.3);
          c.moveTo(p0[0], p0[1]);
          for (let k = 1; k <= 3; k++) { const p = this.appPt(a, k / 3, a.len, t, sp * 1.6, curl + 0.3); c.lineTo(p[0], p[1]); }
        }
        c.stroke();
        c.lineWidth = w * 3.5; c.strokeStyle = rgba(col, 0.1); c.stroke();
      } else if (at === 'spikes') {
        const w = lerp(0.03, 0.1, g.appThickness);
        const tips = [];
        c.fillStyle = rgba(col, 0.55); c.beginPath();
        for (const a of this.apps) {
          const sw = Math.sin(t * sp * 0.4 + a.ph) * 0.15 * curl;
          const nx = a.nx * Math.cos(sw) - a.ny * Math.sin(sw), ny = a.nx * Math.sin(sw) + a.ny * Math.cos(sw);
          const bx = a.bx - a.nx * 0.05, by = a.by - a.ny * 0.05;
          const tx = bx + nx * a.len, ty = by + ny * a.len;
          c.moveTo(bx - a.ny * w, by + a.nx * w); c.lineTo(tx, ty); c.lineTo(bx + a.ny * w, by - a.nx * w); c.closePath();
          tips.push(tx, ty);
        }
        c.fill();
        c.globalCompositeOperation = this.glowOp || 'lighter'; c.fillStyle = rgba(hi, 0.6);
        c.beginPath(); for (let i = 0; i < tips.length; i += 2) { c.moveTo(tips[i] + 0.035, tips[i + 1]); c.arc(tips[i], tips[i + 1], 0.035, 0, TAU); } c.fill();
        c.globalCompositeOperation = 'source-over';
      } else if (at === 'tentacles') {
        const w = lerp(0.05, 0.17, g.appThickness);
        const paths = [];
        for (const a of this.apps) { const pts = []; for (let k = 0; k <= 7; k++) pts.push(this.appPt(a, k / 7, a.len, t, sp * 0.7, curl + 0.15)); paths.push(pts); }
        const stroke = (lw, style, from) => {
          c.lineWidth = lw; c.strokeStyle = style; c.beginPath();
          for (const pts of paths) { c.moveTo(pts[0][0], pts[0][1]); for (let k = 1; k <= from; k++) c.lineTo(pts[k][0], pts[k][1]); }
          c.stroke();
        };
        stroke(w * 0.6, rgba(col, 0.55), 7);
        stroke(w, rgba(col, 0.45), 3);
        c.globalCompositeOperation = this.glowOp || 'lighter';
        const hot = this.hotRGB;
        c.fillStyle = rgba(hot, 0.25); c.beginPath();
        for (const p of paths) { const q = p[7]; c.moveTo(q[0] + w * 1.7, q[1]); c.arc(q[0], q[1], w * 1.7, 0, TAU); } c.fill();
        c.fillStyle = rgba(hot, 0.9); c.beginPath();
        for (const p of paths) { const q = p[7]; c.moveTo(q[0] + w * 0.6, q[1]); c.arc(q[0], q[1], w * 0.6, 0, TAU); } c.fill();
        c.globalCompositeOperation = 'source-over';
      }
    }

    drawFlagella(c, t) {
      if (!this.flag.length) return;
      const col = mix(this.appRGB, this.cr, 0.35);
      const sp = 5 + 4 * this.motion;
      for (const f of this.flag) {
        const pts = [];
        for (let k = 0; k <= 16; k++) {
          const s = k / 16, along = s * f.len;
          const off = Math.sin(s * TAU * 1.4 - t * sp + f.ph) * 0.28 * Math.pow(s, 0.7);
          pts.push([f.bx + f.nx * along - f.ny * off, f.by + f.ny * along + f.nx * off]);
        }
        const seg = (a, b, w, al) => { c.lineWidth = w; c.strokeStyle = rgba(col, al); c.beginPath(); c.moveTo(pts[a][0], pts[a][1]); for (let k = a + 1; k <= b; k++) c.lineTo(pts[k][0], pts[k][1]); c.stroke(); };
        seg(0, 6, 0.07, 0.65); seg(5, 11, 0.045, 0.5); seg(10, 16, 0.025, 0.35);
      }
    }
  }
  P.Microbe = Microbe;
})();
