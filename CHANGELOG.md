# Changelog

## Unreleased

- No entries yet.

## 0.1.0 - 2026-02-24

### Added

- Core PostgreSQL JSONB model/query API: `connect`, `disconnect`, `Schema`, and `model(...)`.
- Built-in FieldTypes with casting/validation support, including advanced types: `UUIDv7`, `Decimal128`, `BigInt`, `Double`, `Int32`, and `Union`.
- Schema field behaviors and runtime document APIs: getters/setters, aliases, serialization helpers (`to_object`, `to_json`), immutable enforcement after first persist, and `mark_modified(...)` dirty tracking.
- Schema index declaration support:
  - path-level index sugar (`index: true | 1 | -1 | { ...options }`)
  - schema-level `create_index(...)` for compound indexes
- Query operator support for PostgreSQL JSONB workflows, including snake_case operators such as `$elem_match`, `$has_key`, `$has_any_keys`, `$has_all_keys`, `$json_path_exists`, and `$json_path_match`.
- PostgreSQL-native JSON update operators in `update_one(...)`: `$set` (`jsonb_set`), `$insert` (`jsonb_insert`), and `$set_lax` (`jsonb_set_lax`).
- `delete_one(...)` model method.
- Migration helpers: `ensure_table`, `ensure_index`, and `ensure_schema`.
- Database-native UUIDv7 row-id generation (`DEFAULT uuidv7()`) with automatic PostgreSQL capability checks and cached feature metadata.

### Behavior Notes

- Table creation behavior follows create-on-first-write semantics:
  - writes (`save`, `update_one`) can auto-create tables
  - reads (`find`, `find_one`, `count_documents`) do not auto-create tables
  - `delete_one(...)` does not auto-create and returns `null` when the target table is missing
- Query operator names use snake_case (the `$` prefix remains the operator namespace).
- `ensure_table()` / `ensure_schema()` are explicit manual migration calls (and are documented as such).

### Docs

- Added/expanded user-facing docs: `docs/api.md`, `docs/examples.md`, `docs/query-translation.md`, and `docs/local-integration-testing.md`.
- Reduced `README.md` scope to quick-start + high-signal pointers, with detailed examples moved to `docs/examples.md`.
- Moved internal-only plans/specs/decisions under `.agents/` to keep published docs focused.

### Testing & Quality

- Added unit and PostgreSQL integration coverage across query/model/migration/runtime behaviors.
- Added Jest coverage reporting (`npm run test-coverage`) and `jest.config.mjs` shared configuration.

### Deferred

- Custom FieldType extensibility/plugin surface is intentionally deferred for a later milestone.
