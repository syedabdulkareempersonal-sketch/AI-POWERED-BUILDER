(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const root = document.documentElement;

  /* ---------- Projects (add a live URL to `url` when one is ready) ---------- */
  const PROJECTS = [
    {
      name: 'WaqtOS',
      kind: 'Personal Operating System',
      logo: 'assets/img/waqtos-logo.webp', plate: '#ffffff', brand: '#0f7a5c',
      desc: 'A Salah-centered personal operating system. It brings worship, time management, tasks, schedules and daily responsibilities into one place, so Muslims can live a more organized, balanced and purposeful life.',
      tags: ['Salah-centered', 'Time management', 'Tasks and schedules', 'Daily responsibilities'],
      url: '',
    },
    {
      name: 'HOOR-E-AIN',
      kind: 'App with AI Companion',
      logo: 'assets/img/hoor-e-ain-logo.webp', plate: '#000000', brand: '#d0202a',
      desc: 'A lifetime wellness, family and love companion. It organizes daily routines, tracks health and habits, supports spiritual and personal growth, keeps a private journal, and includes HOOR AI for everyday questions and support.',
      tags: ['Daily routines', 'Health and habits', 'Spiritual and personal growth', 'Private journal', 'HOOR AI'],
      url: '',
    },
    {
      name: 'CricApex',
      kind: 'Sports App',
      logo: 'assets/img/cricapex-logo.webp', plate: '#ffffff', brand: '#1f6bff',
      desc: 'A full cricket scoring and tournament platform: ball-by-ball live scoring, digital scorecards and player statistics, plus league and knockout tournaments with automatic fixtures, a points table and Net Run Rate. Also includes live match following, live broadcasting support, and player and team records.',
      tags: ['Ball-by-ball live scoring', 'Digital scorecards', 'Player statistics', 'League & knockout tournaments', 'Automatic fixtures', 'Points table & Net Run Rate', 'Live match following', 'Live broadcasting support', 'Player & team records'],
      url: '',
    },
    {
      name: 'Kadapa Cars',
      kind: 'Website',
      logo: 'assets/img/kadapa-cars-logo.webp', plate: '#ffffff', brand: '#2557d6',
      desc: 'A website I built with AI.',
      tags: ['Website', 'Built with AI'],
      url: '',
    },
  ];

  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- Render project cards ---------- */
  const grid = $('#projects');
  grid.innerHTML = PROJECTS.map((p, i) => `
    <article class="proj reveal" style="--brand:${p.brand};--plate:${p.plate}" data-i="${i}" tabindex="0" role="button" aria-label="Open the ${esc(p.name)} case study">
      <div class="proj__stage">
        <span class="proj__idx">${pad(i + 1)}</span>
        <span class="proj__tag">${p.url ? 'Live' : 'Built with AI'}</span>
        <div class="proj__plate"><img src="${p.logo}" alt="${esc(p.name)} logo" loading="lazy"></div>
      </div>
      <div class="proj__body">
        <p class="proj__kind">${esc(p.kind)}</p>
        <h3 class="proj__name">${esc(p.name)}</h3>
        <p class="proj__desc">${esc(p.desc)}</p>
        <ul class="chips">${p.tags.slice(0, 4).map((t) => `<li>${esc(t)}</li>`).join('')}${p.tags.length > 4 ? `<li>+${p.tags.length - 4} more</li>` : ''}</ul>
        <span class="proj__more">Case study <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </div>
    </article>`).join('');

  /* ---------- Case study dialog ---------- */
  const caseDlg = $('#case');
  let current = 0;
  function fillCase() {
    const p = PROJECTS[current];
    $('#casePlate').style.setProperty('--plate', p.plate);
    $('#caseImg').src = p.logo;
    $('#caseImg').alt = `${p.name} logo`;
    $('#caseKind').textContent = p.kind;
    $('#caseName').textContent = p.name;
    $('#caseStatus').innerHTML = p.url ? `<a href="${p.url}" target="_blank" rel="noopener">Visit live ↗</a>` : 'Built with AI · live link coming soon';
    $('#caseDesc').textContent = p.desc;
    $('#caseFeatures').innerHTML = p.tags.map((t) => `<li>${esc(t)}</li>`).join('');
    $('#caseCount').textContent = `${pad(current + 1)} / ${pad(PROJECTS.length)}`;
  }
  function openCase(i) {
    current = i; fillCase();
    if (typeof caseDlg.showModal === 'function') caseDlg.showModal(); else caseDlg.setAttribute('open', '');
  }
  const step = (d) => { current = (current + d + PROJECTS.length) % PROJECTS.length; fillCase(); };
  grid.addEventListener('click', (e) => { const c = e.target.closest('.proj'); if (c) openCase(+c.dataset.i); });
  grid.addEventListener('keydown', (e) => {
    const c = e.target.closest('.proj');
    if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCase(+c.dataset.i); }
  });
  $('#caseClose').addEventListener('click', () => caseDlg.close());
  $('#casePrev').addEventListener('click', () => step(-1));
  $('#caseNext').addEventListener('click', () => step(1));
  caseDlg.addEventListener('click', (e) => { if (e.target === caseDlg) caseDlg.close(); });
  caseDlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); });

  /* ---------- Boot screen ---------- */
  const preloader = $('#preloader');
  const ready = () => {
    if (window.__siteReady) return;
    window.__siteReady = true;
    document.body.classList.remove('is-loading');
    preloader.classList.add('is-done');
    dispatchEvent(new Event('site:ready'));
    $$('.hero [data-count]').forEach(countUp);
  };
  if (reduced) {
    ready();
  } else {
    document.body.classList.add('is-loading');
    const bar = $('#preloaderBar'), pct = $('#preloaderPct'), log = $('#preloaderLog');
    const LOGS = ['Booting AI systems', 'Loading models', 'Assembling robot', 'Ready'];
    const t0 = performance.now(), DUR = 1600;
    let loaded = document.readyState === 'complete';
    addEventListener('load', () => { loaded = true; });
    const tick = (now) => {
      let p = Math.min((now - t0) / DUR, 1);
      p = 1 - Math.pow(1 - p, 3);
      if (!loaded && now - t0 < 4500) p = Math.min(p, .9);
      bar.style.transform = `scaleX(${p})`;
      pct.textContent = Math.round(p * 100);
      log.textContent = LOGS[Math.min(LOGS.length - 1, Math.floor(p * (LOGS.length - 1) + .02))];
      if (p < 1) requestAnimationFrame(tick); else setTimeout(ready, 220);
    };
    requestAnimationFrame(tick);
    setTimeout(ready, 6500);
  }

  /* ---------- Theme ---------- */
  $('#themeToggle').addEventListener('click', () => {
    const next = root.dataset.theme === 'light' ? 'dark' : 'light';
    root.dataset.theme = next;
    $('meta[name="theme-color"]').content = next === 'light' ? '#f4f1ea' : '#09090a';
    try { localStorage.setItem('theme', next); } catch (e) { /* storage unavailable */ }
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

  /* ---------- Scroll progress + hide nav on scroll down ---------- */
  const progress = $('#progressBar'), nav = $('#nav');
  let lastY = scrollY, ticking = false;
  const onScroll = () => {
    const y = scrollY, max = root.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    if (!navLinks.classList.contains('is-open')) {
      if (y > 600 && y > lastY + 6) nav.classList.add('is-hidden');
      else if (y < lastY - 6 || y < 600) nav.classList.remove('is-hidden');
    }
    lastY = y; ticking = false;
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  /* ---------- Reveal on scroll ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      revealIO.unobserve(en.target);
    });
  }, { threshold: .12, rootMargin: '0px 0px -5% 0px' });
  $$('.reveal').forEach((el) => {
    const sibs = $$(':scope > .reveal', el.parentElement);
    el.style.setProperty('--d', `${Math.min(Math.max(sibs.indexOf(el), 0), 5) * 0.07}s`);
    revealIO.observe(el);
  });

  function countUp(el) {
    const target = +el.dataset.count;
    if (reduced || el.dataset.done) return;
    el.dataset.done = '1';
    const comma = el.dataset.format === 'comma';
    const from = target > 1000 && !comma ? target - 30 : 0;
    const t0 = performance.now(), dur = 1500;
    const tick = (now) => {
      const p = Math.min((now - t0) / dur, 1), e = 1 - Math.pow(1 - p, 4);
      const v = Math.round(from + (target - from) * e);
      el.textContent = comma ? v.toLocaleString('en-US') : v;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
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

  /* ---------- Stack strip: duplicate for a seamless loop ---------- */
  const strip = $('#strip');
  strip.innerHTML = strip.innerHTML.repeat(4);
  $$('span, i', strip).forEach((el, i) => { if (i >= 12) el.setAttribute('aria-hidden', 'true'); });

  /* ---------- Pointer effects ---------- */
  if (finePointer && !reduced) {
    $$('.svc').forEach((c) => c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      c.style.setProperty('--mx', `${e.clientX - r.left}px`);
      c.style.setProperty('--my', `${e.clientY - r.top}px`);
    }));
    $$('.proj').forEach((c) => {
      c.addEventListener('pointermove', (e) => {
        const r = c.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.style.transform = `perspective(1000px) rotateX(${-y * 4}deg) rotateY(${x * 5}deg) translateY(-4px)`;
      });
      c.addEventListener('pointerleave', () => { c.style.transform = ''; });
    });
  }

  /* ---------- Reel: plays in place, never leaves the page ---------- */
  const player = $('#reelPlayer');
  $('#reelPlay').addEventListener('click', () => {
    const local = player.dataset.video; // set data-video="assets/video/reel.mp4" to self-host
    let media;
    if (local) {
      media = Object.assign(document.createElement('video'), { src: local, controls: true, autoplay: true, playsInline: true, loop: true });
    } else {
      media = document.createElement('iframe');
      media.src = `${player.dataset.embed}?autoplay=1&playsinline=1&rel=0&modestbranding=1&loop=1&playlist=${player.dataset.id}`;
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
    let w, h, stars = [], wisp = [], running = true;
    const mouse = { x: 0, y: 0, px: 0, py: 0, active: false };
    const resize = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      w = innerWidth; h = innerHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(120, Math.round(w * h / 13000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() * 1.1 + .2,
        z: Math.random() * .8 + .2, tw: Math.random() * Math.PI * 2, gold: Math.random() < .22,
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
    document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) requestAnimationFrame(frame); });

    let t = 0;
    function frame() {
      if (!running) return;
      t += .016;
      const light = root.dataset.theme === 'light';
      ctx.clearRect(0, 0, w, h);
      const sy = scrollY;
      ctx.globalCompositeOperation = 'source-over';
      for (const s of stars) {
        s.y -= .05 * s.z;
        if (s.y < -4) s.y = h + 4;
        const y = ((s.y - sy * .08 * s.z) % h + h) % h;
        const a = (.35 + .65 * Math.abs(Math.sin(t * .8 + s.tw))) * (light ? .45 : .75) * s.z;
        ctx.fillStyle = s.gold ? (light ? `rgba(143,108,16,${a})` : `rgba(232,197,90,${a})`) : (light ? `rgba(40,32,8,${a * .6})` : `rgba(255,255,255,${a * .65})`);
        ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, 6.283); ctx.fill();
      }
      if (mouse.active) {
        const dx = mouse.x - mouse.px, dy = mouse.y - mouse.py, speed = Math.hypot(dx, dy);
        const n = speed < .6 ? 0 : Math.min(4, 1 + (speed / 12 | 0));
        for (let i = 0; i < n && wisp.length < 160; i++) {
          const k = i / n;
          wisp.push({ x: mouse.px + dx * k, y: mouse.py + dy * k, vx: dx * .04 + (Math.random() - .5) * .6, vy: dy * .04 + (Math.random() - .5) * .6 - .15, life: 1, r: 14 + Math.random() * 20 + Math.min(speed, 40) * .4 });
        }
        mouse.px += dx * .35; mouse.py += dy * .35;
      }
      ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
      for (let i = wisp.length - 1; i >= 0; i--) {
        const p = wisp[i];
        p.life -= .024; p.x += p.vx; p.y += p.vy; p.vx *= .96; p.vy *= .96;
        if (p.life <= 0) { wisp.splice(i, 1); continue; }
        const r = p.r * (1.3 - p.life * .5), a = p.life * p.life * (light ? .09 : .12);
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
