'use strict';

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
let allData        = [];
let displayColumns = [];
let hiddenColumns  = new Set();
let columnTypes    = {};
let activeFilters  = [];   // for single view / new category creation
let activeSorts    = [];   // for single view / new category creation
let categoryMap    = [];   // [{ name, filters, sorts, hiddenColumns }]
let viewMode       = 'single';
let fileName       = '';
let filterIdCtr    = 0;
let urlColumn      = 'url';
let clickedItems   = new Set(JSON.parse(localStorage.getItem('clickedItems') || '[]'));

// ── Theme ────────────────────────────────────────────────
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
    {v:'contains',l:'contains'},{v:'not_contains',l:'not contains'},
    {v:'equals',l:'equals'},{v:'not_equals',l:'not equals'},
    {v:'starts_with',l:'starts with'},
    {v:'is_empty',l:'is empty'},{v:'is_not_empty',l:'is not empty'},
];
const NUM_OPS = [
    {v:'eq',l:'= equals'},{v:'neq',l:'≠ not equals'},
    {v:'lt',l:'< less than'},{v:'lte',l:'≤ less/equal'},
    {v:'gt',l:'> greater than'},{v:'gte',l:'≥ greater/equal'},
];
const DATE_OPS = [
    {v:'before',l:'before'},{v:'after',l:'after'},{v:'on',l:'on'},
    {v:'on_or_before',l:'on or before'},{v:'on_or_after',l:'on or after'},
];
const NO_VALUE_OPS = new Set(['is_empty','is_not_empty']);

// ═══════════════════════════════════════════════════════════
//  DATE PARSING
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
    const sample = data.map(r=>r[col]).filter(v=>v!==''&&v!=null).slice(0,60);
    if (!sample.length) return 'text';
    if (sample.every(looksDate)) return 'date';
    if (sample.every(looksNum))  return 'number';
    return 'text';
}

// ═══════════════════════════════════════════════════════════
//  VALUE PARSING
// ═══════════════════════════════════════════════════════════
function parseVal(v, type) {
    if (v==null||v===''||v==='nan'||v==='None') return null;
    const s = String(v).trim(); if (!s) return null;
    if (type==='number') { const n=+s.replace(/[₹$,\s+%]/g,''); return isNaN(n)?null:n; }
    if (type==='date')   return parseDate(s);
    return s.toLowerCase();
}

// ═══════════════════════════════════════════════════════════
//  FILTER ENGINE
// ═══════════════════════════════════════════════════════════
function testFilter(rv, op, fv, type) {
    if (op==='is_empty')     return !rv||String(rv).trim()==='';
    if (op==='is_not_empty') return !!(rv&&String(rv).trim()!=='');
    if (!fv&&fv!==0) return true;
    const r=parseVal(rv,type), f=parseVal(fv,type);
    if (f===null) return true; if (r===null) return false;
    const cmp=(a,b)=>{
        if (a instanceof Date&&b instanceof Date) return a.getTime()-b.getTime();
        if (typeof a==='number') return a-b;
        return String(a).localeCompare(String(b));
    };
    switch(op){
        case 'contains':     return String(r).includes(String(f));
        case 'not_contains': return !String(r).includes(String(f));
        case 'equals':       return r===f;
        case 'not_equals':   return r!==f;
        case 'starts_with':  return String(r).startsWith(String(f));
        case 'eq':           return cmp(r,f)===0;
        case 'neq':          return cmp(r,f)!==0;
        case 'lt':           return cmp(r,f)<0;
        case 'lte':          return cmp(r,f)<=0;
        case 'gt':           return cmp(r,f)>0;
        case 'gte':          return cmp(r,f)>=0;
        case 'before':       return cmp(r,f)<0;
        case 'after':        return cmp(r,f)>0;
        case 'on':           return r instanceof Date&&f instanceof Date&&r.toDateString()===f.toDateString();
        case 'on_or_before': return cmp(r,f)<=0;
        case 'on_or_after':  return cmp(r,f)>=0;
        default: return true;
    }
}
function filterData(data, filters) {
    if (!filters||!filters.length) return data;
    return data.filter(row=>filters.every(f=>!f.column||testFilter(row[f.column],f.operator,f.value,columnTypes[f.column]||'text')));
}

// ═══════════════════════════════════════════════════════════
//  SORT ENGINE
// ═══════════════════════════════════════════════════════════
function sortData(data, sorts) {
    if (!sorts||!sorts.length) return [...data];
    return [...data].sort((a,b)=>{
        for (const s of sorts) {
            const type=columnTypes[s.column]||'text';
            const av=parseVal(a[s.column],type), bv=parseVal(b[s.column],type);
            let c=0;
            if (av===null&&bv===null) continue;
            else if (av===null) c=1; else if (bv===null) c=-1;
            else if (av instanceof Date) c=av.getTime()-bv.getTime();
            else if (typeof av==='number') c=av-bv;
            else c=String(av).localeCompare(String(bv));
            if (c!==0) return s.direction==='asc'?c:-c;
        }
        return 0;
    });
}

// ═══════════════════════════════════════════════════════════
//  VISIBLE COLUMNS
// ═══════════════════════════════════════════════════════════
function visibleCols() { return displayColumns.filter(c=>!hiddenColumns.has(c)); }

// ═══════════════════════════════════════════════════════════
//  COLUMN WIDTH CALCULATION
// ═══════════════════════════════════════════════════════════
const CHAR_W=7.4, PAD_PX=18, MIN_PX=50, MAX_PX=280;
function computeWidths(cols, data) {
    const sample=data.slice(0,100);
    const raw=cols.map(col=>{
        let mx=col.length+2;
        for (const row of sample) { const l=String(row[col]??'').length; if(l>mx)mx=l; }
        return Math.max(MIN_PX,Math.min(MAX_PX,mx*CHAR_W+PAD_PX));
    });
    const total=raw.reduce((a,b)=>a+b,0);
    return raw.map(px=>`${(px/total*100).toFixed(3)}%`);
}

// ═══════════════════════════════════════════════════════════
//  URL COLUMN DETECTION
// ═══════════════════════════════════════════════════════════
function detectUrlColumn(data) {
    if (!data.length) return 'url';
    const first=data[0];
    for (const n of ['url','job_url','link','href']) if(n in first) return n;
    for (const k of Object.keys(first)) if(String(first[k]||'').startsWith('http')) return k;
    return 'url';
}

// ═══════════════════════════════════════════════════════════
//  DATA LOADING
// ═══════════════════════════════════════════════════════════
function loadData(json, name) {
    fileName=name; allData=json; hiddenColumns=new Set();
    activeFilters=[]; activeSorts=[]; viewMode='single';
    if (!allData.length) return;
    urlColumn=detectUrlColumn(allData);
    const skip=new Set(['id','url','category','job_url','link','href',urlColumn]);
    const seen=new Set(); displayColumns=[];
    allData.forEach(r=>Object.keys(r).forEach(k=>{
        if(!skip.has(k)&&!seen.has(k)){seen.add(k);displayColumns.push(k);}
    }));
    columnTypes={};
    displayColumns.forEach(c=>{columnTypes[c]=detectType(c,allData);});
    const fd=document.getElementById('fileNameDisplay');
    fd.textContent=name+'.json'; fd.style.display='';
    document.getElementById('controls').style.display='';
    document.getElementById('applyCategoriesBtn').style.display='';
    document.getElementById('singleViewBtn').style.display='';
    renderAll();
}

// ═══════════════════════════════════════════════════════════
//  MASTER RENDER
// ═══════════════════════════════════════════════════════════
function renderAll() {
    renderCategoryCards();
    renderColManager();
    renderFilterUI();
    renderSortStatus();
    renderTableArea();
}
function refreshView() { renderSortStatus(); renderTableArea(); }

// ═══════════════════════════════════════════════════════════
//  ESC HELPER
// ═══════════════════════════════════════════════════════════
function esc(s) {
    return String(s==null?'':s)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════
//  COLUMN MANAGER
// ═══════════════════════════════════════════════════════════
function renderColManager() {
    const wrap=document.getElementById('colManagerWrap');
    wrap.innerHTML='';
    displayColumns.forEach(col=>{
        const chip=document.createElement('span');
        chip.className='col-chip'+(hiddenColumns.has(col)?' hidden-col':'');
        chip.textContent=col;
        chip.title=hiddenColumns.has(col)?'Click to show':'Click to hide';
        chip.addEventListener('click',()=>{
            hiddenColumns.has(col)?hiddenColumns.delete(col):hiddenColumns.add(col);
            renderColManager(); renderTableArea();
        });
        wrap.appendChild(chip);
    });
}
document.getElementById('showAllColsBtn').addEventListener('click',()=>{
    hiddenColumns.clear(); renderColManager(); renderTableArea();
});

// ═══════════════════════════════════════════════════════════
//  GENERIC FILTER ROW BUILDER
//  Works for both global filters and per-category filters.
//  filtersArr  — the array to mutate
//  f           — the filter object
//  onChange    — called when filter changes (to trigger re-render)
//  onRemove    — called when × is clicked
// ═══════════════════════════════════════════════════════════
function getOps(type) { return type==='number'?NUM_OPS:type==='date'?DATE_OPS:TEXT_OPS; }

function buildFilterRow(f, filtersArr, onChange, onRemove) {
    const row=document.createElement('div');
    row.className='filter-row cat-filter-row';

    const colSel=document.createElement('select'); colSel.className='filter-col';
    colSel.innerHTML=`<option value="">— column —</option>`+
        displayColumns.map(c=>`<option value="${esc(c)}"${c===f.column?' selected':''}>${esc(c)}</option>`).join('');

    const opSel=document.createElement('select'); opSel.className='filter-op';
    const valIn=document.createElement('input'); valIn.className='filter-val';

    function refresh() {
        const type=f.column?(columnTypes[f.column]||'text'):'text';
        const ops=getOps(type);
        opSel.innerHTML=ops.map(o=>`<option value="${o.v}"${o.v===f.operator?' selected':''}>${o.l}</option>`).join('');
        if(!ops.find(o=>o.v===f.operator)){f.operator=ops[0].v;opSel.value=f.operator;}
        valIn.type=type==='date'?'date':type==='number'?'number':'text';
        valIn.step=type==='number'?'any':'';
        valIn.style.display=NO_VALUE_OPS.has(f.operator)?'none':'';
        valIn.value=f.value||'';
    }
    refresh();

    const removeBtn=document.createElement('button');
    removeBtn.className='btn btn-danger btn-sm'; removeBtn.textContent='×';

    colSel.addEventListener('change',()=>{f.column=colSel.value;f.operator='';f.value='';refresh();onChange();});
    opSel.addEventListener('change',()=>{f.operator=opSel.value;valIn.style.display=NO_VALUE_OPS.has(f.operator)?'none':'';if(NO_VALUE_OPS.has(f.operator))f.value='';onChange();});
    valIn.addEventListener('input',()=>{f.value=valIn.value;onChange();});
    removeBtn.addEventListener('click',()=>{
        const i=filtersArr.indexOf(f);
        if(i>=0)filtersArr.splice(i,1);
        onRemove();
    });

    row.append(colSel,opSel,valIn,removeBtn);
    return row;
}

// ═══════════════════════════════════════════════════════════
//  GENERIC SORT EDITOR BUILDER
//  Builds a sort-editor div for the given sorts array.
//  onChange — called on any change.
// ═══════════════════════════════════════════════════════════
function buildSortEditor(sorts, onChange) {
    const wrap=document.createElement('div');

    function renderBadges() {
        wrap.innerHTML='';
        // Current sort badges
        const badgeRow=document.createElement('div');
        badgeRow.className='cat-sort-row';
        if (!sorts.length) {
            const empty=document.createElement('span');
            empty.className='text-dim text-sm'; empty.textContent='No sorts.';
            badgeRow.appendChild(empty);
        }
        sorts.forEach((s,i)=>{
            const badge=document.createElement('span');
            badge.className='cat-sort-badge';

            // direction toggle button
            const dirBtn=document.createElement('button');
            dirBtn.className='cat-sort-dir-btn';
            dirBtn.textContent=s.direction==='asc'?'↑':'↓';
            dirBtn.title='Click to toggle direction';
            dirBtn.addEventListener('click',()=>{
                s.direction=s.direction==='asc'?'desc':'asc';
                onChange(); renderBadges();
            });

            const label=document.createTextNode(` s${i+1} · ${s.column} `);

            const removeBtn=document.createElement('button');
            removeBtn.textContent='×';
            removeBtn.addEventListener('click',()=>{
                sorts.splice(i,1); onChange(); renderBadges();
            });

            badge.append(dirBtn,label,removeBtn);
            badgeRow.appendChild(badge);
        });
        wrap.appendChild(badgeRow);

        // Add sort row
        const addRow=document.createElement('div');
        addRow.className='add-sort-wrap';

        const colSel=document.createElement('select'); colSel.className='add-sort-col';
        colSel.innerHTML=`<option value="">+ add sort column</option>`+
            displayColumns
                .filter(c=>!sorts.find(s=>s.column===c))
                .map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');

        const dirSel=document.createElement('select'); dirSel.className='add-sort-dir';
        dirSel.innerHTML=`<option value="asc">↑ asc</option><option value="desc">↓ desc</option>`;

        const addBtn=document.createElement('button');
        addBtn.className='btn btn-outline btn-sm'; addBtn.textContent='+ Add';
        addBtn.addEventListener('click',()=>{
            const col=colSel.value; if(!col)return;
            sorts.push({column:col,direction:dirSel.value});
            onChange(); renderBadges();
        });

        addRow.append(colSel,dirSel,addBtn);
        wrap.appendChild(addRow);
    }

    renderBadges();
    return wrap;
}

// ═══════════════════════════════════════════════════════════
//  CATEGORY CARDS
// ═══════════════════════════════════════════════════════════

// Track which cards are expanded
const expandedCats = new Set();

function renderCategoryCards() {
    const container=document.getElementById('catCardsContainer');
    container.innerHTML='';
    const noMsg=document.getElementById('noCatsMsg');
    if (!categoryMap.length) {
        if(noMsg) noMsg.style.display='';
        return;
    }
    if(noMsg) noMsg.style.display='none';

    categoryMap.forEach((cat,idx)=>{
        const card=document.createElement('div');
        card.className='cat-card';
        card.setAttribute('draggable','true');
        card.dataset.idx=idx;

        // ── Card header ─────────────────────────────────────
        const header=document.createElement('div');
        header.className='cat-card-header';

        const dragHandle=document.createElement('span');
        dragHandle.className='drag-handle'; dragHandle.textContent='⠿';

        const nameBadge=document.createElement('span');
        nameBadge.className='cat-name-badge'; nameBadge.textContent=cat.name;

        const metaSpan=document.createElement('span');
        metaSpan.className='cat-meta';
        const fCount=cat.filters?cat.filters.filter(f=>f.column).length:0;
        const sCount=cat.sorts?cat.sorts.length:0;
        metaSpan.textContent=`${fCount} filter${fCount!==1?'s':''} · ${sCount} sort${sCount!==1?'s':''}`;

        const isExpanded=expandedCats.has(idx);
        const collapseBtn=document.createElement('button');
        collapseBtn.className='cat-collapse-btn';
        collapseBtn.textContent=isExpanded?'▲ collapse':'▼ edit';

        const deleteBtn=document.createElement('button');
        deleteBtn.className='cat-delete-btn'; deleteBtn.textContent='✕';
        deleteBtn.title='Remove category';

        header.append(dragHandle,nameBadge,metaSpan,collapseBtn,deleteBtn);

        // ── Card body (collapsible) ──────────────────────────
        const body=document.createElement('div');
        body.className='cat-card-body'+(isExpanded?' expanded':'');

        // Filters section
        const filterSection=document.createElement('div');
        filterSection.className='cat-section';
        const filterLabel=document.createElement('div');
        filterLabel.className='cat-section-label';
        filterLabel.textContent='🔍 Filters';
        const addFilterBtn=document.createElement('button');
        addFilterBtn.className='btn btn-outline btn-sm'; addFilterBtn.textContent='+ Add Filter';
        filterLabel.appendChild(addFilterBtn);
        filterSection.appendChild(filterLabel);

        const filterRows=document.createElement('div');
        filterSection.appendChild(filterRows);

        function renderCatFilters() {
            filterRows.innerHTML='';
            if (!cat.filters||!cat.filters.filter(f=>f.column).length&&!cat.filters.length) {
                filterRows.innerHTML='<span class="text-dim text-sm">No filters.</span>';
            }
            (cat.filters||[]).forEach(f=>{
                filterRows.appendChild(buildFilterRow(
                    f,
                    cat.filters,
                    ()=>{ renderCatFilters(); updateMeta(); if(viewMode==='categories')renderTableArea(); },
                    ()=>{ renderCatFilters(); updateMeta(); if(viewMode==='categories')renderTableArea(); }
                ));
            });
        }
        renderCatFilters();

        addFilterBtn.addEventListener('click',()=>{
            if(!cat.filters) cat.filters=[];
            cat.filters.push({id:++filterIdCtr,column:'',operator:'contains',value:''});
            renderCatFilters();
        });

        // Sorts section
        const sortSection=document.createElement('div');
        sortSection.className='cat-section';
        const sortLabel=document.createElement('div');
        sortLabel.className='cat-section-label'; sortLabel.textContent='↕ Sort Order';
        sortSection.appendChild(sortLabel);

        if (!cat.sorts) cat.sorts=[];
        const sortEditor=buildSortEditor(cat.sorts,()=>{
            updateMeta();
            if(viewMode==='categories') renderTableArea();
        });
        sortSection.appendChild(sortEditor);

        body.append(filterSection, sortSection);

        // ── Update meta helper ───────────────────────────────
        function updateMeta() {
            const fC=cat.filters?cat.filters.filter(f=>f.column).length:0;
            const sC=cat.sorts?cat.sorts.length:0;
            metaSpan.textContent=`${fC} filter${fC!==1?'s':''} · ${sC} sort${sC!==1?'s':''}`;
        }

        // ── Events ──────────────────────────────────────────
        collapseBtn.addEventListener('click',e=>{
            e.stopPropagation();
            if(expandedCats.has(idx)){ expandedCats.delete(idx); body.classList.remove('expanded'); collapseBtn.textContent='▼ edit'; }
            else { expandedCats.add(idx); body.classList.add('expanded'); collapseBtn.textContent='▲ collapse'; }
        });

        deleteBtn.addEventListener('click',e=>{
            e.stopPropagation();
            expandedCats.delete(idx);
            categoryMap.splice(idx,1);
            renderCategoryCards();
            if(viewMode==='categories') renderTableArea();
        });

        // Drag and drop reorder
        card.addEventListener('dragstart',e=>{
            e.dataTransfer.setData('text/plain',String(idx));
            card.style.opacity='.4';
        });
        card.addEventListener('dragend',()=>{ card.style.opacity=''; });
        card.addEventListener('dragover',e=>{ e.preventDefault(); card.classList.add('drag-over'); });
        card.addEventListener('dragleave',()=>card.classList.remove('drag-over'));
        card.addEventListener('drop',e=>{
            e.preventDefault(); card.classList.remove('drag-over');
            const from=parseInt(e.dataTransfer.getData('text/plain'));
            const to=parseInt(card.dataset.idx);
            if(from===to) return;
            const [moved]=categoryMap.splice(from,1);
            categoryMap.splice(to,0,moved);
            // Remap expanded set
            const newExpanded=new Set();
            expandedCats.forEach(i=>{
                if(i===from) newExpanded.add(to);
                else if(i>=Math.min(from,to)&&i<=Math.max(from,to)) newExpanded.add(from<to?i-1:i+1);
                else newExpanded.add(i);
            });
            expandedCats.clear(); newExpanded.forEach(i=>expandedCats.add(i));
            renderCategoryCards();
            if(viewMode==='categories') renderTableArea();
        });

        card.append(header,body);
        container.appendChild(card);
    });
}

// ═══════════════════════════════════════════════════════════
//  GLOBAL FILTER UI (single view)
// ═══════════════════════════════════════════════════════════
function renderFilterUI() {
    const c=document.getElementById('filtersContainer');
    if (!activeFilters.length) { c.innerHTML='<span class="text-dim text-sm">No filters.</span>'; return; }
    c.innerHTML='';
    activeFilters.forEach(f=>c.appendChild(buildFilterRow(
        f, activeFilters,
        ()=>refreshView(),
        ()=>{ renderFilterUI(); refreshView(); }
    )));
}
function addFilter() {
    activeFilters.push({id:++filterIdCtr,column:'',operator:'contains',value:''});
    renderFilterUI();
}
function clearAllFilters() { activeFilters=[]; renderFilterUI(); refreshView(); }

// ═══════════════════════════════════════════════════════════
//  GLOBAL SORT (single view)
// ═══════════════════════════════════════════════════════════
function toggleSort(col) {
    const i=activeSorts.findIndex(s=>s.column===col);
    if(i===-1) activeSorts.push({column:col,direction:'asc'});
    else if(activeSorts[i].direction==='asc') activeSorts[i].direction='desc';
    else activeSorts.splice(i,1);
    refreshView();
}
function removeSort(i) { activeSorts.splice(i,1); refreshView(); }
function renderSortStatus() {
    const el=document.getElementById('sortStatus');
    if(!activeSorts.length){ el.innerHTML='<span class="text-dim text-sm">Click column headers to sort.</span>'; return; }
    el.innerHTML=activeSorts.map((s,i)=>
        `<span class="sort-badge">s${i+1} · ${esc(s.column)} ${s.direction==='asc'?'↑':'↓'}
         <button onclick="removeSort(${i})">×</button></span>`
    ).join('');
}

// ═══════════════════════════════════════════════════════════
//  TABLE BUILDER
// ═══════════════════════════════════════════════════════════
function buildTable(data, title, sortsForHeader, onSortClick) {
    // Default: global sort toggle (single view)
    if (!onSortClick) onSortClick = toggleSort;
    const frag=document.createDocumentFragment();
    const cols=visibleCols();
    const widths=computeWidths(cols,data);
    const hSorts=sortsForHeader||activeSorts;

    if (title) {
        const h=document.createElement('div');
        h.className='table-section-title';
        h.innerHTML=`<span>${esc(title)}</span><span class="count">${data.length} records</span>`;
        frag.appendChild(h);
    }

    const wrapper=document.createElement('div'); wrapper.className='table-wrapper';
    const colgroup=cols.map((_,i)=>`<col style="width:${widths[i]}">`).join('');

    const headerCells=cols.map((col,i)=>{
        const si=hSorts.findIndex(s=>s.column===col);
        const dir=si>=0?hSorts[si].direction:null;
        const badge=si>=0?`<span class="sort-label">s${si+1}${dir==='asc'?'↑':'↓'}</span>`:'';
        return `<th data-col="${esc(col)}" style="width:${widths[i]}">
                  <div class="th-inner"><span class="th-name">${esc(col)}</span>${badge}</div>
                </th>`;
    }).join('');

    let bodyHTML='';
    if(!data.length){
        bodyHTML=`<tr><td colspan="${cols.length}" style="text-align:center;padding:16px;color:var(--text-dim)">No records match</td></tr>`;
    } else {
        for (const row of data) {
            const rawId=row['id']||'';
            const uid=`${fileName}_${rawId}`;
            const url=esc(row[urlColumn]||'');
            const cls=clickedItems.has(uid)?' class="visited"':'';
            const cells=cols.map(c=>`<td>${esc(row[c])}</td>`).join('');
            bodyHTML+=`<tr${cls} data-uid="${esc(uid)}" data-url="${url}">${cells}</tr>`;
        }
    }

    const table=document.createElement('table');
    table.innerHTML=`<colgroup>${colgroup}</colgroup><thead><tr>${headerCells}</tr></thead><tbody>${bodyHTML}</tbody>`;

    // Sort on column header click — uses provided callback or falls back to global
    table.querySelector('thead').addEventListener('click',e=>{
        const th=e.target.closest('th[data-col]');
        if(th) onSortClick(th.dataset.col);
    });

    // Row click
    table.querySelector('tbody').addEventListener('click',e=>{
        const tr=e.target.closest('tr[data-uid]');
        if(!tr) return;
        const uid=tr.dataset.uid, url=tr.dataset.url;
        tr.classList.toggle('visited');
        clickedItems.has(uid)?clickedItems.delete(uid):clickedItems.add(uid);
        localStorage.setItem('clickedItems',JSON.stringify([...clickedItems]));
        if(url) window.open(url,'_blank');
    });

    wrapper.appendChild(table);
    frag.appendChild(wrapper);
    const cnt=document.createElement('div');
    cnt.className='record-count';
    cnt.textContent=`${data.length} record${data.length!==1?'s':''}`;
    frag.appendChild(cnt);
    return frag;
}

// ═══════════════════════════════════════════════════════════
//  TABLE AREA
// ═══════════════════════════════════════════════════════════
function renderTableArea() {
    const area=document.getElementById('tableArea');
    area.innerHTML='';

    if (!allData.length) {
        area.innerHTML=`<div class="empty-state"><div class="icon">◈</div><h3>No data loaded</h3><p class="text-dim">Click "Load Data" to open a JSON file</p></div>`;
        return;
    }

    if (viewMode==='categories'&&categoryMap.length) {
        let pool=[...allData];
        const sections=[];
        for (const cat of categoryMap) {
            if (!cat.sorts) cat.sorts = [];      // always an array
            const matched=filterData(pool,cat.filters);
            const sorted=sortData(matched,cat.sorts);
            sections.push({name:cat.name, data:sorted, cat});
            const ids=new Set(matched.map(r=>r['id']));
            pool=pool.filter(r=>!ids.has(r['id']));
        }
        if(pool.length) sections.push({name:'other', data:pool, cat:null});

        let any=false;
        sections.forEach(({name,data,cat})=>{
            if(!data.length) return;
            const catSorts = cat ? cat.sorts : [];
            // Per-category sort toggle: mutates cat.sorts directly
            const catSortToggle = col => {
                if (!cat) return;   // "other" bucket — nothing to persist
                const i = cat.sorts.findIndex(s => s.column === col);
                if (i === -1)                            cat.sorts.push({column:col, direction:'asc'});
                else if (cat.sorts[i].direction==='asc') cat.sorts[i].direction = 'desc';
                else                                     cat.sorts.splice(i, 1);
                renderCategoryCards();   // keep edit panel in sync
                renderTableArea();
            };
            area.appendChild(buildTable(data, name, catSorts, catSortToggle));
            any=true;
        });
        if(!any) area.innerHTML=`<div class="empty-state"><div class="icon">📭</div><h3>No records</h3></div>`;

    } else {
        const filtered=filterData(allData,activeFilters);
        const sorted=sortData(filtered,activeSorts);
        area.appendChild(buildTable(sorted,''));
        const fc=document.getElementById('filterCount');
        if(fc) fc.textContent=activeFilters.length?`Showing ${sorted.length} of ${allData.length}`:`${allData.length} records`;
    }
}

// ═══════════════════════════════════════════════════════════
//  CATEGORY SAVE / LOAD / PERSIST
// ═══════════════════════════════════════════════════════════
function saveAsCategory() {
    const nameEl=document.getElementById('categoryNameInput');
    const name=nameEl.value.trim();
    if(!name){ alert('Please enter a category name.'); return; }

    const newCat={
        name,
        filters:JSON.parse(JSON.stringify(activeFilters)),
        sorts:JSON.parse(JSON.stringify(activeSorts)),
        hiddenColumns:[...hiddenColumns],
    };

    const idx=categoryMap.findIndex(c=>c.name===name);
    if(idx>=0){
        if(!confirm(`"${name}" already exists. Overwrite?`)) return;
        categoryMap[idx]=newCat;
    } else {
        categoryMap.push(newCat);
    }

    nameEl.value='';
    renderCategoryCards();
    const fb=document.getElementById('saveCatFeedback');
    fb.textContent=`✓ Saved "${name}"`;
    setTimeout(()=>{fb.textContent='';},2500);
}

function applyCategoryView() {
    if(!categoryMap.length){ alert('No categories loaded or saved yet.'); return; }
    viewMode='categories';
    if(categoryMap[0].hiddenColumns) hiddenColumns=new Set(categoryMap[0].hiddenColumns);
    renderColManager(); renderTableArea();
}
function singleView() { viewMode='single'; renderTableArea(); }

function loadCategoryMap(json) {
    categoryMap=json;
    viewMode='categories';
    // Ensure every cat has filters/sorts arrays
    categoryMap.forEach(c=>{ if(!c.filters)c.filters=[]; if(!c.sorts)c.sorts=[]; });
    if(json.length&&json[0].hiddenColumns) hiddenColumns=new Set(json[0].hiddenColumns);
    renderAll();
}

function saveCategoryMap() {
    if(!categoryMap.length){ alert('No categories to save.'); return; }
    // Sync current hidden columns into all categories
    categoryMap.forEach(c=>{ c.hiddenColumns=[...hiddenColumns]; });
    const blob=new Blob([JSON.stringify(categoryMap,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='categoryMap.json';
    a.click();
    URL.revokeObjectURL(a.href);
}

// ═══════════════════════════════════════════════════════════
//  EVENT WIRING
// ═══════════════════════════════════════════════════════════
document.getElementById('dataFileInput').addEventListener('change',e=>{
    const file=e.target.files[0]; if(!file) return;
    const name=file.name.replace(/\.[^.]+$/,'');
    const reader=new FileReader();
    reader.onload=ev=>{ try{loadData(JSON.parse(ev.target.result),name);}catch(err){alert('Bad JSON: '+err.message);} };
    reader.readAsText(file); e.target.value='';
});

document.getElementById('catMapFileInput').addEventListener('change',e=>{
    const file=e.target.files[0]; if(!file) return;
    const reader=new FileReader();
    reader.onload=ev=>{ try{loadCategoryMap(JSON.parse(ev.target.result));}catch(err){alert('Bad JSON: '+err.message);} };
    reader.readAsText(file); e.target.value='';
});

document.getElementById('addFilterBtn').addEventListener('click',      addFilter);
document.getElementById('clearFiltersBtn').addEventListener('click',   clearAllFilters);
document.getElementById('clearSortsBtn').addEventListener('click',     ()=>{activeSorts=[];refreshView();});
document.getElementById('saveAsCategoryBtn').addEventListener('click', saveAsCategory);
document.getElementById('applyCategoriesBtn').addEventListener('click',applyCategoryView);
document.getElementById('singleViewBtn').addEventListener('click',     singleView);
document.getElementById('saveCatMapBtn').addEventListener('click',     saveCategoryMap);
