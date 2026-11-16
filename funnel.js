// Heimark funnel v2. Scroll decides WHERE things should be; closed-form springs from motion.js
// decide HOW they get there. Every target change is its own spring released at that moment
// (track() semantics) and summed on top of the ones still settling, so reversing the scroll
// retargets mid-flight. Ambient life (lamps, stars, mist) is a pure function of time on
// seeded noise. No CSS transitions, no easing curves, no Math.random.
(() => {
  const M = window.Motion;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const mix = (a, b, t) => a + (b - a) * t;
  const now = () => performance.now() / 1000;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mobileQ = matchMedia('(max-width:760px)');
  const T0 = now();

  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // smooth seeded flicker in [0,1]: three detuned sines with seeded phases
  function flicker(seed) {
    const r = mulberry32(seed), ph = [r() * 6.28, r() * 6.28, r() * 6.28], f = [0.7 + r() * 0.5, 2.1 + r(), 5.3 + r() * 2];
    return t => 0.5 + 0.22 * Math.sin(t * f[0] + ph[0]) + 0.17 * Math.sin(t * f[1] + ph[1]) + 0.11 * Math.sin(t * f[2] + ph[2]);
  }

  // ---------------------------------------------------------------- Follow = live track()
  class Follow {
    constructor(v = 0, preset = 'default') { this.base = v; this.last = v; this.keys = []; this.preset = preset; }
    to(v, { delay = 0, preset } = {}) {
      if (Math.abs(v - this.last) < 1e-5) return;
      if (still) return this.set(v);
      this.keys.push([now() + delay, v - this.last, preset || this.preset]);
      this.last = v;
    }
    set(v) { this.base = this.last = v; this.keys.length = 0; }
    at(t = now()) {
      while (this.keys.length && t - this.keys[0][0] > M.settle(this.keys[0][2], 0.0005)) this.base += this.keys.shift()[1];
      let v = this.base;
      for (const [t0, d, p] of this.keys) v += d * M.step(t - t0, p);
      return v;
    }
    get busy() { return this.keys.length > 0; }
  }

  // ---------------------------------------------------------------- sections + beats
  const S = id => ({ el: $('#' + id), pin: $('#' + id + ' > .pin'), p: 0, top: 0, h: 0 });
  const story = S('story'), inside = S('inside'), film = S('film'), close = S('get');
  const featuresEl = $('#features');
  inside.shade = document.createElement('div'); inside.shade.className = 'cover-shade'; inside.pin.append(inside.shade);
  const all = [story, inside, film, close];

  const beats = $$('[data-in]').map(el => ({
    el, sec: all.find(s => s.el.contains(el)), fx: el.dataset.fx,
    tin: Number(el.dataset.in), tout: el.dataset.out ? Number(el.dataset.out) : Infinity,
    delay: Number(el.dataset.delay || 0), f: new Follow(0, el.dataset.sp || 'default'),
  }));

  function measure(vh) {
    for (const s of all) {
      const r = s.el.getBoundingClientRect();
      s.top = r.top; s.h = r.height;
      if (s === story) s.p = clamp(-r.top / (r.height - vh));            // pinned until the room takes over underneath
      else if (s.pin) { const span = r.height - 2 * vh; s.p = clamp(-r.top / span); s.cover = clamp((-r.top - span) / vh); }
      else s.p = clamp((vh - r.top) / vh);                                // free-flowing: arrives over one screen
    }
  }

  function applyBeat(b, v) {
    const st = b.el.style;
    if (b.fx === 'rise') st.transform = `translateY(${(v <= 1 ? 1 - v : -(v - 1)) * 140}%)`;
    else if (b.fx === 'card') {
      const e = Math.max(0, v - 1), a = Math.min(v, 1);
      st.opacity = clamp(a * 5) * clamp((1 - e) * 5);
      st.transform = `translateY(${(1 - a) * 48 - e * 40}px) scale(${mix(0.94, 1, a) - e * 0.06})`;
    } else if (b.fx === 'pop') st.transform = `scale(${Math.max(0, v)})`;
  }

  // ---------------------------------------------------------------- 01 night → day → dive
  const world = $('#story .world'), dayPlate = $('#story .day-plate');
  const lamps = $$('#story .lamp').map((el, i) => ({ el, f: flicker(11 + i * 7), fire: el.classList.contains('fire') }));
  const mists = $$('#story .mist');
  const wipe = new Follow(0, 'default'), push = new Follow(0, 'heavy'), dive = new Follow(0, 'default');
  const hole = $('#story .dive-hole'), ringsSvg = $('#story .dive-rings'), rings = $$('#story .dive-rings circle');
  const starCv = $('#story .stars'), sctx = starCv.getContext('2d');
  const stars = (() => {
    const r = mulberry32(7), out = [];
    while (out.length < 110) {
      const x = 0.22 + r() * 0.78, y = r() * 0.9;                          // in the stars canvas (top 42% of the plate)
      if (Math.abs(x - 0.4) < (y * 0.42 - 0.08) * 0.55) continue;           // keep clear of the gable peak
      if (x > 0.56 && y > 0.66) continue;                                   // and of the right-hand treeline
      out.push({ x, y, s: 0.5 + r() * 1.1, w: 0.6 + r() * 2.2, ph: r() * 6.28, a: 0.35 + r() * 0.55 });
    }
    return out;
  })();
  let gable = { x: 0, y: 0 }, diag = 1;

  function plateBox(vw, vh) {
    const pw = Math.max(vw, vh * 1.7868), ph = Math.max(vh, vw / 1.7868), ax = mobileQ.matches ? 0.4 : 0.5;
    return { x: vw * ax - pw * ax, y: (vh - ph) / 2, w: pw, h: ph };
  }
  function layoutStory() {
    const vw = innerWidth, vh = innerHeight, b = plateBox(vw, vh);
    gable = { x: b.x + 0.39 * b.w, y: b.y + 0.58 * b.h };
    diag = Math.hypot(Math.max(gable.x, vw - gable.x), Math.max(gable.y, vh - gable.y));
    world.style.transformOrigin = `${gable.x}px ${gable.y}px`;
    ringsSvg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
    rings.forEach(c => { c.setAttribute('cx', gable.x); c.setAttribute('cy', gable.y); });
    const d = Math.min(2, devicePixelRatio || 1);
    starCv.width = starCv.clientWidth * d; starCv.height = starCv.clientHeight * d;
    sctx.setTransform(d, 0, 0, d, 0, 0);
  }
  function drawStars(t, alpha) {
    const w = starCv.clientWidth, h = starCv.clientHeight;
    sctx.clearRect(0, 0, w, h);
    if (alpha <= 0.01) return;
    sctx.fillStyle = '#fff8eb';
    for (const s of stars) {
      const tw = 0.5 + 0.5 * Math.sin(t * s.w + s.ph);
      sctx.globalAlpha = alpha * s.a * tw * tw;
      sctx.beginPath(); sctx.arc(s.x * w, s.y * h, s.s, 0, 6.283); sctx.fill();
    }
    sctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- 02 inside
  const insideBg = $('#inside .inside-bg'), insidePush = new Follow(0, 'heavy');

  // ---------------------------------------------------------------- 02 inside: the promise, read word by word
  const read = $('#read');
  (function split(node) {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.append(part);
          else { const s = document.createElement('span'); s.className = 'w'; s.textContent = part; frag.append(s); }
        });
        n.replaceWith(frag);
      } else split(n);
    }
  })(read);
  const words = $$('.w', read), litF = new Follow(0, 'default');

  // ---------------------------------------------------------------- 03 features
  const feats = $$('.feat');
  const featF = feats.map(() => new Follow(0.35, 'snappy'));
  const scr = $$('.scr').map(el => ({ el, f: new Follow(el.dataset.scr === '0' ? 1 : 0, 'default') }));
  const qa = $$('[data-qa]').map(el => ({ el, f: new Follow(0, 'default') }));
  const phone = $('#phone'), phoneOn = new Follow(1, 'default');
  const plates = Object.fromEntries($$('.plate-card').map(el => [el.dataset.plate, { el, f: new Follow(0, 'default') }]));
  const checks = $$('[data-plate="share"] li').map(li => ({ li, f: new Follow(0, 'snappy') }));
  // feature → [screen index, or -1 when an illustration stands in for the phone; plate]
  const PLAN = [[1], [0], [2], [3], [5], [7], [-1, 'share']];
  let featActive = -1;

  function activate(i) {
    const prev = featActive; featActive = i;
    feats.forEach((el, j) => featF[j].to(j === i ? 1 : 0.35));
    const [s, plate] = i >= 0 ? PLAN[i] : [0];
    const screenIdx = s < 0 ? (prev >= 0 && PLAN[prev][0] >= 0 ? PLAN[prev][0] : 0) : s;
    scr.forEach((c, j) => { if (j !== 0) c.f.to(j <= screenIdx ? 1 : 0); });
    if (i === 3) scr[4].f.to(1, { delay: 1.6 });                      // notes, then the Ask sheet slides over
    if (i === 4) scr[6].f.to(1, { delay: 1.6 });                      // Today, then the calendar slides over
    phoneOn.to(s < 0 ? 0 : 1);
    for (const [k, p] of Object.entries(plates)) p.f.to(k === plate ? 1 : 0, { delay: k === plate ? 0.12 : 0 });
    if (i === 1) qa.forEach((c, j) => c.f.to(1, { delay: 0.45 + j * 1.25 }));
    if (plate === 'share') checks.forEach((c, j) => { c.f.set(0); c.f.to(1, { delay: 0.45 + j * 0.42 }); });
  }

  // ---------------------------------------------------------------- 05 film
  const video = $('#film-video'), soundBtn = $('#sound');
  new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && !still) video.play().catch(() => {}); else video.pause(); }), { threshold: 0.35 }).observe(video);
  soundBtn.addEventListener('click', () => {
    video.muted = !video.muted; soundBtn.setAttribute('aria-pressed', String(!video.muted));
    soundBtn.querySelector('span').textContent = video.muted ? 'Sound on' : 'Sound off';
    if (!video.muted) { video.currentTime = 0; video.play().catch(() => {}); }
  });

  // ---------------------------------------------------------------- light / dark
  const themeBtn = $('#theme-btn');
  const label = () => themeBtn.setAttribute('aria-label', document.documentElement.dataset.theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  label();
  themeBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('heimark-theme', next); } catch (e) {}
    label(); kick();
  });

  // ---------------------------------------------------------------- pricing: billing toggle
  const billBtns = $$('[data-bill]'), billInd = $('.bill-ind');
  const bill = { x0: new Follow(0, 'default'), x1: new Follow(0, 'default') };
  const amts = $$('.plan .amt').map(el => ({ el, f: new Follow(1, 'snappy') }));
  let billMode = 'year';
  function placeBill(btn, instant) {
    const x0 = btn.offsetLeft, x1 = x0 + btn.offsetWidth, right = x0 > bill.x0.last;
    if (instant) { bill.x0.set(x0); bill.x1.set(x1); return; }
    bill.x0.to(x0, { preset: right ? 'default' : 'snappy' }); bill.x1.to(x1, { preset: right ? 'snappy' : 'default' });
  }
  billBtns.forEach(btn => btn.addEventListener('click', () => {
    if (btn.dataset.bill === billMode) return;
    billMode = btn.dataset.bill;
    billBtns.forEach(b => b.setAttribute('aria-checked', String(b === btn)));
    placeBill(btn);
    $$('[data-year]').forEach(el => { el.textContent = el.dataset[billMode]; });
    amts.forEach(a => { a.f.set(0.82); a.f.to(1); });                      // the new price grows into place
    kick();
  }));

  // ---------------------------------------------------------------- 06 faq: answers open on a spring
  const faqs = $$('.qa-list details').map(d => ({ d, ans: $('.ans', d), sum: $('summary', d), f: new Follow(0, 'default') }));
  faqs.forEach(q => {
    q.ans.style.height = '0px';
    q.sum.addEventListener('click', e => {
      e.preventDefault();
      const opening = q.f.last < 0.5;
      if (opening) q.d.open = true;
      q.f.to(opening ? 1 : 0);
      kick();
    });
  });

  // ---------------------------------------------------------------- chrome: header tone + rail
  const top = $('#top'), tone = new Follow(0, 'snappy');
  const BONE = [255, 248, 235], INK = [43, 38, 32];
  const rgb = (a, b, t) => `rgb(${a.map((v, i) => Math.round(mix(v, b[i], t))).join(',')})`;
  const railLinks = $$('.rail a'), railLabel = $('#rail-label'), railInd = $('.rail-ind'), railF = new Follow(0, 'default');
  const railTargets = railLinks.map(a => $(a.getAttribute('href')));
  let railActive = -1;

  // ---------------------------------------------------------------- frame
  let raf = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function frame() {
    raf = 0;
    const vh = innerHeight, vw = innerWidth, t = now();
    let busy = false;
    measure(vh);

    inside.pin.style.transform = inside.cover > 0 ? `scale(${1 - 0.05 * inside.cover})` : '';
    inside.shade.style.opacity = (0.55 * (inside.cover || 0)).toFixed(3);

    for (const b of beats) {
      const s = b.sec;
      if (s.top >= vh) b.f.set(0);
      else if (s.top < vh * 0.6) {
        const target = s.p < b.tin ? 0 : s.p >= b.tout ? 2 : 1;
        b.f.to(target, { delay: t - T0 < 2.5 ? b.delay : 0 });
      }
      applyBeat(b, b.f.at(t));
      busy ||= b.f.busy;
    }

    // 01 ------------------------------------------------------------
    const ps = story.p, storyOn = story.top + story.h > vh;
    story.pin.style.visibility = storyOn ? '' : 'hidden';               // the room underneath is the same frame: hand off instantly
    wipe.to(clamp((ps - 0.26) / 0.16));
    push.to(ps < 0.7 ? ps / 0.7 : 1 + (ps - 0.7) / 0.27);
    dive.to(clamp((ps - 0.72) / 0.25));
    const w = wipe.at(t), pu = push.at(t), dv = clamp(dive.at(t), 0, 1.02);
    if (storyOn) {
      dayPlate.style.clipPath = `inset(${((1 - w) * 100).toFixed(2)}% 0 0 0)`;
      const drift = still ? 0 : Math.sin(t * 0.12) * 0.006;
      const sc = pu <= 1 ? 1 + 0.07 * pu : 1.07 + 1.5 * (pu - 1) * (pu - 1);   // gentle drift, then the push into the gable
      world.style.transform = `scale(${(sc + drift).toFixed(4)})`;
      const night = 1 - w;
      lamps.forEach(l => { l.el.style.opacity = (night * (l.fire ? 0.55 + 0.6 * l.f(t * 1.6) : 0.72 + 0.4 * l.f(t))).toFixed(3); });
      mists[0].style.transform = `translateX(${Math.sin(t * 0.045) * 4}vw)`;
      mists[1].style.transform = `translateX(${Math.sin(t * 0.06 + 2) * -5}vw)`;
      mists.forEach(m => { m.style.opacity = mix(1, 0.35, w); });
      drawStars(t, night);
      const r = dv * diag * 1.04;
      hole.style.clipPath = `circle(${r.toFixed(1)}px at ${gable.x}px ${gable.y}px)`;
      rings.forEach((c, i) => {
        const rr = r + (i + 1) * (16 + 70 * dv);                               // rings run just ahead of the opening
        c.setAttribute('r', Math.max(0, dv > 0.002 ? rr : 0).toFixed(1));
        c.style.opacity = dv > 0.002 && dv < 1 ? (0.9 - i * 0.2) * (1 - dv) * 1.6 : 0;
      });
      busy = true;                                                            // the night is alive while on screen
    }
    busy ||= wipe.busy || push.busy || dive.busy;

    // 02 ------------------------------------------------------------
    insidePush.to(inside.p);
    insideBg.style.transform = `scale(${(1 + 0.08 * insidePush.at(t)).toFixed(4)})`;
    litF.to(clamp((inside.p - 0.06) / 0.78) * words.length);
    const lit = litF.at(t);
    words.forEach((el, i) => { el.style.opacity = (0.16 + 0.84 * clamp(lit - i)).toFixed(3); });
    busy ||= litF.busy || insidePush.busy;

    // 03 ------------------------------------------------------------
    const line = vh * (mobileQ.matches ? 0.78 : 0.55);
    let fa = -1;
    feats.forEach((el, i) => { if (el.getBoundingClientRect().top < line) fa = i; });
    const fr = featuresEl.getBoundingClientRect();
    if (fr.bottom < vh * 0.3) fa = feats.length - 1;
    if (fa !== featActive && fa >= 0) activate(fa);
    feats.forEach((el, i) => { el.style.opacity = featF[i].at(t).toFixed(3); busy ||= featF[i].busy; });
    scr.forEach((c, j) => {
      const v = c.f.at(t), above = scr[j + 1] ? clamp(scr[j + 1].f.at(t)) : 0;
      c.el.style.transform = `translateY(${((1 - v) * 100).toFixed(2)}%) scale(${(1 - 0.06 * above).toFixed(4)})`;
      busy ||= c.f.busy;
    });
    const qv = qa.map(c => clamp(c.f.at(t), 0, 1.2));
    qa.forEach((c, i) => {
      let lift = 0;
      for (let j = i + 1; j < qa.length; j++) lift += qv[j] * qa[j].el.offsetHeight;
      c.el.style.opacity = clamp(qv[i] * 5);
      c.el.style.transform = `translateY(${((1 - qv[i]) * c.el.offsetHeight * 0.5 - lift).toFixed(1)}px)`;
      busy ||= c.f.busy;
    });
    const po = phoneOn.at(t);
    phone.style.transform = `translateY(${((1 - po) * 70).toFixed(2)}%) scale(${(0.9 + 0.1 * po).toFixed(4)})`;
    phone.style.opacity = clamp(po * 4).toFixed(3);
    busy ||= phoneOn.busy;
    for (const p of Object.values(plates)) {
      const v = p.f.at(t);
      p.el.style.opacity = clamp(v * 5).toFixed(3);
      p.el.style.transform = `translateY(calc(-50% + ${((1 - v) * 60).toFixed(1)}px)) scale(${mix(0.94, 1, clamp(v)).toFixed(4)})`;
      busy ||= p.f.busy;
    }
    checks.forEach(c => {
      const v = c.f.at(t);
      c.li.style.setProperty('--k', Math.max(0, v).toFixed(3));
      c.li.querySelector('span').style.opacity = (0.4 + 0.6 * clamp(v)).toFixed(3);
      busy ||= c.f.busy;
    });

    // pricing --------------------------------------------------------
    const b0 = bill.x0.at(t), b1 = bill.x1.at(t);
    billInd.style.cssText = `transform:translateX(${b0.toFixed(2)}px);width:${(b1 - b0).toFixed(2)}px`;
    amts.forEach(a => { a.el.style.transform = `scale(${a.f.at(t).toFixed(4)})`; a.el.style.transformOrigin = '0 80%'; busy ||= a.f.busy; });
    busy ||= bill.x0.busy || bill.x1.busy;

    // 06 ------------------------------------------------------------
    faqs.forEach(q => {
      const v = q.f.at(t), h = $('p', q.ans).offsetHeight;
      q.ans.style.height = `${Math.max(0, v * h).toFixed(1)}px`;
      q.sum.style.setProperty('--r', `${(clamp(v, 0, 1.1) * 45).toFixed(2)}deg`);
      if (!q.f.busy && q.f.last === 0 && q.d.open) q.d.open = false;
      busy ||= q.f.busy;
    });

    // chrome --------------------------------------------------------
    const probe = 40;
    let toneLight;
    if (story.top + story.h > probe && story.top <= probe) toneLight = false;
    else {
      const zones = [inside, { el: featuresEl }, { el: $('#modes') }, film, { el: $('#pricing') }, { el: $('#faq') }, close];
      let under = null;
      for (const z of zones) { const r = z.el.getBoundingClientRect(); if (r.top <= probe && r.bottom > probe) under = z.el; }
      toneLight = under ? under.dataset.tone === 'light' && document.documentElement.dataset.theme !== 'dark' : false;
    }
    tone.to(toneLight ? 1 : 0);
    const tv = clamp(tone.at(t)), rs = document.documentElement.style;
    rs.setProperty('--tone', rgb(BONE, INK, tv));
    rs.setProperty('--chip-bg', rgb(BONE, INK, tv));
    rs.setProperty('--chip-fg', rgb(INK, BONE, tv));
    busy ||= tone.busy;

    let ra = 0;
    railTargets.forEach((el, i) => { if (el.getBoundingClientRect().top <= vh * 0.5) ra = i; });
    if (ra !== railActive) { railActive = ra; railLabel.textContent = railLinks[ra].dataset.label; railF.to(railLinks[ra].offsetTop + 7); }
    railInd.style.transform = `translateY(${railF.at(t).toFixed(2)}px)`;
    busy ||= railF.busy;

    if (busy) kick();
  }

  // ---------------------------------------------------------------- input
  $$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
    const el = $(a.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    let y = el.getBoundingClientRect().top + scrollY;
    if (el.id === 'inside') y = story.el.offsetTop + story.el.offsetHeight - innerHeight;    // land just after the dive
    scrollTo({ top: y, behavior: 'instant' });
  }));

  function resize() { layoutStory(); placeBill($(`[data-bill="${billMode}"]`), true); kick(); }
  addEventListener('scroll', kick, { passive: true });
  addEventListener('resize', resize);
  $$('img').forEach(i => i.complete || i.addEventListener('load', kick, { once: true }));
  resize();
})();
