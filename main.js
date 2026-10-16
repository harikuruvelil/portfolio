// Page behaviour shared by the home page and project pages. Everything here is an
// enhancement: the content reads the same with scripts off or reduced motion on.
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };

  var year = $('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  // Scroll-driven bits share one rAF-throttled handler.
  var scrollers = [];
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      scrollers.forEach(function (fn) { fn(); });
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  // Nav picks up a background once the page moves.
  var nav = $('.nav');
  if (nav) scrollers.push(function () { nav.classList.toggle('scrolled', window.scrollY > 8); });

  // Fade sections up as they arrive.
  var revealer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add('in');
      revealer.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  $$('[data-reveal]').forEach(function (el) { revealer.observe(el); });

  // The intro statement lights up word by word as it scrolls through the viewport.
  var statement = $('[data-highlight]');
  if (statement && !reduce) {
    var words = [];
    (function wrap(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var span = document.createElement('span');
            span.className = 'w';
            span.textContent = part;
            words.push(span);
            frag.appendChild(span);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          wrap(child);
        }
      });
    })(statement);
    statement.classList.add('is-dim');
    var lit = -1;
    scrollers.push(function () {
      var r = statement.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = (vh * 0.85 - r.top) / (r.height + vh * 0.35);
      var n = Math.round(Math.min(1, Math.max(0, p)) * words.length);
      if (n === lit) return;
      lit = n;
      for (var i = 0; i < words.length; i++) words[i].classList.toggle('on', i < n);
    });
  }

  // Muted loops play only while they are on screen.
  $$('video[data-autoplay]').forEach(function (v) {
    v.muted = true;
    if (reduce) return;
    new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (v.preload === 'none') v.preload = 'auto';
          var p = v.play();
          if (p && p.catch) p.catch(function () {});
        } else {
          v.pause();
        }
      });
    }, { threshold: 0.3 }).observe(v);
  });

  // Project list: the sticky frame shows whichever project is in the middle of the screen.
  var showcase = $('.showcase');
  if (showcase) {
    var items = $$('.show-item', showcase);
    var frames = $$('.show-frame .m', showcase);
    var chart = $('.show-frame .chart-media', showcase);
    $$('.inline-media.chart-media', showcase).forEach(function (slot) {
      if (chart) slot.innerHTML = chart.innerHTML;
    });
    var setActive = function (n) {
      items.forEach(function (it, k) { it.classList.toggle('active', k === n); });
      frames.forEach(function (m, k) { m.classList.toggle('active', k === n); });
    };
    setActive(0);
    var picker = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) setActive(Number(e.target.dataset.index)); });
    }, { rootMargin: '-45% 0px -45% 0px' });
    items.forEach(function (it) { picker.observe(it); });
    // On phones each chart draws when it scrolls into view.
    var inlineCharts = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('active'); });
    }, { threshold: 0.4 });
    $$('.inline-media.chart-media', showcase).forEach(function (el) { inlineCharts.observe(el); });
  }

  // Timeline: place "today" and stretch the current job to it.
  var timeline = $('.timeline');
  if (timeline) {
    var toMonths = function (s) { var p = s.split('-'); return Number(p[0]) * 12 + Number(p[1]) - 1; };
    var now = new Date();
    var nowM = now.getFullYear() * 12 + now.getMonth() + now.getDate() / 31;
    var start = toMonths(timeline.dataset.start);
    var span = toMonths(timeline.dataset.end) - start;
    var pct = function (m) { return Math.min(100, Math.max(0, ((m - start) / span) * 100)) + '%'; };
    timeline.style.setProperty('--now', pct(nowM));
    $$('.tl-bar', timeline).forEach(function (bar) {
      var from = toMonths(bar.dataset.from);
      var to = bar.dataset.to === 'now' ? nowM : toMonths(bar.dataset.to);
      bar.style.setProperty('--s', pct(from));
      bar.style.setProperty('--e', pct(to));
      // The part of a bar that is still in the future is drawn lighter.
      bar.style.setProperty('--split', Math.min(100, Math.max(0, ((nowM - from) / (to - from)) * 100)) + '%');
    });
  }

  // Copy-to-clipboard for the email address.
  $$('[data-copy]').forEach(function (btn) {
    var label = btn.textContent;
    btn.addEventListener('click', function () {
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(btn.dataset.copy).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = label; }, 1800);
      });
    });
  });

  // On touch screens there is no cursor to follow.
  var figText = $('[data-fig-text]');
  if (figText && !window.matchMedia('(hover: hover)').matches) {
    figText.textContent = 'Iron filings around a magnetic dipole. The magnet traces a 3:2 Lissajous figure.';
  }

  // Field canvases.
  if (window.IronFilings) {
    $$('canvas[data-field]').forEach(function (canvas) {
      var dark = canvas.dataset.field === 'dark';
      var area = canvas.closest('[data-field-area]') || canvas;
      var mask = canvas.dataset.mask ? $(canvas.dataset.mask, area) : null;
      new window.IronFilings(canvas, dark ? {
        colors: ['#5b7cff', '#3fd2ea', '#ff5cc8', '#ffd23f'],
        spacing: 30,
        floor: 0.14,
        reach: 320,
        maxLen: 12,
        home: [0.74, 0.42],
        mask: mask,
        area: area,
      } : {
        mask: mask,
        area: area,
      });
    });
  }

  // Project pages: reading progress and the active section in the side list.
  var progress = $('.progress span');
  if (progress) {
    scrollers.push(function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      progress.style.transform = 'scaleX(' + (max > 0 ? h.scrollTop / max : 0) + ')';
    });
  }
  var tocLinks = $$('.toc a');
  if (tocLinks.length) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var current = null;
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        if (current) current.classList.remove('active');
        current = byId[e.target.id];
        if (current) current.classList.add('active');
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    Object.keys(byId).forEach(function (id) { var h = document.getElementById(id); if (h) spy.observe(h); });
  }

  onScroll();
})();
