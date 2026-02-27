# jsonbadger API

## Top-level exports

Named exports:
- `connect(connection_uri, connection_options)`
- `disconnect()`
- `Schema`
- `IdStrategies`
- `model(schema_instance, model_options)`
- `create_field_type(path_value, type_reference, options?)`
- `register_field_type(type_name, type_constructor, references?)`
- `resolve_field_type(type_reference)`

Default export (`jsonbadger`) includes the same plus:
- `field_types.UUIDv7`
- `field_types.boolean_convert_to_true`
- `field_types.boolean_convert_to_false`

## connect

`connect(connection_uri, connection_options)` opens (or reuses) a shared PostgreSQL pool.

`connection_options`:
- `max`: pool size (default `10`)
- `debug`: logs SQL/debug events when `true`
- `auto_index`: server-wide default for automatic index creation when `Model.ensure_table()` is called (default `true`)
- `id_strategy`: server-wide default row-id strategy (`IdStrategies.bigserial` or `IdStrategies.uuidv7`, default `IdStrategies.bigserial`)
- any `pg` pool options (`ssl`, `host`, `port`, `user`, `password`, `database`)

UUIDv7 compatibility behavior:
- `connect(...)` performs an internal PostgreSQL capability scan (server version + native `uuidv7()` function presence) and caches the result for later model/runtime checks.
- If the connection-level `id_strategy` resolves to `IdStrategies.uuidv7` and native support is unavailable, `connect(...)` fails fast.
- Model-level `uuidv7` overrides defined after `connect(...)` are validated on use with the cached capability metadata.
- Optional troubleshooting commands only: `SELECT version();` and `SHOW server_version;`. Runtime checks use machine-readable checks internally.

## schema

`new Schema(schema_def, options?)`

`Schema` is responsible for document structure and index declarations.

methods:
- `validate(payload)`
- `path(path_name)`
- `get_path_type(path_name)`
- `is_array_root(path_name)`
- `create_index(index_spec, index_options?)`
- `get_indexes()`

`create_index` supports:
- single-path index: `schema.create_index('profile.city')`
- compound index: `schema.create_index({name: 1, type: -1})`
- optional options: `unique` and `name`

Notes:
- Single-path string specs (`'profile.city'`) create GIN indexes and do not support `unique`.
- Object specs (`{field: 1}` / compound) create BTREE indexes and support `unique`.

Path-level sugar in schema definitions is also supported:
- `{name: {type: String, index: true}}` -> single-path index
- `{age: {type: Number, index: 1}}` -> ascending single-path spec
- `{age: {type: Number, index: -1}}` -> descending single-path spec
- `{email: {type: String, index: {unique: true, name: 'idx_users_email_unique'}}}` -> path-level index options
- optional direction in object form: `direction` or `order` (`1` or `-1`)

## model

`const User = model(user_schema, { table_name, data_column?, id_strategy?, auto_index? })`

- `table_name` is required.
- `data_column` defaults to `data`.
- `id_strategy` defaults to connection-level `id_strategy`, then library default `IdStrategies.bigserial`.
- `auto_index` defaults to model option if set, otherwise connection-level `auto_index`.

UUIDv7 notes:
- `IdStrategies.uuidv7` uses database-generated row IDs via table DDL (`id UUID PRIMARY KEY DEFAULT uuidv7()`).
- jsonbadger validates `uuidv7` support before uuidv7-backed table/schema/write paths using cached server capability metadata.

static methods:
- `ensure_table()`: manual migration call that ensures the table exists (for `IdStrategies.uuidv7`, table DDL uses `DEFAULT uuidv7()`); when `auto_index` is enabled, applies declared schema indexes once per model instance. First-write methods (`save()`, `update_one(...)`) can also create the table automatically.
- `ensure_index()`: ensures table exists and applies declared schema indexes immediately.
- `ensure_schema()`: ensures table and applies declared schema indexes.
- `find(query_filter, projection_value?)`
- `find_one(query_filter)`
- `count_documents(query_filter)`
- `update_one(query_filter, update_definition)`
  - supported operators: `$set`, `$insert`, `$set_lax`
  - operator application order is deterministic and nested: `$set` -> `$insert` -> `$set_lax`
  - `$insert` maps to PostgreSQL `jsonb_insert(...)`
  - `$set_lax` maps to PostgreSQL `jsonb_set_lax(...)` and supports object form `{ value, create_if_missing?, null_value_treatment? }`
  - update paths allow numeric nested segments for JSON array indexes (for example, `tags.0`)
  - conflicting update paths (same path or parent/child overlap across operators) are rejected before SQL execution
- `delete_one(query_filter)`
  - deletes one matching row and returns the deleted document data
  - returns `null` when no row matches
  - does not implicitly call `ensure_table()`; if the table does not exist yet, returns `null`

instance methods:
- `validate()`
- `get(path_name, runtime_options?)`
- `set(path_name, value, runtime_options?)`
- `mark_modified(path_name)`
- `is_modified(path_name?)`
- `clear_modified()`
- `to_object(serialization_options?)`
- `to_json(serialization_options?)`
- `save()`

Runtime behavior notes:
- Read/query execution (`find(...).exec()`, `find_one(...).exec()`, `count_documents(...).exec()`) does not implicitly call `ensure_table()`.
- Use `ensure_table()` / `ensure_schema()` explicitly, or let a first write (`save()` / `update_one(...)`) create the table.
- `set(...)` applies field setters + casting by default and marks the path as modified.
- `mark_modified(path_name)` is required after in-place `Mixed`/`Date` mutations (for example mutating nested objects or calling `Date` mutator methods directly).
- `is_modified(path_name?)` and `clear_modified()` are available runtime helpers for dirty-path inspection/reset.
- `immutable: true` fields are writable before first persist and become protected after a successful `save()`.
- `to_object(...)` / `to_json(...)` apply getters by default; pass `{ getters: false }` to bypass getter transforms during serialization.

## query filters

Supported filter/operator families (current implemented set):
- scalar comparisons: direct equality, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- sets/arrays: `$in`, `$nin`, `$all`, `$size`, `$contains`, `$elem_match`
- regex: `$regex` (+ `$options`)
- JSONB key existence: `$has_key`, `$has_any_keys`, `$has_all_keys`
- JSONPath: `$json_path_exists`, `$json_path_match`

Existence semantics:
- `$has_key` / `$has_any_keys` / `$has_all_keys` map directly to PostgreSQL `?`, `?|`, and `?&`.
- These operators are top-level for the JSONB value on the left side of the operator.
- When used with a nested field path, jsonbadger extracts that nested JSONB value first, then applies the existence operator to that extracted value.

JSONPath notes:
- `$json_path_exists` maps to `@?` and binds the JSONPath string as a `::jsonpath` parameter.
- `$json_path_match` maps to `@@` and binds the JSONPath string as a `::jsonpath` parameter.

## query builder

builder chain:
- `.where(filter)`
- `.sort(sort_definition)`
- `.limit(limit_value)`
- `.skip(skip_value)`
- `.exec()`

## PostgreSQL capability map (summary)

See [`docs/query-translation.md`](query-translation.md) for the dedicated operator/function capability map, including update operators (`jsonb_set`, `jsonb_insert`, `jsonb_set_lax`) and indexability expectations for query operators over JSONB.
