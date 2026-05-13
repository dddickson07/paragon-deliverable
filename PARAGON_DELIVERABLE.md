# Paragon Deliverable

## Summary

This prototype turns a messy free-text fastener request into a ranked, explainable shortlist of likely SKUs. It is designed for a one-shot operational workflow where precision matters, customer requests are often underspecified, and the system should be opinionated about when not to auto-decide.

## Product Thesis

The right abstraction is not "have a model guess the SKU." It is:

1. Normalize the request into consistent language.
2. Extract the strongest structured signals.
3. Retrieve a plausible candidate set.
4. Re-rank with explicit scoring and optional customer priors.
5. Escalate weak or ambiguous cases instead of forcing confidence.

## What The Prototype Shows

- Top-3 catalog matches for a free-text request
- Confidence labels and score breakdowns for each recommendation
- Searchable customer selection and order-history personalization
- Review routing for vague, conflicting, or multi-product inputs
- Explainability through rationale text and unsupported-attribute warnings

## Why This Fits The Prompt

The take-home emphasized three things: a defensible matcher, clean separation of concerns, and thoughtfulness around edge cases. This prototype is built around those goals:

- `matcher.js` contains ranking logic only
- `app.js` contains UI logic only
- `build.js` prepares the data layer ahead of time
- `normalization.js` keeps build-time and runtime tokenization aligned

## Suggested Interview Framing

The strongest concise framing is:

"I treated this as a retrieval-and-ranking problem rather than a chatbot problem. I wanted the system to be explainable, conservative under ambiguity, and easy to personalize with customer history without letting history override explicit user intent."

## Useful Demo Queries

- `1/4-20 x 3/4 hex cap screw zinc`
- `washer`
- `1/4-20 x 3/4 hex cap screw zinc grade 8`
- `same as last time` with a customer selected
- `M8 nuts and washers`
