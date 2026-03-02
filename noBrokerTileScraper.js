/**
 * NoBroker Property Scraper — Console Control Panel
 * Paste in DevTools > Console and hit Enter
 */
(function () {
  if (document.getElementById('__nb_scraper_panel')) {
    document.getElementById('__nb_scraper_panel').remove();
  }

  /* ─────────────────────────────────────────
     IndexedDB Setup
  ───────────────────────────────────────── */
  const DB_NAME = 'NBScraper';
  const DB_VERSION = 1;
  const STORE = 'properties';
  let db = null;

  function openDB() {
    return new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains(STORE)) {
          const store = d.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
        }
      };
      req.onsuccess = e => { db = e.target.result; res(db); };
      req.onerror = e => rej(e.target.error);
    });
  }

  function dbPut(record) {
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(record).onsuccess = () => res(true);
      tx.onerror = e => rej(e.target.error);
    });
  }

  function dbHas(id) {
    return new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = e => res(!!e.target.result);
      req.onerror = () => res(false);
    });
  }

  function dbGetByDateRange(fromTs, toTs) {
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const index = tx.objectStore(STORE).index('savedAt');
      const range = IDBKeyRange.bound(fromTs, toTs);
      const req = index.getAll(range);
      req.onsuccess = e => res(e.target.result);
      req.onerror = e => rej(e.target.error);
    });
  }

  function dbCount() {
    return new Promise((res) => {
      const tx = db.transaction(STORE, 'readonly');
      tx.objectStore(STORE).count().onsuccess = e => res(e.target.result);
    });
  }

  /* ─────────────────────────────────────────
     Article Parser
  ───────────────────────────────────────── */
  function parseArticles() {
    const cards = document.querySelectorAll('div[data-spt-impressions]');
    const results = [];
    cards.forEach(card => {
      const id = card.id;
      if (!id || id === '') return;
      const anchor = card.querySelector('h2 a');
      if (!anchor) return;
      const title = anchor.textContent.trim();
      const href = anchor.getAttribute('href');
      const link = href ? (href.startsWith('http') ? href : 'https://www.nobroker.in' + href) : '';
      results.push({ id, title, link });
    });
    return results;
  }

  /* ─────────────────────────────────────────
     Scroll Engine
  ───────────────────────────────────────── */
  let scrollTimer = null;
  let isScrolling = false;
  let lastCardCount = 0;
  let noChangeRounds = 0;
  const MAX_NO_CHANGE = 5; // stop after 5 rounds with no new cards

  function startScroll(log, onStop) {
    if (isScrolling) return;
    isScrolling = true;
    lastCardCount = document.querySelectorAll('div[data-spt-impressions]').length;
    noChangeRounds = 0;
    log('▶ Auto-scroll started');

    scrollTimer = setInterval(() => {
      window.scrollBy(0, 800);
      setTimeout(() => {
        const current = document.querySelectorAll('div[data-spt-impressions]').length;
        if (current === lastCardCount) {
          noChangeRounds++;
          log(`⏳ No new articles loaded (${noChangeRounds}/${MAX_NO_CHANGE})...`);
          if (noChangeRounds >= MAX_NO_CHANGE) {
            stopScroll(log, onStop, true);
          }
        } else {
          noChangeRounds = 0;
          log(`📄 Articles visible: ${current}`);
          lastCardCount = current;
        }
      }, 1500);
    }, 2200);
  }

  function stopScroll(log, onStop, auto = false) {
    if (!isScrolling) return;
    clearInterval(scrollTimer);
    scrollTimer = null;
    isScrolling = false;
    const msg = auto ? '🏁 Max articles reached — scroll stopped automatically' : '⏹ Scroll stopped';
    log(msg);
    if (onStop) onStop(auto);
  }

  /* ─────────────────────────────────────────
     CSV Export
  ───────────────────────────────────────── */
  function toCSV(records) {
    const header = ['id', 'title', 'link', 'date', 'savedAt'];
    const rows = records.map(r => [
      `"${r.id}"`,
      `"${r.title.replace(/"/g, '""')}"`,
      `"${r.link}"`,
      `"${r.date}"`,
      `"${new Date(r.savedAt).toLocaleString()}"`
    ].join(','));
    return [header.join(','), ...rows].join('\n');
  }

  function downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function getRangeTimestamps(range) {
    const now = Date.now();
    const day = 86400000;
    const map = {
      today: now - day,
      '3days': now - 3 * day,
      week: now - 7 * day,
      month: now - 30 * day,
    };
    return { from: map[range] || 0, to: now };
  }

  /* ─────────────────────────────────────────
     UI Panel
  ───────────────────────────────────────── */
  const panel = document.createElement('div');
  panel.id = '__nb_scraper_panel';
  panel.innerHTML = `
    <style>
      #__nb_scraper_panel {
        position: fixed;
        top: 80px; right: 24px;
        width: 340px;
        background: #0f1117;
        border: 1px solid #2a2d3a;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        font-family: 'Courier New', monospace;
        z-index: 999999;
        color: #e0e2ef;
        overflow: hidden;
        user-select: none;
      }
      #__nb_header {
        background: linear-gradient(135deg, #1a1d2e 0%, #12151f 100%);
        padding: 10px 14px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: grab;
        border-bottom: 1px solid #2a2d3a;
      }
      #__nb_header:active { cursor: grabbing; }
      #__nb_title {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #7c8cf8;
      }
      #__nb_badge {
        font-size: 10px;
        background: #1e2235;
        border: 1px solid #3a3f5c;
        border-radius: 20px;
        padding: 2px 8px;
        color: #8b8fa8;
      }
      #__nb_body { padding: 12px 14px; }
      #__nb_stats {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 6px;
        margin-bottom: 12px;
      }
      .nb_stat {
        background: #1a1d2e;
        border: 1px solid #2a2d3a;
        border-radius: 8px;
        padding: 8px 6px;
        text-align: center;
      }
      .nb_stat_val {
        font-size: 18px;
        font-weight: 700;
        color: #7c8cf8;
        line-height: 1;
      }
      .nb_stat_lbl {
        font-size: 9px;
        color: #5a5e78;
        margin-top: 3px;
        letter-spacing: 0.8px;
        text-transform: uppercase;
      }
      #__nb_btns {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        margin-bottom: 10px;
      }
      .nb_btn {
        border: none;
        border-radius: 7px;
        padding: 8px 10px;
        font-size: 11px;
        font-family: 'Courier New', monospace;
        font-weight: 700;
        letter-spacing: 0.5px;
        cursor: pointer;
        transition: all 0.15s ease;
        outline: none;
      }
      .nb_btn:active { transform: scale(0.96); }
      #__nb_btn_scroll {
        background: #1e4d2b;
        color: #4ade80;
        border: 1px solid #2d6b3d;
        grid-column: 1 / -1;
      }
      #__nb_btn_scroll.stop {
        background: #4d1e1e;
        color: #f87171;
        border-color: #6b2d2d;
      }
      #__nb_btn_extract {
        background: #1a2850;
        color: #60a5fa;
        border: 1px solid #2a3d6b;
      }
      #__nb_btn_clear {
        background: #1a1d2e;
        color: #8b8fa8;
        border: 1px solid #2a2d3a;
      }
      #__nb_csv_row {
        display: flex;
        gap: 6px;
        margin-bottom: 10px;
        align-items: center;
      }
      #__nb_range {
        flex: 1;
        background: #1a1d2e;
        border: 1px solid #2a2d3a;
        border-radius: 7px;
        color: #c0c4e0;
        font-family: 'Courier New', monospace;
        font-size: 11px;
        padding: 7px 8px;
        outline: none;
        cursor: pointer;
      }
      #__nb_range option { background: #1a1d2e; }
      #__nb_btn_csv {
        background: #2d1a4d;
        color: #c084fc;
        border: 1px solid #4a2d6b;
        white-space: nowrap;
        padding: 7px 12px;
      }
      #__nb_log_wrap {
        background: #090b11;
        border: 1px solid #1e2235;
        border-radius: 8px;
        height: 140px;
        overflow-y: auto;
        padding: 8px;
        scrollbar-width: thin;
        scrollbar-color: #2a2d3a transparent;
      }
      #__nb_log_wrap::-webkit-scrollbar { width: 4px; }
      #__nb_log_wrap::-webkit-scrollbar-thumb { background: #2a2d3a; border-radius: 2px; }
      .nb_log_entry {
        font-size: 10px;
        line-height: 1.6;
        color: #6b7090;
        padding: 1px 0;
        border-bottom: 1px solid #12141e;
        word-break: break-all;
      }
      .nb_log_entry.ok { color: #4ade80; }
      .nb_log_entry.skip { color: #fb923c; }
      .nb_log_entry.info { color: #60a5fa; }
      .nb_log_entry.warn { color: #facc15; }
      .nb_log_entry.err { color: #f87171; }
      #__nb_log_label {
        font-size: 9px;
        color: #3a3f5c;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-bottom: 4px;
        display: flex;
        justify-content: space-between;
      }
      #__nb_clear_log {
        color: #3a3f5c;
        cursor: pointer;
        font-size: 9px;
      }
      #__nb_clear_log:hover { color: #f87171; }
    </style>

    <div id="__nb_header">
      <span id="__nb_title">⬡ NoBroker Scraper</span>
      <span id="__nb_badge">v1.0</span>
    </div>

    <div id="__nb_body">
      <div id="__nb_stats">
        <div class="nb_stat">
          <div class="nb_stat_val" id="__nb_s_visible">0</div>
          <div class="nb_stat_lbl">Visible</div>
        </div>
        <div class="nb_stat">
          <div class="nb_stat_val" id="__nb_s_saved">0</div>
          <div class="nb_stat_lbl">Saved</div>
        </div>
        <div class="nb_stat">
          <div class="nb_stat_val" id="__nb_s_skipped">0</div>
          <div class="nb_stat_lbl">Skipped</div>
        </div>
      </div>

      <div id="__nb_btns">
        <button class="nb_btn" id="__nb_btn_scroll">▶ START SCROLL</button>
        <button class="nb_btn" id="__nb_btn_extract">⬇ EXTRACT</button>
        <button class="nb_btn" id="__nb_btn_clear">✕ CLEAR LOG</button>
      </div>

      <div id="__nb_csv_row">
        <select id="__nb_range">
          <option value="today">Today</option>
          <option value="3days">Last 3 Days</option>
          <option value="week">Last Week</option>
          <option value="month">Last Month</option>
        </select>
        <button class="nb_btn" id="__nb_btn_csv">⤓ CSV</button>
      </div>

      <div id="__nb_log_label">
        <span>Log</span>
        <span id="__nb_clear_log">clear</span>
      </div>
      <div id="__nb_log_wrap">
        <div class="nb_log_entry info">Panel ready. Open IndexedDB...</div>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  /* ─────────────────────────────────────────
     State & Helpers
  ───────────────────────────────────────── */
  let sessionSaved = 0;
  let sessionSkipped = 0;

  const logWrap = document.getElementById('__nb_log_wrap');
  const sVisible = document.getElementById('__nb_s_visible');
  const sSaved = document.getElementById('__nb_s_saved');
  const sSkipped = document.getElementById('__nb_s_skipped');

  function log(msg, type = '') {
    const d = document.createElement('div');
    d.className = 'nb_log_entry' + (type ? ' ' + type : '');
    const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
    d.textContent = `[${time}] ${msg}`;
    logWrap.appendChild(d);
    logWrap.scrollTop = logWrap.scrollHeight;
    console.log(`[NBScraper] ${msg}`);
  }

  function updateStats() {
    sVisible.textContent = document.querySelectorAll('div[data-spt-impressions]').length;
    sSaved.textContent = sessionSaved;
    sSkipped.textContent = sessionSkipped;
  }

  setInterval(updateStats, 2000);

  /* ─────────────────────────────────────────
     Draggable
  ───────────────────────────────────────── */
  const header = document.getElementById('__nb_header');
  let dragging = false, ox = 0, oy = 0;

  header.addEventListener('mousedown', e => {
    dragging = true;
    ox = e.clientX - panel.getBoundingClientRect().left;
    oy = e.clientY - panel.getBoundingClientRect().top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    panel.style.left = (e.clientX - ox) + 'px';
    panel.style.top = (e.clientY - oy) + 'px';
    panel.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => { dragging = false; });

  /* ─────────────────────────────────────────
     Button Wiring
  ───────────────────────────────────────── */
  const btnScroll = document.getElementById('__nb_btn_scroll');
  const btnExtract = document.getElementById('__nb_btn_extract');
  const btnClear = document.getElementById('__nb_btn_clear');
  const btnCSV = document.getElementById('__nb_btn_csv');
  const rangeSelect = document.getElementById('__nb_range');

  btnScroll.addEventListener('click', () => {
    if (!isScrolling) {
      btnScroll.textContent = '⏹ STOP SCROLL';
      btnScroll.classList.add('stop');
      startScroll(log, (auto) => {
        btnScroll.textContent = '▶ START SCROLL';
        btnScroll.classList.remove('stop');
        updateStats();
      });
    } else {
      btnScroll.textContent = '▶ START SCROLL';
      btnScroll.classList.remove('stop');
      stopScroll(log, null, false);
    }
  });

  btnExtract.addEventListener('click', async () => {
    if (!db) { log('DB not ready yet', 'err'); return; }
    const articles = parseArticles();
    if (articles.length === 0) {
      log('No articles found on page', 'warn');
      return;
    }
    log(`Found ${articles.length} articles on page`, 'info');
    const today = new Date().toISOString().slice(0, 10);
    let saved = 0, skipped = 0;

    for (const art of articles) {
      const exists = await dbHas(art.id);
      if (exists) {
        skipped++;
        sessionSkipped++;
        log(`SKIP  ${art.id.slice(0, 16)}… (already in DB)`, 'skip');
      } else {
        const record = {
          id: art.id,
          title: art.title,
          link: art.link,
          date: today,
          savedAt: Date.now()
        };
        try {
          await dbPut(record);
          saved++;
          sessionSaved++;
          log(`SAVED ${art.id.slice(0, 16)}… "${art.title.slice(0, 30)}…"`, 'ok');
        } catch (err) {
          log(`ERR   ${art.id.slice(0, 8)}: ${err.message}`, 'err');
        }
      }
    }
    const total = await dbCount();
    log(`✔ Done — saved: ${saved}, skipped: ${skipped} | DB total: ${total}`, 'info');
    updateStats();
  });

  btnClear.addEventListener('click', () => {
    logWrap.innerHTML = '';
    log('Log cleared', 'info');
  });

  document.getElementById('__nb_clear_log').addEventListener('click', () => {
    logWrap.innerHTML = '';
  });

  btnCSV.addEventListener('click', async () => {
    if (!db) { log('DB not ready', 'err'); return; }
    const range = rangeSelect.value;
    const { from, to } = getRangeTimestamps(range);
    log(`Fetching records: ${range}...`, 'info');
    try {
      const records = await dbGetByDateRange(from, to);
      if (records.length === 0) {
        log('No records found for selected range', 'warn');
        return;
      }
      const csv = toCSV(records);
      const fname = `nobroker_${range}_${new Date().toISOString().slice(0,10)}.csv`;
      downloadCSV(csv, fname);
      log(`✔ Downloaded ${fname} (${records.length} rows)`, 'ok');
    } catch (err) {
      log(`CSV error: ${err.message}`, 'err');
    }
  });

  /* ─────────────────────────────────────────
     Init DB
  ───────────────────────────────────────── */
  openDB()
    .then(async () => {
      const count = await dbCount();
      log(`DB ready — ${count} records in store`, 'ok');
      updateStats();
    })
    .catch(err => log(`DB error: ${err.message}`, 'err'));

})();