/**
 * normalization.js — Single source of truth for query/catalog text normalization.
 *
 * Loaded in the browser before matcher.js (sets window.ParagonNormalize).
 * Required by build.js for identical BM25 indexing strings.
 *
 * Keep ABBREV_PAIRS and normalizeText() in sync across environments — edit here only.
 */
'use strict';

const ABBREV_PAIRS = [
  ['hx hd lag scr', 'lag screw'],
  ['hx hd lag screw', 'lag screw'],
  ['hx lag scr', 'lag screw'],
  ['socket head cap scr', 'socket head cap screw'],
  ['soc head cap scr', 'socket head cap screw'],
  ['soc hd cap scr', 'socket head cap screw'],
  ['soc head cap screw', 'socket head cap screw'],
  ['soc head scr', 'socket head cap screw'],
  ['button socket cap scr', 'button socket cap screw'],
  ['button soc cap scr', 'button socket cap screw'],
  ['btn socket cap scr', 'button socket cap screw'],
  ['btn soc cap scr', 'button socket cap screw'],
  ['btn soc cap screw', 'button socket cap screw'],
  ['hex cap scr', 'hex cap screw'],
  ['hx cap scr', 'hex cap screw'],
  ['hx hd scr', 'hex cap screw'],
  ['hx hd', 'hex cap screw'],
  ['tap blt', 'tap bolt'],
  ['full thread rod', 'threaded rod'],
  ['thread rod', 'threaded rod'],
  ['phillips pan mach scr', 'phillips pan machine screw'],
  ['phillips pan mach screw', 'phillips pan machine screw'],
  ['phil pan mach scr', 'phillips pan machine screw'],
  ['pan mach scr', 'pan head machine screw'],
  ['flat wshr', 'flat washer'],
  ['lock wshr', 'lock washer'],
  ['hx nut', 'hex nut'],
  ['shcs', 'socket head cap screw'],
  ['bhcs', 'button socket cap screw'],
  ['hhb', 'hex cap screw'],
  ['hot dip galv', 'hot dip galvanized'],
  ['black oxide', 'black oxide'],
  ['black ox', 'black oxide'],
  ['yellow zinc', 'zinc'],
  ['yel zn', 'zinc'],
  ['yellow zn', 'zinc'],
  ['mech zinc', 'mechanical zinc'],
  ['mech zn', 'mechanical zinc'],
  ['a2 ss', 'stainless steel'],
  ['18-8 ss', 'stainless steel'],
  ['316 ss', 'stainless steel'],
  ['hdg', 'hot dip galvanized'],
  ['yz', 'zinc'],
  ['mz', 'mechanical zinc'],
  ['zc', 'zinc'],
  ['pln', 'plain'],
  ['stainless', 'stainless steel'],
  ['feet', 'ft'],
  ['foot', 'ft'],
];

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SORTED_ABBREVS = [...ABBREV_PAIRS].sort((a, b) => b[0].length - a[0].length);

function normalizeText(raw) {
  let t = raw.toLowerCase().trim().replace(/"/g, '');

  t = t.replace(/^(?:need|want|order(?:ing)?|looking for|i need|can i get)\s+/i, '');
  t = t.replace(/\b\d+\s*(?:qty|pcs|pieces?|ea|each|pc|units?)\b/g, '');
  t = t.replace(/^\d+\s+(?=[a-zA-Z#M])/g, '');
  t = t.replace(/\bclass\s+\d+\b/g, '');

  for (const [abbrev, expansion] of SORTED_ABBREVS) {
    const re = new RegExp(`\\b${escRe(abbrev)}\\b`, 'g');
    t = t.replace(re, expansion);
  }

  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { normalizeText, ABBREV_PAIRS };
}

if (typeof window !== 'undefined') {
  window.ParagonNormalize = { normalizeText, ABBREV_PAIRS };
}
