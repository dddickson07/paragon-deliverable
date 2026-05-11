# Paragon Deliverable

## One-Shot SKU Matching Prototype

This deliverable is a product and systems prototype for the catalog-matching problem discussed in the founder call: a customer submits an incomplete free-text request, and the system must map that request to the correct SKU with no clarification loop.

The demo is intentionally designed around the operational realities described in the interview:

- Requests are messy and underspecified.
- Precision matters more than raw throughput.
- Returning customers create valuable priors.
- Human review should be reserved for low-confidence or ambiguous cases.

## Product Thesis

The right abstraction is not "ask an LLM to pick a SKU." It is:

1. Parse the request into structured attributes.
2. Retrieve a narrowed candidate set using hybrid search.
3. Rank candidates with an explicit scoring model.
4. Escalate edge cases using confidence thresholds and score separation.
5. Turn reviewed edge cases into labeled data for continuous improvement.

## What The Prototype Demonstrates

- Structured parsing of industrial requests into fields like:
  - product family
  - subtype
  - material
  - diameter
  - length
  - standard
  - threading / connection type
- Hybrid retrieval combining:
  - lexical overlap
  - synonym normalization
  - structured attribute alignment
- Ranking with contextual priors:
  - customer purchase history
  - end-market fit
- Safety layer:
  - only auto-match when confidence is high and the top result clearly separates from the next option
- Explainability:
  - every recommendation shows score components and match reasons

## Why This Approach Fits Paragon

This maps directly to the kind of AI system Paragon appears to be building: not a generic chatbot, but a workflow engine that makes high-stakes decisions inside messy industrial operations.

The system is designed to be:

- auditable for operators
- adaptable across customer verticals
- robust to partial information
- improvable over time through logged human corrections

## Files

- [index.html](/Users/kathu/Desktop/Paragon%20Deliverables/index.html)
- [styles.css](/Users/kathu/Desktop/Paragon%20Deliverables/styles.css)
- [app.js](/Users/kathu/Desktop/Paragon%20Deliverables/app.js)

## Suggested Framing If Sent

This should be framed as a quick thinking artifact, not as "the solution." The strongest positioning is:

"I wanted to make my thinking on the catalog-matching problem concrete, so I built a small prototype showing how I would structure retrieval, ranking, priors, and escalation for a one-shot SKU-matching workflow."
