# SceneFlow

SceneFlow는 Databricks AppKit으로 만든 최종 소비자용 OTT 추천 영업 데모입니다. 헤더의 **영업 데모** 사용자 선택기로 합성 사용자 300명의 개인화 홈을 즉시 전환하고, 추천 근거·이어보기·인기 작품·평론가 코멘트를 한 화면에서 확인할 수 있습니다.

## 구성

- React 19 기반 반응형 OTT 화면
- AppKit Express 서버와 Analytics 플러그인
- Unity Catalog의 최소 노출 뷰를 읽는 서비스 주체 실행
- 명시적 평점, 완주율, 재시청, 콘텐츠 유사도, 선호 장르, 작품 반응을 조합한 결정론적 추천기
- 추천 로직의 오프라인 단위 테스트

Databricks 데이터 흐름과 코드 연결은 [docs/DATABRICKS_USAGE_KO.md](docs/DATABRICKS_USAGE_KO.md), 자원 이름과 기존 Warehouse 예외는 [docs/RESOURCE_NAMING.md](docs/RESOURCE_NAMING.md), 제품·아키텍처 결정은 [docs/IDEATION.md](docs/IDEATION.md)와 [docs/adr/0001-consumer-ott-app-architecture.md](docs/adr/0001-consumer-ott-app-architecture.md)에 기록되어 있습니다.

## 로컬 실행

Node.js 22+, npm, Databricks CLI 및 Unity Catalog 데이터가 필요합니다.

```powershell
Copy-Item .env.example .env
# .env의 Workspace host, CLI profile, SQL Warehouse ID를 로컬 값으로 수정
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

## 배포

`databricks.yml`은 앱 이름 `media-ott-consumer-app`과 번들 이름 `media-ott-recommendations`를 사용합니다. SQL Warehouse에는 `CAN_USE`, 앱이 읽는 테이블·뷰 다섯 개에는 `SELECT`만 부여합니다.

```powershell
databricks apps deploy -t dev -p <profile> --var "sql_warehouse_id=<warehouse-id>"
```

개발 환경은 `media_dev.ott_recommendations`를 사용합니다. 다른 환경으로 승격할 때는 번들 변수와 `app.yaml`의 카탈로그·스키마 설정을 함께 변경하고 승인된 비용센터 태그를 적용해야 합니다.
