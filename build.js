/**
 * build.js — Paragon SKU Matcher preprocessor
 *
 * Reads catalog.csv and order_history.csv, extracts structured attributes
 * from description strings, computes recency-weighted customer profiles,
 * and writes data.js for the browser to load.
 *
 * Run: node build.js
 * Output: data.js (loaded by index.html as a <script> tag)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { normalizeText } = require('./normalization.js');

// ─── PATHS ────────────────────────────────────────────────────────────────────

const DATA_DIR    = path.join(__dirname, 'Paragon Take Home - Part Matching_David');
const CATALOG_CSV = path.join(DATA_DIR, 'catalog.csv');
const HISTORY_CSV = path.join(DATA_DIR, 'order_history.csv');
const OUTPUT      = path.join(__dirname, 'data.js');

// ─── CSV PARSER ───────────────────────────────────────────────────────────────
// Handles: quoted fields, commas inside quotes, doubled-quote escapes (""),
// and inch-mark characters inside quoted strings.

function parseCSV(content) {
  const lines  = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows    = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    if (values.length < headers.length) {
      console.warn(`  [warn] row ${i + 1}: expected ${headers.length} fields, got ${values.length} — skipping`);
      continue;
    }

    const row = {};
    headers.forEach((h, j) => { row[h.trim()] = (values[j] || '').trim(); });
    rows.push(row);
  }
  return rows;
}

function parseCSVLine(line) {
  const fields  = [];
  let current   = '';
  let inQuotes  = false;

  for (let i = 0; i < line.length; i++) {
    const ch   = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        // Doubled quote inside a quoted field → literal "
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

// ─── CATALOG DESCRIPTION PARSER ──────────────────────────────────────────────
// Extracts structured attributes from strings like:
//   "3/8-16 X 1-1/2 HX HD LAG SCR STEEL HDG"
//   "M8-1.25x30MM SOCKET HEAD CAP SCR STEEL BLACK OXIDE"
//   "#8-32 X 3/4" HEX CAP SCREW STEEL ZINC"
//
// Returns: { threadSpec, system, length, productType, material, coating, standard }

// Product type patterns — tested in order, first match wins.
// Longer/more-specific patterns must come before shorter ones.
const PRODUCT_PATTERNS = [
  // ── Lag screw FIRST — must beat "HX HD" which is a substring ──────────────
  [/\bHX HD LAG SCR(?:EW)?\b/i,              'lag screw'],
  [/\bHX LAG SCR(?:EW)?\b/i,                 'lag screw'],
  [/\bLAG SCR(?:EW)?\b/i,                    'lag screw'],
  // Socket head cap screw variants
  [/\bSOCKET HEAD CAP SCR(?:EW)?\b/i,       'socket head cap screw'],
  [/\bSOC HEAD CAP SCR(?:EW)?\b/i,           'socket head cap screw'],
  [/\bSOC HD CAP SCR(?:EW)?\b/i,             'socket head cap screw'],
  [/\bSOC HEAD SCR(?:EW)?\b/i,               'socket head cap screw'],
  [/\bSHCS\b/i,                              'socket head cap screw'],
  // Button socket cap screw variants
  [/\bBUTTON SOCKET CAP SCR(?:EW)?\b/i,      'button socket cap screw'],
  [/\bBUTTON SOC CAP SCR(?:EW)?\b/i,         'button socket cap screw'],
  [/\bBTN SOCKET CAP SCR(?:EW)?\b/i,         'button socket cap screw'],
  [/\bBTN SOC CAP SCR(?:EW)?\b/i,            'button socket cap screw'],
  [/\bBHCS\b/i,                              'button socket cap screw'],
  // Hex cap screw variants — HX HD must come after lag screw patterns
  [/\bHEX CAP SCR(?:EW)?\b/i,                'hex cap screw'],
  [/\bHX CAP SCR(?:EW)?\b/i,                 'hex cap screw'],
  [/\bHX HD SCR(?:EW)?\b/i,                  'hex cap screw'],
  [/\bHX HD\b/i,                             'hex cap screw'],
  [/\bHHB\b/i,                               'hex cap screw'],
  // Phillips pan machine screw
  [/\bPHILLIPS PAN MACH(?:INE)? SCR(?:EW)?\b/i, 'phillips pan machine screw'],
  [/\bPHIL PAN MACH(?:INE)? SCR(?:EW)?\b/i,     'phillips pan machine screw'],
  [/\bPAN MACH(?:INE)? SCR(?:EW)?\b/i,           'pan head machine screw'],
  // Tap bolt
  [/\bTAP BOLT\b/i,                          'tap bolt'],
  [/\bTAP BLT\b/i,                           'tap bolt'],
  // Threaded rod
  [/\bFULL THREAD(?:ED)? ROD\b/i,            'threaded rod'],
  [/\bTHREADED ROD\b/i,                      'threaded rod'],
  [/\bTHREAD ROD\b/i,                        'threaded rod'],
  [/\bROD\b/i,                               'threaded rod'],
  // Washers
  [/\bFLAT WASH(?:ER)?\b/i,                  'flat washer'],
  [/\bFLAT WSHR\b/i,                         'flat washer'],
  [/\bLOCK WASH(?:ER)?\b/i,                  'lock washer'],
  [/\bLOCK WSHR\b/i,                         'lock washer'],
  [/\bWASH(?:ER)?\b/i,                       'flat washer'],
  [/\bWSHR\b/i,                              'flat washer'],
  // Hex nut
  [/\bHEX NUT\b/i,                           'hex nut'],
  [/\bHX NUT\b/i,                            'hex nut'],
  [/\bNUT\b/i,                               'hex nut'],
];

// Coating patterns — tested in order, more-specific first.
const COATING_PATTERNS = [
  [/\bHOT DIP GALV(?:ANIZED)?\b/i,  'hot dip galvanized'],
  [/\bHDG\b/i,                       'hot dip galvanized'],
  [/\bBLACK OXIDE\b/i,               'black oxide'],
  [/\bBLACK OX\b/i,                  'black oxide'],
  [/\bBO\b(?!\s*LT)/i,               'black oxide'],   // "BO" but not "BOLT"
  [/\bYELLOW ZINC\b/i,               'zinc'],
  [/\bYEL(?:LOW)? ZN\b/i,            'zinc'],
  [/\bMECH(?:ANICAL)? ZINC\b/i,      'mechanical zinc'],
  [/\bMECH ZN\b/i,                   'mechanical zinc'],
  [/\bMZ\b/i,                        'mechanical zinc'],
  [/\bZINC\b/i,                      'zinc'],
  [/\bYZ\b/i,                        'zinc'],
  [/\bZC\b/i,                        'zinc'],
  [/\bZN\b/i,                        'zinc'],
  [/\bPLAIN\b/i,                     'plain'],
  [/\bPLN\b/i,                       'plain'],
  [/\bPL\b(?!\s*[A-Z])/i,            'plain'],   // "PL" but not "PHILLIPS"
];

// Standard patterns
const STANDARD_PATTERNS = [
  /\bDIN\s*\d+\b/i,
  /\bISO\s*\d+\b/i,
  /\bASME\s*B[\d.]+\b/i,
  /\bIFI\s*\d+\b/i,
  /\bASTM\s*[A-Z]\d+\b/i,
];

function parseDescription(raw) {
  // Work on an uppercase copy for matching; preserve original for output
  let d = raw.toUpperCase().trim().replace(/"/g, '');   // strip inch-mark chars
  const attrs = {
    threadSpec:  null,
    system:      null,   // 'metric' | 'imperial'
    length:      null,
    productType: null,
    material:    null,
    coating:     null,
    standard:    null,
  };

  // 1. Normalize the X separator (remove spaces around it for uniform parsing)
  //    e.g. "1/2-13x2" or "M8-1.25 X 30MM" or "3/8-16X1-1/2" → uniform "THREAD X LEN REST"
  d = d.replace(/\s*[Xx]\s*/, ' X ');

  // 2. Extract thread spec from the start of the string
  const metricFull   = d.match(/^(M\d+-\d+\.\d+)/);     // M8-1.25
  const metricSimple = d.match(/^(M\d+)(?=\s|X|$)/);    // M8 (washers/nuts)
  const hashThread   = d.match(/^(#\d+-\d+)/);           // #8-32
  const impFull      = d.match(/^(\d+\/\d+-\d+)/);       // 3/8-16, 1/2-13
  const impSimple    = d.match(/^(\d+\/\d+)(?=\s|$)/);   // 5/16, 3/4 (washers/nuts)

  if (metricFull) {
    attrs.threadSpec = metricFull[1];
    attrs.system     = 'metric';
    d = d.slice(metricFull[1].length).trim();
  } else if (metricSimple) {
    attrs.threadSpec = metricSimple[1];
    attrs.system     = 'metric';
    d = d.slice(metricSimple[1].length).trim();
  } else if (hashThread) {
    attrs.threadSpec = hashThread[1];
    attrs.system     = 'imperial';
    d = d.slice(hashThread[1].length).trim();
  } else if (impFull) {
    attrs.threadSpec = impFull[1];
    attrs.system     = 'imperial';
    d = d.slice(impFull[1].length).trim();
  } else if (impSimple) {
    attrs.threadSpec = impSimple[1];
    attrs.system     = 'imperial';
    d = d.slice(impSimple[1].length).trim();
  }

  // 3. Extract length (immediately after thread spec, introduced by X)
  //    Metric:   X 30MM, X 12MM
  //    Imperial: X 1-1/2, X 3/4, X 2, X 6FT
  if (d.startsWith('X ')) {
    const rest = d.slice(2).trim();
    const metricLen  = rest.match(/^(\d+)MM\b/i);
    const feetLen    = rest.match(/^(\d+)FT\b/i);
    const impLen     = rest.match(/^(\d+(?:-\d+\/\d+)?(?:\/\d+)?)\b/);

    if (metricLen) {
      attrs.length = metricLen[1] + 'mm';
      d = rest.slice(metricLen[0].length).trim();
    } else if (feetLen) {
      attrs.length = feetLen[1] + 'ft';
      d = rest.slice(feetLen[0].length).trim();
    } else if (impLen) {
      attrs.length = impLen[1];
      d = rest.slice(impLen[0].length).trim();
    }
  }

  // 4. Extract standard (e.g. DIN 933, ASME B18.2.1) from whatever remains
  //    Test against original raw for context, but also search remaining `d`
  const fullUpper = raw.toUpperCase();
  for (const pattern of STANDARD_PATTERNS) {
    const m = fullUpper.match(pattern);
    if (m) {
      attrs.standard = m[0].replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // 5. Extract coating (test against full description for safety)
  for (const [pattern, name] of COATING_PATTERNS) {
    if (pattern.test(fullUpper)) {
      attrs.coating = name;
      break;
    }
  }

  // 6. Extract material
  if (/\bA2 SS\b|\b18-8\b|\b316\b|\bSTAINLESS\b/.test(fullUpper)) {
    attrs.material = 'stainless steel';
  } else if (/\bBRASS\b/.test(fullUpper)) {
    attrs.material = 'brass';
  } else if (/\bALLOY\b/.test(fullUpper)) {
    attrs.material = 'alloy steel';
  } else if (/\bSTEEL\b/.test(fullUpper)) {
    attrs.material = 'carbon steel';
  }

  // 7. Extract product type (test against full description)
  for (const [pattern, name] of PRODUCT_PATTERNS) {
    if (pattern.test(fullUpper)) {
      attrs.productType = name;
      break;
    }
  }

  return attrs;
}

// ─── DISPLAY STRING BUILDER ───────────────────────────────────────────────────
// Converts parsed attrs into a human-readable line for the UI.

const TYPE_LABELS = {
  'socket head cap screw':     'Socket Head Cap Screw',
  'button socket cap screw':   'Button Socket Cap Screw',
  'hex cap screw':             'Hex Cap Screw',
  'lag screw':                 'Lag Screw',
  'phillips pan machine screw':'Phillips Pan Machine Screw',
  'pan head machine screw':    'Pan Head Machine Screw',
  'tap bolt':                  'Tap Bolt',
  'threaded rod':              'Threaded Rod',
  'flat washer':               'Flat Washer',
  'lock washer':               'Lock Washer',
  'hex nut':                   'Hex Nut',
};

const COATING_LABELS = {
  'hot dip galvanized': 'Hot Dip Galvanized',
  'black oxide':        'Black Oxide',
  'zinc':               'Zinc',
  'mechanical zinc':    'Mechanical Zinc',
  'plain':              'Plain',
};

const MATERIAL_LABELS = {
  'stainless steel': 'Stainless Steel',
  'brass':           'Brass',
  'alloy steel':     'Alloy Steel',
  'carbon steel':    'Steel',
};

function buildDisplayParts(attrs, rawDescription) {
  const parts = [];

  if (attrs.productType) {
    parts.push(TYPE_LABELS[attrs.productType] || titleCase(attrs.productType));
  } else {
    parts.push(rawDescription.replace(/"/g, '').trim() || rawDescription.trim());
    return parts;
  }

  if (attrs.threadSpec) parts.push(attrs.threadSpec);

  if (attrs.length) {
    const lenDisplay = attrs.length.endsWith('mm') ? attrs.length :
                       attrs.length.endsWith('ft') ? attrs.length :
                       attrs.length + ' in';
    parts.push(lenDisplay);
  }

  if (attrs.material)  parts.push(MATERIAL_LABELS[attrs.material]  || attrs.material);
  if (attrs.coating)   parts.push(COATING_LABELS[attrs.coating]    || attrs.coating);
  if (attrs.standard)  parts.push(attrs.standard);

  return parts;
}

function titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

// Text normalization: shared implementation in normalization.js (also loaded in browser).

// ─── CATALOG PROCESSOR ───────────────────────────────────────────────────────

function processCatalog(rows) {
  const items = [];
  let parsed = 0, unparsed = 0;

  for (const row of rows) {
    const { catalog_id, sku, catalog_description, active } = row;
    if (!sku || !catalog_description) continue;

    const attrs       = parseDescription(catalog_description);
    const displayParts = buildDisplayParts(attrs, catalog_description);
    const normalizedText = buildSearchText(catalog_description, attrs);

    if (attrs.productType) parsed++;
    else { unparsed++; }

    items.push({
      catalogId:      catalog_id,
      sku:            sku,
      rawDescription: catalog_description,
      active:         active.toUpperCase() === 'Y',
      displayParts,         // human-readable array for UI rendering
      attrs,                // structured attributes for re-ranking
      normalizedText,       // expanded text for BM25 indexing
    });
  }

  console.log(`  Catalog: ${items.length} items | ${parsed} parsed | ${unparsed} type-unknown`);
  return items;
}

// Build the text that goes into the BM25 index — normalized raw description
// PLUS canonical attribute values to boost recall for expansion cases.
function buildSearchText(raw, attrs) {
  let parts = [normalizeText(raw)];
  // Add canonical expansions explicitly — catches cases where the normalization
  // dictionary didn't fire due to unusual spacing or punctuation.
  if (attrs.productType) parts.push(attrs.productType);
  if (attrs.material)    parts.push(attrs.material);
  if (attrs.coating)     parts.push(attrs.coating);
  if (attrs.standard)    parts.push(attrs.standard ? attrs.standard.toLowerCase() : '');

  // Add bare diameter component so queries like "1/2 rod" match "1/2-13 ... rod".
  // Customers often omit the thread pitch/TPI when describing what they want.
  // IDF weighting naturally discounts these very common tokens.
  if (attrs.threadSpec) {
    const base = attrs.threadSpec.split('-')[0]; // "1/2" from "1/2-13", "M8" from "M8-1.25"
    if (base !== attrs.threadSpec) parts.push(base.toLowerCase());
  }

  return parts.filter(Boolean).join(' ');
}

// ─── ORDER HISTORY PROCESSOR ─────────────────────────────────────────────────
// Groups orders by customer, computes recency-weighted SKU scores.
//
// Recency decay: weight = e^(-DECAY_RATE × monthsAgo)
// At 3 months ≈ 50% weight, at 10 months ≈ 10% weight.
// This reflects that recent purchasing patterns are more predictive.
//
// Threshold rule: customers with fewer than MIN_ORDERS orders are treated as
// new customers — history prior will be 0 for all candidates. A single order
// is not a reliable pattern and creates more noise than signal.

const DECAY_RATE  = 0.23;
const MIN_ORDERS  = 3;
const NOW_MS      = Date.now();

function monthsAgo(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d)) return 999;
  return (NOW_MS - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

function processHistory(rows) {
  // Group by customer
  const byCustomer = {};
  for (const row of rows) {
    const { customer_id, customer_name, order_date, sku, catalog_description, quantity } = row;
    if (!customer_id || !sku) continue;

    if (!byCustomer[customer_id]) {
      byCustomer[customer_id] = { name: customer_name, orders: [] };
    }
    byCustomer[customer_id].orders.push({
      sku,
      description: catalog_description,
      quantity:    parseInt(quantity, 10) || 1,
      date:        order_date,
      monthsAgo:   monthsAgo(order_date),
    });
  }

  // Build recency-weighted SKU scores per customer
  const customers = {};
  for (const [id, data] of Object.entries(byCustomer)) {
    const orders = data.orders;

    // Below threshold → treat as new customer, skuWeights stays empty
    if (orders.length < MIN_ORDERS) {
      customers[id] = { name: data.name, orders, skuWeights: {}, isThinHistory: true };
      continue;
    }

    // Accumulate weighted scores per SKU
    const raw = {};
    for (const o of orders) {
      const w = Math.exp(-DECAY_RATE * o.monthsAgo);
      raw[o.sku] = (raw[o.sku] || 0) + w * Math.log1p(o.quantity);
    }

    // Normalize to [0, 1]
    const max = Math.max(...Object.values(raw));
    const skuWeights = {};
    for (const [sku, score] of Object.entries(raw)) {
      skuWeights[sku] = max > 0 ? score / max : 0;
    }

    customers[id] = { name: data.name, orders, skuWeights, isThinHistory: false };
  }

  console.log(`  History: ${Object.keys(customers).length} customers`);
  return customers;
}

// ─── WRITER ───────────────────────────────────────────────────────────────────

function writeDataJs(catalog, customers) {
  const out = [
    '// data.js — AUTO-GENERATED by build.js — do not edit manually',
    `// Generated: ${new Date().toISOString()}`,
    `// Catalog: ${catalog.length} items | Customers: ${Object.keys(customers).length}`,
    '',
    `window.catalog   = ${JSON.stringify(catalog,   null, 2)};`,
    '',
    `window.customers = ${JSON.stringify(customers, null, 2)};`,
  ].join('\n');

  fs.writeFileSync(OUTPUT, out, 'utf8');
  const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
  console.log(`  Wrote: data.js (${kb} KB)`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

function main() {
  console.log('Building data.js...\n');

  if (!fs.existsSync(CATALOG_CSV)) {
    console.error(`ERROR: cannot find ${CATALOG_CSV}`);
    process.exit(1);
  }
  if (!fs.existsSync(HISTORY_CSV)) {
    console.error(`ERROR: cannot find ${HISTORY_CSV}`);
    process.exit(1);
  }

  const catalogRows  = parseCSV(fs.readFileSync(CATALOG_CSV,  'utf8'));
  const historyRows  = parseCSV(fs.readFileSync(HISTORY_CSV,  'utf8'));

  const catalog   = processCatalog(catalogRows);
  const customers = processHistory(historyRows);

  writeDataJs(catalog, customers);

  console.log('\nDone. Open index.html in a browser to use the matcher.');
}

if (require.main === module) {
  main();
}

module.exports = {
  parseCSV,
  parseCSVLine,
  parseDescription,
  processCatalog,
  processHistory,
  buildDisplayParts,
  buildSearchText,
  monthsAgo,
};
