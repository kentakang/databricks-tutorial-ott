# SceneFlow

SceneFlow는 Databricks AppKit으로 만든 최종 소비자용 OTT 추천 영업 데모입니다. 헤더의 **영업 데모** 사용자 선택기로 합성 사용자 300명의 개인화 홈을 즉시 전환하고, 추천 근거·이어보기·인기 작품·평론가 코멘트를 한 화면에서 확인할 수 있습니다.

## 구성

- React 19 기반 반응형 OTT 화면
- AppKit Express 서버와 Analytics 플러그인
- Unity Catalog의 최소 노출 뷰를 읽는 서비스 주체 실행
- Databricks AI Search의 Delta Sync Hybrid Index로 취향 문맥에 맞는 미시청 작품 검색
- 검색된 후보만 Foundation Model에 제공하는 RAG 추천과 결정론적 안전 폴백
- MLflow Run/Metric 기반 시간순 오프라인 평가와 RAG·AI 큐레이션 운영 모니터링
- 사람 라벨 AI Search 평가셋과 Hybrid 검색 회귀 평가
- 추천 로직의 오프라인 단위 테스트

Databricks 데이터 흐름과 코드 연결은 [docs/DATABRICKS_USAGE_KO.md](docs/DATABRICKS_USAGE_KO.md), 자원 이름과 기존 Warehouse 예외는 [docs/RESOURCE_NAMING.md](docs/RESOURCE_NAMING.md), 제품·RAG 아키텍처 결정은 [docs/IDEATION.md](docs/IDEATION.md)와 [docs/adr/0004-ai-search-rag-recommendations.md](docs/adr/0004-ai-search-rag-recommendations.md)에 기록되어 있습니다.

## 로컬 실행

Node.js 22+, npm, Databricks CLI, Unity Catalog 데이터 및 동기화된 AI Search Index가 필요합니다.

```powershell
Copy-Item .env.example .env
# .env의 Workspace host, CLI profile, SQL Warehouse ID, Serving Endpoint,
# AI Search Index 이름을 로컬 값으로 수정
npm ci
npm run dev
```

`.env`는 커밋하지 않습니다. 앱 코드는 Workspace host, 토큰, Warehouse ID 또는 카탈로그 경로를 하드코딩하지 않고 통합 인증과 환경 설정을 사용합니다.

## 검증

```powershell
npm run format
npm run lint
npm run typecheck
npm test
npm run build
databricks apps validate --skip-tests -p <profile> --var "sql_warehouse_id=<warehouse-id>"
databricks apps validate -p <profile> --var "sql_warehouse_id=<warehouse-id>"
databricks bundle validate -t dev -p <profile> --var "sql_warehouse_id=<warehouse-id>"
```

동기화된 AI Search Index의 검색 품질은 16개 한국어 의미 질의가 있는
`config/evaluation/ai-search-relevance.v1.json`으로 별도 평가합니다. 로컬 `.env`에
`DATABRICKS_CONFIG_PROFILE`과 `DATABRICKS_VS_INDEX_NAME`을 설정한 뒤 실행합니다.
`MLFLOW_EXPERIMENT_ID`도 설정되어 있으면 집계 결과를 전용 Experiment에 기록합니다.

```powershell
npm run evaluate:ai-search
```

## 배포

`databricks.yml`은 앱 이름 `media-ott-consumer-app`과 번들 이름 `media-ott-recommendations`를 사용합니다. 배포 전에 검색 원본 Delta 테이블을 준비해야 합니다. 배포는 Standard AI Search Endpoint와 Triggered Delta Sync Hybrid Index를 만들고, 앱에는 해당 인덱스 `SELECT`, SQL Warehouse `CAN_USE`, Foundation Model `CAN_QUERY`, 기존 앱 데이터 객체 `SELECT`만 부여합니다.

```powershell
# 최초 배포 또는 원본 데이터 재생성
pwsh ./scripts/provision-data.ps1 -WarehouseId <warehouse-id> -Profile <profile>

# 원격 Endpoint, Index, App 생성·변경 계획을 확인한 뒤 실행
databricks apps deploy -t dev -p <profile> --var "sql_warehouse_id=<warehouse-id>"
```

Triggered Index이므로 이후 `movie_search_documents`만 갱신했다면 `databricks vector-search-indexes sync-index media_dev.ott_recommendations.movie_recommendations_search -p <profile>`로 명시적으로 동기화합니다.

개발 환경은 `media_dev.ott_recommendations`를 사용합니다. 다른 환경으로 승격할 때는 번들 변수와 `app.yaml`의 카탈로그·스키마 설정을 함께 변경하고 승인된 비용센터 태그를 적용해야 합니다.
