(function () {
  if (document.getElementById('__naukri_scraper__')) {
    document.getElementById('__naukri_scraper__').remove();
  }

  /* ─── In-memory store (no DB — matches linkedin.js pattern) ── */
  let globalExtractedData = [];

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /* ─── Experience expander ───────────────────────────────── */
  /* "5-10 Yrs" → [5,6,7,8,9,10]   "3 Yrs" → [3]            */
  function expandExperience(raw) {
    if (!raw) return [];
    const range = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
    if (range) {
      const lo = parseInt(range[1]);
      const hi = parseInt(range[2]);
      if (lo <= hi && hi - lo <= 60)
        return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
    }
    const single = raw.match(/(\d+)/);
    return single ? [parseInt(single[1])] : [];
  }

  /* ─── Tile helpers ──────────────────────────────────────── */
  function getTiles() {
    return Array.from(
      document.querySelectorAll('div[class*="min-h"][class*="cursor-pointer"][class*="rounded-3xl"]')
    );
  }

  function iconText(tile, altKeyword) {
    for (const img of tile.querySelectorAll('li img[alt]')) {
      if (img.alt.toLowerCase().includes(altKeyword)) {
        const spans = img.closest('li').querySelectorAll('span');
        for (let i = spans.length - 1; i >= 0; i--) {
          const t = spans[i].textContent.trim();
          if (t) return t;
        }
      }
    }
    return '';
  }

  /* ─── Click-intercept URL capture ──────────────────────────
     Naukri tiles are plain divs with JS click handlers — no <a>.
     We temporarily hijack window.open + history.pushState so the
     navigation is caught when we click the tile, giving us the
     full URL without the page actually navigating away.           */

  const NAUKRI_ID_RE = /-(\d{10,13})(?=[?#]|$)/;

  function extractNaukriId(url) {
    if (!url) return null;
    const m = url.match(NAUKRI_ID_RE);
    return m ? m[1] : null;
  }

  function captureUrlFromClick(tile) {
    return new Promise((resolve) => {
      let done = false;

      const finish = (rawUrl) => {
        if (done) return;
        done = true;
        window.open          = _open;
        history.pushState    = _push;
        history.replaceState = _replace;
        clearTimeout(timer);
        if (!rawUrl) { resolve({ url: '', naukriJobId: null }); return; }
        const url         = rawUrl.startsWith('http') ? rawUrl : window.location.origin + rawUrl;
        const naukriJobId = extractNaukriId(url);
        resolve({ url, naukriJobId });
      };

      const _open    = window.open;
      const _push    = history.pushState;
      const _replace = history.replaceState;

      /* Intercept new-tab open */
      window.open = (url) => {
        finish(url);
        return { focus() {}, closed: false };
      };

      /* Intercept SPA / Next.js router — do NOT call original so page URL stays put */
      history.pushState    = (state, title, url) => { finish(url); };
      history.replaceState = (state, title, url) => { finish(url); };

      /* Shortened fallback timeout (was 900ms) — genuine navigations fire the
         hijacked pushState/window.open synchronously on click, so this only
         matters for tiles that don't navigate at all. Cutting it speeds up
         extraction on pages with many non-navigating tiles. */
      const timer = setTimeout(() => finish(null), 400);

      tile.click();
    });
  }

  /* ─── Per-tile scrape (no jobMatchScore) ────────────────── */
  function scrapeTile(tile) {
    /* url and naukriJobId are injected by the extract loop after click-capture */
    let url         = '';
    let naukriJobId = null;

    /* ── Left panel ── */
    const hiringTitle = (() => {
      const el = tile.querySelector('div[class*="line-clamp-1"]');
      return el ? el.textContent.trim() : '';
    })();

    const recruitingAgency = (() => {
      for (const p of tile.querySelectorAll('p')) {
        const t = p.textContent.trim();
        if (t.toLowerCase().startsWith('posted by'))
          return t.replace(/^posted by\s*/i, '').trim();
      }
      return '';
    })();

    const postedTime = (() => {
      for (const p of tile.querySelectorAll('p[class*="text-body12R"]')) {
        const t = (p.childNodes[0]?.textContent || '').trim();
        if (t) return t;
      }
      for (const p of tile.querySelectorAll('p')) {
        const t = p.textContent.trim();
        if (/ago|just now|\d+d|\d+h/i.test(t))
          return t.replace(/quick apply/i, '').trim();
      }
      return '';
    })();

    const hasQuickApply = /quick apply/i.test(tile.textContent);

    /* ── Right panel ── */
    const jobTitle = (() => {
      for (const el of tile.querySelectorAll('div[class*="text-n100"]')) {
        const t = el.textContent.trim();
        if (t) return t;
      }
      return '';
    })();

    const location      = iconText(tile, 'location');
    const salary        = iconText(tile, 'salary');
    const skillsRaw     = iconText(tile, 'skills');
    const skills        = skillsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const experienceRaw = iconText(tile, 'experience');
    const experience    = expandExperience(experienceRaw);

    const recruiterNote = (() => {
      const el = tile.querySelector('div[class*="italic"]');
      return el ? el.textContent.trim() : '';
    })();

    /* ── ID: prefer Naukri's own job ID; fallback to composite key ── */
    const id = naukriJobId
      ? naukriJobId
      : `${jobTitle}||${recruitingAgency}||${location}`.slice(0, 250).replace(/[^\w|@.\- ]/g, '_');

    return {
      id,
      naukriJobId,
      url,
      jobTitle,
      hiringTitle,
      recruitingAgency,
      location,
      salary,
      skills,
      experienceRaw,
      experience,
      hasQuickApply,
      postedTime,
      recruiterNote,
      scrapedAt:   new Date().toISOString(),
      scrapedDate: new Date().toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    };
  }

  /* ─── Extract all currently-loaded tiles ────────────────── */
  async function extractData(onProgress) {
    const tiles = getTiles();
    let newCount = 0, dupCount = 0;

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      try {
        const { url, naukriJobId } = await captureUrlFromClick(tile);
        const job = scrapeTile(tile);
        job.url         = url;
        job.naukriJobId = naukriJobId;
        job.id          = naukriJobId || job.id;

        if (!job.jobTitle && !job.hiringTitle) continue;

        const isDuplicate = globalExtractedData.some(d => d.id === job.id);
        if (!isDuplicate) {
          globalExtractedData.push(job);
          newCount++;
        } else {
          dupCount++;
        }
      } catch (err) {
        console.error('Scrape error:', err);
      }
      if (onProgress) onProgress(i + 1, tiles.length, newCount, dupCount);
    }

    return { newCount, dupCount, total: tiles.length };
  }

  /* ─── Panel UI ───────────────────────────────────────────── */
  const panel = document.createElement('div');
  panel.id = '__naukri_scraper__';
  panel.style.cssText = [
    'position:fixed',
    'top:70px',
    'right:24px',
    'z-index:2147483647',
    'width:340px',
    'background:#0d1117',
    'color:#c9d1d9',
    'border-radius:12px',
    'box-shadow:0 12px 40px rgba(0,0,0,0.65)',
    'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
    'font-size:12px',
    'border:1px solid #30363d',
    'overflow:hidden',
    'user-select:none',
  ].join(';');

  panel.innerHTML = `
    <div id="__ns_drag__" style="background:#161b22;padding:10px 14px;cursor:grab;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #30363d;">
      <div>
        <span style="font-weight:700;font-size:13px;color:#58a6ff;letter-spacing:.5px;">◈ NAUKRI SCRAPER</span>
        <div style="font-size:9px;color:#484f58;margin-top:1px;">continuous scroll · in-memory · JSON export</div>
      </div>
      <button id="__ns_close__" style="background:none;border:none;color:#8b949e;cursor:pointer;font-size:16px;padding:0;line-height:1;">✕</button>
    </div>

    <div style="padding:12px 14px;border-bottom:1px solid #21262d;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="color:#8b949e;font-size:11px;white-space:nowrap;">Scroll speed</span>
        <input id="__ns_speed__" type="range" min="1" max="20" value="8"
          style="flex:1;accent-color:#58a6ff;height:4px;cursor:pointer;background:#21262d;border-radius:2px;outline:none;border:none;appearance:none;-webkit-appearance:none;">
        <span id="__ns_speed_val__" style="color:#58a6ff;min-width:18px;text-align:right;">8</span>
      </div>
      <div style="display:flex;gap:7px;">
        <button id="__ns_scroll__"   style="flex:1;padding:7px 4px;background:#1f4e79;color:#cae8ff;border:1px solid #388bfd55;border-radius:7px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;">▶ Scroll</button>
        <button id="__ns_scrape__"   style="flex:1;padding:7px 4px;background:#1a4a2e;color:#aff5b4;border:1px solid #3fb95055;border-radius:7px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;">⬡ Extract</button>
        <button id="__ns_download__" style="flex:1;padding:7px 4px;background:#3b1f6e;color:#d2a8ff;border:1px solid #8957e555;border-radius:7px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;">↓ Export</button>
      </div>
    </div>

    <div style="padding:8px 14px;border-bottom:1px solid #21262d;display:flex;gap:0;font-size:11px;">
      <div style="flex:1;text-align:center;border-right:1px solid #21262d;">
        <div style="color:#8b949e;">Tiles</div>
        <div id="__ns_s_tiles__" style="font-size:15px;font-weight:700;color:#e6edf3;">0</div>
      </div>
      <div style="flex:1;text-align:center;border-right:1px solid #21262d;">
        <div style="color:#8b949e;">Extracted</div>
        <div id="__ns_s_saved__" style="font-size:15px;font-weight:700;color:#3fb950;">0</div>
      </div>
      <div style="flex:1;text-align:center;">
        <div style="color:#8b949e;">Dupes skipped</div>
        <div id="__ns_s_skipped__" style="font-size:15px;font-weight:700;color:#d29922;">0</div>
      </div>
    </div>

    <div id="__ns_log__" style="padding:8px 14px;height:170px;overflow-y:auto;background:#010409;color:#8b949e;line-height:1.55;font-size:11px;"></div>
  `;

  document.body.appendChild(panel);

  /* ─── Drag ──────────────────────────────────────────────── */
  const handle = document.getElementById('__ns_drag__');
  let ox = 0, oy = 0;
  handle.addEventListener('mousedown', e => {
    ox = e.clientX - panel.getBoundingClientRect().left;
    oy = e.clientY - panel.getBoundingClientRect().top;
    handle.style.cursor = 'grabbing';
    const move = ev => {
      panel.style.left  = (ev.clientX - ox) + 'px';
      panel.style.top   = (ev.clientY - oy) + 'px';
      panel.style.right = 'auto';
    };
    const up = () => {
      handle.style.cursor = 'grab';
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  });

  document.getElementById('__ns_close__').onclick = () => panel.remove();

  /* ─── Logger ────────────────────────────────────────────── */
  const logEl = document.getElementById('__ns_log__');
  const LEVEL_COLORS = {
    info:    '#8b949e',
    success: '#3fb950',
    warn:    '#d29922',
    error:   '#f85149',
    dim:     '#484f58',
  };
  function log(msg, level = 'info') {
    const t    = new Date().toLocaleTimeString('en-IN', { hour12: false });
    const line = document.createElement('div');
    line.style.color         = LEVEL_COLORS[level] || LEVEL_COLORS.info;
    line.style.paddingBottom = '1px';
    line.innerHTML = `<span style="color:#484f58">${t}</span> ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  /* ─── Speed slider ──────────────────────────────────────── */
  const speedSlider = document.getElementById('__ns_speed__');
  const speedVal     = document.getElementById('__ns_speed_val__');
  speedSlider.oninput = () => { speedVal.textContent = speedSlider.value; };

  /* ─── Stat helpers ──────────────────────────────────────── */
  function setStat(id, val) { document.getElementById(id).textContent = val; }
  function incStat(id, n = 1) {
    const el = document.getElementById(id);
    el.textContent = parseInt(el.textContent || '0') + n;
  }

  /* ─── Continuous, optimized scroll ──────────────────────────
     Uses requestAnimationFrame instead of setInterval so it's
     synced to the actual display refresh rate rather than a fixed
     16ms timer (which drifts and competes with other JS on the
     page). The tile-count stat — which used to re-query the whole
     DOM on every single tick, ~60x/sec — is now only refreshed a
     couple of times a second, which is the main reason the old
     version felt sluggish. Auto-stops at the bottom of the page. */
  let scrolling      = false;
  let rafId          = null;
  let lastStatUpdate = 0;
  let bottomSince     = null;   // timestamp we first noticed we were at the bottom
  const BOTTOM_GRACE_MS = 5000; // wait this long for slow-loading content before giving up
  const scrollBtn    = document.getElementById('__ns_scroll__');

  function scrollTick(timestamp) {
    if (!scrolling) return;

    const speed      = parseInt(speedSlider.value, 10); // 1–20
    const pxPerFrame = speed * 15;                       // tune for "very fast"
    window.scrollBy(0, pxPerFrame);

    if (timestamp - lastStatUpdate > 400) {
      setStat('__ns_s_tiles__', getTiles().length);
      lastStatUpdate = timestamp;
    }

    const atBottom = (window.innerHeight + window.scrollY) >= (document.body.scrollHeight - 4);

    if (atBottom) {
      if (bottomSince === null) {
        bottomSince = timestamp;
        log('Hit bottom — waiting up to 5s for more content to load…', 'dim');
      } else if (timestamp - bottomSince >= BOTTOM_GRACE_MS) {
        stopScroll();
        log('Still at bottom after 5s — scroll auto-stopped.', 'warn');
        return;
      }
      // still within the grace window: keep the loop alive so we can
      // notice if scrollHeight grows (new tiles arriving), but don't
      // keep issuing scrollBy since we're already maxed out.
    } else {
      if (bottomSince !== null) {
        log('New content loaded — resuming scroll.', 'dim');
      }
      bottomSince = null;
    }

    rafId = requestAnimationFrame(scrollTick);
  }

  function startScroll() {
    scrolling      = true;
    lastStatUpdate = 0;
    bottomSince    = null;
    scrollBtn.textContent      = '⏹ Stop';
    scrollBtn.style.background = '#6e1b1b';
    log('Auto-scroll started…', 'info');
    rafId = requestAnimationFrame(scrollTick);
  }

  function stopScroll() {
    scrolling = false;
    if (rafId) cancelAnimationFrame(rafId);
    scrollBtn.textContent      = '▶ Scroll';
    scrollBtn.style.background = '#1f4e79';
  }

  scrollBtn.onclick = () => {
    if (scrolling) {
      stopScroll();
      log('Scroll stopped.', 'warn');
    } else {
      startScroll();
    }
  };

  /* ─── Extract ────────────────────────────────────────────── */
  document.getElementById('__ns_scrape__').onclick = async () => {
    const scrapeBtn = document.getElementById('__ns_scrape__');
    scrapeBtn.disabled = true;

    const tiles = getTiles();
    setStat('__ns_s_tiles__', tiles.length);
    log(`Found <strong>${tiles.length}</strong> tile(s). Extracting…`, 'info');

    const { newCount, dupCount } = await extractData((done, total) => {
      scrapeBtn.textContent = `⬡ ${done}/${total}`;
    });

    incStat('__ns_s_saved__',   newCount);
    incStat('__ns_s_skipped__', dupCount);
    log(`── Done ── extracted: ${newCount} | duplicates: ${dupCount}`, 'success');

    scrapeBtn.textContent = '⬡ Extract';
    scrapeBtn.disabled = false;
  };

  /* ─── Export ─────────────────────────────────────────────── */
  document.getElementById('__ns_download__').onclick = () => {
    if (globalExtractedData.length === 0) {
      log('No data extracted yet — click Extract first.', 'warn');
      return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(globalExtractedData, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `naukri_jobs_${Date.now()}.json`);
    dlAnchor.click();
    log(`✓ Exported ${globalExtractedData.length} record(s) as JSON.`, 'success');
  };

  /* ─── Init ───────────────────────────────────────────────── */
  log('Ready ✓ — no DB, all data kept in memory until you export.', 'success');
  setStat('__ns_s_tiles__', getTiles().length);

})();
