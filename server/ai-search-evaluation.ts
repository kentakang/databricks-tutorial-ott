const movieDocumentUriPattern = /^sceneflow:\/\/movies\/(MOV\d{4})$/u;

export interface ExpectedRetrievedDocument {
  doc_uri: string;
  content?: string;
}

export interface AiSearchEvaluationRecord {
  dataset_record_id: string;
  inputs: {
    query_text: string;
  };
  expectations: {
    expected_retrieved_context: ExpectedRetrievedDocument[];
  };
  tags?: Record<string, string>;
}

export interface AiSearchEvaluationDataset {
  name: string;
  version: string;
  description: string;
  default_k: number;
  records: AiSearchEvaluationRecord[];
}

export interface AiSearchEvaluationCaseResult {
  recordId: string;
  expectedMovieIds: string[];
  retrievedMovieIds: string[];
  recallAtK: number;
  reciprocalRankAtK: number;
  normalizedDiscountedCumulativeGainAtK: number;
  latencyMs: number;
  errorType?: string;
}

export interface AiSearchEvaluationMetrics {
  k: number;
  evaluatedQueries: number;
  failedQueries: number;
  hitRateAtK: number;
  recallAtK: number;
  meanReciprocalRankAtK: number;
  normalizedDiscountedCumulativeGainAtK: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
}

export interface AiSearchEvaluationResult {
  datasetName: string;
  datasetVersion: string;
  metrics: AiSearchEvaluationMetrics;
  cases: AiSearchEvaluationCaseResult[];
}

export type EvaluateRetrieval = (queryText: string, resultCount: number) => Promise<string[]>;

function expectedMovieId(document: ExpectedRetrievedDocument): string {
  const match = movieDocumentUriPattern.exec(document.doc_uri);
  if (!match) {
    throw new Error(`Expected document URI must match sceneflow://movies/MOV0000: ${document.doc_uri}`);
  }
  return match[1];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function validateAiSearchEvaluationDataset(value: unknown): AiSearchEvaluationDataset {
  if (typeof value !== 'object' || value === null) throw new Error('AI Search evaluation dataset must be an object.');

  const dataset = value as Partial<AiSearchEvaluationDataset>;
  if (!dataset.name?.trim() || !dataset.version?.trim() || !dataset.description?.trim()) {
    throw new Error('AI Search evaluation dataset name, version, and description are required.');
  }
  if (!Number.isInteger(dataset.default_k) || (dataset.default_k ?? 0) <= 0) {
    throw new Error('AI Search evaluation dataset default_k must be a positive integer.');
  }
  if (!Array.isArray(dataset.records) || dataset.records.length === 0) {
    throw new Error('AI Search evaluation dataset must contain at least one record.');
  }

  const recordIds = new Set<string>();
  for (const record of dataset.records) {
    if (!record.dataset_record_id?.trim() || recordIds.has(record.dataset_record_id)) {
      throw new Error(
        `AI Search evaluation dataset record IDs must be non-empty and unique: ${record.dataset_record_id}`
      );
    }
    recordIds.add(record.dataset_record_id);

    if (!record.inputs?.query_text?.trim()) {
      throw new Error(`AI Search evaluation record ${record.dataset_record_id} requires inputs.query_text.`);
    }
    const documents = record.expectations?.expected_retrieved_context;
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error(`AI Search evaluation record ${record.dataset_record_id} requires expected_retrieved_context.`);
    }
    const movieIds = documents.map(expectedMovieId);
    if (unique(movieIds).length !== movieIds.length) {
      throw new Error(`AI Search evaluation record ${record.dataset_record_id} contains duplicate expected movies.`);
    }
  }

  return dataset as AiSearchEvaluationDataset;
}

interface QueryIndexResponse {
  manifest?: {
    columns?: Array<{ name?: string }>;
  };
  result?: {
    data_array?: unknown;
  };
}

export function parseQueryIndexMovieIds(response: unknown): string[] {
  if (typeof response !== 'object' || response === null) {
    throw new Error('AI Search query response must be an object.');
  }

  const typed = response as QueryIndexResponse;
  const columns = typed.manifest?.columns;
  const movieIdIndex = columns?.findIndex((column) => column.name === 'movie_id') ?? -1;
  if (movieIdIndex < 0) throw new Error('AI Search query response did not declare a movie_id column.');

  const rows = typed.result?.data_array;
  if (!Array.isArray(rows)) throw new Error('AI Search query response did not contain a data_array.');

  return unique(
    rows.flatMap((row) => {
      if (!Array.isArray(row)) return [];
      const values = row as unknown[];
      const movieId = values[movieIdIndex];
      return typeof movieId === 'string' && movieIdPattern(movieId) ? [movieId] : [];
    })
  );
}

function movieIdPattern(value: string): boolean {
  return /^MOV\d{4}$/u.test(value);
}

function discountedGain(retrievedMovieIds: string[], expectedMovieIds: ReadonlySet<string>, k: number): number {
  return retrievedMovieIds.slice(0, k).reduce((total, movieId, index) => {
    return total + (expectedMovieIds.has(movieId) ? 1 / Math.log2(index + 2) : 0);
  }, 0);
}

function idealDiscountedGain(relevantCount: number, k: number): number {
  let total = 0;
  for (let index = 0; index < Math.min(relevantCount, k); index += 1) {
    total += 1 / Math.log2(index + 2);
  }
  return total;
}

function percentile95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0;
}

export async function evaluateAiSearchRelevance(
  rawDataset: unknown,
  retrieve: EvaluateRetrieval,
  now: () => number = Date.now
): Promise<AiSearchEvaluationResult> {
  const dataset = validateAiSearchEvaluationDataset(rawDataset);
  const cases: AiSearchEvaluationCaseResult[] = [];

  for (const record of dataset.records) {
    const expectedMovieIds = record.expectations.expected_retrieved_context.map(expectedMovieId);
    const expected = new Set(expectedMovieIds);
    const startedAt = now();
    let retrievedMovieIds: string[] = [];
    let errorType: string | undefined;

    try {
      retrievedMovieIds = unique(await retrieve(record.inputs.query_text, dataset.default_k)).slice(
        0,
        dataset.default_k
      );
    } catch (error) {
      errorType = error instanceof Error ? error.name : 'UnknownError';
    }

    const latencyMs = Math.max(0, now() - startedAt);
    const hitRanks = retrievedMovieIds.flatMap((movieId, index) => (expected.has(movieId) ? [index + 1] : []));
    const idealGain = idealDiscountedGain(expected.size, dataset.default_k);
    cases.push({
      recordId: record.dataset_record_id,
      expectedMovieIds,
      retrievedMovieIds,
      recallAtK: hitRanks.length / expected.size,
      reciprocalRankAtK: hitRanks.length > 0 ? 1 / Math.min(...hitRanks) : 0,
      normalizedDiscountedCumulativeGainAtK:
        idealGain > 0 ? discountedGain(retrievedMovieIds, expected, dataset.default_k) / idealGain : 0,
      latencyMs,
      ...(errorType ? { errorType } : {}),
    });
  }

  const divisor = Math.max(1, cases.length);
  const latencies = cases.map((result) => result.latencyMs);
  return {
    datasetName: dataset.name,
    datasetVersion: dataset.version,
    metrics: {
      k: dataset.default_k,
      evaluatedQueries: cases.length,
      failedQueries: cases.filter((result) => result.errorType).length,
      hitRateAtK: cases.filter((result) => result.reciprocalRankAtK > 0).length / divisor,
      recallAtK: cases.reduce((total, result) => total + result.recallAtK, 0) / divisor,
      meanReciprocalRankAtK: cases.reduce((total, result) => total + result.reciprocalRankAtK, 0) / divisor,
      normalizedDiscountedCumulativeGainAtK:
        cases.reduce((total, result) => total + result.normalizedDiscountedCumulativeGainAtK, 0) / divisor,
      averageLatencyMs: latencies.reduce((total, latency) => total + latency, 0) / divisor,
      p95LatencyMs: percentile95(latencies),
    },
    cases,
  };
}
