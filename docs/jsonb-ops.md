# JSONB Update Pipeline

This document describes the current JSONB update flow.

## Example

```js
await User.update_one({id: '1'}, {
	updated_at: new Date(),
	$unset: ['profile.address'],
	$set: {
		'profile.city': 'Santiago',
		'profile.tags': ['vip']
	}
});
```

> **Note:** `updated_at` is optional in this payload. `Model.prototype.update()` sets it automatically, and direct code paths can pass it explicitly when they want to control the value. The SQL builder only binds the row-level timestamps it receives. A dedicated `model_options.timestamps` flag is a follow-up and is called out by the TODO in `src/constants/defaults.js`.

Runtime flow:
1. `exec_update_one(...)` splits row-level fields (`created_at`, `updated_at`) from the JSONB payload.
2. `JsonbOps.from(payload, {column_name, coalesce: true})` returns a `JsonbOps` instance with `target` and ordered `operations`.
3. `jsonb_ops.compile(parameter_state)` folds `operations` into one SQL RHS expression and binds JSON values into the shared parameter state.
4. `build_update_query(...)` assembles `UPDATE ... SET ...` and binds only the row-level timestamp parameters it receives after the JSONB expression is finalized.

> **Note:** `jsonb_set(NULL, ...)` returns `NULL`. Partial JSONB updates must start from `COALESCE(column, '{}'::jsonb)`.

## Current Contract

`JsonbOps.from(...)` accepts operator-style input:

```js
const jsonb_ops = JsonbOps.from(payload, {column_name: '"data"', coalesce: true});

jsonb_ops.target;
// -> 'COALESCE("data", \'{}\'::jsonb)'

jsonb_ops.operations;
// -> [
//   {op: '$replace_roots', value: '{"profile":{"city":"Miami"}}'},
//   {op: '#-', path: '{"profile","address"}'},
//   {op: 'jsonb_set', path: '{"profile","tags"}', value: '["vip"]'}
// ]

const rhs = jsonb_ops.compile(parameter_state);
```

Rules:
1. `operations` is ordered for PostgreSQL execution: replace roots -> unsets -> sets.
2. `from(...)` never receives `parameter_state`.
3. `compile(...)` is the only JSONB layer that calls `bind_parameter(...)`.

## Update Shapes

The SQL-side contract is operator-style:
1. `$replace_roots`: plain object payload replacement.
2. `$unset`: array of dot paths.
3. `$set`: map of dot path -> value.
4. Any top-level non-`$` key is treated as implicit `$set`.

Tracked document updates come from `DeltaTracker` as:

```js
{replace_roots: {...}, set: {...}, unset: [...]}
```

When `track: ['data']` is used, tracked paths are prefixed like `data.profile.city`. The orchestrator boundary in `src/model/factory/exec-update-one.js` strips that tracked root and maps the delta into operator-style input before calling `JsonbOps.from(...)`.

## Interaction Model

The update path is easiest to reason about as three stages:
1. change set from `DeltaTracker`,
2. ordered JSONB operations from `JsonbOps`,
3. final SQL assembly in the query builder.

### 1. Change Set

Tracked document updates start as pure delta data:

```js
const tracker_delta = document.$get_delta();

// Example shape:
// {
//   replace_roots: {},
//   set: {
//     'data.profile.name': 'John Doe',
//     'data.profile.age': 35
//   },
//   unset: ['data.profile.address']
// }
```

This shape is still tracker-oriented. It may include the tracked root prefix and it does not use SQL-facing operator names.

### 2. JSONB Operations

The orchestrator adapts the tracker delta into operator-style input and builds one `JsonbOps` instance:

```js
const jsonb_ops = JsonbOps.from(payload, {
	column_name: '"data"',
	coalesce: true
});
```

That instance stores:
1. `target`: the starting SQL expression,
2. `operations`: the ordered JSONB mutations to apply.

```js
jsonb_ops.operations;
// -> [
//   {op: '#-', path: '{"profile","address"}'},
//   {op: 'jsonb_set', path: '{"profile","name"}', value: '"John Doe"'},
//   {op: 'jsonb_set', path: '{"profile","age"}', value: '35'}
// ]
```

> **Note:** `JsonbOps.from(...)` does not bind SQL parameters. It only parses and orders JSONB mutations.

### 3. SQL Assembly

The SQL builder compiles those operations against the shared parameter state:

```js
const compiled_data_expression = jsonb_ops.compile(parameter_state);
```

That compile step folds the ordered operations into one RHS expression and pushes JSON values into the global parameter list in the same pass.

```js
// Example result:
// jsonb_set(
//   jsonb_set(
//     COALESCE("data", '{}'::jsonb) #- '{"profile","address"}',
//     '{"profile","name"}',
//     $2::jsonb,
//     true
//   ),
//   '{"profile","age"}',
//   $3::jsonb,
//   true
// )
```

## Module Responsibilities

1. `src/sql/jsonb-ops.js`: parse operator-style JSONB updates and compile them into the RHS SQL expression.
2. `src/model/factory/exec-update-one.js`: split row timestamps, adapt tracked deltas when needed, and build the query context.
3. `src/sql/build-update-query.js`: compile `jsonb_ops`, then bind row-level timestamps and assemble the final `UPDATE`.
4. `src/model/model.js`: keep `updated_at` and `created_at` at the row boundary instead of pushing them into JSONB `$set`.

## Pending Note

The current boundary adapter assumes one JSONB slug per document update path. Multi-slug document routing is a follow-up and is called out by the TODO in `src/model/factory/exec-update-one.js`.
