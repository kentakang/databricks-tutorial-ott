# ADR 0003: MLflow recommendation evaluation and monitoring

- Status: Accepted; amended by ADR 0004
- Date: 2026-08-19

## Context

SceneFlow combines a deterministic TypeScript recommender with a Databricks Foundation Model that organizes grounded candidates into four Korean OTT themes. The application does not train or serve a custom recommendation model, so generic classification accuracy and training-loss metrics would misrepresent the system. It still needs repeatable evidence that the ranker surfaces future positive interactions and operational visibility into AI latency, invalid output, and deterministic fallback usage.

The application already runs as a Node.js Databricks App. Introducing a separate Python runtime or duplicating the ranking algorithm in a notebook would create two implementations that can drift. The catalog is small enough to run a focused offline evaluation in the app process after a snapshot refresh.

## Decision

Bind a bundle-managed MLflow experiment to the Databricks App with `CAN_EDIT`. When `MLFLOW_EXPERIMENT_ID` is configured, use the existing Databricks TypeScript SDK and unified authentication to create MLflow runs and log metrics directly through the workspace API.

Apply two complementary measurements:

1. Evaluate the deterministic fallback ranker with temporal leave-one-out backtesting. For each eligible synthetic user, remove the latest positive title, rank it against unwatched candidates using the remaining history, and aggregate `Recall@10`, `MRR@10`, `NDCG@10`, and `Catalog Coverage@10`.
2. Record each uncached RAG recommendation as a run with retrieval source, retrieved candidate count, curation source, latency, and degraded status.
3. Record each uncached AI curation attempt as a run with aggregate inputs and outputs: candidate count, positive-history count, source, latency, theme count, movie count, unique-movie ratio, and whether a deterministic fallback was used.
4. Evaluate the synchronized AI Search Index on demand with a versioned, human-labeled Korean retrieval dataset. Record HitRate@10, Recall@10, MRR@10, NDCG@10, failures, and latency as one aggregate run.

The fallback evaluation runs at most once every 30 minutes when an application request loads a catalog snapshot. The labeled AI Search evaluation runs only through its explicit local command. No raw prompts, reviews, user IDs, model responses, or complete recommendation lists are exported to MLflow. When no experiment is configured, both offline evaluations remain available locally and run logging becomes a no-op. Monitoring failures do not fail consumer requests.

## Alternatives considered

### Duplicate the recommender in a Python MLflow notebook

Python provides the broadest MLflow evaluation API, but reimplementing the TypeScript scoring function would make the measured algorithm different from the deployed algorithm. It would also add a second runtime and dependency lockfile to the current single-runtime app.

### Log only request latency to application logs

This adds no dependency but cannot group AI calls and quality measurements in an MLflow experiment or compare metrics between runs.

### Use an LLM judge for every production trace

An LLM judge can measure subjective theme quality, but it adds inference cost and depends on the MLflow production-monitoring Beta. Deterministic safety and diversity signals are the appropriate first monitor; sampled human or LLM judgment can be added after the sales walkthrough defines an accepted quality rubric.

### Store TypeScript traces as experiment artifacts

The TypeScript tracing SDK creates trace metadata through the workspace API and then uploads span data to a pre-signed cloud-storage URL. A deployment smoke test showed that the Databricks Apps runtime could not reach that storage endpoint, leaving trace rows without span content. Direct Run/Metric logging stays on the authenticated workspace API path and requires no additional egress or storage resource.

### Provision a Unity Catalog trace location

Unity Catalog-backed OpenTelemetry tables avoid experiment-artifact limits and are the preferred future production trace store. They require a new schema, four managed tables, explicit `SELECT` and `MODIFY` grants, and a new experiment because an existing experiment cannot be rebound. That operational footprint is deferred until span-level investigation or production scorers are required.

## Consequences

- The deployed app receives `CAN_EDIT` on one dedicated MLflow experiment and no additional data permissions.
- Fallback metrics use the actual deterministic implementation and current governed snapshot. A separate labeled retrieval canary measures AI Search but does not estimate personalized recommendation lift.
- The backtest is directional evidence on synthetic data, not a causal estimate of online recommendation lift. Aggregated quality signals still include the held-out user's contribution.
- Evaluation is traffic-triggered rather than a guaranteed wall-clock schedule. A Lakeflow Job should replace it if evaluation must run while the app is idle or if the catalog grows beyond in-process evaluation scale.
- Monitoring uses the already selected Apache-2.0 Databricks SDK, so no additional production dependency or trace-artifact egress path is required.
