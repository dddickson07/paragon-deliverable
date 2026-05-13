/**
 * Integration-style tests: loads data.js + normalization.js + matcher.js like the browser.
 *
 * Run: npm test   (or node --test tests/matcher.test.js tests/build.test.js)
 *
 * Important: set global.window BEFORE requiring normalization.js (it attaches ParagonNormalize once).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const root = path.join(__dirname, '..');

global.window = global;

require(path.join(root, 'data.js'));
require(path.join(root, 'normalization.js'));
require(path.join(root, 'matcher.js'));

const { normalizeText } = require(path.join(root, 'normalization.js'));

function reloadMatcher() {
  delete require.cache[path.join(root, 'matcher.js')];
  require(path.join(root, 'matcher.js'));
}

function match(q, cust) {
  return global.window.Matcher.match(q, cust || null);
}

const catalog = global.window.catalog;
const customers = global.window.customers;

// ─── normalization.js ────────────────────────────────────────────────────────

test('normalize: strips inch marks', () => {
  assert.equal(normalizeText('1/4-20 x 3/4" zinc'), normalizeText('1/4-20 x 3/4 zinc'));
});

test('normalize: strips qty tokens', () => {
  assert.match(normalizeText('10 qty M8 hex nuts'), /m8 hex nut/);
  assert.doesNotMatch(normalizeText('10 qty M8 hex nuts'), /\b10\b/);
});

test('normalize: strips leading bare quantity before alpha', () => {
  assert.equal(normalizeText('500 M8 hex nuts').trim(), 'm8 hex nuts');
});

test('normalize: strips class markers', () => {
  assert.doesNotMatch(normalizeText('M12 hex nut class 8 zinc'), /class/);
});

test('normalize: expands SHCS / BHCS / HHB', () => {
  assert.match(normalizeText('SHCS M8 x 16'), /socket head cap screw/);
  assert.match(normalizeText('BHCS M8'), /button socket cap screw/);
  assert.match(normalizeText('HHB 3/4'), /hex cap screw/);
});

test('normalize: expands HDG / coatings', () => {
  assert.match(normalizeText('3/8 lag HDG'), /hot dip galvanized/);
});

test('normalize: feet → ft', () => {
  assert.match(normalizeText('1/2 rod 6 feet'), /\b6 ?ft\b|\b6ft\b/);
});

test('normalize: filler prefixes', () => {
  assert.match(normalizeText('i need 1/4-20 zinc bolt'), /1\/4-20/);
  assert.match(normalizeText('looking for M8 washer'), /m8/);
});

// ─── MatchResult shape ───────────────────────────────────────────────────────

test('match returns results (≤3), flags, queryAttrs, margin', () => {
  const r = match('1/4-20 x 3/4 hex cap screw zinc');
  assert.ok(Array.isArray(r.results));
  assert.ok(r.results.length <= 3);
  assert.ok(r.flags && typeof r.flags.lowConfidence === 'boolean');
  assert.ok(typeof r.margin === 'number');
  assert.ok(r.queryAttrs);
  assert.ok(r.decision && typeof r.decision.route === 'string');
});

test('each result has required fields', () => {
  const r = match('M8 x 30mm socket head cap screw');
  assert.ok(r.results.length >= 1);
  const x = r.results[0];
  assert.ok(x.sku);
  assert.ok(Array.isArray(x.displayParts));
  assert.ok(x.scores && typeof x.scores.final === 'number');
  assert.ok(['High', 'Medium', 'Low'].includes(x.confidenceLabel));
  assert.ok(typeof x.confidencePct === 'number');
  assert.ok(typeof x.rationale === 'string');
  assert.ok(Array.isArray(x.uncertainty));
});

// ─── Metric / imperial isolation ─────────────────────────────────────────────

test('metric query: top results are metric SKUs only', () => {
  const r = match('M8 x 50mm button socket cap screw');
  for (const row of r.results) {
    assert.equal(row.attrs.system, 'metric', `SKU ${row.sku} should be metric`);
  }
});

test('imperial thread query: top results are imperial', () => {
  const r = match('3/8-16 x 1 hex cap screw zinc');
  for (const row of r.results) {
    assert.equal(row.attrs.system, 'imperial');
  }
});

test('mixed wording still resolves metric when M-spec present', () => {
  const r = match('M16 x 8mm pan head machine screw');
  assert.ok(r.results.length >= 1);
  assert.equal(r.results[0].attrs.system, 'metric');
});

// ─── Mixed unit length (metric thread + inch length) ──────────────────────────

test('mixed unit: M thread + explicit inch length after X', () => {
  const r = match('M8 socket head cap screw x 1 inch');
  assert.equal(r.queryAttrs.system, 'metric');
  assert.equal(r.queryAttrs.threadSpec, 'M8');
  assert.equal(r.queryAttrs.length, '1');
});

test('mixed unit: M thread + fractional inch phrase', () => {
  const r = match('M8 x 2-1/2 INCH hex cap screw');
  assert.equal(r.queryAttrs.length, '2-1/2');
});

// ─── Example-query style spot checks ──────────────────────────────────────────

test('SHCS imperial abbreviation resolves', () => {
  const r = match('SHCS 7/16 x 2-1/2');
  assert.ok(r.results.length >= 1);
  assert.equal(r.results[0].attrs.productType, 'socket head cap screw');
});

test('hex bolt synonym resolves to hex cap screw', () => {
  const r = match('3/8-16 x 4 hex bolt');
  assert.ok(r.results.length >= 1);
  assert.equal(r.results[0].attrs.productType, 'hex cap screw');
});

test('HHB tap-style description', () => {
  const r = match('HHB 3/4-10 x 5/8');
  assert.ok(r.results.some((x) => x.attrs.productType === 'hex cap screw'));
});

test('brass hex nut query', () => {
  const r = match('brass hex nut 1/2-13');
  assert.ok(r.results.some((x) => x.attrs.productType === 'hex nut'));
});

test('implicit imperial hex cap when only dimensions', () => {
  const r = match('3/4-10 x 2-1/2');
  assert.equal(r.queryAttrs.productType, 'hex cap screw');
});

test('high-confidence exact query routes to auto-match', () => {
  const r = match('1/4-20 x 3/4 hex cap screw zinc');
  assert.equal(r.decision.route, 'auto-match');
});

test('underspecified generic query routes to review-required', () => {
  const r = match('washer');
  assert.equal(r.decision.route, 'review-required');
});

test('unsupported specification is surfaced for review', () => {
  const r = match('1/4-20 x 3/4 hex cap screw zinc grade 8');
  assert.ok(r.unsupportedSignals.length >= 1);
  assert.ok(
    r.unsupportedSignals.some((item) => item.label === 'Grade')
  );
  assert.notEqual(r.decision.route, 'auto-match');
});

// ─── Referential ─────────────────────────────────────────────────────────────

test('referential with customer returns ≤3 history SKUs', () => {
  const r = match('same as last time', 'CUST-001');
  assert.equal(r.flags.isReferential, true);
  assert.ok(r.results.length >= 1 && r.results.length <= 3);
  assert.ok(r.historyComparison);
});

test('referential without customer falls through to normal match', () => {
  const r = match('same as last time', null);
  assert.equal(r.flags.isReferential, true);
  assert.ok(Array.isArray(r.results));
});

test('referential result includes margin field', () => {
  const r = match('reorder what we got before', 'CUST-001');
  if (r.results.length > 0) {
    assert.ok(typeof r.margin === 'number');
  }
});

test('EXAMPLE QUERIES: "the same washers as last time" triggers referential (last time)', () => {
  const r = match('the same washers as last time', 'CUST-001');
  assert.equal(r.flags.isReferential, true);
  assert.ok(r.results.length >= 1);
});

test('referential skips orders whose SKU is missing from catalog', () => {
  const backup = JSON.parse(JSON.stringify(customers['CUST-001']));
  customers['CUST-001'].orders = [
    { sku: 'INVALID-SKU-999', description: 'ghost', quantity: 1, date: '2026-05-01', monthsAgo: 0 },
    ...backup.orders,
  ];
  reloadMatcher();

  const r = global.window.Matcher.match('same as last time', 'CUST-001');
  assert.ok(r.results.length >= 1);
  assert.ok(r.results.every((row) => row.sku !== 'INVALID-SKU-999'));

  customers['CUST-001'] = backup;
  reloadMatcher();
});

test('referential all-unknown SKUs yields empty + lowConfidence', () => {
  const backup = JSON.parse(JSON.stringify(customers['CUST-001']));
  customers['CUST-001'].orders = [
    { sku: 'INVALID-A', description: 'a', quantity: 1, date: '2026-05-01', monthsAgo: 0 },
    { sku: 'INVALID-B', description: 'b', quantity: 1, date: '2026-05-02', monthsAgo: 0 },
  ];
  reloadMatcher();

  const r = global.window.Matcher.match('same as last time', 'CUST-001');
  assert.equal(r.results.length, 0);
  assert.equal(r.flags.lowConfidence, true);

  customers['CUST-001'] = backup;
  reloadMatcher();
});

// ─── Multi-product flag ──────────────────────────────────────────────────────

test('multi-product heuristic: nuts and washers', () => {
  const r = match('M8 nuts and washers for the order');
  assert.equal(r.flags.isMultiProduct, true);
});

test('multi-product: comma-separated list', () => {
  const r = match('M8 nuts, washers');
  assert.equal(r.flags.isMultiProduct, true);
});

test('multi-product: plus separator', () => {
  const r = match('hex nuts + flat washers M12');
  assert.equal(r.flags.isMultiProduct, true);
});

test('multi-product false when single product token', () => {
  const r = match('M8 hex nuts zinc');
  assert.equal(r.flags.isMultiProduct, false);
});

test('multi-product: spaced slash separator', () => {
  const r = match('stock up on nuts / washers for bin A');
  assert.equal(r.flags.isMultiProduct, true);
});

// ─── Inactive SKU still rankable ─────────────────────────────────────────────

test('inactive SKU can appear in results with active:false', () => {
  const inactiveSku = 'PXHEX3438A2MZ0011';
  const found = catalog.find((c) => c.sku === inactiveSku);
  assert.equal(found.active, false);
  const r = match(
    '3/4-10 x 3/8 hex cap screw A307 A2 stainless mechanical zinc'
  );
  const hit = r.results.find((x) => x.sku === inactiveSku);
  assert.ok(hit, 'inactive SKU should still be matchable in top 3');
  assert.equal(hit.active, false);
});

// ─── Thin-history customer ───────────────────────────────────────────────────

test('thin-history customer gets zero history boost', () => {
  const backup = JSON.parse(JSON.stringify(customers['CUST-001']));
  customers['CUST-001'].isThinHistory = true;
  customers['CUST-001'].skuWeights = {};
  reloadMatcher();

  const r = global.window.Matcher.match(
    '1/4-20 x 3/4 hex cap screw zinc',
    'CUST-001'
  );
  assert.ok(r.results.length >= 1);
  assert.ok(r.results.every((row) => row.scores.history === 0));

  customers['CUST-001'] = backup;
  reloadMatcher();
});

test('history comparison is exposed when a customer is selected', () => {
  const r = match('1/4-20 x 3/4 hex cap screw zinc', 'CUST-001');
  assert.ok(r.historyComparison);
  assert.ok(typeof r.historyComparison.summary === 'string');
});

// ─── Low-confidence nonsense ─────────────────────────────────────────────────

test('very vague / nonsense query should flag lowConfidence or stay weak', () => {
  const r = match('zzzqqq aaabbb nonsensecatalogtoken xyz');
  assert.ok(
    r.flags.lowConfidence === true || (r.results[0] && r.results[0].scores.final < 0.35),
    'garbage text should not read as a confident match'
  );
});
