// Iron filings: short dashes that line up with the field of a magnetic dipole.
// The dipole follows the pointer. When the pointer is away it traces a slow 3:2
// Lissajous figure, the shape an oscilloscope draws in XY mode.
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var TAU = Math.PI * 2;
  var HUES = 28;
  var LEVELS = 6;

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // A looping colour ramp through the given stops.
  function ramp(stops, steps) {
    var rgb = stops.map(hexToRgb);
    var out = [];
    for (var i = 0; i < steps; i++) {
      var t = (i / steps) * rgb.length;
      var k = Math.floor(t);
      var f = t - k;
      var a = rgb[k % rgb.length];
      var b = rgb[(k + 1) % rgb.length];
      out.push('rgb(' + Math.round(a[0] + (b[0] - a[0]) * f) + ',' + Math.round(a[1] + (b[1] - a[1]) * f) + ',' + Math.round(a[2] + (b[2] - a[2]) * f) + ')');
    }
    return out;
  }

  // Small seeded PRNG so the layout stays the same between resizes.
  function prng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function smoothstep(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function angleDiff(a, b) {
    var d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function Field(canvas, options) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = Object.assign({
      colors: ['#3159f5', '#0aa5c0', '#c2349b', '#e0a400'],
      spacing: 28,
      lineWidth: 2.2,
      floor: 0.08,
      reach: 360,
      hole: 30,
      push: 24,
      maxLen: 11,
      mask: null,
      home: [0.7, 0.6],
      area: canvas,
    }, options || {});
    this.hues = ramp(this.o.colors, HUES);
    this.t = 0;
    this.fade = 0;
    this.running = false;
    this.visible = true;
    this.pointer = null;
    this.lastMove = -1e9;
    this.theta = -0.6;
    this.layout();
    this.mx = this.W * this.o.home[0];
    this.my = this.H * this.o.home[1];
    this.bind();
    if (reduceMotion.matches) this.drawStatic(); else this.start();
  }

  Field.prototype.layout = function () {
    var r = this.canvas.getBoundingClientRect();
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);

    var g = this.W < 640 ? this.o.spacing * 0.9 : this.o.spacing;
    var cols = Math.ceil(this.W / g) + 1;
    var rows = Math.ceil(this.H / g) + 1;
    this.measureMask(r);
    // Keep the current filings if the grid hasn't changed size.
    if (cols === this.cols && rows === this.rows && g === this.g) return;
    this.cols = cols;
    this.rows = rows;
    this.g = g;
    var n = cols * rows;
    var rand = prng(11);
    this.n = n;
    this.bx = new Float32Array(n);
    this.by = new Float32Array(n);
    this.ph = new Float32Array(n);
    this.cx = new Float32Array(n);
    this.cy = new Float32Array(n);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.ang = new Float32Array(n);
    this.len = new Float32Array(n);
    this.bucket = new Int16Array(n);
    this.order = new Int32Array(n);
    this.counts = new Int32Array(HUES * LEVELS + 1);
    for (var j = 0; j < rows; j++) {
      for (var i = 0; i < cols; i++) {
        var k = j * cols + i;
        this.bx[k] = (i - 0.5 + (rand() - 0.5) * 0.9) * g;
        this.by[k] = (j - 0.5 + (rand() - 0.5) * 0.9) * g;
        this.ph[k] = rand() * TAU;
        // Start unaligned so the filings swing into place on load.
        var a0 = rand() * TAU;
        this.cx[k] = Math.cos(a0);
        this.cy[k] = Math.sin(a0);
      }
    }
  };

  // The area behind the headline stays quiet so the text reads cleanly.
  Field.prototype.measureMask = function (r) {
    this.maskBox = null;
    if (!this.o.mask) return;
    var m = this.o.mask.getBoundingClientRect();
    this.maskBox = {
      x: m.left - r.left + m.width / 2,
      y: m.top - r.top + m.height / 2,
      rx: m.width * 0.56 + 24,
      ry: m.height * 0.62 + 24,
    };
  };

  Field.prototype.bind = function () {
    var self = this;
    window.addEventListener('pointermove', function (e) {
      var r = self.o.area.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      var c = self.canvas.getBoundingClientRect();
      self.pointer = [e.clientX - c.left, e.clientY - c.top];
      self.lastMove = performance.now();
    }, { passive: true });

    var resizeTimer;
    new ResizeObserver(function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var fx = self.mx / self.W;
        var fy = self.my / self.H;
        self.layout();
        self.mx = fx * self.W;
        self.my = fy * self.H;
        if (!self.running) self.drawStatic();
      }, 120);
    }).observe(this.canvas);

    new IntersectionObserver(function (entries) {
      self.visible = entries[0].isIntersecting;
      self.sync();
    }).observe(this.canvas);
    document.addEventListener('visibilitychange', function () { self.sync(); });
    reduceMotion.addEventListener('change', function () {
      if (reduceMotion.matches) { self.stop(); self.drawStatic(); } else { self.start(); }
    });
  };

  Field.prototype.sync = function () {
    if (reduceMotion.matches) return;
    if (this.visible && !document.hidden) this.start(); else this.stop();
  };

  Field.prototype.start = function () {
    if (this.running) return;
    this.running = true;
    var self = this;
    var last = performance.now();
    function frame(now) {
      if (!self.running) return;
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      self.step(dt, now, false);
      self.draw();
      self.raf = requestAnimationFrame(frame);
    }
    this.raf = requestAnimationFrame(frame);
  };

  Field.prototype.stop = function () {
    this.running = false;
    cancelAnimationFrame(this.raf);
  };

  Field.prototype.drawStatic = function () {
    this.mx = this.W * this.o.home[0];
    this.my = this.H * this.o.home[1];
    this.theta = -0.6;
    this.fade = 1;
    this.step(0, 0, true);
    this.draw();
  };

  Field.prototype.step = function (dt, now, settle) {
    var o = this.o;
    var W = this.W, H = this.H;
    this.t += dt;
    this.fade = Math.min(1, this.fade + dt * 0.9);

    if (!settle) {
      var idle = !this.pointer || now - this.lastMove > 2600;
      var tx, ty;
      if (idle) {
        var w = 0.13;
        tx = W * (0.5 + 0.3 * Math.sin(3 * w * this.t + Math.PI / 2));
        ty = H * (0.52 + 0.3 * Math.sin(2 * w * this.t));
      } else {
        tx = this.pointer[0];
        ty = this.pointer[1];
      }
      var ease = 1 - Math.exp(-dt * (idle ? 1.1 : 6));
      var nx = this.mx + (tx - this.mx) * ease;
      var ny = this.my + (ty - this.my) * ease;
      var vx = (nx - this.mx) / (dt || 1);
      var vy = (ny - this.my) / (dt || 1);
      this.mx = nx;
      this.my = ny;
      // The dipole turns to face the way it is moving, and slowly spins when still.
      var speed = Math.sqrt(vx * vx + vy * vy);
      if (speed > 25) this.theta += angleDiff(Math.atan2(vy, vx), this.theta) * (1 - Math.exp(-dt * Math.min(4, speed / 120)));
      else this.theta += dt * 0.12;
    }

    var ux = Math.cos(this.theta), uy = Math.sin(this.theta);
    var mx = this.mx, my = this.my, t = this.t;
    var mb = this.maskBox;
    var counts = this.counts;
    counts.fill(0);

    for (var i = 0; i < this.n; i++) {
      var dx = this.bx[i] - mx;
      var dy = this.by[i] - my;
      var d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      var rx = dx / d, ry = dy / d;

      // Filings are pushed back from the magnet, which leaves a clear ring around it.
      var push = o.push * Math.exp(-d / 110);
      var x = this.bx[i] + rx * push + Math.sin(t * 0.7 + this.ph[i]) * 0.8;
      var y = this.by[i] + ry * push + Math.cos(t * 0.6 + this.ph[i] * 1.3) * 0.8;

      // Dipole field direction: B ∝ 3(u·r̂)r̂ − u. Filings have no head or tail,
      // so ease the doubled angle to avoid flipping at ±90°.
      var dot = ux * rx + uy * ry;
      var bxv = 3 * dot * rx - ux;
      var byv = 3 * dot * ry - uy;
      var bb = bxv * bxv + byv * byv || 1;
      var tcx = (bxv * bxv - byv * byv) / bb;
      var tcy = (2 * bxv * byv) / bb;
      var resp = settle ? 1 : 1 - Math.exp(-dt * (1.6 + 14 * Math.exp(-d / 240)));
      var cx = this.cx[i] + (tcx - this.cx[i]) * resp;
      var cy = this.cy[i] + (tcy - this.cy[i]) * resp;
      this.cx[i] = cx;
      this.cy[i] = cy;

      var a = o.floor + (1 - o.floor) * Math.exp(-d / o.reach);
      a *= smoothstep(o.hole, o.hole + 70, d);
      if (mb) {
        var ex = (x - mb.x) / mb.rx, ey = (y - mb.y) / mb.ry;
        a *= 0.1 + 0.9 * smoothstep(0.6, 1.15, ex * ex + ey * ey);
      }
      a *= this.fade;

      var level = Math.floor(a * LEVELS);
      if (level <= 0) { this.bucket[i] = -1; continue; }
      if (level >= LEVELS) level = LEVELS - 1;
      var hue = (Math.atan2(dy, dx) - this.theta) / TAU;
      hue -= Math.floor(hue);
      var b = Math.floor(hue * HUES) % HUES * LEVELS + level;

      this.x[i] = x;
      this.y[i] = y;
      this.ang[i] = 0.5 * Math.atan2(cy, cx);
      this.len[i] = 2.4 + (o.maxLen - 2.4) * Math.exp(-d / 260);
      this.bucket[i] = b;
      counts[b + 1]++;
    }

    // Counting sort by bucket so each colour and opacity is stroked once.
    for (var c = 1; c < counts.length; c++) counts[c] += counts[c - 1];
    var fill = counts.slice();
    for (var j = 0; j < this.n; j++) {
      var bk = this.bucket[j];
      if (bk >= 0) this.order[fill[bk]++] = j;
    }
  };

  Field.prototype.draw = function () {
    var ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.lineWidth = this.o.lineWidth;
    ctx.lineCap = 'round';
    var counts = this.counts;
    for (var b = 0; b < HUES * LEVELS; b++) {
      var from = counts[b], to = counts[b + 1];
      if (from === to) continue;
      ctx.strokeStyle = this.hues[Math.floor(b / LEVELS)];
      ctx.globalAlpha = ((b % LEVELS) + 0.5) / LEVELS;
      ctx.beginPath();
      for (var k = from; k < to; k++) {
        var i = this.order[k];
        var h = this.len[i] / 2;
        var cx = Math.cos(this.ang[i]) * h, cy = Math.sin(this.ang[i]) * h;
        ctx.moveTo(this.x[i] - cx, this.y[i] - cy);
        ctx.lineTo(this.x[i] + cx, this.y[i] + cy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  window.IronFilings = Field;
})();
