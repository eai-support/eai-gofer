---
name: market-sizing
description: "Estimates TAM, SAM and SOM with top-down and bottom-up triangulation and stated assumptions. Use to size a market."
---

# Market Sizing

Estimate how big a market is, how much of it is reachable, and how much is winnable.

## Input

- The product or service, target customers, geography, year, and currency.

## Method

1. Define the market: product, customer, geography, year, value or volume.
2. TAM: total demand for the need. SAM: the part the offer and channels can serve. SOM: the share you can win in 3 to 5 years, based on share benchmarks.
3. Top-down: total spend x relevant share.
4. Bottom-up: number of customers x adoption rate x purchase frequency x price.
5. Triangulate. If the two methods differ by more than 25%, explain why and adjust.
6. Give a range (low, base, high) and the growth rate (CAGR) with drivers.
7. Source every input or label it [Assumption].

## Output

1. Driver tree for each method.
2. Table: Measure | Low | Base | High | Key assumptions | Sources.
3. Reconciliation note and growth outlook.

## Quality bar

- Units, year, and currency are stated.
- Every number traces to a source or a labeled assumption.

## Boundaries

- Not for defining customer segments: use `customer-segmentation`.
- Not for flexing assumptions: use `sensitivity-analysis`.
- Hand off to: `growth-strategy`, `business-case`.

## Rules

- If a required input is missing, ask once when you can. Otherwise state an assumption, label it [Assumption], and continue.
- Do not invent facts, figures, or sources. Use provided material or sources you can check; label other knowledge [Unverified] and estimates [Estimate].
