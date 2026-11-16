(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;

  /* ---------- Projects ---------- */
  const PROJECTS = [
    {
      name: 'WaqtOS',
      kind: 'Personal Operating System',
      sub: 'Salah-centered',
      img: 'assets/img/waqtos.webp',
      bg: '#ffffff', label: '#0d5c46',
      desc: 'A Salah-centered personal operating system. It brings worship, time management, tasks, schedules and daily responsibilities into one place, so Muslims can live a more organized, balanced and purposeful life.',
      tags: ['Salah-centered', 'Time management', 'Tasks and schedules', 'Daily responsibilities'],
      metric: 'Salah', metricLabel: 'At the centre',
    },
    {
      name: 'HOOR-E-AIN',
      kind: 'App with AI Companion',
      sub: 'Wellness, family & love',
      img: 'assets/img/hoor-e-ain.webp',
      bg: '#000000', label: '#e9b949',
      desc: 'A lifetime wellness, family and love companion. It organizes daily routines, tracks health and habits, supports spiritual and personal growth, keeps a private journal, and includes HOOR AI for everyday questions and support.',
      tags: ['Daily routines', 'Health and habits', 'Spiritual and personal growth', 'Private journal', 'HOOR AI'],
      metric: 'HOOR AI', metricLabel: 'Built-in companion',
    },
    {
      name: 'CricApex',
      kind: 'Sports App',
      sub: 'Cricket scoring & tournaments',
      img: 'assets/img/cricapex.webp',
      bg: '#ffffff', label: '#0b1f4d',
      desc: 'A full cricket scoring and tournament platform: ball-by-ball live scoring, digital scorecards and player statistics, plus league and knockout tournaments with automatic fixtures, a points table and Net Run Rate. Also includes live match following, live broadcasting support, and player and team records.',
      tags: ['Ball-by-ball live scoring', 'Digital scorecards', 'Player statistics', 'League & knockout tournaments', 'Automatic fixtures', 'Points table & Net Run Rate', 'Live match following', 'Live broadcasting support', 'Player & team records'],
      metric: 'Ball by ball', metricLabel: 'Live scoring',
    },
    {
      name: 'Kadapa Cars',
      kind: 'Website',
      sub: 'Built with AI',
      img: 'assets/img/kadapa-cars.webp',
      bg: '#ffffff', label: '#0b2a6b',
      desc: 'A website I built with AI.',
      tags: ['Website', 'Built with AI'],
      metric: '100%', metricLabel: 'Built with AI',
    },
  ];

  /* ---------- Preloader ---------- */
  const preloader = $('#preloader');
  const startPage = () => {
    document.body.classList.remove('is-loading');
    preloader.classList.add('is-done');
  };
  if (reduced) {
    preloader.classList.add('is-done');
  } else {
    document.body.classList.add('is-loading');
    const bar = $('#preloaderBar'), pct = $('#preloaderPct');
    const t0 = performance.now(), DUR = 1700;
    let loaded = document.readyState === 'complete';
    addEventListener('load', () => { loaded = true; });
    const tick = (now) => {
      let p = Math.min((now - t0) / DUR, 1);
      p = 1 - Math.pow(1 - p, 3);
      if (!loaded && now - t0 < 4000) p = Math.min(p, .92);
      bar.style.transform = `scaleX(${p})`;
      pct.textContent = Math.round(p * 100);
      if (p < 1) requestAnimationFrame(tick); else setTimeout(startPage, 250);
    };
    requestAnimationFrame(tick);
    setTimeout(startPage, 6000); // safety net
  }

  /* ---------- Theme ---------- */
  $('#themeToggle').addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    $('meta[name="theme-color"]').content = next === 'light' ? '#f5f2ea' : '#0b0b0a';
    try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
  });

  /* ---------- Mobile menu ---------- */
  const burger = $('#burger'), navLinks = $('#navLinks');
  const setMenu = (open) => {
    navLinks.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', open);
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  burger.addEventListener('click', () => setMenu(!navLinks.classList.contains('is-open')));
  navLinks.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  /* ---------- Scroll: progress, rail, nav hide ---------- */
  const progress = $('#progressBar'), rail = $('#railThumb'), nav = $('#nav');
  let lastY = 0, ticking = false;
  const onScroll = () => {
    const y = scrollY, max = root.scrollHeight - innerHeight;
    const p = max > 0 ? y / max : 0;
    progress.style.transform = `scaleX(${p})`;
    rail.style.transform = `translateY(${p * (innerHeight - 56)}px)`;
    const menuOpen = navLinks.classList.contains('is-open');
    nav.classList.toggle('is-hidden', !menuOpen && y > 500 && y > lastY + 4);
    if (y < lastY - 4) nav.classList.remove('is-hidden');
    lastY = y; ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---------- Reveal on scroll ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      $$('[data-count]', en.target).forEach(countUp);
      revealIO.unobserve(en.target);
    });
  }, { threshold: .15, rootMargin: '0px 0px -6% 0px' });
  $$('.reveal').forEach((el) => {
    const sibs = $$(':scope > .reveal', el.parentElement);
    el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 6) * 0.08}s`);
    revealIO.observe(el);
  });

  function countUp(el) {
    const target = +el.dataset.count;
    if (reduced) return;
    const comma = el.dataset.format === 'comma';
    const from = target > 1000 && !comma ? target - 40 : 0; // years roll a short distance
    const t0 = performance.now(), dur = 1600;
    const step = (now) => {
      const p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 4);
      const v = Math.round(from + (target - from) * e);
      el.textContent = comma ? v.toLocaleString('en-US') : v;
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /* ---------- Active nav link ---------- */
  const linkFor = Object.fromEntries($$('.nav__links a').map((a) => [a.getAttribute('href').slice(1), a]));
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      Object.values(linkFor).forEach((a) => a.classList.remove('is-active'));
      linkFor[en.target.id]?.classList.add('is-active');
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => spy.observe(s));

  /* ---------- Marquee: duplicate for a seamless loop ---------- */
  const mq = $('#marquee');
  mq.innerHTML = mq.innerHTML.repeat(6);

  /* ---------- Hero parallax ---------- */
  const heroVisual = $('#heroVisual');
  if (finePointer && !reduced) {
    const layers = $$('[data-depth]', heroVisual);
    $('.hero').addEventListener('pointermove', (e) => {
      const x = e.clientX / innerWidth - .5, y = e.clientY / innerHeight - .5;
      layers.forEach((l) => {
        const d = +l.dataset.depth;
        l.style.transform = `translate3d(${x * d}px, ${y * d}px, 0)`;
      });
    });
    // spotlight on service cards
    $$('.card').forEach((c) => c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    }));
  }

  /* ---------- Projects carousel ---------- */
  const deck = $('#deck'), info = $('#projectInfo');
  let current = 0;
  const pad = (n) => String(n).padStart(2, '0');
  PROJECTS.forEach((p, i) => {
    const card = document.createElement('div');
    card.className = 'deck__card';
    card.style.background = p.bg;
    card.style.setProperty('--label', p.label);
    card.innerHTML = `<img src="${p.img}" alt="${p.name} logo" loading="lazy"><span>${p.name}</span>`;
    card.addEventListener('click', () => (i === current ? openCase() : go(i)));
    deck.append(card);
  });
  $('#projectTotal').textContent = pad(PROJECTS.length);
  $$(':scope > *', info).forEach((el, i) => el.style.setProperty('--i', i));

  function fill() {
    const p = PROJECTS[current];
    $('#projectKind').textContent = p.kind;
    $('#projectName').textContent = p.name;
    $('#projectSub').textContent = p.sub;
    $('#projectDesc').textContent = p.desc;
    $('#projectTags').innerHTML = p.tags.slice(0, 5).map((t) => `<li>${t}</li>`).join('') +
      (p.tags.length > 5 ? `<li>+${p.tags.length - 5} more</li>` : '');
    $('#projectMetric').textContent = p.metric;
    $('#projectMetricLabel').textContent = p.metricLabel;
    $('#projectIndex').textContent = pad(current + 1);
  }
  function layout() {
    const n = PROJECTS.length;
    $$('.deck__card', deck).forEach((c, i) => { c.dataset.pos = (i - current + n) % n; });
  }
  function go(i) {
    const n = PROJECTS.length, next = (i + n) % n;
    if (next === current) return;
    const leaving = deck.children[current];
    const forward = next === (current + 1) % n;
    current = next;
    if (forward && !reduced) {
      leaving.dataset.pos = -1; // top card slides away, then drops to the back
      setTimeout(layout, 380);
    } else layout();
    info.classList.add('is-swapping');
    setTimeout(() => { fill(); info.classList.remove('is-swapping'); if (caseDlg.open) fillCase(); }, reduced ? 0 : 220);
  }
  $('#prevProject').addEventListener('click', () => go(current - 1));
  $('#nextProject').addEventListener('click', () => go(current + 1));
  $('#showcase').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') go(current - 1);
    if (e.key === 'ArrowRight') go(current + 1);
  });
  // swipe
  let sx = null;
  deck.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  deck.addEventListener('touchend', (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 40) go(current + (dx < 0 ? 1 : -1));
  });

  /* ---------- Case study dialog ---------- */
  const caseDlg = $('#case');
  function fillCase() {
    const p = PROJECTS[current];
    $('#caseKind').textContent = p.kind;
    $('#caseStatus').textContent = 'Live link coming soon';
    $('#caseName').textContent = p.name;
    $('#caseImg').src = p.img;
    $('#caseImg').alt = `${p.name} logo`;
    $('#caseMedia').style.background = p.bg;
    $('#caseDesc').textContent = p.desc;
    $('#caseFeatures').innerHTML = p.tags.map((t) => `<li>${t}</li>`).join('');
  }
  function openCase() { fillCase(); caseDlg.showModal(); }
  $('#openCase').addEventListener('click', openCase);
  $('#caseClose').addEventListener('click', () => caseDlg.close());
  $('#casePrev').addEventListener('click', () => go(current - 1));
  $('#caseNext').addEventListener('click', () => go(current + 1));
  caseDlg.addEventListener('click', (e) => { if (e.target === caseDlg) caseDlg.close(); });

  layout(); fill();

  /* ---------- Reel: plays in place, never leaves the page ---------- */
  const player = $('#reelPlayer');
  $('#reelPlay').addEventListener('click', () => {
    const local = player.dataset.video; // set data-video="assets/video/reel.mp4" to self-host
    let media;
    if (local) {
      media = Object.assign(document.createElement('video'), { src: local, controls: true, autoplay: true, playsInline: true, loop: true });
    } else {
      media = document.createElement('iframe');
      media.src = `${player.dataset.embed}?autoplay=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=nXBdBgQvUWE`;
      media.title = 'AI video reel by Syed Abdul Kareem';
      media.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      media.allowFullscreen = true;
    }
    player.replaceChildren(media);
  });

  $('#year').textContent = new Date().getFullYear();

  /* ---------- Ambient canvas: starfield + golden cursor wisp ---------- */
  const canvas = $('#fx');
  if (!reduced && canvas.getContext) {
    const ctx = canvas.getContext('2d');
    let w, h, dpr, stars = [], wisp = [], running = true;
    const mouse = { x: -999, y: -999, px: -999, py: -999, active: false };

    const resize = () => {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = innerWidth; h = innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(140, Math.round(w * h / 11000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.1 + .2, z: Math.random() * .8 + .2,
        tw: Math.random() * Math.PI * 2, gold: Math.random() < .22,
      }));
    };
    resize();
    addEventListener('resize', resize);

    if (finePointer) {
      addEventListener('pointermove', (e) => {
        mouse.x = e.clientX; mouse.y = e.clientY;
        if (!mouse.active) { mouse.px = mouse.x; mouse.py = mouse.y; mouse.active = true; }
      }, { passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      running = !document.hidden;
      if (running) requestAnimationFrame(frame);
    });

    let t = 0;
    function frame() {
      if (!running) return;
      t += .016;
      const light = root.dataset.theme === 'light';
      ctx.clearRect(0, 0, w, h);

      // stars drift slowly upward and shift with scroll for depth
      const sy = scrollY;
      ctx.globalCompositeOperation = 'source-over';
      for (const s of stars) {
        s.y -= .05 * s.z;
        if (s.y < -4) s.y = h + 4;
        const y = ((s.y - sy * .08 * s.z) % h + h) % h;
        const a = (.35 + .65 * Math.abs(Math.sin(t * .8 + s.tw))) * (light ? .5 : .8) * s.z;
        ctx.fillStyle = s.gold
          ? (light ? `rgba(138,106,18,${a})` : `rgba(232,197,71,${a})`)
          : (light ? `rgba(40,32,8,${a * .7})` : `rgba(255,255,255,${a * .7})`);
        ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, 6.283); ctx.fill();
      }

      // wisp: soft gold embers trailing the cursor
      if (mouse.active) {
        const dx = mouse.x - mouse.px, dy = mouse.y - mouse.py;
        const speed = Math.hypot(dx, dy);
        const n = speed < .6 ? 0 : Math.min(4, 1 + (speed / 12 | 0));
        for (let i = 0; i < n && wisp.length < 160; i++) {
          const k = i / n;
          wisp.push({
            x: mouse.px + dx * k, y: mouse.py + dy * k,
            vx: dx * .04 + (Math.random() - .5) * .6, vy: dy * .04 + (Math.random() - .5) * .6 - .15,
            life: 1, r: 16 + Math.random() * 22 + Math.min(speed, 40) * .4,
          });
        }
        mouse.px += dx * .35; mouse.py += dy * .35;
      }
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      for (let i = wisp.length - 1; i >= 0; i--) {
        const p = wisp[i];
        p.life -= .022; p.x += p.vx; p.y += p.vy; p.vx *= .96; p.vy *= .96;
        if (p.life <= 0) { wisp.splice(i, 1); continue; }
        const r = p.r * (1.3 - p.life * .5), a = p.life * p.life * (light ? .1 : .13);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, `rgba(255,205,80,${a})`);
        g.addColorStop(.45, `rgba(212,150,30,${a * .5})`);
        g.addColorStop(1, 'rgba(212,150,30,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283); ctx.fill();
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }
})();
