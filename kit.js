// Tiny shared kit for the mockups: spring followers on top of motion.js,
// one frame loop, and spring reveals for [data-rise] elements.
(() => {
  const M = window.Motion;
  const now = () => performance.now() / 1000;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // A value that springs to each new target from wherever it is (one spring per change).
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
  }

  const frames = [];
  const loop = () => { const t = now(); for (const f of frames) f(t); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);

  // [data-rise] slides up into place on a spring when it scrolls into view.
  // data-rise="0.12" staggers it by that many seconds.
  function rise(root = document) {
    const items = [...root.querySelectorAll('[data-rise]')].map(el => ({ el, f: new Follow(0, 'default'), d: parseFloat(el.dataset.rise) || 0 }));
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (!e.isIntersecting) return;
      const it = items.find(i => i.el === e.target);
      it.f.to(1, { delay: it.d });
      io.unobserve(e.target);
    }), { threshold: 0.2 });
    items.forEach(i => io.observe(i.el));
    frames.push(t => items.forEach(({ el, f }) => {
      const v = f.at(t);
      el.style.transform = `translateY(${((1 - v) * 44).toFixed(2)}px)`;
      el.style.opacity = Math.min(1, Math.max(0, v * 1.4)).toFixed(3);
    }));
  }

  window.Kit = { M, Follow, now, still, onFrame: f => frames.push(f), rise };
})();
