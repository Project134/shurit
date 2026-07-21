(function () {
  if (document.getElementById('__naukri_scraper__')) {
    document.getElementById('__naukri_scraper__').remove();
  }

  /* ─── IndexedDB ─────────────────────────────────────────── */
  const DB_NAME    = 'NaukriJobsDB';
  const STORE_NAME = 'jobs';
  const DB_VERSION = 1;

  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('jobTitle',      'jobTitle',      { unique: false });
          store.createIndex('naukriJobId',   'naukriJobId',   { unique: false });
          store.createIndex('jobMatchScore', 'jobMatchScore', { unique: false });
          store.createIndex('scrapedAt',     'scrapedAt',     { unique: false });
        }
      };
      req.onsuccess = e => res(e.target.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  function saveJob(db, job) {
    return new Promise((res, rej) => {
      const tx    = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const get   = store.get(job.id);
      get.onsuccess = () => {
        if (get.result) {
          res({ saved: false });
        } else {
          const put = store.put(job);
          put.onsuccess = () => res({ saved: true });
          put.onerror   = e => rej(e.target.error);
        }
      };
      get.onerror = e => rej(e.target.error);
    });
  }

  function getAllJobs(db) {
    return new Promise((res, rej) => {
      const tx  = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).getAll();
      req.onsuccess = () => res(req.result);
      req.onerror   = e => rej(e.target.error);
    });
  }

  function deleteDB() {
    return new Promise((res, rej) => {
      /* Must close any open connection first */
      if (db) { db.close(); db = null; }
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => res();
      req.onerror   = e => rej(e.target.error);
      req.onblocked = () => rej(new Error('DB delete blocked — close other tabs using this DB'));
    });
  }

  /* ─── Keyword match dictionary ──────────────────────────── */
  /* Edit weights here whenever needed.                        */
  const MATCH_KEYWORDS = {
    data:       1,
    analytics:  3,
    product:    3,
    commercial: 8,
    reporting: 5
  };

  function calcMatchScore(skills) {
    if (!skills || !skills.length) return 0;
    const text  = skills.join(' ').toLowerCase();
    let   score = 0;
    for (const [kw, pts] of Object.entries(MATCH_KEYWORDS)) {
      /* Count EVERY occurrence (global flag) */
      const hits = text.match(new RegExp(kw, 'gi'));
      if (hits) score += hits.length * pts;
    }
    return score;
  }

  /* ─── Experience expander ───────────────────────────────── */
  /* "5-10 Yrs" → [5,6,7,8,9,10]   "3 Yrs" → [3]            */
  function expandExperience(raw) {
    if (!raw) return [];
    const range  = raw.match(/(\d+)\s*[-–]\s*(\d+)/);
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

      /* 900 ms timeout fallback */
      const timer = setTimeout(() => finish(null), 900);

      tile.click();
    });
  }

  /* ─── Main scrape function ──────────────────────────────── */
  function scrapeTile(tile) {
    /* url and naukriJobId are injected by the scrape loop after click-capture */
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

    const location        = iconText(tile, 'location');
    const salary          = iconText(tile, 'salary');
    const skillsRaw       = iconText(tile, 'skills');
    const skills          = skillsRaw.split(',').map(s => s.trim()).filter(Boolean);
    const experienceRaw   = iconText(tile, 'experience');
    const experience      = expandExperience(experienceRaw);
    const jobMatchScore   = calcMatchScore(skills);

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
      jobMatchScore,
      hasQuickApply,
      postedTime,
      recruiterNote,
      scrapedAt:   new Date().toISOString(),
      scrapedDate: new Date().toLocaleDateString('en-IN', { year: 'numeric', month: '2-digit', day: '2-digit' }),
    };
  }

  /* ─── Panel HTML ────────────────────────────────────────── */
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

  /* Build keyword legend for the header tooltip */
  const kwLegend = Object.entries(MATCH_KEYWORDS)
    .map(([k, v]) => `${k}×${v}`)
    .join(' · ');

  panel.innerHTML = `
    <div id="__ns_drag__" style="background:#161b22;padding:10px 14px;cursor:grab;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #30363d;">
      <div>
        <span style="font-weight:700;font-size:13px;color:#58a6ff;letter-spacing:.5px;">◈ NAUKRI SCRAPER</span>
        <div style="font-size:9px;color:#484f58;margin-top:1px;">match: ${kwLegend}</div>
      </div>
      <button id="__ns_close__" style="background:none;border:none;color:#8b949e;cursor:pointer;font-size:16px;padding:0;line-height:1;">✕</button>
    </div>

    <div style="padding:12px 14px;border-bottom:1px solid #21262d;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
        <span style="color:#8b949e;font-size:11px;white-space:nowrap;">Scroll speed</span>
        <input id="__ns_speed__" type="range" min="1" max="10" value="3"
          style="flex:1;accent-color:#58a6ff;height:4px;cursor:pointer;background:#21262d;border-radius:2px;outline:none;border:none;appearance:none;-webkit-appearance:none;">
        <span id="__ns_speed_val__" style="color:#58a6ff;min-width:14px;text-align:right;">3</span>
      </div>
      <div style="display:flex;gap:7px;margin-bottom:7px;">
        <button id="__ns_scroll__"   style="flex:1;padding:7px 4px;background:#1f4e79;color:#cae8ff;border:1px solid #388bfd55;border-radius:7px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;">▶ Scroll</button>
        <button id="__ns_scrape__"   style="flex:1;padding:7px 4px;background:#1a4a2e;color:#aff5b4;border:1px solid #3fb95055;border-radius:7px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;">⬡ Scrape</button>
        <button id="__ns_download__" style="flex:1;padding:7px 4px;background:#3b1f6e;color:#d2a8ff;border:1px solid #8957e555;border-radius:7px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;">↓ Export</button>
      </div>
      <button id="__ns_deletedb__" style="width:100%;padding:6px 4px;background:#1a0a0a;color:#f85149;border:1px solid #f8514940;border-radius:7px;cursor:pointer;font-family:inherit;font-size:11px;font-weight:600;letter-spacing:.3px;">⚠ Delete entire DB</button>
    </div>

    <div style="padding:8px 14px;border-bottom:1px solid #21262d;display:flex;gap:0;font-size:11px;">
      <div style="flex:1;text-align:center;border-right:1px solid #21262d;">
        <div style="color:#8b949e;">Tiles</div>
        <div id="__ns_s_tiles__"   style="font-size:15px;font-weight:700;color:#e6edf3;">0</div>
      </div>
      <div style="flex:1;text-align:center;border-right:1px solid #21262d;">
        <div style="color:#8b949e;">Saved</div>
        <div id="__ns_s_saved__"   style="font-size:15px;font-weight:700;color:#3fb950;">0</div>
      </div>
      <div style="flex:1;text-align:center;border-right:1px solid #21262d;">
        <div style="color:#8b949e;">Skipped</div>
        <div id="__ns_s_skipped__" style="font-size:15px;font-weight:700;color:#d29922;">0</div>
      </div>
      <div style="flex:1;text-align:center;">
        <div style="color:#8b949e;">In DB</div>
        <div id="__ns_s_db__"      style="font-size:15px;font-weight:700;color:#58a6ff;">0</div>
      </div>
    </div>

    <div id="__ns_log__" style="padding:8px 14px;height:170px;overflow-y:auto;background:#010409;color:#8b949e;line-height:1.55;font-size:11px;"></div>
    <div style="padding:5px 14px;background:#0d1117;border-top:1px solid #21262d;text-align:right;font-size:10px;color:#484f58;">IndexedDB: ${DB_NAME} / ${STORE_NAME}</div>
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
    line.style.color        = LEVEL_COLORS[level] || LEVEL_COLORS.info;
    line.style.paddingBottom = '1px';
    line.innerHTML = `<span style="color:#484f58">${t}</span> ${msg}`;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  /* ─── Speed slider ──────────────────────────────────────── */
  const speedSlider = document.getElementById('__ns_speed__');
  const speedVal    = document.getElementById('__ns_speed_val__');
  speedSlider.oninput = () => { speedVal.textContent = speedSlider.value; };

  /* ─── Stat helpers ──────────────────────────────────────── */
  function setStat(id, val) { document.getElementById(id).textContent = val; }
  function incStat(id, n = 1) {
    const el = document.getElementById(id);
    el.textContent = parseInt(el.textContent || '0') + n;
  }

  async function refreshDBCount() {
    if (!db) return;
    setStat('__ns_s_db__', (await getAllJobs(db)).length);
  }

  /* ─── Scroll ────────────────────────────────────────────── */
  let scrollTimer = null;
  let scrolling   = false;
  const scrollBtn = document.getElementById('__ns_scroll__');

  scrollBtn.onclick = () => {
    if (scrolling) {
      clearInterval(scrollTimer);
      scrolling = false;
      scrollBtn.textContent       = '▶ Scroll';
      scrollBtn.style.background  = '#1f4e79';
      log('Scroll stopped.', 'warn');
    } else {
      scrolling = true;
      scrollBtn.textContent       = '⏹ Stop';
      scrollBtn.style.background  = '#6e1b1b';
      log('Auto-scroll started…', 'info');
      scrollTimer = setInterval(() => {
        window.scrollBy(0, parseInt(speedSlider.value) * 4);
        setStat('__ns_s_tiles__', getTiles().length);
      }, 16);
    }
  };

  /* ─── Scrape ─────────────────────────────────────────────── */
  document.getElementById('__ns_scrape__').onclick = async () => {
    if (!db) { log('DB not ready, retrying…', 'warn'); db = await openDB(); }

    const tiles = getTiles();
    setStat('__ns_s_tiles__', tiles.length);
    log(`Found <strong>${tiles.length}</strong> tile(s). Scraping…`, 'info');

    let saved = 0, skipped = 0, errors = 0;

    for (const tile of tiles) {
      try {
        /* Click the tile to capture its URL without navigating away */
        const { url, naukriJobId } = await captureUrlFromClick(tile);
        const job = scrapeTile(tile);
        job.url          = url;
        job.naukriJobId  = naukriJobId;
        job.id           = naukriJobId || job.id;

        if (!job.jobTitle && !job.hiringTitle) {
          log('↩ Skipped — no identifiable title', 'dim');
          skipped++;
          continue;
        }

        const result = await saveJob(db, job);

        if (result.saved) {
          saved++;
          const idLabel   = job.naukriJobId ? `<span style="color:#484f58">#${job.naukriJobId}</span> ` : '';
          const scoreTag  = job.jobMatchScore > 0
            ? ` <span style="color:#d29922;background:#2d2100;padding:0 4px;border-radius:3px;">★${job.jobMatchScore}</span>`
            : '';
          const expLabel  = job.experience.length
            ? ` <span style="color:#484f58">[${job.experience[0]}–${job.experience[job.experience.length-1]}yr]</span>`
            : '';
          log(`✓ ${idLabel}<span style="color:#e6edf3">${job.jobTitle || job.hiringTitle}</span>${expLabel}${scoreTag}`, 'success');
        } else {
          skipped++;
          log(`↩ Duplicate: ${job.naukriJobId || job.jobTitle}`, 'dim');
        }
      } catch (err) {
        errors++;
        log(`✗ ${err.message}`, 'error');
      }
    }

    incStat('__ns_s_saved__',   saved);
    incStat('__ns_s_skipped__', skipped);
    await refreshDBCount();
    log(`── Done ── saved: ${saved} | skipped: ${skipped} | errors: ${errors}`, 'success');
  };

  /* ─── Export ─────────────────────────────────────────────── */
  document.getElementById('__ns_download__').onclick = async () => {
    if (!db) db = await openDB();
    const jobs = await getAllJobs(db);
    if (!jobs.length) { log('Nothing in DB yet.', 'warn'); return; }

    const blob = new Blob([JSON.stringify(jobs, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href:     url,
      download: `naukri_jobs_${new Date().toISOString().slice(0, 10)}.json`,
    }).click();
    URL.revokeObjectURL(url);
    log(`✓ Exported ${jobs.length} record(s) as JSON.`, 'success');
  };

  /* ─── Delete DB ──────────────────────────────────────────── */
  document.getElementById('__ns_deletedb__').onclick = async () => {
    const btn = document.getElementById('__ns_deletedb__');

    /* First click → arms the button (confirmation state) */
    if (btn.dataset.armed !== 'yes') {
      btn.dataset.armed        = 'yes';
      btn.textContent          = '⚠ Click again to CONFIRM delete';
      btn.style.background     = '#3b0a0a';
      btn.style.borderColor    = '#f85149';
      /* Auto-disarm after 4 seconds if user changes mind */
      setTimeout(() => {
        if (btn.dataset.armed === 'yes') {
          btn.dataset.armed     = '';
          btn.textContent       = '⚠ Delete entire DB';
          btn.style.background  = '#1a0a0a';
          btn.style.borderColor = '#f8514940';
          log('Delete cancelled (timed out).', 'dim');
        }
      }, 4000);
      log('Delete armed — click again within 4s to confirm.', 'warn');
      return;
    }

    /* Second click → actually delete */
    btn.dataset.armed = '';
    try {
      const countBefore = db ? (await getAllJobs(db)).length : '?';
      await deleteDB();
      setStat('__ns_s_db__',      0);
      setStat('__ns_s_saved__',   0);
      setStat('__ns_s_skipped__', 0);
      btn.textContent       = '⚠ Delete entire DB';
      btn.style.background  = '#1a0a0a';
      btn.style.borderColor = '#f8514940';
      log(`✓ DB deleted — ${countBefore} record(s) removed. Re-initialising…`, 'warn');
      /* Re-open a fresh DB so the scraper stays usable */
      db = await openDB();
      log('Fresh DB ready ✓', 'success');
    } catch (err) {
      log(`✗ Delete failed: ${err.message}`, 'error');
    }
  };
  let db = null;
  openDB().then(d => {
    db = d;
    log('IndexedDB ready ✓', 'success');
    log(`Match keywords: ${Object.entries(MATCH_KEYWORDS).map(([k,v])=>`${k}(${v}pts)`).join(', ')}`, 'dim');
    setStat('__ns_s_tiles__', getTiles().length);
    refreshDBCount();
  }).catch(e => log('DB init error: ' + e.message, 'error'));

})();
