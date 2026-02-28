---
name: python
description: General Python conventions and patterns for all projects
invoke: auto
---

# Python Conventions

## Package Management

- Use `uv` for all package management — never pip directly
- `pyproject.toml` is the single source of truth for dependencies, scripts, and tool config
- Pin dependencies explicitly
- Use optional dependency groups for dev tooling: `[project.optional-dependencies]` with groups like `style`, `test`, `types`, `dist`
- Define CLI entry points via `[project.scripts]`
- Use `.python-version` file to pin the Python version

## Project Structure

- Use src-layout: `src/<package_name>/`
- Organize by layer: `models/`, `repositories/`, `services/`, `routers/`, `clients/`, `handlers/`, `enums/`, `settings/`
- Collocate tests with source code — put `tests/` directories next to the code they test, not in a top-level `tests/` folder
- Use `bin/` for shell scripts (verify, run, install, initialize)

## Testing

- Use `pytest` with `--import-mode=importlib`
- Use `pytest-xdist` for parallel test execution
- Organize test fixtures into pytest plugins registered via `pyproject.toml`
- Use factory functions for test data creation
- For database tests: use real PostgreSQL with template cloning for parallel worker isolation
- Verification scripts: `bin/verify` runs all checks, with `bin/verify-style`, `bin/verify-types`, `bin/verify-tests` as sub-scripts

## Type Checking

- Use `mypy` in strict mode:
  - `disallow_untyped_defs = true`
  - `disallow_untyped_calls = true`
  - `disallow_any_generics = true`
  - `disallow_incomplete_defs = true`
  - `check_untyped_defs = true`
- Every function must have type annotations
- Use narrow `[[tool.mypy.overrides]]` for third-party libraries without stubs
- Enable relevant mypy plugins (e.g., pydantic)

## Linting & Formatting

- Use `ruff` for linting and import sorting
- Minimum rule selection: `["E4", "E7", "E9", "F", "I", "T"]`
- All config lives in `pyproject.toml` under `[tool.ruff]`

## Code Style

- snake_case for files, functions, variables
- PascalCase for classes
- SCREAMING_SNAKE_CASE for constants
- Prefer `frozen=True` dataclasses for value objects and components
- Use `UUID` for primary keys
- Use `|` union syntax over `Optional` (e.g., `str | None` not `Optional[str]`)

## Pydantic

- Use Pydantic V2
- Base config: `populate_by_name=True`, `extra="forbid"`, `from_attributes=True`
- Use `BaseSettings` subclasses for configuration with env var injection
- DTO naming: `{Entity}`, `Create{Entity}`, `{Entity}Search`, `{Entity}Response`

## SQLAlchemy

- Use SQLAlchemy 2.0 with `DeclarativeBase`
- Auto-generate table names from class names
- Base model includes: UUID pk, `created_at`, `updated_at` with database defaults
- Use Alembic for migrations
- Repository pattern for data access with base classes

## FastAPI

- Factory pattern: `create_app()` function
- Separate app instances for different auth contexts (API, public, tool/admin)
- Middleware stack for cross-cutting concerns (tracing, logging, auth, sessions, events, CORS)
- Custom operation IDs for OpenAPI readability
- Cursor-based pagination with `after` + `limit`

## Docker

- Multi-stage builds: base → requirements → source → verify → build → install → deploy
- CI verification runs inside Docker (lint, types, tests)
- Use uvicorn with `--factory` flag for production

## General Principles

- Absolute imports from package root
- Manual dependency injection with frozen dataclass components — avoid magic DI frameworks
- Service layer for business logic, repositories for data access, routers for HTTP
- Use decorator patterns for ACLs and authorization
- Prefer explicit over implicit — no magic globals or monkey-patching
