# Databricks App product brief

Status: MVP deployed and technically validated

Last updated: 2026-08-19

Use this document as the shared working surface for product ideation. Keep unknowns explicit; do not turn assumptions into facts merely to complete the template.

## One-sentence concept

SceneFlow is a consumer-style OTT home screen where Databricks AI turns governed viewing signals into multiple explainable recommendation themes, while a sales-demo-only user selector makes personalization visible across personas.

## Problem and opportunity

- Current workflow or pain: Recommendation demos often show either a static consumer UI with no governed data lineage or a technical model notebook with no believable end-user experience.
- Why it matters now: Sales audiences need to see that Databricks can serve a polished application directly from governed behavioral, catalog, and review data.
- Evidence already available: Six related CSV datasets contain 300 users, 200 movies, 4,000 viewing sessions, 1,000 user reviews, 500 critic reviews, and 40 critics with complete foreign-key coverage.
- Existing alternatives and their gaps: A dashboard does not demonstrate a consumer journey, while a hard-coded prototype cannot demonstrate governed data access or per-user personalization.

## Target users

| User or role | Job to be done | Current workaround | Access level | Priority |
| --- | --- | --- | --- | --- |
| OTT viewer | Find something appealing quickly and understand why it fits | Browse generic rows and popularity charts | App user | Primary |
| Sales demonstrator | Switch personas and make personalization differences obvious | Use screenshots or separate demo accounts | App user | Primary |
| Data platform team | Operate the demo without embedding workspace identifiers or credentials | Maintain a standalone demo stack | Workspace developer | Secondary |

## Outcomes and success measures

- User outcome: A viewer sees a personalized home screen and can identify a relevant title within 30 seconds.
- Business outcome: A five-minute sales demonstration connects governed lakehouse data to an end-user application experience.
- Leading indicator: Changing the selected user changes the hero title, four AI-generated recommendation themes, movie groupings, and evidence labels without reloading the application.
- Guardrail metric: Already-watched titles never appear in the primary recommendation row, recommendation explanations only cite computed evidence, and demographic fields do not influence ranking.
- Explicit non-goals: Production recommendation accuracy claims, playback delivery, account management, payments, writes to user profiles, online experimentation, and a production user-switching control.

## Candidate user journey

1. Entry point: Open the SceneFlow home screen with a default synthetic demo persona.
2. Core action: Choose another persona from the header selector and browse personalized rows.
3. Databricks data or AI interaction: A bound Databricks AI Search Index retrieves unseen movies from governed catalog documents, then a bound Foundation Model organizes those grounded candidates into four persona-specific themes.
4. Decision or artifact produced: The viewer explores several AI-curated collections and selects a movie after seeing a concise, evidence-backed recommendation reason.
5. Follow-up action: Open the movie detail panel, read every critic commentary and written user review, or switch personas to compare the experience.

## Data, AI, and Databricks resources

| Need | Candidate resource | Read/write | Sensitivity | Open question |
| --- | --- | --- | --- | --- |
| Movie and user data | `media_dev.ott_recommendations` Unity Catalog tables | Read | Internal; user profile fields | Keep app permissions read-only |
| Application queries | Existing `Serverless Starter Warehouse` (migration exception) | Read | Internal | Future compliant name: `media-recommendations-warehouse` |
| RAG candidate retrieval | `media-ott-recommendations-search` endpoint and `media_dev.ott_recommendations.movie_recommendations_search` Delta Sync Hybrid Index | Query | Non-identifying movie documents and aggregate quality signals | Trigger a sync after catalog refresh |
| AI theme curation | Existing `databricks-qwen3-next-80b-a3b-instruct` Foundation Model endpoint | Query | Synthetic taste and candidate metadata | App receives `CAN_QUERY` only |
| Recommendation and AI monitoring | `media-ott-recommendations-monitoring` MLflow experiment | Write traces | Aggregate metrics only | App receives `CAN_EDIT`; no raw prompts or user IDs |
| Consumer application | `media-ott-consumer-app` Databricks App | Read | Internal demo | Workspace-authenticated users only |
| Source file staging | `media_dev.ott_recommendations.source_datasets` Volume | Deployment write, runtime none | Internal | App service principal receives no volume write access |

Consider data freshness, volume, latency, lineage, row/column-level controls, model quality, inference cost, and the minimum permissions required by the app service principal.

## Experience hypotheses

- Primary interface: Responsive consumer OTT home page with a cinematic hero, horizontal movie rails, and a detail modal.
- Most important view or interaction: Changing the demo user regenerates four distinct AI-curated themes and their movie groupings, while each movie detail exposes complete critic and viewer review collections.
- Empty, loading, error, and permission-denied states: Skeleton cards, retryable error panel, no-recommendations fallback to trending titles, and an explicit access-denied message.
- Accessibility and localization needs: Korean-first copy, semantic buttons and dialogs, keyboard navigation, visible focus, reduced-motion support, and WCAG AA color contrast.
- Expected devices and viewport sizes: Sales laptop at 1440px primary; verify 1024px tablet and 390px mobile layouts.

## Technical options

| Option | Advantages | Costs and risks | Evidence needed |
| --- | --- | --- | --- |
| Python app | Fast data iteration and a small deployment surface | Consumer OTT interactions and visual polish require more custom UI work | Rejected for this MVP |
| Node.js AppKit app | Generated React/Vite client, Express server, typed SQL queries, and one runtime | Recommendation math must be implemented and tested in TypeScript | Selected |
| Combined frontend and Python backend | Flexible ML implementation and polished UI | Two toolchains and a larger deployment and testing surface | Reconsider if a trained model becomes necessary |
| AI Search RAG curation | Hybrid semantic/keyword retrieval with governed movie grounding, followed by persona-specific themes from Model Serving | Adds an endpoint, index sync, embedding cost, and two-stage latency | Selected for the recommendation path |

Do not choose a stack from familiarity alone. Evaluate the user experience, Databricks integrations, team skills, testability, deployment behavior, and operational burden.

## Constraints and risks

- Security, privacy, or compliance: Display names and behavioral data are synthetic demo inputs but remain internal; critic email is excluded from application queries; gender and region are not ranking features.
- Workspace and network constraints: Use the existing AWS `us-east-2` serverless workspace because the current identity cannot create account-level workspaces.
- Performance and availability expectations: The multi-theme home should appear within two seconds from a warm RAG cache; cold retrieval and generation update progressively and retain deterministic themes on failure.
- Cost ceiling: Use one 2X-Small serverless SQL Warehouse, one Standard AI Search endpoint with a triggered Delta Sync Index, one existing pay-per-token Foundation Model endpoint, and a single Databricks App deployment.
- Delivery timeline: Migrate the validated MVP to AI Search RAG before the stakeholder walkthrough.
- Adoption or change-management risk: The user selector must be visibly described as a sales-demo control so it is not mistaken for a production UX pattern.

## Riskiest assumptions and experiments

| Assumption | Risk if false | Smallest test | Success signal | Status |
| --- | --- | --- | --- | --- |
| A consumer UI makes the platform story clearer than a model workbench | The demo looks like a generic OTT clone | Build one complete home-screen prototype and run a five-minute walkthrough | A viewer can identify data, personalization, and governance moments without opening a notebook | Prototype completed; sales walkthrough pending |
| The supplied interactions provide visibly different recommendations | Persona changes look random or identical | Compare recommendation overlap for representative users | At least half of the top-six titles differ between selected personas | Passed: `USR0001` and `USR0211` differed on all six titles |
| SQL-backed requests are responsive enough for live switching | The demo pauses during persona changes | Measure warm API latency after Warehouse start | P95 below two seconds in the demo walkthrough | Passed: deployed warm P95 1.072 seconds over ten requests |
| The deterministic fallback has measurable offline quality | UI differences could be mistaken for validated relevance | Temporally hold out each eligible user's latest positive title and evaluate the fallback TypeScript ranker | Preserve a reproducible safety baseline while AI Search is evaluated separately | Baseline on 2026-08-19: 298 users, Recall@10 0.0403, MRR@10 0.0141, NDCG@10 0.0201, coverage 0.8550; no production-quality claim |
| AI Search retrieves catalog items that match Korean semantic intents | A healthy Index could still return irrelevant candidates | Run 16 human-labeled precise and thematic queries against the synchronized Hybrid Index | Establish a versioned regression baseline across every catalog genre | Baseline on 2026-08-19: HitRate@10 1.0000, Recall@10 0.9792, MRR@10 0.9688, NDCG@10 0.9600; thresholds pending |

## Decisions

| Date | Decision | Rationale | Owner | Follow-up |
| --- | --- | --- | --- | --- |
| 2026-08-18 | Keep the application stack open during initial discovery | Avoid constraining the product before users, data, and core journey are understood | Project team | Complete the sections above |
| 2026-08-18 | Build a consumer-style OTT recommendation experience | The sales demonstration should show a believable final-user surface, not an internal model workbench | User | Implement the SceneFlow home journey |
| 2026-08-18 | Use the existing serverless Workspace | The authenticated user is a Workspace admin but cannot create account-level Workspaces; the user approved reuse | User | Isolate all new resources with naming-standard-compliant names |
| 2026-08-18 | Use the Node.js AppKit template with analytics | React/Vite supports a polished consumer UI and the generated server integrates with SQL Warehouse resource binding | Project team | Validate the generated template before deployment |
| 2026-08-18 | Start with a deterministic explainable hybrid ranker | The interaction matrix is small and synthetic, so the MVP must not claim trained-model accuracy | Project team | Measure recommendation diversity and add AI Search only if it materially improves the demo |
| 2026-08-19 | Deploy the MVP with five read-only Unity Catalog bindings | The app needs only profiles, movies, interactions, quality signals, and critic commentary; source data remains inaccessible at runtime | Project team | Run the stakeholder sales walkthrough |
| 2026-08-19 | Add hybrid AI theme curation with a grounded candidate set | Multiple consumer-style themes improve realism while deterministic validation prevents hallucinated or watched titles | User and project team | Measure cold latency, topic diversity, and sales-demo clarity |
| 2026-08-19 | Monitor recommendation quality and AI curation with MLflow | The deployed algorithm is TypeScript, so temporal backtesting and aggregate traces avoid a drifting Python duplicate while exposing quality and fallback trends | User and project team | Establish baseline thresholds after the first deployed evaluation |
| 2026-08-19 | Use AI Search RAG for primary recommendation retrieval | The user requested Databricks-native RAG; governed Hybrid retrieval provides semantic candidates while the existing generator and server guardrails prevent hallucinated or watched titles | User | Provision the search document, deploy the endpoint and index, then evaluate live retrieval quality |
| 2026-08-19 | Adopt a versioned human-labeled AI Search evaluation set | Precise semantic canaries and broader multi-result themes detect retrieval regressions without exporting user behavior or duplicating the recommendation implementation | User and project team | Set release thresholds after reviewing the v1 baseline and stakeholder failure tolerance |

## Open questions

- Which cost-center value should replace the temporary development tag value `demo` before promotion beyond development?
- Which v1 AI Search baseline regressions should block a release, especially for thematic Recall@10 and P95 latency?
- Which production identity model would replace the sales-demo-only user selector?

## Next discovery step

Set AI Search release thresholds from the v1 baseline, validate the deployed RAG flow, then run the five-minute stakeholder sales walkthrough.
