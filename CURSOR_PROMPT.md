# Master Cursor Prompt — Paragon Take-Home UI Layer

## Context

This is a take-home challenge for Paragon (YC startup), a Forward Deployed Engineer internship.
The task: build a single-page web app that matches free-text customer product descriptions against
a 1,000-SKU industrial fastener catalog, returning the top 3 matches with confidence scores.

The logic layer is already complete. You only need to build the UI layer.

---

## Files Already Built (do not modify logic)

| File | Status | Role |
|------|--------|------|
| `build.js` | ✅ Done | Node.js preprocessor — reads CSVs, outputs data.js |
| `data.js` | ✅ Done | Auto-generated (665 KB). Exports `window.catalog` and `window.customers` |
| `matcher.js` | ✅ Done | All matching logic. Exports `window.Matcher` |

---

## Files You Need to Create

### 1. `index.html`
The only HTML file. Loads data.js, matcher.js, then app.js. Everything is single-page.

### 2. `styles.css`
Clean, professional styling. No CSS framework needed — plain CSS only.

### 3. `app.js`
UI wiring only. Calls `window.Matcher.match(query, customerId)` and renders results.

---

## Matcher API

```javascript
// Call the matcher:
const result = window.Matcher.match(query, customerId);
// customerId is a string like "CUST-001", or null for anonymous

// MatchResult shape:
{
  results: [         // always top 3 (or fewer if catalog is smaller)
    {
      sku: "string",
      rawDescription: "string",
      displayParts: ["string", ...],  // formatted display tokens
      active: true | false,
      attrs: {
        threadSpec: "1/2-13" | null,
        system: "imperial" | "metric" | null,
        length: "2-1/2\"" | null,
        productType: "hex cap screw" | null,
        material: "stainless" | null,
        coating: "zinc" | null,
        standard: "grade 5" | null
      },
      scores: {
        bm25: 0.0–1.0,
        attribute: 0.0–1.0,
        history: 0.0–1.0,
        final: 0.0–1.0
      },
      confidenceLabel: "High" | "Medium" | "Low",
      confidencePct: 80,   // integer 0–100
      historyBoosted: true | false   // true if customer order history helped this result
    }
  ],
  queryAttrs: {        // what the matcher parsed from the query
    threadSpec, system, length, productType, material, coating, standard
  },
  flags: {
    lowConfidence: true | false,     // true if top result is Low confidence
    isReferential: true | false,     // true if query was "same as last time" style
    isMultiProduct: true | false     // true if query asked for 2 different product types
  },
  margin: 0.12   // score gap between #1 and #2 result (used for confidence classification)
}
```

---

## Customer Data (from window.customers)

```javascript
// window.customers is an array:
[
  { name: "Acme Manufacturing", orders: [...], skuWeights: {...}, isThinHistory: false },
  ...
]
// Customer IDs: "CUST-001" through "CUST-005"
// Build the dropdown from this array
```

---

## UI Requirements

### Layout
- Single column, centered, max-width ~800px
- Header: app name + 1-line description
- Input section: large textarea for query + customer dropdown + "Match" button
- Results section: 3 result cards rendered below

### Customer Dropdown
```
[ No customer selected (anonymous) ]
[ CUST-001 — Acme Manufacturing    ]
[ CUST-002 — ...                   ]
...
```
Populate dynamically from `window.customers`. Format: `CUST-00N — Name`.

### Result Cards
Each of the 3 results gets a card showing:

1. **SKU** — bold, top left
2. **Description** — the `displayParts` array joined with " · " (middle dot), or fall back to `rawDescription`
3. **Confidence badge** — pill/badge showing `confidenceLabel` + `confidencePct`%
   - High → green badge
   - Medium → yellow/amber badge
   - Low → red/gray badge
4. **Inactive warning** — if `active === false`, show a subtle "⚠ Inactive SKU" label
5. **History boost indicator** — if `historyBoosted === true`, show a small "📦 Ordered before" tag
6. **Score breakdown** (collapsible or small) — show bm25, attribute, history scores as small bars or percentages. This is for transparency/debuggability.
7. **Rank number** — #1, #2, #3 clearly indicated

### Flags / Warnings Banner
After matching, show a banner above the results if any flags are true:
- `lowConfidence` → "⚠ Low confidence — results may not be accurate. Try adding more detail."
- `isReferential` → "📋 Referential query detected — showing items from order history."
- `isMultiProduct` → "🔀 Multi-product query detected — showing best single match. Try separate queries for each item."

### Parsed Query Attributes (optional but nice)
Show a small "Parsed as:" line below the search box displaying what `queryAttrs` detected:
e.g. `Parsed as: hex cap screw · 1/4-20 · 3/4" · zinc · imperial`
Only show non-null attrs. If nothing was parsed, omit entirely.

### Loading State
Show a brief "Matching…" state while the JS runs (even if fast, it's good UX).

### Empty / Error States
- No query entered: "Enter a product description above to find matching SKUs."
- Matcher throws: show a friendly error message.

---

## Example Queries to Test With

```
# Should return SHCS results:
socket head cap screw 7/16 x 2-1/2 alloy

# Should return hex cap screw:
1/4-20 x 3/4 hex cap screw zinc

# Should return metric BHCS:
M8 x 50mm button head cap screw alloy black oxide

# Should return brass hex nut:
brass hex nut 1/2-13

# Referential (use with CUST-001):
the same washers as last time

# Misspelling test:
sockt head cap scrw 3/8 x 1
```

---

## index.html Structure

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Paragon Part Matcher</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div id="app">
    <!-- Header -->
    <!-- Search form: textarea + customer select + button -->
    <!-- Parsed attrs display -->
    <!-- Flags banner -->
    <!-- Results grid: 3 cards -->
  </div>
  <script src="data.js"></script>
  <script src="matcher.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

---

## app.js Structure (pseudocode)

```javascript
// 1. Populate customer dropdown from window.customers
// 2. On form submit:
//    a. Get query text + selected customerId
//    b. Show loading state
//    c. Call: const result = window.Matcher.match(query, customerId)
//    d. Render queryAttrs "Parsed as:" line
//    e. Render flags banner if any flags true
//    f. Render 3 result cards
// 3. Card render function:
//    - rank badge (#1/#2/#3)
//    - SKU + description
//    - confidence badge (color-coded)
//    - active/inactive indicator
//    - history boost tag
//    - score breakdown (bm25/attribute/history/final)
```

---

## Visual Design Direction — Neobrutalism

Do NOT produce a generic Bootstrap or plain Tailwind card layout. This is a take-home for a YC startup.
The aesthetic should be **neobrutalism**: bold, high-contrast, industrial. It suits the subject matter.

### Core rules
- **Background**: off-white (`#F5F0E8`) or warm cream — not pure white
- **Cards**: white (`#FFFFFF`) with a **thick 2–3px solid black border** and a hard **4px offset black box-shadow** (e.g. `4px 4px 0px #000`). No blur, no soft shadow.
- **Hover state**: card shifts `translate(-2px, -2px)` with shadow growing to `6px 6px 0px #000`
- **Primary button**: solid black fill, white text, no border-radius (or max 2px), thick border. On hover: invert (white fill, black text, black border).
- **Font**: `'Space Grotesk'` from Google Fonts (import in CSS). Fallback: `system-ui`. The industrial sans-serif perfectly matches the fastener context.
- **Header accent**: use a bold yellow (#FFD600) or electric orange (#FF4500) highlight on a key word in the app name — e.g. "PART **MATCH**" where MATCH is in yellow
- **Rank badges**: (#1, #2, #3) — thick black border pill or square, yellow fill for #1, white for #2/#3
- **Confidence colors** (keep these, they're semantic):
  - High → `#22c55e` with black border
  - Medium → `#f59e0b` with black border
  - Low → `#ef4444` with black border
- **Score bars**: simple filled rectangles with black border, no rounded caps — raw/mechanical look
- **Parsed attrs chips**: small rectangular chips with 1.5px black border, black text — no soft pill radius
- **Flag banners**: thick left border (4px solid) in the appropriate semantic color, off-white background, bold monospace label

### Typography
```css
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap');

body { font-family: 'Space Grotesk', system-ui, sans-serif; }
```
- App title: 2rem+ bold, uppercase, letter-spacing 0.05em
- SKU: monospace font (`font-family: monospace`), bold — looks like a part number
- Description: normal weight, slightly muted color (#444)

### Layout
- Max-width 860px, centered, generous padding (40px sides)
- Textarea: full-width, thick 2px black border, `border-radius: 2px`, large (5–6 rows)
- Customer select: same border treatment as textarea
- The 3 result cards sit in a vertical stack (full width), NOT a grid — this gives room to breathe and show the score breakdown

### Reference aesthetic
Think: [Neobrutalism on Dribbble](https://dribbble.com/tags/neubrutalism) — raw, bold, honest.
Real-world example: Linear's old branding, Figma's UI kit for neubrutalism.
Keyword: "heavy borders, hard shadows, no gradients, no blur, intentional rawness."

### What to AVOID
- Soft rounded cards with subtle shadow (default Tailwind/Bootstrap look)
- Glassmorphism / frosted panels
- Gradient backgrounds
- Any pastel color palette
- Thin 1px grey borders that disappear
- Generic blue primary button (`#3b82f6` Bootstrap blue)

---

## Deliverables

When done, the folder should contain:
```
index.html       ← new
styles.css       ← new
app.js           ← new (UI wiring only)
build.js         ← existing, do not modify
data.js          ← existing, do not modify
matcher.js       ← existing, do not modify
```

To use: open `index.html` in a browser. No server needed — all files are local.
If data.js is missing or empty, run `node build.js` from the project folder first
(requires catalog.csv and order_history.csv in `Paragon Take Home - Part Matching_David/`).
