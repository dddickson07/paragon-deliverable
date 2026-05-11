'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const {
  parseCSV,
  parseCSVLine,
  parseDescription,
} = require(path.join(root, 'build.js'));

test('parseCSVLine: quoted commas', () => {
  const line = '"a,b","c"';
  assert.deepEqual(parseCSVLine(line), ['a,b', 'c']);
});

test('parseCSVLine: escaped quotes', () => {
  const line = '"say ""hi""",x';
  assert.deepEqual(parseCSVLine(line), ['say "hi"', 'x']);
});

test('parseCSV: skips short rows', () => {
  const csv = 'h1,h2\nfull,row\nshort\n';
  const rows = parseCSV(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].h1, 'full');
});

test('parseDescription: metric lag pattern', () => {
  const d = parseDescription('M8-1.25 X 50MM BUTTON SOCKET CAP SCR STEEL BLACK OXIDE');
  assert.equal(d.system, 'metric');
  assert.equal(d.threadSpec, 'M8-1.25');
  assert.equal(d.length, '50mm');
  assert.equal(d.productType, 'button socket cap screw');
});

test('parseDescription: imperial hex cap', () => {
  const d = parseDescription('1/4-20 X 3/4" HEX CAP SCREW STEEL ZINC');
  assert.equal(d.system, 'imperial');
  assert.equal(d.threadSpec, '1/4-20');
  assert.equal(d.productType, 'hex cap screw');
});

test('parseDescription: lag before generic HX HD', () => {
  const d = parseDescription('3/8-16 X 1-1/2 HX HD LAG SCR STEEL HDG');
  assert.equal(d.productType, 'lag screw');
});
