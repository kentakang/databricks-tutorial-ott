import { Config, WorkspaceClient } from '@databricks/sdk-experimental';
import rawDataset from '../config/evaluation/ai-search-relevance.v1.json';
import { evaluateAiSearchRelevance, parseQueryIndexMovieIds } from './ai-search-evaluation.js';
import { createModelMonitoring, normalizeDatabricksHost } from './mlflow-monitoring.js';

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

async function main(): Promise<void> {
  const indexName = requiredEnvironmentValue('DATABRICKS_VS_INDEX_NAME');
  const profile = process.env.DATABRICKS_CONFIG_PROFILE?.trim();
  const host = normalizeDatabricksHost(process.env.DATABRICKS_HOST);
  const client = new WorkspaceClient(
    new Config({
      ...(profile ? { profile } : {}),
      ...(host ? { host } : {}),
    })
  );

  const evaluation = await evaluateAiSearchRelevance(rawDataset, async (queryText, resultCount) => {
    const response = await client.vectorSearchIndexes.queryIndex({
      index_name: indexName,
      columns: ['movie_id'],
      num_results: resultCount,
      query_text: queryText,
      query_type: 'HYBRID',
    });
    return parseQueryIndexMovieIds(response);
  });

  const monitoring = createModelMonitoring();
  await monitoring.recordAiSearchEvaluation(evaluation);

  console.table(
    evaluation.cases.map((result) => ({
      record: result.recordId,
      recall: result.recallAtK.toFixed(4),
      reciprocalRank: result.reciprocalRankAtK.toFixed(4),
      ndcg: result.normalizedDiscountedCumulativeGainAtK.toFixed(4),
      latencyMs: result.latencyMs,
      status: result.errorType ?? 'OK',
    }))
  );
  console.info('AI Search relevance evaluation completed.', {
    mlflowEnabled: monitoring.enabled,
    datasetName: evaluation.datasetName,
    datasetVersion: evaluation.datasetVersion,
    ...evaluation.metrics,
  });

  if (evaluation.metrics.failedQueries > 0) process.exitCode = 1;
}

void main().catch((error: unknown) => {
  console.error('AI Search relevance evaluation failed.', error);
  process.exitCode = 1;
});
