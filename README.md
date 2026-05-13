# Paragon · Part Match

Single-page prototype for Paragon's catalog-match take-home. The app takes a free-text fastener request, returns the top 3 catalog matches, explains why they ranked there, and optionally personalizes ranking with customer order history.

The goal of the prototype is not "perfect SKU selection." It is a defensible matching system that is explainable, handles ambiguity honestly, and knows when to route to review instead of pretending to be certain.

## What It Demonstrates

- Free-text request matching against a 1,000-item catalog
- Top-3 ranked results with confidence labels and score breakdowns
- Searchable customer selection with order-history personalization
- Explicit `Auto-Match` vs `Review Required` routing
- Edge-case handling for shorthand, vague queries, unsupported specs, multi-product requests, and referential requests like "same as last time"

## Quick Start

```bash
npm install
node build.js
open index.html
```

If `data.js` is already present, you can skip `node build.js`.

## Verification

```bash
npm test
npm run verify
```

- `npm test` runs parser + matcher coverage
- `npm run verify` runs a Playwright smoke test and writes [verification.png](/Users/kathu/Desktop/Paragon%20Deliverables/verification.png)

## Demo Flow

If I were walking through this live, I would show it in this order:

1. Base match: `1/4-20 x 3/4 hex cap screw zinc`
2. Ambiguous query: `washer`
3. Unsupported spec: `1/4-20 x 3/4 hex cap screw zinc grade 8`
4. Stretch personalization: select a customer, then try `same as last time`
5. Multi-product rejection path: `M8 nuts and washers`

That sequence shows the happy path, uncertainty handling, unsupported attributes, customer-history lift, and refusal to overcommit.

## Matching Approach

The matcher uses a simple, explainable pipeline:

1. Normalize query text and expand industrial shorthand using a shared dictionary.
2. Extract structured attributes such as thread spec, length, product type, material, coating, and standard.
3. Pre-filter metric vs imperial so incompatible systems never cross-match.
4. Retrieve a candidate set with BM25.
5. Re-rank candidates with weighted lexical score, structured attribute fit, and optional customer-history prior.
6. Classify confidence using both absolute score and separation from the next candidate.
7. Route the request to `Auto-Match` or `Review Required`.

This prototype intentionally favors transparency over model complexity. For a static 1,000-SKU catalog, BM25 plus structured re-ranking is fast, inspectable, and easy to defend in conversation.

## Stretch Challenge

The extension objective is implemented.

- The UI includes a searchable customer filter and selection control.
- A selected customer's order history contributes a recency-weighted ranking prior.
- History only fills in gaps; it does not override explicit query attributes like product type, material, or coating.
- Sparse-history customers are treated as effectively new accounts.
- Referential requests such as `same as last time` resolve directly from customer history when possible.

## Architecture

The project is split cleanly by responsibility:

| File | Responsibility |
|------|----------------|
| `build.js` | Parses the CSV inputs, extracts attributes, computes customer priors, and generates `data.js` |
| `normalization.js` | Shared text normalization and abbreviation expansion used by both build-time and runtime code |
| `matcher.js` | Matching logic only; no DOM code |
| `app.js` | UI rendering and event wiring only; no ranking logic |
| `data.js` | Generated browser-ready data layer |

## Edge Cases Covered

- Abbreviations and shorthand such as `SHCS`, `BHCS`, `HHB`, `HDG`
- Partial or underspecified requests
- Vague single-word queries
- Unsupported requested attributes such as grade, tolerance, hardness, and heat treatment
- Metric vs imperial separation
- Inactive SKUs
- Misspellings via fuzzy fallback when lexical retrieval is weak
- Multi-product requests in a single query
- Referential requests based on prior orders
- Conflicts between customer history and explicit query intent

## Tradeoffs And Limits

- No embeddings or LLM retrieval tier; this is a deliberate simplicity choice for the take-home
- Review handoff is mocked; there is no ERP or order-submission backend
- Some ambiguous phrasing still requires operator review by design
- Multi-product detection is heuristic rather than full intent parsing

## Discussion Notes

If asked why I made these choices, the core answer is:

- I optimized for explainability, deterministic behavior, and clear failure modes.
- I treated human review as part of the product, not as a fallback after the model fails.
- I used customer history as a prior, not as permission to ignore what the user explicitly asked for.
- I prioritized a clean base solution, then added the personalization stretch in a way that is easy to reason about.
