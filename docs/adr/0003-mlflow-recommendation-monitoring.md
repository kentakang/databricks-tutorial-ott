# ADR 0003: MLflow recommendation evaluation and monitoring

- Status: Accepted
- Date: 2026-08-19

## Context

SceneFlow combines a deterministic TypeScript recommender with a Databricks Foundation Model that organizes grounded candidates into four Korean OTT themes. The application does not train or serve a custom recommendation model, so generic classification accuracy and training-loss metrics would misrepresent the system. It still needs repeatable evidence that the ranker surfaces future positive interactions and operational visibility into AI latency, invalid output, and deterministic fallback usage.

The application already runs as a Node.js Databricks App. Introducing a separate Python runtime or duplicating the ranking algorithm in a notebook would create two implementations that can drift. The catalog is small enough to run a focused offline evaluation in the app process after a snapshot refresh.

## Decision

Bind a bundle-managed MLflow experiment to the Databricks App with `CAN_EDIT` and initialize the official `mlflow-tracing` TypeScript SDK only when `MLFLOW_EXPERIMENT_ID` is configured.

Apply two complementary measurements:

1. Evaluate the deterministic ranker with temporal leave-one-out backtesting. For each eligible synthetic user, remove the latest positive title, rank it against unwatched candidates using the remaining history, and aggregate `Recall@10`, `MRR@10`, `NDCG@10`, and `Catalog Coverage@10`.
2. Trace each uncached AI curation attempt with aggregate inputs and outputs: candidate count, positive-history count, source, latency, theme count, movie count, unique-movie ratio, and whether a deterministic fallback was used.

The evaluation runs at most once every 30 minutes when an application request loads a catalog snapshot. No raw prompts, reviews, user IDs, model responses, or complete recommendation lists are exported to MLflow. When no experiment is configured, the same offline evaluation remains available locally and trace export becomes a no-op. Monitoring failures do not fail consumer requests.

## Alternatives considered

### Duplicate the recommender in a Python MLflow notebook

Python provides the broadest MLflow evaluation API, but reimplementing the TypeScript scoring function would make the measured algorithm different from the deployed algorithm. It would also add a second runtime and dependency lockfile to the current single-runtime app.

### Log only request latency to application logs

This adds no dependency but cannot group AI calls and quality measurements in an MLflow experiment or support trace-based investigation and future production scorers.

### Use an LLM judge for every production trace

An LLM judge can measure subjective theme quality, but it adds inference cost and depends on the MLflow production-monitoring Beta. Deterministic safety and diversity signals are the appropriate first monitor; sampled human or LLM judgment can be added after the sales walkthrough defines an accepted quality rubric.

## Consequences

- The deployed app receives `CAN_EDIT` on one dedicated MLflow experiment and no additional data permissions.
- Offline metrics use the actual production TypeScript ranker and current governed snapshot.
- The backtest is directional evidence on synthetic data, not a causal estimate of online recommendation lift. Aggregated quality signals still include the held-out user's contribution.
- Evaluation is traffic-triggered rather than a guaranteed wall-clock schedule. A Lakeflow Job should replace it if evaluation must run while the app is idle or if the catalog grows beyond in-process evaluation scale.
- The Apache-2.0 `mlflow-tracing` dependency is maintained in the MLflow repository and is already a transitive AppKit dependency; declaring it directly makes the runtime API explicit.
