/* Petri v2 — specimen builder */
(function () {
  'use strict';
  const P = window.Petri;
  const { TAU, lerp } = P;

  const SECTIONS = [
    { n: '01', title: 'Form', items: [
      { key: 'shape', type: 'chips', options: () => P.SHAPES },
      { key: 'scale', label: 'Size' },
      { key: 'length', label: 'Length' },
      { key: 'width', label: 'Girth' },
      { key: 'pinch', label: 'Constriction', show: (g) => g.shape === 'dumbbell' },
      { key: 'fluidity', label: 'Fluidity' },
      { key: 'lumpiness', label: 'Lumpiness' },
    ] },
    { n: '02', title: 'Membrane', items: [
      { key: 'transparency', label: 'Translucency' },
      { key: 'rim', label: 'Rim glow' },
      { key: 'aura', label: 'Aura' },
      { key: 'haze', label: 'Haze · defocus' },
    ] },
    { n: '03', title: 'Interior', items: [
      { key: 'nuclei', label: 'Nuclei', min: 0, max: 4, step: 1 },
      { key: 'nucleusSize', label: 'Nucleus size', show: (g) => g.nuclei > 0 },
      { key: 'glow', label: 'Luminescence', show: (g) => g.nuclei > 0 },
      { key: 'granules', label: 'Granules' },
      { key: 'texture', type: 'chips', options: () => P.TEXTURES },
    ] },
    { n: '04', title: 'Appendages', items: [
      { key: 'appType', type: 'chips', options: () => P.APPS },
      { key: 'appCount', label: 'Count', show: (g) => g.appType !== 'none' },
      { key: 'appLength', label: 'Length', show: (g) => g.appType !== 'none' },
      { key: 'appThickness', label: 'Thickness', show: (g) => g.appType !== 'none' },
      { key: 'appCurl', label: 'Curl', show: (g) => g.appType !== 'none' },
      { key: 'appSpeed', label: 'Beat speed', show: (g) => g.appType !== 'none' },
      { key: 'flagella', label: 'Flagella', min: 0, max: 3, step: 1 },
      { key: 'flagLength', label: 'Flagellum length', show: (g) => g.flagella > 0 },
    ] },
    { n: '05', title: 'Colour', items: [
      { key: 'palette', type: 'palette' },
      { key: 'appColor', type: 'appcolor', label: 'Appendage colour' },
    ] },
    { n: '06', title: 'Temperament', items: [
      { key: 'temperament', type: 'chips', options: () => P.TEMPERS, desc: true },
    ] },
  ];

  class Creator {
    constructor(root, opts) {
      this.root = root; this.opts = opts || {};
      this.g = P.makeGenome(P.presets[2].g); this.g.name = P.makeName();
      this.activePreset = 2;
      this.build();
      this.preview = new Preview(this.root.querySelector('.pv-canvas'), this.g);
      this.sync();
    }

    build() {
      const r = this.root;
      r.classList.add('creator');
      r.innerHTML = `
        <header class="cr-head">
          <div class="cr-brand">Foreign<br>Organisms</div>
          <div class="cr-meta">Specimen builder<br><span>Iteration 13</span></div>
        </header>
        <div class="pv">
          <canvas class="pv-canvas"></canvas>
          <div class="pv-label"><b class="pv-fig">Fig. —</b><span class="pv-name"></span><em class="pv-latin"></em><small class="pv-temper"></small></div>
          <div class="pv-ticks"><span>0</span><span>25</span><span>50 µm</span></div>
        </div>
        <div class="cr-presets"></div>
        <div class="cr-scroll"><div class="cr-sections"></div>
          <section class="cr-sec"><div class="sec-h"><span>07</span>Name</div>
            <div class="name-row"><input class="name-in" maxlength="16" spellcheck="false"><button class="btn-ghost dice" title="New name">↻</button></div>
          </section>
        </div>
        <footer class="cr-foot">
          <button class="btn-ghost rnd">Randomise</button>
          <button class="btn-send">Release into the dish <span>→</span></button>
        </footer>`;
      // пресеты с миниатюрами
      const pr = r.querySelector('.cr-presets');
      P.presets.forEach((p, i) => {
        const b = document.createElement('button'); b.className = 'preset';
        const cv = document.createElement('canvas'); cv.width = cv.height = 120;
        b.append(cv); const s = document.createElement('span'); s.textContent = p.name; b.append(s);
        b.onclick = () => { this.applyPreset(i); };
        pr.append(b);
        const m = new P.Microbe(P.makeGenome(Object.assign({ seed: 1000 + i * 77 }, p.g, { haze: 0 })), { res: 72 });
        m.update(2);
        const U = 120 / (m.half * 2) * 0.95, size = m.drawSprite(2, U), x = cv.getContext('2d');
        x.translate(60, 60); x.rotate(-0.5); x.drawImage(m.sprite, -size / 2, -size / 2);
      });
      // секции
      const host = r.querySelector('.cr-sections');
      this.controls = [];
      SECTIONS.forEach((sec) => {
        const el = document.createElement('section'); el.className = 'cr-sec';
        el.innerHTML = `<div class="sec-h"><span>${sec.n}</span>${sec.title}</div>`;
        sec.items.forEach((it) => { const c = this.makeControl(it); el.append(c.el); this.controls.push(c); });
        host.append(el);
      });
      this.$name = r.querySelector('.name-in');
      this.$name.oninput = () => { this.g.name = this.$name.value || '—'; this.updateLabel(); };
      r.querySelector('.dice').onclick = () => { this.g.name = P.makeName(); this.sync(); };
      r.querySelector('.rnd').onclick = () => { this.g = P.randomGenome(); this.activePreset = -1; this.sync(true); };
      r.querySelector('.btn-send').onclick = () => this.send();
    }

    makeControl(it) {
      const el = document.createElement('div');
      const c = { it, el };
      if (it.type === 'chips') {
        el.className = 'ctl chips' + (it.desc ? ' with-desc' : '');
        it.options().forEach((o) => {
          const b = document.createElement('button'); b.className = 'chip'; b.dataset.v = o.id;
          b.innerHTML = o.name + (it.desc ? `<small>${o.desc}</small>` : '');
          b.onclick = () => { this.g[it.key] = o.id; this.changed(it.key); };
          el.append(b);
        });
        c.set = (g) => el.querySelectorAll('.chip').forEach((b) => b.classList.toggle('on', b.dataset.v === g[it.key]));
      } else if (it.type === 'palette') {
        el.className = 'ctl swatches';
        P.palettes.forEach((p, i) => {
          const b = document.createElement('button'); b.className = 'sw'; b.title = p.name;
          b.style.background = `radial-gradient(circle at 50% 55%, ${p.hot} 0%, ${p.mid} 38%, ${p.edge} 72%, ${p.rim} 86%, transparent 92%)`;
          b.onclick = () => { this.g.palette = i; this.changed('palette'); };
          el.append(b);
        });
        const lab = document.createElement('div'); lab.className = 'sw-name'; el.append(lab);
        c.set = (g) => { el.querySelectorAll('.sw').forEach((b, i) => b.classList.toggle('on', i === g.palette)); lab.textContent = P.palettes[g.palette].name; };
      } else if (it.type === 'appcolor') {
        el.className = 'ctl swatches small';
        el.innerHTML = `<div class="ctl-l">${it.label}</div>`;
        P.appSwatches.forEach((col) => {
          const b = document.createElement('button'); b.className = 'sw sm'; b.dataset.v = col;
          if (col === 'auto') { b.textContent = 'A'; b.title = 'Auto: from palette'; } else b.style.background = col;
          b.onclick = () => { this.g.appColor = col; this.changed('appColor'); };
          el.append(b);
        });
        c.set = (g) => el.querySelectorAll('.sw').forEach((b) => b.classList.toggle('on', b.dataset.v === g.appColor));
      } else {
        el.className = 'ctl range';
        const min = it.min != null ? it.min : 0, max = it.max != null ? it.max : 1, step = it.step || 0.01;
        el.innerHTML = `<label><span>${it.label}</span><output></output></label><input type="range" min="${min}" max="${max}" step="${step}">`;
        const inp = el.querySelector('input'), out = el.querySelector('output');
        const fmt = (v) => (step >= 1 ? String(v) : String(Math.round(v * 100)).padStart(2, '0'));
        inp.oninput = () => { const v = parseFloat(inp.value); this.g[it.key] = v; out.textContent = fmt(v); this.fill(inp); this.changed(it.key, true); };
        c.set = (g) => { inp.value = g[it.key]; out.textContent = fmt(g[it.key]); this.fill(inp); };
      }
      return c;
    }
    fill(inp) { const p = ((inp.value - inp.min) / (inp.max - inp.min)) * 100; inp.style.setProperty('--p', p + '%'); }

    applyPreset(i) {
      const keepName = this.g.name;
      this.g = P.makeGenome(P.presets[i].g); this.g.name = keepName;
      this.activePreset = i; this.sync(true);
    }
    changed(key, fromSlider) {
      if (!fromSlider) this.activePreset = -1;
      if (key === 'shape' || key === 'appType' || key === 'nuclei' || key === 'flagella') this.refreshVisibility();
      if (!fromSlider) this.controls.forEach((c) => c.set(this.g));
      this.preview.setGenome(this.g);
      this.updateLabel();
      this.root.querySelectorAll('.preset').forEach((b, i) => b.classList.toggle('on', i === this.activePreset));
    }
    refreshVisibility() { this.controls.forEach((c) => { c.el.style.display = c.it.show && !c.it.show(this.g) ? 'none' : ''; }); }
    sync(anim) {
      this.controls.forEach((c) => c.set(this.g));
      this.refreshVisibility();
      this.$name.value = this.g.name || '';
      this.preview.setGenome(this.g, anim);
      this.updateLabel();
      this.root.querySelectorAll('.preset').forEach((b, i) => b.classList.toggle('on', i === this.activePreset));
    }
    updateLabel() {
      const r = this.root;
      r.querySelector('.pv-fig').textContent = `Fig. ${this.opts.nextFig ? this.opts.nextFig() : '—'}.`;
      r.querySelector('.pv-name').textContent = this.g.name || '—';
      r.querySelector('.pv-latin').textContent = P.latinName(this.g);
      const tp = P.TEMPERS.find((q) => q.id === this.g.temperament); r.querySelector('.pv-temper').textContent = tp ? tp.name + ' · ' + tp.desc : '';
    }

    send() {
      if (this.sending) return;
      this.sending = true;
      const g = Object.assign({}, this.g, { seed: this.g.seed });
      const btn = this.root.querySelector('.btn-send');
      btn.classList.add('busy');
      const done = () => {
        this.sending = false; btn.classList.remove('busy');
        // следующий микроб — вариация текущего
        const next = Object.assign({}, this.g, { seed: (Math.random() * 1e9) | 0, name: P.makeName() });
        this.g = next; this.sync(true); this.preview.appear();
      };
      if (this.opts.onSend) this.opts.onSend(g, this.preview, done);
      else done();
    }
  }

  /* ---------- превью в маленьком окуляре ---------- */
  class Preview {
    constructor(canvas, g) {
      this.c = canvas; this.ctx = canvas.getContext('2d');
      this.m = new P.Microbe(g, { res: 128 });
      this.t = 0; this.alpha = 1; this.scale = 1; this.hidden = false;
      this.bokeh = []; for (let i = 0; i < 18; i++) this.bokeh.push({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, r: P.rand(0.02, 0.09), col: P.pick(['#58cbe6', '#ff86c2', '#a58cff', '#ffcf98', '#86e2cc']), ph: Math.random() * TAU });
      new ResizeObserver(() => this.resize()).observe(canvas);
      this.resize();
      this.last = performance.now();
      requestAnimationFrame((n) => this.loop(n));
    }
    resize() {
      const r = this.c.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.dpr = dpr; this.S = Math.max(10, Math.round(Math.min(r.width, r.height) * dpr));
      this.c.width = this.c.height = this.S;
    }
    setGenome(g, anim) { this.m.setGenome(g); if (anim) { this.pop = 0; } }
    appear() { this.hidden = false; this.alpha = 0; this.pop = 0; }
    get U() { const k = P.lerp(0.62, 1, this.m.g.scale == null ? 0.5 : this.m.g.scale); return Math.min(this.S * 0.42 / this.m.half, this.S * 0.1) * k; }
    /* данные для анимации полёта */
    snapshot() {
      const rect = this.c.getBoundingClientRect();
      const U = this.U, size = this.m.drawSprite(this.t, U), img = this.m.compose(this.t);
      const copy = document.createElement('canvas'); copy.width = copy.height = size;
      copy.getContext('2d').drawImage(img, 0, 0);
      return { canvas: copy, size: size / this.dpr, cx: rect.left + rect.width / 2, cy: rect.top + rect.height / 2, U: U / this.dpr, rot: this.rot };
    }
    loop(now) {
      const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
      const c = this.ctx, S = this.S, h = S / 2, t = this.t;
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.clearRect(0, 0, S, S);
      c.save(); c.beginPath(); c.arc(h, h, h * 0.98, 0, TAU); c.clip();
      let g = c.createRadialGradient(h, h * 0.9, 0, h, h, h);
      g.addColorStop(0, '#fbfaf7'); g.addColorStop(0.75, '#f0f1f3'); g.addColorStop(1, '#e7e9ee');
      c.fillStyle = g; c.fillRect(0, 0, S, S);
      c.filter = `blur(${S * 0.012}px)`;
      for (const b of this.bokeh) {
        c.globalAlpha = 0.22 + 0.12 * Math.sin(t * 0.5 + b.ph);
        const o = P.orb(b.col, 'soft'), x = h + (b.x + Math.sin(t * 0.05 + b.ph) * 0.05) * h, y = h + (b.y + Math.cos(t * 0.04 + b.ph) * 0.05) * h, r = b.r * S;
        c.drawImage(o, x - r, y - r, r * 2, r * 2);
      }
      c.filter = 'none'; c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      // микроб
      if (!this.hidden) {
        if (this.alpha < 1) this.alpha = Math.min(1, this.alpha + dt * 2);
        if (this.pop != null) { this.pop += dt; if (this.pop > 0.6) this.pop = null; }
        const popS = this.pop != null ? 1 + Math.sin((this.pop / 0.6) * Math.PI) * 0.06 : 1;
        this.m.update(t);
        const U = this.U, size = this.m.drawSprite(t, U), img = this.m.compose(t);
        this.rot = -0.4 + Math.sin(t * 0.25) * 0.35;
        const ar = this.m.rMax * U * 2.3, aura = this.m.g.aura == null ? 0.6 : this.m.g.aura;
        c.globalAlpha = this.alpha * aura * 0.5;
        c.drawImage(P.orb(this.m.pal.aura, 'soft'), h - ar, h - ar, ar * 2, ar * 2);
        c.globalAlpha = 1;
        c.save(); c.translate(h + Math.sin(t * 0.4) * S * 0.015, h + Math.cos(t * 0.33) * S * 0.015); c.rotate(this.rot); c.scale(popS, popS);
        c.globalAlpha = this.alpha;
        c.drawImage(img, -size / 2, -size / 2);
        c.restore();
      }
      // мягкий bloom-лайт
      c.restore();
      c.globalCompositeOperation = 'source-over';
      c.strokeStyle = 'rgba(40,46,60,0.4)'; c.lineWidth = this.dpr; c.beginPath(); c.arc(h, h, h * 0.98, 0, TAU); c.stroke();
      requestAnimationFrame((n) => this.loop(n));
    }
  }

  P.Creator = Creator;
})();
