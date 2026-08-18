# Development environment

This repository is prepared for Databricks App ideation and implementation with Codex. The application framework is intentionally not selected yet; choose it only after documenting the product and data requirements in `docs/IDEATION.md`.

## Required local tools

- Git
- Databricks CLI with the `apps` command group
- `uv` for Python environments and Databricks local app preparation
- Node.js, npm, and npx for frontend or full-stack apps and the Context7 documentation server
- PowerShell 7 (`pwsh`) for repository scripts

Docker is optional and is useful only when a selected architecture needs a local dependency.

Run the one-time repository bootstrap after cloning. It checks the environment and enables the versioned Git hooks and commit template:

```powershell
pwsh ./scripts/bootstrap.ps1
```

Run only the environment check at any time with:

```powershell
pwsh ./scripts/doctor.ps1
```

If no valid Databricks profile is reported, authenticate with OAuth user-to-machine authentication:

```powershell
databricks auth login --host https://<workspace-host>
```

Keep credentials in the operating system credential store or the user-level Databricks configuration. Never add credentials to this repository.

## Codex tools

The project-scoped `.codex/config.toml` enables the pinned Context7 MCP server for current third-party library documentation. Trust this repository and restart the Codex task after changing MCP configuration.

For Databricks behavior, prefer the installed CLI help and the official Databricks documentation. For local UI verification, start the app and use Codex's in-app browser tooling.

## Databricks App lifecycle

After the product direction and framework are selected:

```powershell
# Create an AppKit project interactively when the repository is ready for scaffolding.
databricks apps init

# Fast feedback while implementing.
databricks apps validate --skip-tests

# Full validation before a task-scope commit is considered complete.
databricks apps validate

# Run locally; uv prepares the Python environment when needed.
databricks apps run-local --prepare-environment
```

Deployment changes remote workspace state. Run `databricks apps deploy` only when the user explicitly requests a deployment and the intended profile, app, and source are confirmed.

## Dependency conventions

- For Python, use `pyproject.toml`, `uv`, and a committed `uv.lock` unless the chosen template requires another format.
- For Node.js, use the package manager identified by the committed lockfile. Default to npm when no lockfile exists.
- Pin direct production dependencies and keep generated dependency directories out of Git.
- Add framework-specific lint, type-check, test, and build commands when the stack is selected.

## References

- [Databricks Apps deployment](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/deploy)
- [Databricks CLI authentication](https://docs.databricks.com/aws/en/dev-tools/cli/authentication)
- [Declarative Automation Bundles](https://docs.databricks.com/aws/en/dev-tools/bundles/)
- [Codex project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp)
