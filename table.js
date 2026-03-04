'use strict';

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
let allData        = [];
let displayColumns = [];          // all columns excl. id / url / category
let hiddenColumns  = new Set();
let columnTypes    = {};
let columnWidths   = {};          // col → px (computed once per data load / visibility change)
let activeFilters  = [];
let activeSorts    = [];
let categoryMap    = [];
let viewMode       = 'single';
let fileName       = '';
let filterIdCtr    = 0;
let clickedItems   = new Set(JSON.parse(localStorage.getItem('clickedItems') || '[]'));

// ── "url" column name — can differ across datasets (house.json vs naukri json).
// We auto-detect it as the first column whose name is 'url' or 'job_url' or whose
// values start with 'http'. Falls back to 'url'.
let urlColumn = 'url';

// ═══════════════════════════════════════════════════════════
//  THEME
// ═══════════════════════════════════════════════════════════
let isDark = true;
const themeBtn = document.getElementById('themeToggle');
function applyTheme() {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    themeBtn.textContent = isDark ? '🌙' : '☀️';
}
themeBtn.addEventListener('click', () => { isDark = !isDark; applyTheme(); });
applyTheme();

// ═══════════════════════════════════════════════════════════
//  OPERATORS
// ═══════════════════════════════════════════════════════════
const TEXT_OPS = [
    { v:'contains',     l:'contains'      },
    { v:'not_contains', l:'not contains'  },
    { v:'equals',       l:'equals'        },
    { v:'not_equals',   l:'not equals'    },
    { v:'starts_with',  l:'starts with'   },
    { v:'is_empty',     l:'is empty'      },
    { v:'is_not_empty', l:'is not empty'  },
];
const NUM_OPS = [
    { v:'eq',  l:'= equals'        },
    { v:'neq', l:'≠ not equals'    },
    { v:'lt',  l:'< less than'     },
    { v:'lte', l:'≤ less/equal'    },
    { v:'gt',  l:'> greater than'  },
    { v:'gte', l:'≥ greater/equal' },
];
const DATE_OPS = [
    { v:'before',       l:'before'       },
    { v:'after',        l:'after'        },
    { v:'on',           l:'on'           },
    { v:'on_or_before', l:'on or before' },
    { v:'on_or_after',  l:'on or after'  },
];
const NO_VALUE_OPS = new Set(['is_empty','is_not_empty']);

// ═══════════════════════════════════════════════════════════
//  DATE PARSING  — handles "Mar 2, 2026", ISO, d/m/y
// ═══════════════════════════════════════════════════════════
const MON = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
function parseDate(s) {
    if (!s) return null;
    s = String(s).trim();
    const m1 = s.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s*(\d{4})$/);
    if (m1 && MON[m1[1]] !== undefined) return new Date(+m1[3], MON[m1[1]], +m1[2]);
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) return new Date(+m2[1], +m2[2]-1, +m2[3]);
    const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m3) return new Date(+m3[3], +m3[2]-1, +m3[1]);
    return null;
}

// ═══════════════════════════════════════════════════════════
//  TYPE DETECTION
// ═══════════════════════════════════════════════════════════
function looksDate(v) {
    v = String(v).trim();
    return /^[A-Za-z]{3}[a-z]*\s+\d{1,2},?\s*\d{4}$/.test(v)
        || /^\d{4}-\d{2}-\d{2}$/.test(v)
        || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v);
}
function looksNum(v) {
    const s = String(v).replace(/[₹$,\s+%]/g,'');
    return s !== '' && /^-?[\d.]+$/.test(s);
}
function detectType(col, data) {
    const sample = data.map(r => r[col]).filter(v => v !== '' && v != null).slice(0, 60);
    if (!sample.length) return 'text';
    if (sample.every(looksDate)) return 'date';
    if (sample.every(looksNum))  return 'number';
    return 'text';
}

// ═══════════════════════════════════════════════════════════
//  VALUE PARSING FOR COMPARISON
// ═══════════════════════════════════════════════════════════
function parseVal(v, type) {
    if (v == null || v === '' || v === 'nan' || v === 'None') return null;
    const s = String(v).trim();
    if (!s) return null;
    if (type === 'number') { const n = +s.replace(/[₹$,\s+%]/g,''); return isNaN(n) ? null : n; }
    if (type === 'date')   return parseDate(s);
    return s.toLowerCase();
}

// ═══════════════════════════════════════════════════════════
//  FILTER ENGINE
// ═══════════════════════════════════════════════════════════
function testFilter(rv, op, fv, type) {
    if (op === 'is_empty')     return !rv || String(rv).trim() === '';
    if (op === 'is_not_empty') return !!(rv && String(rv).trim() !== '');
    if (!fv && fv !== 0) return true;
    const r = parseVal(rv, type), f = parseVal(fv, type);
    if (f === null) return true;
    if (r === null) return false;
    const cmp = (a, b) => {
        if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
        if (typeof a === 'number') return a - b;
        return String(a).localeCompare(String(b));
    };
    switch (op) {
        case 'contains':     return String(r).includes(String(f));
        case 'not_contains': return !String(r).includes(String(f));
        case 'equals':       return r === f;
        case 'not_equals':   return r !== f;
        case 'starts_with':  return String(r).startsWith(String(f));
        case 'eq':           return cmp(r,f) === 0;
        case 'neq':          return cmp(r,f) !== 0;
        case 'lt':           return cmp(r,f) < 0;
        case 'lte':          return cmp(r,f) <= 0;
        case 'gt':           return cmp(r,f) > 0;
        case 'gte':          return cmp(r,f) >= 0;
        case 'before':       return cmp(r,f) < 0;
        case 'after':        return cmp(r,f) > 0;
        case 'on':           return r instanceof Date && f instanceof Date &&
                                    r.toDateString() === f.toDateString();
        case 'on_or_before': return cmp(r,f) <= 0;
        case 'on_or_after':  return cmp(r,f) >= 0;
        default: return true;
    }
}
function filterData(data, filters) {
    if (!filters || !filters.length) return data;
    return data.filter(row =>
        filters.every(f => !f.column || testFilter(row[f.column], f.operator, f.value, columnTypes[f.column] || 'text'))
    );
}

// ═══════════════════════════════════════════════════════════
//  SORT ENGINE
// ═══════════════════════════════════════════════════════════
function sortData(data, sorts) {
    if (!sorts || !sorts.length) return [...data];
    return [...data].sort((a, b) => {
        for (const s of sorts) {
            const type = columnTypes[s.column] || 'text';
            const av = parseVal(a[s.column], type), bv = parseVal(b[s.column], type);
            let c = 0;
            if (av === null && bv === null) continue;
            else if (av === null) c = 1;
            else if (bv === null) c = -1;
            else if (av instanceof Date) c = av.getTime() - bv.getTime();
            else if (typeof av === 'number') c = av - bv;
            else c = String(av).localeCompare(String(bv));
            if (c !== 0) return s.direction === 'asc' ? c : -c;
        }
        return 0;
    });
}

// ═══════════════════════════════════════════════════════════
//  VISIBLE COLUMNS
// ═══════════════════════════════════════════════════════════
function visibleCols() {
    return displayColumns.filter(c => !hiddenColumns.has(c));
}

// ═══════════════════════════════════════════════════════════
//  COLUMN WIDTH CALCULATION
//
//  Strategy: measure actual character content of header + up to
//  100 data rows per column. Convert to px with a fixed char width
//  estimate, clamp, then normalise to % so columns fill 100% of
//  the table and never overflow or require scrolling.
// ═══════════════════════════════════════════════════════════
const CHAR_W = 7.4;   // px per character @ 12px DM Sans
const PAD_PX = 18;    // horizontal cell padding (8px each side + border)
const MIN_PX = 50;
const MAX_PX = 280;

function computeWidths(cols, data) {
    const sample = data.slice(0, 100);
    const raw = cols.map(col => {
        let maxLen = col.length + 2;   // header + sort badge room
        for (const row of sample) {
            const len = String(row[col] == null ? '' : row[col]).length;
            if (len > maxLen) maxLen = len;
        }
        const px = Math.max(MIN_PX, Math.min(MAX_PX, maxLen * CHAR_W + PAD_PX));
        return px;
    });
    const total = raw.reduce((a, b) => a + b, 0);
    // Return as percentages summing to 100
    return raw.map(px => `${(px / total * 100).toFixed(3)}%`);
}

// ═══════════════════════════════════════════════════════════
//  URL COLUMN AUTO-DETECTION
// ═══════════════════════════════════════════════════════════
function detectUrlColumn(data) {
    if (!data.length) return 'url';
    const first = data[0];
    // Prefer exact names
    for (const name of ['url', 'job_url', 'link', 'href']) {
        if (name in first) return name;
    }
    // Fallback: first column whose values look like URLs
    for (const key of Object.keys(first)) {
        const v = String(first[key] || '');
        if (v.startsWith('http')) return key;
    }
    return 'url';
}

// ═══════════════════════════════════════════════════════════
//  DATA LOADING
// ═══════════════════════════════════════════════════════════
function loadData(json, name) {
    fileName      = name;
    allData       = json;
    hiddenColumns = new Set();
    activeFilters = [];
    activeSorts   = [];
    viewMode      = 'single';
    if (!allData.length) return;

    urlColumn = detectUrlColumn(allData);

    // Build column list — skip internal/navigation columns
    const skip = new Set(['id', 'url', 'category', 'job_url', 'link', 'href', urlColumn]);
    const seen = new Set();
    displayColumns = [];
    allData.forEach(r => Object.keys(r).forEach(k => {
        if (!skip.has(k) && !seen.has(k)) { seen.add(k); displayColumns.push(k); }
    }));

    columnTypes = {};
    displayColumns.forEach(c => { columnTypes[c] = detectType(c, allData); });

    const fd = document.getElementById('fileNameDisplay');
    fd.textContent = name + '.json';
    fd.style.display = '';
    document.getElementById('controls').style.display = '';
    document.getElementById('applyCategoriesBtn').style.display = '';
    document.getElementById('singleViewBtn').style.display = '';

    renderAll();
}

// ═══════════════════════════════════════════════════════════
//  MASTER RENDER
// ═══════════════════════════════════════════════════════════
function renderAll() {
    renderCategoryPills();
    renderColManager();
    renderFilterUI();
    renderSortStatus();
    renderTableArea();
}
function refreshView() {
    renderSortStatus();
    renderTableArea();
}

// ═══════════════════════════════════════════════════════════
//  COLUMN MANAGER
// ═══════════════════════════════════════════════════════════
function renderColManager() {
    const wrap = document.getElementById('colManagerWrap');
    wrap.innerHTML = '';
    displayColumns.forEach(col => {
        const chip = document.createElement('span');
        chip.className = 'col-chip' + (hiddenColumns.has(col) ? ' hidden-col' : '');
        chip.textContent = col;
        chip.title = hiddenColumns.has(col) ? 'Click to show' : 'Click to hide';
        chip.addEventListener('click', () => {
            hiddenColumns.has(col) ? hiddenColumns.delete(col) : hiddenColumns.add(col);
            renderColManager();
            renderTableArea();
        });
        wrap.appendChild(chip);
    });
}
document.getElementById('showAllColsBtn').addEventListener('click', () => {
    hiddenColumns.clear();
    renderColManager();
    renderTableArea();
});

// ═══════════════════════════════════════════════════════════
//  TABLE BUILDER
// ═══════════════════════════════════════════════════════════
function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildTable(data, title, sortsForHeader) {
    const frag   = document.createDocumentFragment();
    const cols   = visibleCols();
    const widths = computeWidths(cols, data);
    // Use passed-in sorts for header badges (category view) or fall back to global
    const headerSorts = sortsForHeader || activeSorts;

    // Section title
    if (title) {
        const h = document.createElement('div');
        h.className = 'table-section-title';
        h.innerHTML = `<span>${esc(title)}</span><span class="count">${data.length} records</span>`;
        frag.appendChild(h);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'table-wrapper';

    // colgroup
    const colgroup = cols.map((_, i) => `<col style="width:${widths[i]}">`).join('');

    // header cells
    const headerCells = cols.map((col, i) => {
        const si  = headerSorts.findIndex(s => s.column === col);
        const dir = si >= 0 ? headerSorts[si].direction : null;
        const badge = si >= 0
            ? `<span class="sort-label">s${si+1}${dir==='asc'?'↑':'↓'}</span>` : '';
        return `<th data-col="${esc(col)}" style="width:${widths[i]}">
                  <div class="th-inner"><span class="th-name">${esc(col)}</span>${badge}</div>
                </th>`;
    }).join('');

    // body rows
    let bodyHTML = '';
    if (!data.length) {
        bodyHTML = `<tr><td colspan="${cols.length}"
            style="text-align:center;padding:16px;color:var(--text-dim)">
            No records match</td></tr>`;
    } else {
        for (const row of data) {
            const rawId = row['id'] || '';
            const uid   = `${fileName}_${rawId}`;
            const url   = esc(row[urlColumn] || '');
            const cls   = clickedItems.has(uid) ? ' class="visited"' : '';
            // Each cell has a tooltip (title) showing the full value,
            // so content is always accessible even when clipped.
            const cells = cols.map(c => {
                const val = esc(row[c]);
                return `<td>${val}</td>`;
            }).join('');
            bodyHTML += `<tr${cls} data-uid="${esc(uid)}" data-url="${url}">${cells}</tr>`;
        }
    }

    const table = document.createElement('table');
    table.innerHTML =
        `<colgroup>${colgroup}</colgroup>` +
        `<thead><tr>${headerCells}</tr></thead>` +
        `<tbody>${bodyHTML}</tbody>`;

    // Column sort on header click
    table.querySelector('thead').addEventListener('click', e => {
        const th = e.target.closest('th[data-col]');
        if (th) toggleSort(th.dataset.col);
    });

    // Row click → visit + open URL
    table.querySelector('tbody').addEventListener('click', e => {
        const tr = e.target.closest('tr[data-uid]');
        if (!tr) return;
        const uid = tr.dataset.uid;
        const url = tr.dataset.url;
        tr.classList.toggle('visited');
        clickedItems.has(uid) ? clickedItems.delete(uid) : clickedItems.add(uid);
        localStorage.setItem('clickedItems', JSON.stringify([...clickedItems]));
        if (url) window.open(url, '_blank');
    });

    wrapper.appendChild(table);
    frag.appendChild(wrapper);

    const cnt = document.createElement('div');
    cnt.className = 'record-count';
    cnt.textContent = `${data.length} record${data.length !== 1 ? 's' : ''}`;
    frag.appendChild(cnt);

    return frag;
}

// ═══════════════════════════════════════════════════════════
//  TABLE AREA RENDER
// ═══════════════════════════════════════════════════════════
function renderTableArea() {
    const area = document.getElementById('tableArea');
    area.innerHTML = '';

    if (!allData.length) {
        area.innerHTML = `<div class="empty-state">
            <div class="icon">◈</div>
            <h3>No data loaded</h3>
            <p class="text-dim">Click "Load Data" to open a JSON file</p>
        </div>`;
        return;
    }

    if (viewMode === 'categories' && categoryMap.length) {
        let pool = [...allData];
        const sections = [];
        for (const cat of categoryMap) {
            const matched = filterData(pool, cat.filters);
            const sorted  = sortData(matched, cat.sorts);
            sections.push({ name: cat.name, data: sorted, sorts: cat.sorts || [] });
            const ids = new Set(matched.map(r => r['id']));
            pool = pool.filter(r => !ids.has(r['id']));
        }
        if (pool.length) sections.push({ name: 'other', data: pool, sorts: [] });

        let any = false;
        sections.forEach(({ name, data, sorts }) => {
            if (!data.length) return;
            area.appendChild(buildTable(data, name, sorts));
            any = true;
        });
        if (!any) area.innerHTML = `<div class="empty-state"><div class="icon">📭</div><h3>No records</h3></div>`;

    } else {
        const filtered = filterData(allData, activeFilters);
        const sorted   = sortData(filtered, activeSorts);
        area.appendChild(buildTable(sorted, ''));

        const fc = document.getElementById('filterCount');
        if (fc) fc.textContent = activeFilters.length
            ? `Showing ${sorted.length} of ${allData.length}`
            : `${allData.length} records`;
    }
}

// ═══════════════════════════════════════════════════════════
//  SORT
// ═══════════════════════════════════════════════════════════
function toggleSort(col) {
    const i = activeSorts.findIndex(s => s.column === col);
    if (i === -1)                           activeSorts.push({ column: col, direction: 'asc' });
    else if (activeSorts[i].direction === 'asc') activeSorts[i].direction = 'desc';
    else                                    activeSorts.splice(i, 1);
    refreshView();
}
function removeSort(i) { activeSorts.splice(i, 1); refreshView(); }

function renderSortStatus() {
    const el = document.getElementById('sortStatus');
    if (!activeSorts.length) {
        el.innerHTML = '<span class="text-dim text-sm">Click column headers to sort. Multiple columns supported.</span>';
        return;
    }
    el.innerHTML = activeSorts.map((s, i) =>
        `<span class="sort-badge">s${i+1} · ${esc(s.column)} ${s.direction==='asc'?'↑':'↓'}
         <button onclick="removeSort(${i})">×</button></span>`
    ).join('');
}

// ═══════════════════════════════════════════════════════════
//  FILTERS UI
// ═══════════════════════════════════════════════════════════
function getOps(type) {
    return type === 'number' ? NUM_OPS : type === 'date' ? DATE_OPS : TEXT_OPS;
}

function renderFilterUI() {
    const c = document.getElementById('filtersContainer');
    if (!activeFilters.length) {
        c.innerHTML = '<span class="text-dim text-sm">No filters. Click "+ Add Filter" to start.</span>';
        return;
    }
    c.innerHTML = '';
    activeFilters.forEach(f => c.appendChild(buildFilterRow(f)));
}

function buildFilterRow(f) {
    const row = document.createElement('div');
    row.className = 'filter-row';

    const colSel = document.createElement('select');
    colSel.className = 'filter-col';
    colSel.innerHTML = `<option value="">— column —</option>` +
        displayColumns.map(c =>
            `<option value="${esc(c)}"${c===f.column?' selected':''}>${esc(c)}</option>`
        ).join('');

    const opSel  = document.createElement('select');
    opSel.className = 'filter-op';
    const valIn  = document.createElement('input');
    valIn.className = 'filter-val';

    function refresh() {
        const type = f.column ? (columnTypes[f.column] || 'text') : 'text';
        const ops  = getOps(type);
        opSel.innerHTML = ops.map(o =>
            `<option value="${o.v}"${o.v===f.operator?' selected':''}>${o.l}</option>`
        ).join('');
        if (!ops.find(o => o.v === f.operator)) { f.operator = ops[0].v; opSel.value = f.operator; }
        valIn.type = type === 'date' ? 'date' : type === 'number' ? 'number' : 'text';
        valIn.step = type === 'number' ? 'any' : '';
        valIn.style.display = NO_VALUE_OPS.has(f.operator) ? 'none' : '';
        valIn.value = f.value || '';
    }
    refresh();

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn-danger';
    removeBtn.textContent = '×';

    colSel.addEventListener('change',  () => { f.column=colSel.value; f.operator=''; f.value=''; refresh(); refreshView(); });
    opSel.addEventListener('change',   () => { f.operator=opSel.value; valIn.style.display=NO_VALUE_OPS.has(f.operator)?'none':''; if(NO_VALUE_OPS.has(f.operator))f.value=''; refreshView(); });
    valIn.addEventListener('input',    () => { f.value=valIn.value; refreshView(); });
    removeBtn.addEventListener('click',() => { activeFilters=activeFilters.filter(x=>x.id!==f.id); renderFilterUI(); refreshView(); });

    row.append(colSel, opSel, valIn, removeBtn);
    return row;
}

function addFilter() {
    activeFilters.push({ id: ++filterIdCtr, column: '', operator: 'contains', value: '' });
    renderFilterUI();
}
function clearAllFilters() { activeFilters = []; renderFilterUI(); refreshView(); }

// ═══════════════════════════════════════════════════════════
//  CATEGORY MANAGEMENT
// ═══════════════════════════════════════════════════════════
function saveAsCategory() {
    const nameEl = document.getElementById('categoryNameInput');
    const name   = nameEl.value.trim();
    if (!name) { alert('Please enter a category name.'); return; }

    const newCat = {
        name,
        filters:       JSON.parse(JSON.stringify(activeFilters)),
        sorts:         JSON.parse(JSON.stringify(activeSorts)),
        hiddenColumns: [...hiddenColumns],
    };

    const idx = categoryMap.findIndex(c => c.name === name);
    if (idx >= 0) {
        if (!confirm(`"${name}" already exists. Overwrite?`)) return;
        categoryMap[idx] = newCat;
    } else {
        categoryMap.push(newCat);
    }

    nameEl.value = '';
    renderCategoryPills();
    const fb = document.getElementById('saveCatFeedback');
    fb.textContent = `✓ Saved "${name}"`;
    setTimeout(() => { fb.textContent = ''; }, 2500);
}

function removeCategory(idx) {
    categoryMap.splice(idx, 1);
    renderCategoryPills();
    if (viewMode === 'categories') renderTableArea();
}

function renderCategoryPills() {
    const c = document.getElementById('categoryPills');
    c.innerHTML = '';
    if (!categoryMap.length) {
        c.innerHTML = '<span class="text-dim text-sm">No categories — load a categoryMap or save one below ↓</span>';
        return;
    }
    categoryMap.forEach((cat, idx) => {
        const pill = document.createElement('div');
        pill.className = 'cat-pill';
        pill.setAttribute('draggable', 'true');
        pill.dataset.idx = idx;
        pill.innerHTML = `<span>${esc(cat.name)}</span>
                          <button class="remove-pill" title="Remove">×</button>`;
        pill.querySelector('.remove-pill').addEventListener('click', e => {
            e.stopPropagation(); removeCategory(idx);
        });
        pill.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(idx)); pill.style.opacity = '.4'; });
        pill.addEventListener('dragend',   ()  => { pill.style.opacity = ''; });
        pill.addEventListener('dragover',  e   => { e.preventDefault(); pill.classList.add('drag-over'); });
        pill.addEventListener('dragleave', ()  => pill.classList.remove('drag-over'));
        pill.addEventListener('drop', e => {
            e.preventDefault(); pill.classList.remove('drag-over');
            const from = parseInt(e.dataTransfer.getData('text/plain'));
            const to   = parseInt(pill.dataset.idx);
            if (from === to) return;
            const [moved] = categoryMap.splice(from, 1);
            categoryMap.splice(to, 0, moved);
            renderCategoryPills();
            if (viewMode === 'categories') renderTableArea();
        });
        c.appendChild(pill);
    });
}

function applyCategoryView() {
    if (!categoryMap.length) { alert('No categories loaded or saved yet.'); return; }
    viewMode = 'categories';
    if (categoryMap[0].hiddenColumns) hiddenColumns = new Set(categoryMap[0].hiddenColumns);
    renderColManager();
    renderTableArea();
}
function singleView() { viewMode = 'single'; renderTableArea(); }

function loadCategoryMap(json) {
    categoryMap = json;
    viewMode    = 'categories';
    if (json.length && json[0].hiddenColumns) hiddenColumns = new Set(json[0].hiddenColumns);
    renderAll();
}

function saveCategoryMap() {
    if (!categoryMap.length) { alert('No categories to save.'); return; }
    categoryMap.forEach(c => { c.hiddenColumns = [...hiddenColumns]; });
    const blob = new Blob([JSON.stringify(categoryMap, null, 2)], { type: 'application/json' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = 'categoryMap.json';
    a.click();
    URL.revokeObjectURL(a.href);
}

// ═══════════════════════════════════════════════════════════
//  EVENT WIRING
// ═══════════════════════════════════════════════════════════
document.getElementById('dataFileInput').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const name = file.name.replace(/\.[^.]+$/, '');
    const reader = new FileReader();
    reader.onload = ev => {
        try { loadData(JSON.parse(ev.target.result), name); }
        catch (err) { alert('Failed to parse JSON: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
});

document.getElementById('catMapFileInput').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
        try { loadCategoryMap(JSON.parse(ev.target.result)); }
        catch (err) { alert('Failed to parse categoryMap: ' + err.message); }
    };
    reader.readAsText(file);
    e.target.value = '';
});

document.getElementById('addFilterBtn').addEventListener('click',       addFilter);
document.getElementById('clearFiltersBtn').addEventListener('click',    clearAllFilters);
document.getElementById('clearSortsBtn').addEventListener('click',      () => { activeSorts = []; refreshView(); });
document.getElementById('saveAsCategoryBtn').addEventListener('click',  saveAsCategory);
document.getElementById('applyCategoriesBtn').addEventListener('click', applyCategoryView);
document.getElementById('singleViewBtn').addEventListener('click',      singleView);
document.getElementById('saveCatMapBtn').addEventListener('click',      saveCategoryMap);
