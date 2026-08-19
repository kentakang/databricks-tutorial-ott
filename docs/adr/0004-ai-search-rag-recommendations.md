# ADR 0004: AI Search RAG recommendations

- Status: Accepted
- Date: 2026-08-19

## Context

The deployed MVP selects recommendation candidates with a deterministic in-process TypeScript ranker and uses a Databricks Foundation Model only to group those candidates into four themes. This is safe and explainable, but it does not demonstrate Databricks AI Search or a retrieval-augmented generation workflow. The user requested that the recommendation model use Databricks RAG capabilities, including an AI Search endpoint and index.

The source catalog contains only 200 synthetic movies. Each movie has rich Korean metadata but no reusable retrieval document. The app must continue excluding watched titles, avoid demographic ranking features, reject hallucinated IDs, remain usable during platform failures, and receive only least-privilege access.

## Decision

Use AI Search as the primary candidate retriever and retain the Foundation Model as the grounded generator:

1. Provision `movie_search_documents`, a non-identifying Delta table with Change Data Feed enabled. Each row combines movie genre, setting, protagonist, conflict, keywords, logline, runtime, original status, and aggregate quality signals into one Korean retrieval document.
2. Create the Standard AI Search endpoint `media-ott-recommendations-search` and the Delta Sync Hybrid Index `media_dev.ott_recommendations.movie_recommendations_search` through the bundle. Use triggered sync because the demo catalog changes only during explicit data provisioning.
3. Let Databricks compute document and query embeddings with `databricks-qwen3-embedding-0-6b`. This multilingual embedding model is selected for the Korean catalog and query text.
4. Build a query from preferred genre, viewing context, and up to six positive viewing anchors. Do not include user ID, birth year, household type, gender, region, or raw reviews.
5. Retrieve 64 movie IDs with Hybrid search. The server validates IDs, removes duplicates and watched titles, and accepts the retrieval only when at least 32 grounded candidates remain.
6. Pass only those retrieved candidates and their governed catalog metadata to the existing Foundation Model. Continue validating its JSON, candidate IDs, cross-theme uniqueness, and minimum theme size.
7. If retrieval fails or returns too few candidates, fall back to the deterministic ranker. If generation fails, retain AI Search candidates but create deterministic themes. Cache a complete RAG result for 30 minutes and any degraded result for two minutes.
8. Bind the AI Search index to the app as a Unity Catalog table with `SELECT`; Databricks grants the required parent `USE CATALOG` and `USE SCHEMA` privileges. Resolve the index name from the app resource binding rather than hard-coding it.

## Alternatives considered

### Keep deterministic retrieval and rename it as RAG

This would avoid new resources, but it would not perform semantic retrieval and would misrepresent the platform flow.

### Let the Foundation Model generate titles without retrieval

This reduces infrastructure, but it can hallucinate catalog items and cannot demonstrate governed grounding.

### Use a Direct Vector Access Index

Direct access would require the application or another job to compute and upsert vectors. Delta Sync keeps the governed Delta table as the source of truth and removes that write path.

### Use continuous index synchronization

Continuous sync minimizes freshness lag but adds ongoing processing for a catalog that changes only during controlled demo provisioning. Triggered sync is cheaper and operationally sufficient; operators must run an index sync after later source-table refreshes.

## Consequences

- The primary recommendation path is now Retrieve (AI Search) → Augment (governed movie metadata) → Generate (Foundation Model).
- The app retains SQL Warehouse reads for complete home and review data, while recommendation candidate retrieval moves out of the Node.js process.
- Deployment creates a serverless AI Search endpoint and index, which adds platform cost and requires the direct bundle deployment engine.
- The app service principal gains `SELECT` only on the AI Search index in addition to its existing resource permissions.
- The existing temporal leave-one-out evaluation measures the deterministic fallback, not live AI Search relevance. RAG traces record retrieval source, candidate count, curation source, latency, and degraded status without exporting prompts, user IDs, or recommendation lists.
- AI Search retrieval quality must be evaluated separately after the remote index is populated. No production recommendation-quality claim is made.
