# ADR 0002: AI-personalized theme curation

- Status: Accepted
- Date: 2026-08-19

## Context

The initial home screen has one broad personalized rail and one anchor-based rail. A consumer OTT experience needs several distinct, user-specific programming themes whose titles and movie groupings change with the selected persona. The supplied catalog is synthetic and small, but the demo must still prevent hallucinated movies, recommendations of already-watched titles, and ungrounded personalization claims.

The Workspace already exposes READY pay-per-token Databricks Foundation Model API endpoints. The app can receive least-privilege `CAN_QUERY` access to an existing endpoint without creating a dedicated serving endpoint or storing credentials.

## Decision

Use a hybrid curation flow:

1. The deterministic ranker excludes watched titles and selects the top 48 grounded candidates.
2. The server sends only synthetic preference signals, positive viewing anchors, and candidate movie metadata to the bound `databricks-qwen3-next-80b-a3b-instruct` endpoint.
3. The foundation model creates four Korean OTT-style themes and selects eight candidate IDs for each theme.
4. The server validates the JSON response, rejects unknown IDs, prevents cross-theme duplicates, and fills incomplete themes only from the validated candidate set.
5. The home endpoint immediately returns four grounded deterministic themes while AI curation runs in the background; the client replaces them when the AI result arrives.
6. Results are cached per synthetic user for 30 minutes. Invalid or unavailable model responses retain four deterministic themes and are retried after a short cache period.

The preconfigured endpoint is a Databricks-owned system resource, so its system name is an explicit exception to the project naming standard. The app resource key `ai-curation-model` and configuration variable `serving_endpoint_name` follow the standard.

## Alternatives considered

### Let the model generate all movie recommendations freely

This produces the most creative output, but it can invent titles, return watched movies, and make claims that are not supported by governed data.

### Use AI only to rename deterministic genre rails

This is inexpensive and safe, but the movie grouping is not actually AI-curated and provides a weaker Databricks AI sales story.

### Precompute every user's themes in a batch job

This gives predictable latency and cost, but adds a job, storage table, refresh workflow, and write permissions before the interactive demo has been evaluated.

## Consequences

- The home screen shows four AI-generated theme rails in addition to continue-watching and trending content.
- Candidate selection and all safety guardrails remain deterministic and unit-testable.
- Persona switching is not blocked by foundation-model latency: grounded multi-theme rails appear first and AI results progressively replace them. Cold AI completion still incurs pay-per-token cost; warm requests use the in-process cache.
- The app service principal gains only `CAN_QUERY` on one existing serving endpoint.
- Prompts exclude birth year, household type, user ID, and other demographic fields.
- The app remains usable when Model Serving is unavailable, but the UI identifies deterministic fallback curation rather than claiming AI generation.
