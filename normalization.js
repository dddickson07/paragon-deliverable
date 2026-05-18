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
  // ── Multi-word catalog shorthand (longest entries first for safe substitution) ──

  // Lag screw variants
  ['hx hd lag screw', 'lag screw'],
  ['hx hd lag scr', 'lag screw'],
  ['hx lag scr', 'lag screw'],

  // Socket head
  ['socket head cap screw', 'socket head cap screw'],
  ['socket head cap scr', 'socket head cap screw'],
  ['skt hd cap screw', 'socket head cap screw'],
  ['skt hd cap scr', 'socket head cap screw'],
  ['soc head cap screw', 'socket head cap screw'],
  ['soc head cap scr', 'socket head cap screw'],
  ['soc head screw', 'socket head cap screw'],
  ['soc head scr', 'socket head cap screw'],
  ['soc hd cap screw', 'socket head cap screw'],
  ['soc hd cap scr', 'socket head cap screw'],
  ['soc hd screw', 'socket head cap screw'],
  ['soc hd scr', 'socket head cap screw'],

  // Socket head set screw
  ['soc hd set screw', 'socket head set screw'],
  ['soc hd set scr', 'socket head set screw'],

  // Button head
  ['button socket cap screw', 'button socket cap screw'],
  ['button socket cap scr', 'button socket cap screw'],
  ['button soc cap screw', 'button socket cap screw'],
  ['button soc cap scr', 'button socket cap screw'],
  ['button hd cap screw', 'button head cap screw'],
  ['button hd cap scr', 'button head cap screw'],
  ['btn socket cap screw', 'button socket cap screw'],
  ['btn socket cap scr', 'button socket cap screw'],
  ['btn soc cap screw', 'button socket cap screw'],
  ['btn soc cap scr', 'button socket cap screw'],
  ['btn hd cap screw', 'button head cap screw'],
  ['btn hd cap scr', 'button head cap screw'],

  // Flat head
  ['flat head cap screw', 'flat head cap screw'],
  ['flat head cap scr', 'flat head cap screw'],
  ['flat hd cap screw', 'flat head cap screw'],
  ['flat hd cap scr', 'flat head cap screw'],
  ['fl hd cap screw', 'flat head cap screw'],
  ['fl hd cap scr', 'flat head cap screw'],
  ['csk hd cap screw', 'flat head cap screw'],
  ['csk hd cap scr', 'flat head cap screw'],

  // Pan / round / truss head machine screws
  ['phillips pan machine screw', 'phillips pan machine screw'],
  ['phillips pan mach screw', 'phillips pan machine screw'],
  ['phillips pan mach scr', 'phillips pan machine screw'],
  ['phil pan mach screw', 'phillips pan machine screw'],
  ['phil pan mach scr', 'phillips pan machine screw'],
  ['pan head machine screw', 'pan head machine screw'],
  ['pan head mach screw', 'pan head machine screw'],
  ['pan hd machine screw', 'pan head machine screw'],
  ['pan hd mach screw', 'pan head machine screw'],
  ['pan hd mach scr', 'pan head machine screw'],
  ['pan mach scr', 'pan head machine screw'],
  ['pan hd scr', 'pan head screw'],
  ['rnd hd scr', 'round head screw'],
  ['rnd hd mach scr', 'round head machine screw'],
  ['truss hd scr', 'truss head screw'],

  // Phillips machine screw acronyms
  ['pphms', 'phillips pan head machine screw'],
  ['fphms', 'flat head phillips machine screw'],
  ['rphms', 'round head phillips machine screw'],

  // Hex head / hex cap / hex bolt
  ['hex head cap screw', 'hex cap screw'],
  ['hex head cap scr', 'hex cap screw'],
  ['hex head bolt', 'hex head bolt'],
  ['hex head screw', 'hex cap screw'],
  ['hx head cap screw', 'hex cap screw'],
  ['hx head cap scr', 'hex cap screw'],
  ['hx hd bolt', 'hex head bolt'],
  ['hex hd bolt', 'hex head bolt'],
  ['hex hd scr', 'hex cap screw'],
  ['hx hd scr', 'hex cap screw'],
  ['hex cap scr', 'hex cap screw'],
  ['hx cap scr', 'hex cap screw'],
  ['hex bolts', 'hex cap screws'],
  ['hex bolt', 'hex cap screw'],
  ['hx hd', 'hex head'],
  ['hex hd', 'hex head'],

  // Hex flange
  ['hex flange screw', 'hex flange screw'],
  ['hex flange bolt', 'hex flange bolt'],
  ['hex flange nut', 'hex flange nut'],
  ['hex fln screw', 'hex flange screw'],
  ['hex fln scr', 'hex flange screw'],
  ['hex fln bolt', 'hex flange bolt'],
  ['hex fln nut', 'hex flange nut'],
  ['hx fln scr', 'hex flange screw'],
  ['hx fln bolt', 'hex flange bolt'],
  ['hx fln nut', 'hex flange nut'],

  // Hex washer head
  ['hex washer head screw', 'hex washer head screw'],
  ['hex washer head', 'hex washer head'],
  ['hex wash hd scr', 'hex washer head screw'],
  ['hex wash hd sms', 'hex washer head sheet metal screw'],
  ['hwh scr', 'hex washer head screw'],
  ['hwh sms', 'hex washer head sheet metal screw'],

  // Carriage bolt
  ['carriage bolt', 'carriage bolt'],
  ['carr bolt', 'carriage bolt'],
  ['carr blt', 'carriage bolt'],
  ['rnd hd sq nk bolt', 'carriage bolt'],

  // Set screws
  ['set screw', 'set screw'],
  ['set scr', 'set screw'],
  ['cup pt set screw', 'cup point set screw'],
  ['cup pt set scr', 'cup point set screw'],
  ['dog pt set screw', 'dog point set screw'],
  ['dog pt set scr', 'dog point set screw'],
  ['flat pt set screw', 'flat point set screw'],
  ['flat pt set scr', 'flat point set screw'],
  ['cone pt set screw', 'cone point set screw'],
  ['cone pt set scr', 'cone point set screw'],
  ['oval pt set screw', 'oval point set screw'],
  ['oval pt set scr', 'oval point set screw'],

  // Sheet metal / self-drilling / tapping screws
  ['sheet metal screw', 'sheet metal screw'],
  ['sheet metal scr', 'sheet metal screw'],
  ['self drilling screw', 'self drilling screw'],
  ['self drilling scr', 'self drilling screw'],
  ['self drill screw', 'self drilling screw'],
  ['self drill scr', 'self drilling screw'],
  ['self tapping screw', 'self tapping screw'],
  ['self tapping scr', 'self tapping screw'],
  ['self tap scr', 'self tapping screw'],

  // Threaded rod / stud
  ['full thread rod', 'threaded rod'],
  ['all thread rod', 'all thread rod'],
  ['all thrd rod', 'all thread rod'],
  ['thread rod', 'threaded rod'],
  ['thrdd rod', 'threaded rod'],
  ['tap blt', 'tap bolt'],

  // Shoulder bolt
  ['shoulder bolt', 'shoulder bolt'],
  ['shoulder screw', 'shoulder screw'],

  // Washers (multi-word)
  ['flat washer', 'flat washer'],
  ['flat wshr', 'flat washer'],
  ['lock washer', 'lock washer'],
  ['lock wshr', 'lock washer'],
  ['lk wshr', 'lock washer'],
  ['split lock washer', 'split lock washer'],
  ['split lock wshr', 'split lock washer'],
  ['splt lk wshr', 'split lock washer'],
  ['splt wshr', 'split lock washer'],
  ['ext tooth lock washer', 'external tooth lock washer'],
  ['ext tooth wshr', 'external tooth lock washer'],
  ['int tooth lock washer', 'internal tooth lock washer'],
  ['int tooth wshr', 'internal tooth lock washer'],
  ['fender washer', 'fender washer'],
  ['fender wshr', 'fender washer'],
  ['fnd wshr', 'fender washer'],
  ['belleville washer', 'belleville washer'],
  ['bel wshr', 'belleville washer'],
  ['sae flat washer', 'sae flat washer'],
  ['sae flat wshr', 'sae flat washer'],
  ['uss flat washer', 'uss flat washer'],
  ['uss flat wshr', 'uss flat washer'],
  ['sae wshr', 'sae flat washer'],
  ['uss wshr', 'uss flat washer'],

  // Nuts (multi-word)
  ['hex flange nut', 'hex flange nut'],
  ['hex jam nut', 'hex jam nut'],
  ['hx jam nut', 'hex jam nut'],
  ['nylon insert lock nut', 'nylon insert lock nut'],
  ['nylon insert nut', 'nylon insert lock nut'],
  ['nyl ins lock nut', 'nylon insert lock nut'],
  ['nyl ins nut', 'nylon insert lock nut'],
  ['prevailing torque nut', 'prevailing torque nut'],
  ['coupling nut', 'coupling nut'],
  ['cplg nut', 'coupling nut'],
  ['castle nut', 'castle nut'],
  ['castellated nut', 'castle nut'],
  ['square nut', 'square nut'],
  ['sq nut', 'square nut'],
  ['wing nut', 'wing nut'],
  ['hx nut', 'hex nut'],

  // Coatings (multi-word)
  ['hot dip galvanized', 'hot dip galvanized'],
  ['hot dip galv', 'hot dip galvanized'],
  ['hot dip zinc', 'hot dip galvanized'],
  ['mech zinc', 'mechanical zinc'],
  ['mech zn', 'mechanical zinc'],
  ['elec galv', 'electrogalvanized'],
  ['elec zinc', 'electrogalvanized'],
  ['black oxide', 'black oxide'],
  ['black phos', 'black phosphate'],
  ['bl phos', 'black phosphate'],
  ['zinc phos', 'zinc phosphate'],
  ['yellow zinc', 'zinc'],
  ['yellow zn', 'zinc'],
  ['yel zn', 'zinc'],
  ['black ox', 'black oxide'],
  ['nickel plate', 'nickel plated'],
  ['chrome plate', 'chrome plated'],
  ['geom coat', 'geomet coating'],

  // Stainless grade combos
  ['316l ss', 'stainless steel'],
  ['316 ss', 'stainless steel'],
  ['304 ss', 'stainless steel'],
  ['18-8 ss', 'stainless steel'],
  ['a2 ss', 'stainless steel'],
  ['a4 ss', 'stainless steel'],
  ['a2-70', 'stainless steel grade a2-70'],
  ['a4-80', 'stainless steel grade a4-80'],

  // ── Single-token abbreviations ────────────────────────────────────────

  // Fastener type acronyms
  ['shcs', 'socket head cap screw'],
  ['bhcs', 'button socket cap screw'],
  ['fhcs', 'flat head cap screw'],
  ['hhcs', 'hex head cap screw'],
  ['hhb',  'hex head bolt'],
  ['shss', 'socket head set screw'],
  ['fhss', 'flat head set screw'],
  ['thcs', 'truss head cap screw'],
  ['hwh',  'hex washer head'],
  ['sds',  'self drilling screw'],
  ['sms',  'sheet metal screw'],

  // Drive types
  ['torx', 'torx'],
  ['tx',   'torx'],
  ['phil', 'phillips'],
  ['pozi', 'pozidrive'],

  // Head/point descriptors
  ['csk',   'countersunk'],
  ['csink', 'countersunk'],
  ['btn',   'button'],
  ['trss',  'truss'],
  ['flt',   'flat'],
  ['rnd',   'round'],

  // Nut abbreviations
  ['hfn',    'hex flange nut'],
  ['nylock', 'nylon insert lock nut'],
  ['esna',   'elastic stop nut'],
  ['ptn',    'prevailing torque nut'],
  ['wn',     'wing nut'],
  ['cn',     'coupling nut'],

  // Washer abbreviations
  ['wshr',  'washer'],
  ['lkwshr','lock washer'],
  ['fwshr', 'flat washer'],

  // Coatings / finishes
  ['hdg',      'hot dip galvanized'],
  ['galv',     'galvanized'],
  ['eg',       'electrogalvanized'],
  ['yz',       'zinc'],
  ['mz',       'mechanical zinc'],
  ['zc',       'zinc'],
  ['zp',       'zinc plated'],
  ['bo',       'black oxide'],
  ['phos',     'phosphate'],
  ['np',       'nickel plated'],
  ['dacromet', 'zinc aluminum coating'],
  ['geomet',   'zinc aluminum geomet coating'],
  ['pln',      'plain'],
  ['zinc',     'zinc'],

  // Materials
  ['stainless', 'stainless steel'],
  ['ss',   'stainless steel'],
  ['alum', 'aluminum'],
  ['al',   'aluminum'],
  ['br',   'brass'],
  ['cs',   'carbon steel'],
  ['ti',   'titanium'],

  // Grades
  ['gr2',  'grade 2'],
  ['gr5',  'grade 5'],
  ['gr8',  'grade 8'],
  ['g2',   'grade 2'],
  ['g5',   'grade 5'],
  ['g8',   'grade 8'],
  ['gr.2', 'grade 2'],
  ['gr.5', 'grade 5'],
  ['gr.8', 'grade 8'],
  ['a307', 'astm a307'],
  ['a325', 'astm a325'],
  ['a490', 'astm a490'],
  ['cl8',  'class 8'],
  ['cl10', 'class 10'],

  // Thread standards
  ['unc',  'unified national coarse'],
  ['unf',  'unified national fine'],
  ['unef', 'unified national extra fine'],
  ['npt',  'national pipe thread'],
  ['nptf', 'national pipe taper fuel thread'],

  // Shorthand dimensions / descriptors
  ['thd',   'thread'],
  ['thrd',  'threaded'],
  ['thrdd', 'threaded'],
  ['lg',    'long'],
  ['dia',   'diameter'],
  ['od',    'outer diameter'],
  ['id',    'inner diameter'],
  ['thk',   'thick'],
  ['scr',   'screw'],
  ['blt',   'bolt'],
  ['mach',  'machine'],

  // Units
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
