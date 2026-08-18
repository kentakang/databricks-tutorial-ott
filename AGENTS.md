# Repository agent instructions

## Scope and mission

These instructions apply to the entire repository. This repository is for ideating, building, testing, and deploying a Databricks App. The project begins in discovery, so do not assume a product scope, UI framework, backend framework, data source, or deployment topology until the relevant decision is recorded.

## Start every task

1. Run `git status --short --branch` and preserve unrelated user changes.
2. Read the files relevant to the request, including `docs/IDEATION.md` while the product is still being defined.
3. State the smallest coherent task scope and any assumptions before editing.
4. Check current behavior through local code, installed CLI help, or authoritative documentation instead of relying on memory for changing Databricks or library behavior.
5. Do not scaffold an application framework solely to make progress during ideation. Record and compare viable options first.

## Ideation and decisions

- Treat `docs/IDEATION.md` as the living product brief. Keep confirmed facts, assumptions, experiments, open questions, and decisions visibly separate.
- Express ideas in terms of target users, jobs to be done, data and AI capabilities, constraints, risks, and measurable outcomes.
- For meaningful product or architecture choices, present a small number of viable options with consequences and recommend one. Record the accepted choice and date.
- Create a short ADR under `docs/adr/` when a decision constrains architecture, security, data access, deployment, or operations. Include context, decision, alternatives, and consequences.
- Prefer the smallest experiment that can invalidate the riskiest assumption before building a broad solution.

## Databricks App implementation

- Prefer Databricks AppKit and generated project conventions after the stack is selected. Avoid hand-building infrastructure that the current CLI or template provides.
- Keep application entry points and dependency manifests at the project root when required by Databricks deployment behavior.
- For Python, use `uv`, `pyproject.toml`, and a committed `uv.lock` unless the selected template requires otherwise.
- For Node.js, use the package manager selected by the committed lockfile; default to npm when no lockfile exists.
- Use Databricks unified authentication and resource bindings. Never hard-code workspace hosts, tokens, resource IDs, catalog paths, or environment-specific values in application code.
- Grant the app service principal only the resources and permissions needed for the use case.
- Keep business logic separate from Databricks adapters where practical so focused local tests do not require a live workspace.
- Add or update tests with behavior changes. Prefer deterministic unit tests, then focused integration tests for Databricks boundaries.

## Tools and sources

- Run `pwsh ./scripts/doctor.ps1` when environment readiness is relevant.
- Use the project Context7 MCP server for current third-party library APIs.
- Use installed `databricks ... --help` output and official Databricks documentation for Databricks features and CLI behavior.
- Use the in-app browser for local UI smoke tests and screenshots when a visual surface changes.
- Do not add a new production dependency until its purpose, maintenance impact, license, and simpler alternatives have been considered.

## Validation

Run every check that applies to the changed scope. Do not claim a check passed unless it was actually run.

- Always inspect the final diff and run `git diff --check`.
- For an initialized Databricks AppKit project, use `databricks apps validate --skip-tests` for quick iteration and `databricks apps validate` before completing a code scope.
- When `pyproject.toml` exists, run the repository's `uv`-managed format, lint, type-check, and test commands that cover the change.
- When `package.json` exists, run its applicable lint, type-check, test, and build scripts.
- When `databricks.yml` exists, run `databricks bundle validate` for the intended local development target if validation does not modify remote state.
- For a visual change, run the app locally and inspect the affected flow at relevant viewport sizes when feasible.
- If a required check needs credentials, remote resources, or unavailable infrastructure, report that limitation explicitly in the handoff and commit message body when material.

## Git workflow and commit discipline

- Break work into small, coherent task scopes. A scope should represent one behavior, one refactor, one tool/configuration change, or one documentation decision—not a collection of unrelated edits.
- After a small task scope is complete, verified, and documented, commit it immediately before starting the next scope. Keep these commits local unless the user explicitly asks to push.
- Stage only the files that belong to the completed scope. Review `git diff --cached` and check for secrets before committing.
- Every commit message must follow Conventional Commits:

  ```text
  <type>(optional-scope): <imperative summary>
  ```

- Use an appropriate type: `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `chore`, `style`, or `revert`.
- Keep the subject specific, lowercase where natural, without a trailing period, and preferably at most 72 characters.
- Mark breaking changes with `!` before the colon and explain them in a `BREAKING CHANGE:` footer.
- Add a body when the reason, tradeoff, verification limitation, or migration impact is not obvious.
- Examples: `feat(search): add title filtering`, `fix(auth): refresh expired workspace token`, `docs(ideation): record dashboard audience decision`, `chore(git): enable repository hooks`.
- Do not amend, squash, rebase, reset, force-push, or rewrite existing commits unless the user explicitly requests it.
- If checks fail, fix the issue within the scope before committing. If the issue cannot be resolved safely, stop at that boundary and report it rather than creating a knowingly broken commit.

## Safety and remote actions

- Never commit secrets, personal data, access tokens, `.env` files, `.databrickscfg`, or raw production data.
- Use synthetic or anonymized fixtures for tests and examples.
- Treat workspace deployment, resource creation or deletion, permission changes, data mutation, and external publishing as remote side effects. Perform them only when explicitly requested after confirming the profile, target, and impact.
- Prefer read-only discovery commands before proposing or performing a remote change.
- Do not weaken authentication, authorization, row-level security, or auditability to make local development easier.

## Code review rules

- Flag credentials or environment-specific identifiers committed to source.
- Flag Databricks resources or queries that grant broader data access than the documented use case requires.
- Flag state-changing workspace calls hidden inside tests, startup paths, or supposedly read-only flows.
- Flag behavior changes without focused verification or without an update to the relevant product/architecture decision.
