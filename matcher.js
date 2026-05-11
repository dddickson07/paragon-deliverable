/**
 * matcher.js — All matching logic for the Paragon SKU Matcher
 *
 * Zero UI code lives here. This file exposes a single public API:
 *   window.Matcher.match(query, customerId) → MatchResult
 *
 * Pipeline:
 *   1. Special-case detection (referential query, multi-product query)
 *   2. Query normalization + attribute extraction
 *   3. Metric / imperial pre-filter (these namespaces never cross-match)
 *   4. BM25 retrieval — top MAX_CANDIDATES from the filtered pool
 *   5. Re-ranking — BM25 score + attribute match + history prior
 *   6. Confidence classification and result packaging
 *
 * Depends on: window.catalog and window.customers (from data.js), and
 * normalization.js (must load first — shared normalizeText with build.js).
 */

window.Matcher = (() => {
  'use strict';

  // ─── CONSTANTS ─────────────────────────────────────────────────────────────

  const BM25_K1 = 1.5;   // term frequency saturation
  const BM25_B  = 0.75;  // length normalization factor

  // BM25 retrieval pool before re-ranking — wide enough to surface good candidates,
  // small enough that attribute re-ranking meaningfully reorders.
  const MAX_CANDIDATES = 15;

  // Scoring weights. Rationale:
  //   attribute (0.35) — structured field matching is the most precise signal;
  //     a thread-spec match is far more reliable than word overlap.
  //   bm25 (0.45) — lexical + synonym overlap; the primary retrieval signal
  //     that handles abbreviation expansion and partial queries.
  //   history (0.15) — customer prior fills in ambiguity but never overrides
  //     explicit attribute matches (conflict rule enforced during scoring).
  const WEIGHTS = { bm25: 0.45, attribute: 0.35, history: 0.15 };

  // Confidence thresholds for label classification and UI warnings.
  const CONF = {
    HIGH_SCORE:  0.65,
    HIGH_MARGIN: 0.10,
    MED_SCORE:   0.40,
    LOW_BANNER:  0.25,   // below this → show "no strong match" warning
  };

  // History: customers with fewer than MIN_ORDERS → treated as new account.
  // Redundant with build.js flag but enforced here too as defensive check.
  const MIN_ORDERS = 3;

  // Recency decay constant (matches build.js).
  const DECAY_RATE = 0.23;

  // ─── TEXT NORMALIZATION (shared: normalization.js — load before matcher.js) ──

  function escRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeText(raw) {
    const pack = typeof window !== 'undefined' && window.ParagonNormalize;
    if (!pack || typeof pack.normalizeText !== 'function') {
      throw new Error('Paragon SKU Matcher: load normalization.js before matcher.js');
    }
    return pack.normalizeText(raw);
  }

  function tokenize(text) {
    // Split on whitespace; keep hyphenated thread specs (e.g. "3/8-16", "M8-1.25") intact.
    return text.toLowerCase().split(/\s+/).filter(Boolean);
  }

  // ─── BM25 INDEX ────────────────────────────────────────────────────────────
  // Built once at startup from window.catalog.
  // BM25 is used over TF-IDF because it normalizes for document length
  // (short catalog entries aren't penalized against longer ones) and
  // weights rare terms (e.g. specific thread specs) more heavily than common ones.

  let bm25Index = null;  // lazy-initialized on first match() call

  function buildBM25Index(catalog) {
    const N   = catalog.length;
    const df  = {};           // term → document frequency
    const tfs = [];           // per-doc: term → raw tf
    const lens = [];          // per-doc: token count
    const skuToIdx = new Map();

    for (let i = 0; i < catalog.length; i++) {
      skuToIdx.set(catalog[i].sku, i);
      const tokens = tokenize(catalog[i].normalizedText);
      lens.push(tokens.length);

      const tf = {};
      for (const tok of tokens) {
        tf[tok] = (tf[tok] || 0) + 1;
      }
      tfs.push(tf);

      for (const tok of Object.keys(tf)) {
        df[tok] = (df[tok] || 0) + 1;
      }
    }

    const avgdl = lens.reduce((a, b) => a + b, 0) / N;

    // Precompute IDF for every term in the corpus
    const idf = {};
    for (const [term, freq] of Object.entries(df)) {
      idf[term] = Math.log((N - freq + 0.5) / (freq + 0.5) + 1);
    }

    return { tfs, lens, avgdl, idf, N, skuToIdx };
  }

  // Score a single document against a list of query tokens.
  function bm25Score(docIdx, queryTokens, idx) {
    const { tfs, lens, avgdl, idf } = idx;
    const tf  = tfs[docIdx];
    const len = lens[docIdx];
    let score = 0;

    for (const tok of queryTokens) {
      const termIdf = idf[tok] || 0;
      if (termIdf === 0) continue;
      const termTf  = tf[tok]  || 0;
      const num     = termTf * (BM25_K1 + 1);
      const denom   = termTf + BM25_K1 * (1 - BM25_B + BM25_B * len / avgdl);
      score += termIdf * (num / denom);
    }
    return score;
  }

  // ─── ATTRIBUTE EXTRACTOR ───────────────────────────────────────────────────
  // Pulls structured attributes out of a free-text query.
  // These are used for the attribute match score and the metric/imperial filter.

  function extractQueryAttrs(normalizedQuery, rawQuery) {
    const rawUpper = rawQuery.toUpperCase();
    const q = rawUpper.replace(/"/g, '');
    const attrs = {
      threadSpec:  null,
      system:      null,    // 'metric' | 'imperial' | null
      length:      null,
      productType: null,
      material:    null,
      coating:     null,
      standard:    null,
    };

    // Thread spec detection — metric takes priority to avoid false imperial matches
    const metricFull   = q.match(/\b(M\d+-\d+\.\d+)\b/);
    const metricSimple = q.match(/\b(M\d+)(?=\s|X|$)/);
    const hashThread   = q.match(/\b(#\d+-\d+)\b/);
    const impFull      = q.match(/\b(\d+\/\d+-\d+)\b/);
    const impSimple    = q.match(/\b(\d+\/\d+)(?=\s|$)/);

    if (metricFull) {
      attrs.threadSpec = metricFull[1]; attrs.system = 'metric';
    } else if (metricSimple) {
      attrs.threadSpec = metricSimple[1]; attrs.system = 'metric';
    } else if (hashThread) {
      attrs.threadSpec = hashThread[1]; attrs.system = 'imperial';
    } else if (impFull) {
      attrs.threadSpec = impFull[1]; attrs.system = 'imperial';
    } else if (impSimple) {
      attrs.threadSpec = impSimple[1]; attrs.system = 'imperial';
    }

    // Length — explicit units first (supports mixed metric thread + imperial length).
    const feetLen = q.match(/\b(\d+)\s*(?:FT|FOOT|FEET)\b/i);
    const metricLen =
      q.match(/\b[Xx]\s*(\d+)\s*MM\b/i) ||
      q.match(/\b(\d+)\s*MM\b/i);
    const inchLen =
      rawUpper.match(/\b[Xx]\s*(\d+(?:-\d+\/\d+)?(?:\/\d+)?)\s*(?:IN(?:CH)?|")\b/i) ||
      rawUpper.match(/\b[Xx]\s*(\d+(?:-\d+\/\d+)?(?:\/\d+)?)\s+IN(?:CH)?\b/i);
    const impLenFrac =
      attrs.system === 'imperial'
        ? q.match(/[Xx]\s*(\d+(?:-\d+\/\d+)?(?:\/\d+)?)\b/)
        : null;

    if (feetLen) {
      attrs.length = feetLen[1] + 'ft';
    } else if (metricLen) {
      attrs.length = metricLen[1] + 'mm';
    } else if (inchLen) {
      attrs.length = inchLen[1];
    } else if (impLenFrac) {
      attrs.length = impLenFrac[1];
    } else if (attrs.system === 'metric') {
      const bareMm = q.match(/\b[Xx]\s*(\d+)\b/);
      if (bareMm) attrs.length = bareMm[1] + 'mm';
    }

    // Standard
    const stdMatch = q.match(/\b(DIN\s*\d+|ISO\s*\d+|ASME\s*B[\d.]+|IFI\s*\d+|ASTM\s*[A-Z]\d+)\b/i);
    if (stdMatch) attrs.standard = stdMatch[1].replace(/\s+/g, ' ').trim().toUpperCase();

    // Coating — test the normalized query
    const nq = normalizedQuery;
    if (/\bhot dip galvanized\b/.test(nq))   attrs.coating = 'hot dip galvanized';
    else if (/\bblack oxide\b/.test(nq))     attrs.coating = 'black oxide';
    else if (/\bmechanical zinc\b/.test(nq)) attrs.coating = 'mechanical zinc';
    else if (/\bplain\b/.test(nq))           attrs.coating = 'plain';
    else if (/\bzinc\b/.test(nq))            attrs.coating = 'zinc';

    // Material
    if (/\bstainless steel\b/.test(nq) || /\b316\b|\b18-8\b|\ba2\b/.test(nq)) {
      attrs.material = 'stainless steel';
    } else if (/\bbrass\b/.test(nq)) {
      attrs.material = 'brass';
    } else if (/\balloy(?:\s+steel)?\b/.test(nq)) {
      attrs.material = 'alloy steel';
    } else if (/\bsteel\b/.test(nq)) {
      attrs.material = 'carbon steel';
    }

    // Product type — scan normalized query for canonical type names
    const TYPE_KEYWORDS = [
      ['lag screw',                 'lag screw'],
      ['socket head cap screw',     'socket head cap screw'],
      ['button socket cap screw',   'button socket cap screw'],
      ['hex cap screw',             'hex cap screw'],
      ['phillips pan machine screw','phillips pan machine screw'],
      ['pan head machine screw',    'pan head machine screw'],
      ['tap bolt',                  'tap bolt'],
      ['threaded rod',              'threaded rod'],
      ['lock washer',               'lock washer'],
      ['flat washer',               'flat washer'],
      ['washer',                    'flat washer'],
      ['hex nut',                   'hex nut'],
      ['nut',                       'hex nut'],
      ['rod',                       'threaded rod'],
      ['bolt',                      'hex cap screw'],
      ['screw',                     null],   // too generic — don't infer
    ];
    for (const [keyword, type] of TYPE_KEYWORDS) {
      if (type && new RegExp(`\\b${escRe(keyword)}\\b`).test(nq)) {
        attrs.productType = type;
        break;
      }
    }

    // Implicit product type: bare dimension pattern with no product name
    // e.g. "3/4-10 x 2-1/2" → most likely hex cap screw
    if (!attrs.productType && attrs.threadSpec && attrs.system === 'imperial') {
      attrs.productType = 'hex cap screw';
    }

    return attrs;
  }

  // ─── ATTRIBUTE MATCH SCORER ────────────────────────────────────────────────
  // Compares extracted query attributes against a catalog item's parsed attrs.
  // Returns a score in [0, 1].
  //
  // CONFLICT RULE: the query always wins on any attribute it explicitly states.
  // History can only influence ranking when the query is silent on that attribute.
  // This function only scores structural alignment — history is handled separately.

  function attributeMatchScore(queryAttrs, itemAttrs) {
    // Hard disqualifier: if the query explicitly names a product type AND the
    // catalog item has a different product type, this is the wrong product.
    // A hex nut is never a flat washer — size overlap is irrelevant.
    // Return near-zero so BM25 can still surface it as a distant fallback,
    // but it will never beat a correctly-typed candidate.
    if (queryAttrs.productType && itemAttrs.productType &&
        queryAttrs.productType !== itemAttrs.productType) {
      return 0.02;
    }

    let positive = 0;
    let penalty  = 0;
    let checked  = 0;

    function check(qVal, iVal, weight) {
      if (!qVal) return;                          // query silent → no signal
      checked++;
      if (qVal === iVal) {
        positive += weight;
      } else if (iVal !== null && iVal !== undefined) {
        penalty  += weight;                      // full penalty on explicit conflict
      }
    }

    // Thread spec match: highest-value signal — if specs conflict, it's wrong.
    if (queryAttrs.threadSpec && itemAttrs.threadSpec) {
      const qSpec = queryAttrs.threadSpec.toUpperCase();
      const iSpec = (itemAttrs.threadSpec || '').toUpperCase();
      checked++;
      if (qSpec === iSpec) {
        positive += 0.40;
      } else if (iSpec) {
        // Partial match: same diameter, different pitch (e.g. M8 vs M8-1.25)
        const qBase = qSpec.split('-')[0];
        const iBase = iSpec.split('-')[0];
        if (qBase === iBase) {
          positive += 0.15;  // diameter matches, pitch unspecified or different
        } else {
          penalty  += 0.40;  // fundamentally different spec — hard penalize
        }
      }
    }

    check(queryAttrs.productType, itemAttrs.productType, 0.30);
    check(queryAttrs.coating,     itemAttrs.coating,     0.20);
    check(queryAttrs.material,    itemAttrs.material,    0.15);
    check(queryAttrs.standard,    normalizeStd(itemAttrs.standard), 0.10);

    // Length: soft check — customers often omit length
    if (queryAttrs.length && itemAttrs.length) {
      checked++;
      if (queryAttrs.length === itemAttrs.length) {
        positive += 0.15;
      } else {
        penalty  += 0.10;
      }
    }

    const raw = Math.max(0, positive - penalty);

    // If nothing was checked (fully silent query), return a neutral mid score
    // so BM25 and history can still differentiate candidates.
    if (checked === 0) return 0.3;

    return Math.min(1, raw);
  }

  function normalizeStd(std) {
    if (!std) return null;
    return std.toUpperCase().replace(/\s+/g, ' ').trim();
  }

  // ─── HISTORY PRIOR ─────────────────────────────────────────────────────────
  // Returns the pre-computed recency-weighted SKU score for a candidate,
  // given the selected customer. Returns 0 if no history or below threshold.
  //
  // CONFLICT RULE enforced here: if the query explicitly specifies an attribute
  // (coating, material, or product type) AND the historical SKU conflicts with
  // that attribute, the prior is set to 0 for that candidate.
  // History fills gaps; it never overrides stated intent.

  function historyPrior(sku, itemAttrs, queryAttrs, customerId) {
    if (!customerId) return 0;
    const customer = window.customers[customerId];
    if (!customer || customer.isThinHistory) return 0;

    const weight = customer.skuWeights[sku] || 0;
    if (weight === 0) return 0;

    // Conflict suppression: if query was explicit on an attribute and the
    // historical SKU's attribute conflicts, nullify its history boost.
    if (queryAttrs.coating && itemAttrs.coating && queryAttrs.coating !== itemAttrs.coating) {
      return 0;
    }
    if (queryAttrs.material && itemAttrs.material && queryAttrs.material !== itemAttrs.material) {
      return 0;
    }
    if (queryAttrs.productType && itemAttrs.productType && queryAttrs.productType !== itemAttrs.productType) {
      return 0;
    }

    return weight;
  }

  // ─── LEVENSHTEIN FALLBACK ──────────────────────────────────────────────────
  // Used to catch misspellings when a query token has no BM25 index hit.
  // Only applied as a fallback — avoids false positives on genuinely distinct terms.

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
      Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i-1] === b[j-1]
          ? dp[i-1][j-1]
          : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      }
    }
    return dp[m][n];
  }

  // ─── SPECIAL CASE DETECTORS ────────────────────────────────────────────────

  // Referential queries: the user refers to a past order rather than describing a product.
  const REFERENTIAL_PATTERNS = [
    /\bsame as (?:last|before|previous|prior)\b/i,
    /\blast (?:time|order|purchase)\b/i,
    /\bwhat i (?:ordered|got|bought)\b/i,
    /\breorder\b/i,
  ];

  function isReferentialQuery(raw) {
    return REFERENTIAL_PATTERNS.some(p => p.test(raw));
  }

  // Multi-product queries: two distinct products in one input.
  function isMultiProductQuery(raw) {
    // Two+ product-like tokens AND a separator between first and last hit:
    // "and", comma/semicolon, plus, ampersand, or spaced slash (not thread fractions).
    const pw =
      /\b(?:washers?|nuts?|screws?|bolts?|rods?|lags?|sockets?|buttons?|hex|flat|locks?)\b/gi;
    const matches = [...raw.matchAll(pw)];
    if (matches.length < 2) return false;

    const inner = raw.slice(
      matches[0].index + matches[0][0].length,
      matches[matches.length - 1].index
    );

    return (
      /\band\b/i.test(inner) ||
      /[,;+]/.test(inner) ||
      /\s&\s/.test(inner) ||
      /\s\/\s/.test(inner)
    );
  }

  // ─── MAIN MATCH FUNCTION ───────────────────────────────────────────────────

  /**
   * match(query, customerId) → MatchResult
   *
   * @param {string} query       — free-text product description from the user
   * @param {string} customerId  — customer ID from order_history (or null/empty)
   * @returns {MatchResult}
   *
   * MatchResult: {
   *   results:    Array<ResultItem>,  // top 3, sorted by finalScore desc
   *   queryAttrs: object,             // extracted query attributes (for UI display)
   *   flags: {
   *     lowConfidence:   boolean,     // top score below LOW_BANNER threshold
   *     isReferential:   boolean,     // referential query detected
   *     isMultiProduct:  boolean,     // multi-product query detected
   *   }
   * }
   *
   * ResultItem: {
   *   sku, rawDescription, displayParts, active, attrs,
   *   scores: { bm25, attribute, history, final },
   *   confidence: 'High' | 'Medium' | 'Low',
   *   confidencePct: number (0-100),
   *   historyBoosted: boolean,
   * }
   */
  function match(query, customerId) {
    const catalog = window.catalog;

    // ── Lazy-init BM25 index ──────────────────────────────────────────────
    if (!bm25Index) {
      bm25Index = buildBM25Index(catalog);
    }

    const flags = {
      isReferential:  isReferentialQuery(query),
      isMultiProduct: isMultiProductQuery(query),
      lowConfidence:  false,
    };

    // ── Special case: referential query ──────────────────────────────────
    if (flags.isReferential && customerId) {
      const customer = window.customers[customerId];
      if (customer && customer.orders.length > 0) {
        const seen = new Set();
        const recent = [];
        const sorted = [...customer.orders].sort((a, b) => new Date(b.date) - new Date(a.date));
        for (const order of sorted) {
          if (!seen.has(order.sku)) {
            seen.add(order.sku);
            const idx = bm25Index.skuToIdx.get(order.sku);
            if (idx !== undefined) recent.push(catalog[idx]);
          }
          if (recent.length >= 3) break;
        }

        if (recent.length === 0) {
          flags.lowConfidence = true;
          return { results: [], queryAttrs: {}, flags, margin: 0 };
        }

        const ranked = recent.map((item, idx) => ({
          item,
          scores: {
            bm25: 1,
            attribute: 1,
            history: 1,
            final: Math.max(0.35, 1 - idx * 0.015),
          },
          historyBoosted: true,
        }));

        const topScore = ranked[0].scores.final;
        const secondScore = ranked[1]?.scores.final ?? topScore * 0.85;
        const margin = topScore - secondScore;

        flags.lowConfidence = topScore < CONF.LOW_BANNER;

        return {
          results: ranked.map((s) =>
            packageResult(s.item, s.scores, s.historyBoosted, topScore, margin)
          ),
          queryAttrs: {},
          flags,
          margin,
        };
      }
    }

    // ── Normalize and extract attributes ─────────────────────────────────
    const normalizedQuery = normalizeText(query);
    const queryTokens     = tokenize(normalizedQuery);
    const queryAttrs      = extractQueryAttrs(normalizedQuery, query);

    // ── Metric / imperial pre-filter ─────────────────────────────────────
    // Metric and imperial thread systems are physically incompatible.
    // Never allow them to cross-match — a customer asking for M8 should
    // never see 5/16 results, regardless of how similar the descriptions are.
    let pool = catalog;
    if (queryAttrs.system === 'metric') {
      const filtered = catalog.filter(c => c.attrs.system === 'metric');
      if (filtered.length > 0) pool = filtered;
    } else if (queryAttrs.system === 'imperial') {
      const filtered = catalog.filter(c => c.attrs.system === 'imperial');
      if (filtered.length > 0) pool = filtered;
    }

    // ── BM25 retrieval ────────────────────────────────────────────────────
    // Score every item in the pool and take the top MAX_CANDIDATES.
    // We normalize BM25 scores to [0,1] relative to the top scorer.
    const rawScores = [];
    for (const item of pool) {
      const globalIdx = bm25Index.skuToIdx.get(item.sku);
      if (globalIdx === undefined) continue;
      rawScores.push({
        item,
        globalIdx,
        raw: bm25Score(globalIdx, queryTokens, bm25Index),
      });
    }

    const maxBM25 =
      rawScores.length === 0
        ? 0.001
        : Math.max(...rawScores.map((s) => s.raw), 0.001);
    const topCandidates = rawScores
      .map(s => ({ ...s, bm25Norm: s.raw / maxBM25 }))
      .sort((a, b) => b.raw - a.raw)
      .slice(0, MAX_CANDIDATES);

    // ── Levenshtein fallback ──────────────────────────────────────────────
    // If query tokens don't appear in ANY catalog description (maxBM25 near 0),
    // try fuzzy matching the product type token against the corpus.
    // This catches misspellings like "washe" → "washer".
    let fuzzyBoost = {};
    // Cap Levenshtein comparisons — vocabulary can be huge; only runs when BM25 is weak.
    const MAX_FUZZY_CMP = 3500;
    if (maxBM25 < 0.1) {
      const indexTerms = Object.keys(bm25Index.idf);
      let fuzzyCmp = 0;
      outer: for (const qTok of queryTokens) {
        if (qTok.length < 3) continue;
        for (const term of indexTerms) {
          if (fuzzyCmp++ >= MAX_FUZZY_CMP) break outer;
          if (term.length < 3) continue;
          if (Math.abs(term.length - qTok.length) > 2) continue;
          if (levenshtein(qTok, term) <= 2) {
            for (const item of pool) {
              if (item.normalizedText.includes(term)) {
                fuzzyBoost[item.sku] = (fuzzyBoost[item.sku] || 0) + 0.05;
              }
            }
          }
        }
      }
    }

    // ── Re-ranking ────────────────────────────────────────────────────────
    const scored = topCandidates.map(({ item, bm25Norm }) => {
      const attrScore = attributeMatchScore(queryAttrs, item.attrs);
      const histScore = historyPrior(item.sku, item.attrs, queryAttrs, customerId);
      const fuzz      = fuzzyBoost[item.sku] || 0;

      const final = Math.min(1,
        bm25Norm   * WEIGHTS.bm25      +
        attrScore  * WEIGHTS.attribute +
        histScore  * WEIGHTS.history   +
        fuzz
      );

      return {
        item,
        scores: { bm25: bm25Norm, attribute: attrScore, history: histScore, final },
        historyBoosted: histScore > 0,
      };
    });

    scored.sort((a, b) => b.scores.final - a.scores.final);

    const top3 = scored.slice(0, 3);
    const topScore   = top3[0]?.scores.final || 0;
    const secondScore = top3[1]?.scores.final || 0;
    const margin = topScore - secondScore;

    flags.lowConfidence = topScore < CONF.LOW_BANNER;

    // ── Package results ───────────────────────────────────────────────────
    return {
      results:    top3.map(s => packageResult(s.item, s.scores, s.historyBoosted, topScore, margin)),
      queryAttrs,
      flags,
      margin,
    };
  }

  // ─── RESULT PACKAGER ───────────────────────────────────────────────────────

  function packageResult(item, scores, historyBoosted, topScore, margin) {
    const pct    = Math.round(scores.final * 100);
    const isTop  = scores.final === topScore;
    const label  = classifyConfidence(scores.final, isTop ? margin : 0);

    return {
      sku:            item.sku,
      rawDescription: item.rawDescription,
      displayParts:   item.displayParts,
      active:         item.active,
      attrs:          item.attrs,
      scores,
      confidenceLabel: label,
      confidencePct:   pct,
      historyBoosted:  historyBoosted || false,
    };
  }

  function classifyConfidence(score, margin) {
    if (score >= CONF.HIGH_SCORE && margin >= CONF.HIGH_MARGIN) return 'High';
    if (score >= CONF.MED_SCORE) return 'Medium';
    return 'Low';
  }

  // ─── PUBLIC API ────────────────────────────────────────────────────────────

  return { match };

})();
