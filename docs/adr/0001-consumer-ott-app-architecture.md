# ADR 0001: Consumer OTT app architecture

- Status: Superseded in part by ADR 0004
- Date: 2026-08-18

## Context

The repository must deliver a Databricks sales demonstration that looks and behaves like a final-consumer OTT home screen. A sales demonstrator needs a user selector to compare personalized results without maintaining multiple identities. The supplied dataset is small and synthetic: each user has twelve unique watched titles, and explicit preferred genre has little observed lift over the balanced catalog. The MVP therefore cannot credibly claim production model quality.

The current identity can administer the existing AWS `us-east-2` serverless Workspace but cannot create a new account-level Workspace. The user approved using the existing Workspace.

## Decision

Use the generated Databricks AppKit Node.js template with its React/Vite client, Express server, and analytics plugin. Store the six source datasets as managed Unity Catalog tables in `media_dev.ott_recommendations`. Bind `media-recommendations-warehouse` to `media-ott-consumer-app` with `CAN_USE`, and grant the app service principal read-only access to the required tables.

Implement a deterministic hybrid ranker in server-side TypeScript. It will:

1. Exclude watched movies from the primary recommendation rail.
2. Derive positive and negative signals from ratings, completion percentage, abandonment, and rewatches.
3. Compare movie genre, keywords, setting, conflict, and logline tokens with positive and negative history.
4. Add smoothed catalog engagement and user/critic review quality.
5. Return structured evidence with every score so the client never invents recommendation reasons.

The client will render a cinematic hero, personalized rails, continue-watching rail, user selector, and accessible movie detail dialog. The selector is a sales-demo control and is not a production identity design.

## Alternatives considered

### Python-only application

This would minimize recommendation implementation overhead, but the primary risk is consumer experience quality. Achieving the required responsive OTT interactions would require substantial custom frontend work outside the template's strongest path.

### React client with a separate Python backend

This gives maximum flexibility for future ML models but introduces two dependency ecosystems, a larger deployment surface, and unnecessary operational cost for the deterministic MVP.

### AI Search and Model Serving in the first release

This would demonstrate more platform features, but the small catalog does not justify the added endpoint cost and operational complexity before the consumer journey is validated. AI Search remains a compatible future candidate-generation layer.

ADR 0004 adopts this candidate-generation layer after the MVP was validated and the user explicitly requested a Databricks RAG architecture. The deterministic ranker remains the safety fallback and offline baseline.

## Consequences

- One Node.js process serves both the API and compiled client.
- Recommendation behavior is deterministic, testable, and auditable.
- Local tests do not require a live Workspace because ranking logic is isolated from the Databricks adapter.
- The deployed app requires only SQL Warehouse access and `SELECT` on the governed tables.
- Ranking runs in the application for the 200-title demo catalog and must move to precomputed features or a serving endpoint before production scale.
- The app does not write viewing history or user state.
