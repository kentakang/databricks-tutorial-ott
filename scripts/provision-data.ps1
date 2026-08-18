[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$WarehouseId,

    [string]$Profile = "codex-databricks",

    [string]$Catalog = "media_dev",

    [string]$Schema = "ott_recommendations",

    [string]$SourceVolume = "source_datasets"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$identifierPattern = '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$'
foreach ($entry in @{
        Catalog      = $Catalog
        Schema       = $Schema
        SourceVolume = $SourceVolume
    }.GetEnumerator()) {
    if ($entry.Value -notmatch $identifierPattern) {
        throw "$($entry.Key) must be a lowercase snake_case Unity Catalog identifier."
    }
}

if ([string]::IsNullOrWhiteSpace($WarehouseId)) {
    throw "WarehouseId cannot be empty."
}

$namespace = "$Catalog.$Schema"
$volumePath = "/Volumes/$Catalog/$Schema/$SourceVolume"

function Invoke-DatabricksSql {
    param(
        [Parameter(Mandatory)]
        [string]$Statement
    )

    $request = @{
        warehouse_id    = $WarehouseId
        statement       = $Statement
        wait_timeout    = "30s"
        on_wait_timeout = "CONTINUE"
    } | ConvertTo-Json -Depth 8 -Compress

    $output = @(& databricks api post /api/2.0/sql/statements -p $Profile --json $request -o json 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "Databricks SQL submission failed:`n$($output -join [Environment]::NewLine)"
    }

    $response = ($output -join [Environment]::NewLine) | ConvertFrom-Json
    $deadline = [DateTimeOffset]::UtcNow.AddMinutes(2)

    while ($response.status.state -in @("PENDING", "RUNNING")) {
        if ([DateTimeOffset]::UtcNow -ge $deadline) {
            throw "Databricks SQL statement timed out: $($response.statement_id)"
        }

        Start-Sleep -Seconds 2
        $pollOutput = @(& databricks api get "/api/2.0/sql/statements/$($response.statement_id)" -p $Profile -o json 2>&1)
        if ($LASTEXITCODE -ne 0) {
            throw "Databricks SQL status check failed:`n$($pollOutput -join [Environment]::NewLine)"
        }

        $response = ($pollOutput -join [Environment]::NewLine) | ConvertFrom-Json
    }

    if ($response.status.state -ne "SUCCEEDED") {
        $message = $response.status.error.message
        throw "Databricks SQL statement failed ($($response.status.state)): $message`n$Statement"
    }

    return $response
}

$statements = @(
    @"
CREATE OR REPLACE TABLE $namespace.users
COMMENT 'Synthetic SceneFlow viewer profiles supplied for the OTT recommendation demonstration.'
AS
SELECT
  CAST(user_id AS STRING) AS user_id,
  CAST(display_name AS STRING) AS display_name,
  CAST(birth_year AS INT) AS birth_year,
  CAST(gender AS STRING) AS gender,
  CAST(region AS STRING) AS region,
  CAST(preferred_language AS STRING) AS preferred_language,
  CAST(signup_date AS DATE) AS signup_date,
  CAST(subscription_plan AS STRING) AS subscription_plan,
  CAST(preferred_genre AS STRING) AS preferred_genre,
  CAST(preferred_device AS STRING) AS preferred_device,
  CAST(watch_time_preference AS STRING) AS watch_time_preference,
  CAST(household_type AS STRING) AS household_type,
  CAST(account_status AS STRING) AS account_status
FROM read_files('$volumePath/users.csv', format => 'csv', header => true, inferSchema => true)
"@,
    @"
CREATE OR REPLACE TABLE $namespace.movies
COMMENT 'Synthetic Korean movie catalog used by the SceneFlow consumer experience.'
AS
SELECT
  CAST(movie_id AS STRING) AS movie_id,
  CAST(title AS STRING) AS title,
  CAST(release_date AS DATE) AS release_date,
  CAST(primary_genre AS STRING) AS primary_genre,
  CAST(genre_detail AS STRING) AS genre_detail,
  CAST(production_country AS STRING) AS production_country,
  CAST(original_language AS STRING) AS original_language,
  CAST(runtime_minutes AS INT) AS runtime_minutes,
  CAST(content_rating AS STRING) AS content_rating,
  CAST(director_name AS STRING) AS director_name,
  CAST(studio_name AS STRING) AS studio_name,
  CAST(production_budget_krw AS BIGINT) AS production_budget_krw,
  CAST(theatrical_admissions AS BIGINT) AS theatrical_admissions,
  CAST(platform_release_date AS DATE) AS platform_release_date,
  CAST(is_platform_original AS BOOLEAN) AS is_platform_original,
  CAST(setting AS STRING) AS setting,
  CAST(protagonist AS STRING) AS protagonist,
  CAST(core_conflict AS STRING) AS core_conflict,
  CAST(keywords AS STRING) AS keywords,
  CAST(logline AS STRING) AS logline
FROM read_files('$volumePath/movies.csv', format => 'csv', header => true, inferSchema => true)
"@,
    @"
CREATE OR REPLACE TABLE $namespace.viewing_history
COMMENT 'Synthetic SceneFlow viewing sessions used for recommendation and continue-watching signals.'
AS
SELECT
  CAST(viewing_id AS STRING) AS viewing_id,
  CAST(user_id AS STRING) AS user_id,
  CAST(movie_id AS STRING) AS movie_id,
  CAST(started_at AS TIMESTAMP) AS started_at,
  CAST(ended_at AS TIMESTAMP) AS ended_at,
  CAST(watch_minutes AS INT) AS watch_minutes,
  CAST(completion_pct AS INT) AS completion_pct,
  CAST(playback_status AS STRING) AS playback_status,
  CAST(device_type AS STRING) AS device_type,
  CAST(streaming_quality AS STRING) AS streaming_quality,
  CAST(viewing_country AS STRING) AS viewing_country,
  CAST(rewatch_number AS INT) AS rewatch_number,
  CAST(discovery_source AS STRING) AS discovery_source
FROM read_files('$volumePath/viewing_history.csv', format => 'csv', header => true, inferSchema => true)
"@,
    @"
CREATE OR REPLACE TABLE $namespace.user_reviews
COMMENT 'Synthetic SceneFlow viewer ratings and Korean-language review text.'
AS
SELECT
  CAST(review_id AS STRING) AS review_id,
  CAST(user_id AS STRING) AS user_id,
  CAST(movie_id AS STRING) AS movie_id,
  CAST(source_viewing_id AS STRING) AS source_viewing_id,
  CAST(rating AS DOUBLE) AS rating,
  CAST(review_title AS STRING) AS review_title,
  CAST(review_text AS STRING) AS review_text,
  CAST(reviewed_at AS TIMESTAMP) AS reviewed_at
FROM read_files('$volumePath/user_reviews.csv', format => 'csv', header => true, inferSchema => true)
"@,
    @"
CREATE OR REPLACE TABLE $namespace.critic_reviews
COMMENT 'Synthetic professional critic scores and Korean-language review text.'
AS
SELECT
  CAST(critic_review_id AS STRING) AS critic_review_id,
  CAST(critic_id AS STRING) AS critic_id,
  CAST(movie_id AS STRING) AS movie_id,
  CAST(score_100 AS INT) AS score_100,
  CAST(letter_grade AS STRING) AS letter_grade,
  CAST(review_title AS STRING) AS review_title,
  CAST(review_text AS STRING) AS review_text,
  CAST(reviewed_at AS TIMESTAMP) AS reviewed_at,
  CAST(verdict AS STRING) AS verdict,
  CAST(recommended AS BOOLEAN) AS recommended
FROM read_files('$volumePath/critic_reviews.csv', format => 'csv', header => true, inferSchema => true)
"@,
    @"
CREATE OR REPLACE TABLE $namespace.critics
COMMENT 'Synthetic professional critic profiles with source email intentionally excluded.'
AS
SELECT
  CAST(critic_id AS STRING) AS critic_id,
  CAST(critic_name AS STRING) AS critic_name,
  CAST(pen_name AS STRING) AS pen_name,
  CAST(publication_name AS STRING) AS publication_name,
  CAST(region AS STRING) AS region,
  CAST(years_experience AS INT) AS years_experience,
  CAST(specialty_genre AS STRING) AS specialty_genre,
  CAST(education_background AS STRING) AS education_background,
  CAST(criticism_style AS STRING) AS criticism_style,
  CAST(primary_medium AS STRING) AS primary_medium,
  CAST(joined_date AS DATE) AS joined_date,
  CAST(is_top_critic AS BOOLEAN) AS is_top_critic,
  CAST(profile_note AS STRING) AS profile_note
FROM read_files('$volumePath/critics.csv', format => 'csv', header => true, inferSchema => true)
"@,
    @"
CREATE OR REPLACE VIEW $namespace.consumer_profiles
COMMENT 'Minimum viewer profile attributes exposed to the SceneFlow application.'
AS
SELECT
  user_id,
  display_name,
  birth_year,
  preferred_language,
  subscription_plan,
  preferred_genre,
  preferred_device,
  watch_time_preference,
  household_type
FROM $namespace.users
WHERE account_status = 'active'
"@,
    @"
CREATE OR REPLACE VIEW $namespace.viewer_interactions
COMMENT 'Read-only viewer behavior and optional review signal exposed to the SceneFlow application.'
AS
SELECT
  h.viewing_id,
  h.user_id,
  h.movie_id,
  h.started_at,
  h.ended_at,
  h.watch_minutes,
  h.completion_pct,
  h.playback_status,
  h.device_type,
  h.streaming_quality,
  h.rewatch_number,
  h.discovery_source,
  r.rating,
  r.review_title,
  r.review_text,
  r.reviewed_at
FROM $namespace.viewing_history h
LEFT JOIN $namespace.user_reviews r
  ON h.viewing_id = r.source_viewing_id
"@,
    @"
CREATE OR REPLACE VIEW $namespace.movie_quality_signals
COMMENT 'Aggregated engagement, viewer rating, and critic score signals for explainable recommendations.'
AS
WITH engagement AS (
  SELECT
    movie_id,
    COUNT(*) AS view_count,
    COUNT(DISTINCT user_id) AS viewer_count,
    AVG(completion_pct) AS average_completion_pct,
    AVG(CASE WHEN playback_status = 'completed' THEN 1.0 ELSE 0.0 END) AS completed_rate,
    AVG(CASE WHEN rewatch_number > 0 THEN 1.0 ELSE 0.0 END) AS rewatch_rate
  FROM $namespace.viewing_history
  GROUP BY movie_id
), viewer_ratings AS (
  SELECT movie_id, COUNT(*) AS user_review_count, AVG(rating) AS average_user_rating
  FROM $namespace.user_reviews
  GROUP BY movie_id
), critic_ratings AS (
  SELECT
    movie_id,
    COUNT(*) AS critic_review_count,
    AVG(score_100) AS average_critic_score,
    AVG(CASE WHEN recommended THEN 1.0 ELSE 0.0 END) AS critic_recommendation_rate
  FROM $namespace.critic_reviews
  GROUP BY movie_id
)
SELECT
  m.movie_id,
  COALESCE(e.view_count, 0) AS view_count,
  COALESCE(e.viewer_count, 0) AS viewer_count,
  COALESCE(e.average_completion_pct, 0.0) AS average_completion_pct,
  COALESCE(e.completed_rate, 0.0) AS completed_rate,
  COALESCE(e.rewatch_rate, 0.0) AS rewatch_rate,
  COALESCE(v.user_review_count, 0) AS user_review_count,
  v.average_user_rating,
  COALESCE(c.critic_review_count, 0) AS critic_review_count,
  c.average_critic_score,
  COALESCE(c.critic_recommendation_rate, 0.0) AS critic_recommendation_rate
FROM $namespace.movies m
LEFT JOIN engagement e USING (movie_id)
LEFT JOIN viewer_ratings v USING (movie_id)
LEFT JOIN critic_ratings c USING (movie_id)
"@,
    @"
CREATE OR REPLACE VIEW $namespace.critic_commentary
COMMENT 'Critic evidence exposed to the SceneFlow movie detail experience without contact information.'
AS
SELECT
  r.critic_review_id,
  r.movie_id,
  r.score_100,
  r.letter_grade,
  r.review_title,
  r.review_text,
  r.reviewed_at,
  r.verdict,
  r.recommended,
  c.critic_name,
  c.pen_name,
  c.publication_name,
  c.years_experience,
  c.specialty_genre,
  c.is_top_critic
FROM $namespace.critic_reviews r
JOIN $namespace.critics c USING (critic_id)
"@,
    "ALTER CATALOG $Catalog SET TAGS ('environment' = 'dev', 'domain' = 'media', 'product' = 'ott_recommendations', 'managed_by' = 'manual', 'data_classification' = 'internal')",
    "ALTER SCHEMA $namespace SET TAGS ('environment' = 'dev', 'domain' = 'media', 'product' = 'ott_recommendations', 'owner_group' = 'grp-dbx-ott-recommendations-owners', 'cost_center' = 'demo', 'managed_by' = 'manual', 'data_classification' = 'internal')",
    "ALTER VOLUME $namespace.$SourceVolume SET TAGS ('environment' = 'dev', 'domain' = 'media', 'product' = 'ott_recommendations', 'managed_by' = 'manual', 'data_classification' = 'internal')"
)

$taggedTables = @(
    "users",
    "movies",
    "viewing_history",
    "user_reviews",
    "critic_reviews",
    "critics"
)

$taggedViews = @(
    "consumer_profiles",
    "viewer_interactions",
    "movie_quality_signals",
    "critic_commentary"
)

foreach ($name in $taggedTables) {
    $statements += "ALTER TABLE $namespace.$name SET TAGS ('environment' = 'dev', 'domain' = 'media', 'product' = 'ott_recommendations', 'owner_group' = 'grp-dbx-ott-recommendations-owners', 'cost_center' = 'demo', 'managed_by' = 'manual', 'data_classification' = 'internal')"
}

foreach ($name in $taggedViews) {
    $statements += "ALTER VIEW $namespace.$name SET TAGS ('environment' = 'dev', 'domain' = 'media', 'product' = 'ott_recommendations', 'owner_group' = 'grp-dbx-ott-recommendations-owners', 'cost_center' = 'demo', 'managed_by' = 'manual', 'data_classification' = 'internal')"
}

foreach ($statement in $statements) {
    Write-Host "Executing: $($statement.Trim().Split([Environment]::NewLine)[0])" -ForegroundColor Cyan
    $null = Invoke-DatabricksSql -Statement $statement
}

$verification = Invoke-DatabricksSql -Statement @"
SELECT 'users' AS object_name, COUNT(*) AS row_count FROM $namespace.users
UNION ALL SELECT 'movies', COUNT(*) FROM $namespace.movies
UNION ALL SELECT 'viewing_history', COUNT(*) FROM $namespace.viewing_history
UNION ALL SELECT 'user_reviews', COUNT(*) FROM $namespace.user_reviews
UNION ALL SELECT 'critic_reviews', COUNT(*) FROM $namespace.critic_reviews
UNION ALL SELECT 'critics', COUNT(*) FROM $namespace.critics
ORDER BY object_name
"@

$verification.result.data_array | ForEach-Object {
    [PSCustomObject]@{
        Object   = $_[0]
        RowCount = [int]$_[1]
    }
} | Format-Table -AutoSize
