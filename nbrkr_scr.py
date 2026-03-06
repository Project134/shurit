# %%
"""
NoBroker Property Data Extractor — Batch Tab Version
------------------------------------------------------
Reads input.csv (columns: id, title, link, date, savedAt)
Opens BATCH_SIZE tabs at once, extracts data from all, saves, repeats.
Saves to final_excel.xlsx (skips already-extracted records).

Requirements (install once):
    pip install selenium openpyxl pandas bs4 lxml

Usage:
    python nobroker_scraper.py
"""

# ── Auto-install missing packages ─────────────────────────────────────────────
import subprocess
import sys

def import_or_install(package):
    try:
        __import__(package)
    except ImportError:
        print(f"{package} not installed. Installing...")
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', package])
        print(f"{package} has been installed.")
    else:
        print(f"{package} is already installed.")

import_or_install('selenium')
import_or_install('openpyxl')
import_or_install('pandas')
import_or_install('bs4')
import_or_install('lxml')

# ── Imports ───────────────────────────────────────────────────────────────────
import os
import sys
import time
import random
import logging
import pandas as pd
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ═════════════════════════════════════════════════════════════════════════════
#  CONFIG  — tweak these as needed
# ═════════════════════════════════════════════════════════════════════════════
INPUT_CSV    = "input.csv"
OUTPUT_EXCEL = "final_excel.xlsx"

LOGIN_WAIT   = 40    # seconds to wait for manual login
PAGE_LOAD    = 12    # seconds to let all tabs finish loading after opening batch
BATCH_SIZE   = 9     # number of tabs to open simultaneously
# ═════════════════════════════════════════════════════════════════════════════

# ── Columns — same 33 fields as the JS bookmarklet ────────────────────────────
COLUMNS = [
    "id", "url", "status", "phone", "visitDate",
    "title", "location", "rent", "maintenance", "area", "deposit",
    "bedrooms", "propertyType", "preferredTenant", "possession",
    "parking", "buildingAge", "balcony", "postedOn",
    "furnishingStatus", "facing", "waterSupply", "floor", "bathroom",
    "petAllowed", "nonVegAllowed", "gatedSecurity",
    "latitude", "longitude",
    "uniqueViews", "shortlists", "contacted",
    "comments"
]

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("nobroker_scraper.log", encoding="utf-8")
    ]
)
log = logging.getLogger(__name__)

# ── JS extraction — mirrors bookmarklet exactly ───────────────────────────────
EXTRACT_JS = """
function extractIdFromUrl(url) {
    try {
        var match = url.match(/\\/property\\/[^\\/]+\\/([a-f0-9]+)\\/detail/i);
        if (match && match[1]) return match[1];
        var parts = url.split('/');
        var detailIndex = parts.indexOf('detail');
        if (detailIndex > 0) return parts[detailIndex - 1];
        return '';
    } catch(e) { return ''; }
}

function safeExtract(selector, attribute) {
    try {
        attribute = attribute || 'textContent';
        var el = document.querySelector(selector);
        if (!el) return '';
        if (attribute === 'textContent') return el.textContent.trim().replace(/\\s+/g, ' ');
        if (attribute === 'content')     return el.getAttribute('content') || '';
        return el.getAttribute(attribute) || '';
    } catch(e) { return ''; }
}

function extractById(id) {
    try {
        var el = document.getElementById(id);
        return el ? el.textContent.trim().replace(/\\s+/g, ' ') : '';
    } catch(e) { return ''; }
}

function extractOverviewItem(title) {
    try {
        var items = document.querySelectorAll('.nb__3ocPe');
        for (var i = 0; i < items.length; i++) {
            var titleEl = items[i].querySelector('.nb__1IoiM');
            if (titleEl && titleEl.textContent.includes(title)) {
                var valueEl = items[i].querySelector('.font-semi-bold');
                return valueEl ? valueEl.textContent.trim() : '';
            }
        }
        return '';
    } catch(e) { return ''; }
}

var data = {
    id:               extractIdFromUrl(window.location.href),
    url:              window.location.href,
    status:           'Not started',
    phone:            '',
    visitDate:        '',
    title:            safeExtract('h1.nb__s_YQN'),
    location:         safeExtract('h5.nb__16pur'),
    rent:             safeExtract('#rent-maintenance span[itemprop="value"] > div > div > span') ||
                      safeExtract('#rent-maintenance .flex.gap-1 > span') ||
                      safeExtract('#rent-maintenance .nb__3h7Fo > span[itemprop="value"]'),
    maintenance:      safeExtract('#rent-maintenance .text-14.font-semibold.ml-1'),
    area:             safeExtract('#square-ft'),
    deposit:          safeExtract('#emi span[itemprop="value"]') || safeExtract('#emi'),
    bedrooms:         extractById('details-summary-typeDesc'),
    propertyType:     extractById('details-summary-buildingType'),
    preferredTenant:  extractById('details-summary-leaseType'),
    possession:       extractById('details-summary-availableFrom'),
    parking:          extractById('details-summary-parkingDesc'),
    buildingAge:      extractById('details-summary-propertyAge'),
    balcony:          extractById('details-summary-balconies'),
    postedOn:         extractById('details-summary-lastUpdateDate'),
    furnishingStatus: extractOverviewItem('Furnishing Status'),
    facing:           extractOverviewItem('Facing'),
    waterSupply:      extractOverviewItem('Water Supply'),
    floor:            extractOverviewItem('Floor'),
    bathroom:         extractOverviewItem('Bathroom'),
    petAllowed:       extractOverviewItem('Pet Allowed'),
    nonVegAllowed:    extractOverviewItem('Non-Veg Allowed'),
    gatedSecurity:    extractOverviewItem('Gated Security'),
    latitude:         safeExtract('meta[itemprop="latitude"]',  'content'),
    longitude:        safeExtract('meta[itemprop="longitude"]', 'content'),
    uniqueViews:      '',
    shortlists:       '',
    contacted:        '',
    comments:         ''
};

try {
    var actDivs = document.querySelectorAll('.nb__3PMUu');
    if (actDivs.length >= 1) data.uniqueViews = ((actDivs[0].querySelector('.nb__32dA0') || {}).textContent || '').trim();
    if (actDivs.length >= 2) data.shortlists  = ((actDivs[1].querySelector('.nb__32dA0') || {}).textContent || '').trim();
    if (actDivs.length >= 3) data.contacted   = ((actDivs[2].querySelector('.nb__32dA0') || {}).textContent || '').trim();
} catch(e) {}

return data;
"""


# ── Excel helpers ──────────────────────────────────────────────────────────────
def load_or_create_excel(path):
    if os.path.exists(path):
        log.info(f"Loading existing Excel: {path}")
        df = pd.read_excel(path, dtype=str).fillna("")
        for col in COLUMNS:
            if col not in df.columns:
                df[col] = ""
        return df[COLUMNS]
    else:
        log.info(f"final_excel.xlsx not found — creating new file: {path}")
        df = pd.DataFrame(columns=COLUMNS)
        df.to_excel(path, index=False)
        return df


def save_excel(df, path):
    df.to_excel(path, index=False)
    log.info(f"  💾  Saved {len(df)} total rows → {path}")


# ── Page-ready check ───────────────────────────────────────────────────────────
def page_is_ready(driver):
    try:
        return driver.execute_script("return document.readyState") == "complete"
    except Exception:
        return False


# ── Close all tabs except the first ───────────────────────────────────────────
def close_extra_tabs(driver):
    main_handle = driver.window_handles[0]
    for handle in driver.window_handles[1:]:
        try:
            driver.switch_to.window(handle)
            driver.close()
        except Exception:
            pass
    driver.switch_to.window(main_handle)


# ── Main ──────────────────────────────────────────────────────────────────────
def main():

    # 1. Load input CSV
    if not os.path.exists(INPUT_CSV):
        log.error(f"Input file not found: {INPUT_CSV}")
        sys.exit(1)

    input_df = pd.read_csv(INPUT_CSV, dtype=str).fillna("")
    log.info(f"Input CSV: {len(input_df)} row(s) loaded")

    if "link" not in input_df.columns:
        log.error("Column 'link' not found in input.csv")
        sys.exit(1)

    # 2. Load / create output Excel
    out_df = load_or_create_excel(OUTPUT_EXCEL)
    existing_urls = set(out_df["url"].dropna().str.strip())
    log.info(f"Already in Excel : {len(existing_urls)} record(s)")

    # 3. Build pending list
    pending = [
        str(row.get("link", "")).strip()
        for _, row in input_df.iterrows()
        if str(row.get("link", "")).strip() not in existing_urls
    ]
    log.info(f"Skipping         : {len(input_df) - len(pending)} already-extracted")
    log.info(f"Pending          : {len(pending)} to extract")
    log.info(f"Batch size       : {BATCH_SIZE} tabs")
    log.info(f"Batches needed   : {-(-len(pending) // BATCH_SIZE)}")  # ceiling div

    if not pending:
        log.info("All records already extracted. Nothing to do.")
        return

    # 4. Launch Chrome
    driver = webdriver.Chrome()
    log.info("Chrome launched.")

    try:
        driver.get("https://www.nobroker.in")
        log.info(f"⏳  Please log in manually. You have {LOGIN_WAIT} seconds…")
        for remaining in range(LOGIN_WAIT, 0, -5):
            log.info(f"   {remaining}s remaining…")
            time.sleep(5)
        log.info("Login wait done. Starting batch extraction…\n")

        total          = len(pending)
        processed      = 0
        batch_num      = 0

        # 5. Process in batches
        for batch_start in range(0, total, BATCH_SIZE):
            batch     = pending[batch_start : batch_start + BATCH_SIZE]
            batch_num += 1
            log.info(f"{'─'*60}")
            log.info(f"Batch {batch_num} — opening {len(batch)} tab(s) "
                     f"[records {batch_start+1}–{min(batch_start+BATCH_SIZE, total)} of {total}]")

            # ── Open all URLs in the batch as separate tabs ────────────────
            url_to_handle = {}   # url → window handle

            for i, url in enumerate(batch):
                if i == 0 and batch_start == 0:
                    # Very first URL: navigate the existing tab
                    driver.get(url)
                    url_to_handle[url] = driver.current_window_handle
                else:
                    handles_before = set(driver.window_handles)
                    driver.execute_script(f"window.open('{url}', '_blank');")
                    handles_after  = set(driver.window_handles)
                    new_handle     = (handles_after - handles_before).pop()
                    url_to_handle[url] = new_handle

            # ── Wait for all tabs to load ──────────────────────────────────
            log.info(f"  ⏳  Waiting {PAGE_LOAD}s for all tabs to load…")
            time.sleep(PAGE_LOAD)

            # ── Extract data from each tab ─────────────────────────────────
            batch_records = []

            for url in batch:
                handle = url_to_handle[url]
                log.info(f"  [{processed+1}/{total}]  {url}")

                try:
                    driver.switch_to.window(handle)

                    # Extra wait if page still loading
                    if not page_is_ready(driver):
                        log.info("    Page not ready yet, waiting 5s more…")
                        time.sleep(5)

                    data       = driver.execute_script(EXTRACT_JS)
                    data["url"] = url  # preserve original URL

                    log.info(
                        f"    ✔  title='{data.get('title','')[:45]}' | "
                        f"rent='{data.get('rent','')}' | "
                        f"loc='{data.get('location','')[:30]}'"
                    )
                    record = {col: str(data.get(col, "") or "").strip() for col in COLUMNS}

                except Exception as e:
                    log.error(f"    ✗  Failed: {e}")
                    record = {col: "" for col in COLUMNS}
                    record["url"]    = url
                    record["status"] = "ERROR"

                batch_records.append(record)
                processed += 1

            # ── Save entire batch at once ──────────────────────────────────
            if batch_records:
                new_rows = pd.DataFrame(batch_records, columns=COLUMNS)
                out_df   = pd.concat([out_df, new_rows], ignore_index=True)
                save_excel(out_df, OUTPUT_EXCEL)
                log.info(f"  ✅  Batch {batch_num} saved ({len(batch_records)} records). "
                         f"Progress: {processed}/{total} "
                         f"({processed/total*100:.1f}%)")

            # ── Close all extra tabs before next batch ─────────────────────
            close_extra_tabs(driver)

            # Small pause between batches
            time.sleep(random.randint(2, 4))

        log.info(f"\n{'═'*60}")
        log.info(f"✅  Extraction complete! {processed} record(s) processed.")
        log.info(f"📄  Output: {OUTPUT_EXCEL} ({len(out_df)} total rows)")

    finally:
        driver.quit()
        log.info("Browser closed.")

    # ── Auto-enrich after scraping ─────────────────────────────────────────
    log.info("\nRunning enrichment (distance, locality, district, rent/sqft)…")
    try:
        import enrich_excel
        enrich_excel.enrich()
    except Exception as e:
        log.warning(f"Enrichment skipped — run enrich_excel.py manually. Reason: {e}")


if __name__ == "__main__":
    main()

# %%
"""
NoBroker Excel Enrichment Script
----------------------------------
Reads final_excel.xlsx and adds / updates:
  1. distance_km        — straight-line distance from reference point
  2. locality           — matched Delhi locality from title/location
  3. district           — Delhi district for that locality
  4. rent_per_sqft      — (rent + maintenance) / area
  5. deposit_per_sqft   — deposit / area
  6. batch              — priority batch based on posting age + distance

Batch assignment logic:
  ┌─────────────────────────────┬───────────────┬─────────┐
  │ Posted                      │ Distance      │ Batch   │
  ├─────────────────────────────┼───────────────┼─────────┤
  │ < 3 days from today         │ < 5 km        │ batch 1 │
  │ < 3 days from today         │ 5 – 10 km     │ batch 2 │
  │ 3 – 6 days from today       │ < 5 km        │ batch 3 │
  │ 3 – 6 days from today       │ 5 – 10 km     │ batch 4 │
  │ everything else             │ —             │ other   │
  └─────────────────────────────┴───────────────┴─────────┘

Sort within each batch (and across the full sheet):
  Primary   → batch order  (batch 1 → 2 → 3 → 4 → other)
  Secondary → building_age_order  (Newly Constructed → <1yr → <2yr →
                                   1-2yr → 2-5yr → 5-10yr → >10yr → unknown)
  Tertiary  → rent_per_sqft ascending (cheapest first)

Run standalone:
    python enrich_excel.py
Or it is called automatically at the end of nobroker_scraper.py.
"""

import re
import math
import sys
import logging
import datetime
import pandas as pd

# ── Config ────────────────────────────────────────────────────────────────────
OUTPUT_EXCEL  = "final_excel.xlsx"
REFERENCE_LAT = 28.6272040
REFERENCE_LON = 77.1170842

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
log = logging.getLogger(__name__)


# ═════════════════════════════════════════════════════════════════════════════
#  LOCALITY → DISTRICT MAPPING
# ═════════════════════════════════════════════════════════════════════════════
LOCALITY_DISTRICT = {
    # Central Delhi
    "connaught place": "Central Delhi", "cp": "Central Delhi",
    "karol bagh": "Central Delhi", "paharganj": "Central Delhi",
    "rajendra place": "Central Delhi", "patel nagar": "Central Delhi",
    "gole market": "Central Delhi", "daryaganj": "Central Delhi",
    "chandni chowk": "Central Delhi", "delhi gate": "Central Delhi",
    "sadar bazar": "Central Delhi",
    # New Delhi
    "new delhi": "New Delhi", "chanakyapuri": "New Delhi",
    "lodi road": "New Delhi", "lodi colony": "New Delhi",
    "safdarjung": "New Delhi", "golf links": "New Delhi",
    "jor bagh": "New Delhi", "khan market": "New Delhi",
    "sunder nagar": "New Delhi",
    # South Delhi
    "saket": "South Delhi", "hauz khas": "South Delhi",
    "green park": "South Delhi", "malviya nagar": "South Delhi",
    "greater kailash": "South Delhi", "gk 1": "South Delhi",
    "gk 2": "South Delhi", "gk1": "South Delhi", "gk2": "South Delhi",
    "lajpat nagar": "South Delhi", "kalkaji": "South Delhi",
    "okhla": "South Delhi", "govindpuri": "South Delhi",
    "badarpur": "South Delhi", "sangam vihar": "South Delhi",
    "tughlaqabad": "South Delhi", "molar band": "South Delhi",
    "jasola": "South Delhi", "sarita vihar": "South Delhi",
    "alaknanda": "South Delhi", "chirag delhi": "South Delhi",
    "press enclave": "South Delhi", "pushp vihar": "South Delhi",
    "neb sarai": "South Delhi", "ber sarai": "South Delhi",
    "nehru place": "South Delhi", "khanpur": "South Delhi",
    "deoli": "South Delhi", "ambedkar nagar": "South Delhi",
    "madangir": "South Delhi", "ina colony": "South Delhi",
    "dda": "South Delhi",
    # South West Delhi
    "munirka": "South West Delhi", "rk puram": "South West Delhi",
    "r k puram": "South West Delhi", "vasant enclave": "South West Delhi",
    "vasant vihar": "South West Delhi", "vasant kunj": "South West Delhi",
    "dwarka": "South West Delhi", "dabri": "South West Delhi",
    "kakrola": "South West Delhi", "palam": "South West Delhi",
    "mahipalpur": "South West Delhi", "kapashera": "South West Delhi",
    "bijwasan": "South West Delhi", "samalka": "South West Delhi",
    "najafgarh": "South West Delhi", "dwarka mor": "South West Delhi",
    "dda flats munirka": "South West Delhi",
    "sarojini nagar": "South West Delhi", "moti bagh": "South West Delhi",
    # West Delhi
    "rajouri garden": "West Delhi", "janakpuri": "West Delhi",
    "uttam nagar": "West Delhi", "bindapur": "West Delhi",
    "tilak nagar": "West Delhi", "punjabi bagh": "West Delhi",
    "tagore garden": "West Delhi", "vikaspuri": "West Delhi",
    "subhash nagar": "West Delhi", "paschim vihar": "West Delhi",
    "meera bagh": "West Delhi", "madipur": "West Delhi",
    "khayala": "West Delhi", "nangloi": "West Delhi",
    "nilothi": "West Delhi", "matiala": "West Delhi",
    "naraina": "West Delhi", "ramesh nagar": "West Delhi",
    "kirti nagar": "West Delhi", "hari nagar": "West Delhi",
    # North West Delhi
    "rohini": "North West Delhi", "pitampura": "North West Delhi",
    "shalimar bagh": "North West Delhi", "ashok vihar": "North West Delhi",
    "model town": "North West Delhi", "shakurpur": "North West Delhi",
    "mangolpuri": "North West Delhi", "sultanpuri": "North West Delhi",
    "kirari": "North West Delhi", "bawana": "North West Delhi",
    "peeragarhi": "North West Delhi",
    # North Delhi
    "civil lines": "North Delhi", "mukherjee nagar": "North Delhi",
    "adarsh nagar": "North Delhi", "burari": "North Delhi",
    "timarpur": "North Delhi", "dhaka": "North Delhi",
    "bhai parmanand": "North Delhi", "kamla nagar": "North Delhi",
    "jawahar nagar": "North Delhi", "shakti nagar": "North Delhi",
    "inderlok": "North Delhi",
    # North East Delhi
    "shahdara": "North East Delhi", "dilshad garden": "North East Delhi",
    "nand nagri": "North East Delhi", "seelampur": "North East Delhi",
    "brahmpuri": "North East Delhi", "mustafabad": "North East Delhi",
    "bhajanpura": "North East Delhi", "yamuna vihar": "North East Delhi",
    "karawal nagar": "North East Delhi", "gokulpuri": "North East Delhi",
    "gokalpuri": "North East Delhi", "jaffrabad": "North East Delhi",
    "maujpur": "North East Delhi", "babarpur": "North East Delhi",
    # East Delhi
    "preet vihar": "East Delhi", "mayur vihar": "East Delhi",
    "laxmi nagar": "East Delhi", "lakshmi nagar": "East Delhi",
    "vishwas nagar": "East Delhi", "krishna nagar": "East Delhi",
    "gandhi nagar": "East Delhi", "jhilmil": "East Delhi",
    "patparganj": "East Delhi", "kondli": "East Delhi",
    "mandawali": "East Delhi", "vinod nagar": "East Delhi",
    "anand vihar": "East Delhi", "karkardooma": "East Delhi",
    "geeta colony": "East Delhi", "vivek vihar": "East Delhi",
    "ip extension": "East Delhi",
    # NCR
    "noida": "Gautam Buddh Nagar (UP)",
    "greater noida": "Gautam Buddh Nagar (UP)",
    "gurgaon": "Gurugram (Haryana)", "gurugram": "Gurugram (Haryana)",
    "faridabad": "Faridabad (Haryana)",
    "ghaziabad": "Ghaziabad (UP)",
}

# Longest-first so "dda flats munirka" beats "dda"
SORTED_LOCALITIES = sorted(LOCALITY_DISTRICT.keys(), key=len, reverse=True)


# ═════════════════════════════════════════════════════════════════════════════
#  BUILDING AGE → SORT ORDER
#  Lower number = newer = higher priority
# ═════════════════════════════════════════════════════════════════════════════
BUILDING_AGE_ORDER = {
    "newly constructed" : 0,
    # 0–1 year bucket
    "0-1 year"          : 1,
    "0-1 years"         : 1,
    "< 1 year"          : 1,
    "<1 year"           : 1,
    "< 1 years"         : 1,
    # 1–2 year bucket
    "1-2 year"          : 2,
    "1-2 years"         : 2,
    "< 2 year"          : 2,
    "< 2 years"         : 2,
    "<2 years"          : 2,
    # 1–3 year bucket (maps between 1-2 and 2-5)
    "1-3 year"          : 3,
    "1-3 years"         : 3,
    "< 3 year"          : 3,
    "< 3 years"         : 3,
    "<3 years"          : 3,
    "2-3 year"          : 3,
    "2-3 years"         : 3,
    # 3–5 year bucket
    "3-5 year"          : 4,
    "3-5 years"         : 4,
    "2-5 year"          : 4,
    "2-5 years"         : 4,
    "< 4 year"          : 4,
    "< 4 years"         : 4,
    "<4 years"          : 4,
    "3-4 year"          : 4,
    "3-4 years"         : 4,
    "< 5 year"          : 4,
    "< 5 years"         : 4,
    "<5 years"          : 4,
    "4-5 year"          : 4,
    "4-5 years"         : 4,
    # 5–10 year bucket
    "5-10 year"         : 5,
    "5-10 years"        : 5,
    # > 10 year bucket
    "> 10 year"         : 6,
    "> 10 years"        : 6,
    ">10 years"         : 6,
    "10+ years"         : 6,
    "10+ year"          : 6,
}

BATCH_ORDER = {
    "batch 1" : 1,
    "batch 2" : 2,
    "batch 3" : 3,
    "batch 4" : 4,
    "other"   : 5,
}


# ═════════════════════════════════════════════════════════════════════════════
#  HELPER FUNCTIONS
# ═════════════════════════════════════════════════════════════════════════════

def haversine_km(lat1, lon1, lat2, lon2):
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return round(R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a)), 2)


def clean_number(val):
    """Strip ₹ , + spaces and return float or None."""
    if not val or str(val).strip() in ("", "NA", "nan", "None"):
        return None
    s = re.sub(r"[₹,\s\+]", "", str(val))
    s = re.sub(r"[^\d.]", "", s)
    try:
        return float(s) if s else None
    except ValueError:
        return None


def match_locality(title, location):
    search = f"{title} {location}".lower()
    for loc in SORTED_LOCALITIES:
        if loc in search:
            return loc.title(), LOCALITY_DISTRICT[loc]
    return "Other", "Unknown"


def parse_posted_date(raw):
    """
    Parse dates like 'Mar 2, 2026' or 'Feb 18, 2026'.
    Returns a date object or None.
    """
    if not raw or str(raw).strip() in ("", "NA", "nan", "None"):
        return None
    raw = str(raw).strip()
    for fmt in ("%b %d, %Y", "%B %d, %Y", "%d %b %Y", "%d %B %Y",
                "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def building_age_sort_key(raw_age):
    """Return numeric sort key for building age string.
    Tries exact match first, then substring (longest pattern first)."""
    if not raw_age or str(raw_age).strip() in ("", "NA", "nan", "None"):
        return 99
    normalized = str(raw_age).strip().lower()
    # Exact match first
    if normalized in BUILDING_AGE_ORDER:
        return BUILDING_AGE_ORDER[normalized]
    # Substring match — longest pattern first to avoid short patterns shadowing long ones
    for pattern in sorted(BUILDING_AGE_ORDER.keys(), key=len, reverse=True):
        if pattern.lower() in normalized:
            return BUILDING_AGE_ORDER[pattern]
    return 99


def assign_batch(posted_date, distance_km):
    """
    Assign batch name based on posting age and distance.
    posted_date : datetime.date or None
    distance_km : float or None
    """
    today = datetime.date.today()

    # posting age in days
    if posted_date is not None:
        age_days = (today - posted_date).days
    else:
        age_days = None   # unknown → falls to 'other'

    # distance bucket
    if distance_km is not None:
        near = distance_km < 5
        mid  = 5 <= distance_km <= 10
    else:
        near = False
        mid  = False

    if age_days is not None and age_days < 3:
        if near:
            return "batch 1"
        if mid:
            return "batch 2"
    if age_days is not None and 3 <= age_days <= 6:
        if near:
            return "batch 3"
        if mid:
            return "batch 4"

    return "other"


# ═════════════════════════════════════════════════════════════════════════════
#  MAIN ENRICHMENT
# ═════════════════════════════════════════════════════════════════════════════

def enrich():
    try:
        df = pd.read_excel(OUTPUT_EXCEL, dtype=str).fillna("")
    except FileNotFoundError:
        log.error(f"{OUTPUT_EXCEL} not found. Run nobroker_scraper.py first.")
        return

    log.info(f"Loaded {len(df)} rows from {OUTPUT_EXCEL}")
    today = datetime.date.today()
    log.info(f"Today's date for batch calculation: {today}")

    # ── Compute columns row-by-row ─────────────────────────────────────────
    dist_col             = []
    locality_col         = []
    district_col         = []
    rent_psf_col         = []
    deposit_psf_col      = []
    batch_col            = []
    age_sort_col         = []   # internal, used for sorting
    post_age_col         = []   # days since posted
    balcony_col          = []   # -1 if not mentioned

    for i, row in df.iterrows():

        # Distance
        try:
            lat = float(row.get("latitude",  "") or 0)
            lon = float(row.get("longitude", "") or 0)
            dist = haversine_km(REFERENCE_LAT, REFERENCE_LON, lat, lon) if (lat and lon) else None
        except (ValueError, TypeError):
            dist = None
        dist_col.append(dist)

        # Locality & District
        locality, district = match_locality(
            str(row.get("title", "")),
            str(row.get("location", ""))
        )
        locality_col.append(locality)
        district_col.append(district)

        # Financial per-sqft
        rent        = clean_number(row.get("rent",        ""))
        maintenance = clean_number(row.get("maintenance", "")) or 0.0
        area        = clean_number(row.get("area",        ""))
        deposit     = clean_number(row.get("deposit",     ""))

        if area and area > 0:
            total_rent  = (rent or 0) + maintenance
            rent_psf    = round(total_rent / area, 2) if rent is not None else None
            deposit_psf = round(deposit / area, 2)    if deposit is not None else None
        else:
            rent_psf = deposit_psf = None

        rent_psf_col.append(rent_psf)
        deposit_psf_col.append(deposit_psf)

        # Posted date
        posted_date = parse_posted_date(row.get("postedOn", ""))

        # Batch
        batch = assign_batch(posted_date, dist)
        batch_col.append(batch)

        # Post age in days from today — 0 if posted today, None only if date unparseable
        post_age = (today - posted_date).days if posted_date is not None else None
        post_age_col.append(post_age)

        # Balcony — -1 if not mentioned / blank
        raw_balcony = str(row.get("balcony", "")).strip()
        if raw_balcony in ("", "NA", "nan", "None"):
            balcony_val = -1
        else:
            try:
                balcony_val = int(float(raw_balcony))
            except (ValueError, TypeError):
                balcony_val = -1
        balcony_col.append(balcony_val)

        # Building age sort key (stored temporarily for sorting)
        age_sort_col.append(building_age_sort_key(row.get("buildingAge", "")))

        log.info(
            f"[{i+1}/{len(df)}]  {str(row.get('title',''))[:40]:<40} | "
            f"dist={dist} km | posted={posted_date} | age={post_age}d | "
            f"batch={batch} | rent/sqft={rent_psf}"
        )

    # ── Attach computed columns ────────────────────────────────────────────
    df["distance_km"]       = dist_col
    df["locality"]          = locality_col
    df["district"]          = district_col
    df["rent_per_sqft"]     = rent_psf_col
    df["deposit_per_sqft"]  = deposit_psf_col
    df["batch"]             = batch_col
    df["postAge"]           = post_age_col
    df["balcony_count"]     = balcony_col          # -1 = not mentioned
    df["_age_sort"]         = age_sort_col
    df["_batch_order"]      = df["batch"].map(BATCH_ORDER).fillna(5)

    # ── Sort: batch order → building age → rent_per_sqft ──────────────────
    df["_rent_psf_sort"] = pd.to_numeric(df["rent_per_sqft"], errors="coerce").fillna(9999)

    df = df.sort_values(
        by=["_batch_order", "_age_sort", "_rent_psf_sort"],
        ascending=[True, True, True]
    ).reset_index(drop=True)

    # Drop only the two purely-internal sort helpers (not age_sort)
    df.drop(columns=["_batch_order", "_rent_psf_sort"], inplace=True)
    df.rename(columns={"_age_sort": "age_sort"}, inplace=True)

    # ── Column order: original 33 + new enrichment columns ────────────────
    original_cols = [c for c in df.columns if c not in
                     ["distance_km", "locality", "district",
                      "rent_per_sqft", "deposit_per_sqft", "postAge", "balcony_count", "age_sort", "batch"]]
    final_order = original_cols + [
        "distance_km", "locality", "district",
        "rent_per_sqft", "deposit_per_sqft", "postAge", "balcony_count", "age_sort", "batch"
    ]
    df = df[final_order]

    df.to_excel(OUTPUT_EXCEL, index=False)

    # ── Summary log ───────────────────────────────────────────────────────
    log.info(f"\n{'═'*55}")
    log.info(f"✅  Enriched file saved → {OUTPUT_EXCEL}")
    log.info(f"{'─'*55}")
    batch_counts = df["batch"].value_counts().reindex(
        ["batch 1", "batch 2", "batch 3", "batch 4", "other"], fill_value=0
    )
    for b, count in batch_counts.items():
        log.info(f"   {b:10s}: {count} records")
    log.info(f"{'═'*55}")


if __name__ == "__main__":
    enrich()

# %%
"""
Convert final_excel.xlsx → house.json
---------------------------------------
Output is consumed by table.html / table.js.
  - 'id'       → id field
  - 'batch'    → category field  (groups rows into separate tables)
  - 'url'      → url field       (opens on row click)
  - All other columns follow COLUMN_ORDER below.

COLUMN_ORDER controls:
  - Which columns are included (set value to 0 to exclude entirely)
  - The display order (lower number = appears earlier)
  - Columns not listed here are excluded automatically

Zero-value rule:
  - If a cell's value is exactly 0 or "0", it is shown as blank in the table.

Usage:
    python make_json.py
"""

import pandas as pd
import json
import os

# ── Config ────────────────────────────────────────────────────────────────────
INPUT_EXCEL  = "final_excel.xlsx"
OUTPUT_JSON  = "house.json"

# ═════════════════════════════════════════════════════════════════════════════
#  COLUMN ORDER
#  Set the display order for each column (1 = first, 2 = second, …).
#  Set to 0 to EXCLUDE the column from the output entirely.
#  Columns not listed here are excluded automatically.
# ═════════════════════════════════════════════════════════════════════════════
COLUMN_ORDER = {
    # ── Core identity (always kept, handled separately) ───────────────────
    # 'id', 'url', 'batch/category' are always included — no need to list them

    # ── Property basics ───────────────────────────────────────────────────
    "title"             : 1,
    "location"          : 2,
    "locality"          : 3,
    "district"          : 4,
    "distance_km"       : 5,

    # ── Financials ────────────────────────────────────────────────────────
    "rent"              : 6,
    "maintenance"       : 7,
    "rent_per_sqft"     : 8,
    "deposit"           : 9,
    "deposit_per_sqft"  : 10,

    # ── Property details ──────────────────────────────────────────────────
    "area"              : 11,
    "bedrooms"          : 12,
    "propertyType"      : 13,
    "furnishingStatus"  : 14,
    "floor"             : 15,
    "bathroom"          : 16,
    "balcony"           : 17,
    "facing"            : 18,
    "buildingAge"       : 19,
    "parking"           : 20,

    # ── Tenant preferences ────────────────────────────────────────────────
    "preferredTenant"   : 21,
    "petAllowed"        : 22,
    "nonVegAllowed"     : 23,

    # ── Availability ──────────────────────────────────────────────────────
    "postAge"           : 24,
    "postedOn"          : 25,

    # ── Amenities ─────────────────────────────────────────────────────────
    "waterSupply"       : 26,
    "gatedSecurity"     : 27,

    # ── Activity ──────────────────────────────────────────────────────────
    "uniqueViews"       : 28,
    "shortlists"        : 29,
    "contacted"         : 30,
    "age_sort"          : 31,

    # ── Workflow columns (set to 0 to hide) ───────────────────────────────
    "status"            : 0,   # hide
    "phone"             : 0,   # hide
    "visitDate"         : 0,   # hide
    "comments"          : 0,   # hide

    # ── Coordinates (usually not useful in table view) ────────────────────
    "latitude"          : 0,   # hide
    "longitude"         : 0,   # hide
}
# ═════════════════════════════════════════════════════════════════════════════


def clean_value(val):
    """
    Return cleaned string value.
    - 0 or '0' → '' (blank, not visible in table)
    - NaN / None / 'nan' / 'None' → ''
    - Everything else → stripped string
    """
    if val is None:
        return ""
    s = str(val).strip()
    if s in ("nan", "None", "NaN", ""):
        return ""
    return s


def make_json():
    if not os.path.exists(INPUT_EXCEL):
        print(f"ERROR: {INPUT_EXCEL} not found.")
        return

    df = pd.read_excel(INPUT_EXCEL, dtype=str).fillna("")
    print(f"Loaded {len(df)} rows from {INPUT_EXCEL}")

    # Build ordered list of display columns (exclude 0-valued entries)
    visible_columns = sorted(
        [(col, order) for col, order in COLUMN_ORDER.items() if order > 0],
        key=lambda x: x[1]
    )
    ordered_cols = [col for col, _ in visible_columns]

    # Only keep columns that actually exist in the Excel
    ordered_cols = [c for c in ordered_cols if c in df.columns]

    print(f"Columns included : {ordered_cols}")
    print(f"Columns excluded : {[c for c, v in COLUMN_ORDER.items() if v == 0]}")

    records = []
    for _, row in df.iterrows():
        record = {}

        # Fixed fields for table.js
        record["id"]       = clean_value(row.get("id", ""))
        record["url"]      = clean_value(row.get("url", ""))
        record["category"] = clean_value(row.get("batch", "other")) or "other"

        # Ordered display columns
        for col in ordered_cols:
            record[col] = clean_value(row.get(col, ""))

        records.append(record)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    # Summary
    print(f"\n✅  Written {len(records)} records → {OUTPUT_JSON}")
    categories = {}
    for r in records:
        cat = r["category"]
        categories[cat] = categories.get(cat, 0) + 1
    print("─" * 40)
    for cat in ["batch 1", "batch 2", "batch 3", "batch 4", "other"]:
        if cat in categories:
            print(f"  {cat:10s}: {categories[cat]} records")
    print("─" * 40)


if __name__ == "__main__":
    make_json()

# %%



