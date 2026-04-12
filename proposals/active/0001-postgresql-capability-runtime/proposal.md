# PostgreSQL Capability Runtime Proposal

Audience: repo contributors.

This note defines the capability-resolution flow for PostgreSQL features that can use different SQL implementations depending on the connected server.

The goal is simple: detect once, finalize once on the cloned schema, and keep downstream code dumb.

## Target End State

1. Server capabilities are detected once during `connect(...)`.

2. Model compilation clones the source schema and calls `schema.$bind_connection(connection)`.

3. `Schema.prototype.$bind_connection(connection)` resolves any capability-dependent behavior and stores the chosen implementation on that cloned schema instance under `schema.$runtime`.

4. Downstream query and SQL code never asks "does this server support X?" before picking one function over another.

5. Features with a fallback use the implementation already bound onto `model.schema`, including the finalized `schema.$runtime.identity` policy and bound read operators under `schema.$runtime.read_operators`.

6. Features without a fallback fail at one explicit feature seam.
   A. example: a schema configuration may require a capability and still fail during `schema.$bind_connection(connection)` if there is no valid fallback

## Proposed File Structure

1. Keep raw capability detection in `src/connection/server-capabilities.js`.
   A. this file should answer factual questions only
   B. it should not choose SQL compilers or mutate schemas

2. Keep capability finalization in `src/schema/schema.js`.
   A. add `Schema.prototype.$bind_connection(connection)`
   B. keep `schema.identity` declarative and user-facing
   C. write resolved runtime artifacts under `schema.$runtime`
   D. this method should inspect `connection.server_capabilities`
   E. the `$` prefix signals that this is an internal model-factory/runtime hook, not normal public schema API

3. Use `src/model/factory/index.js` as the resolution seam.
   A. clone the source schema
   B. call `cloned_schema.$bind_connection(connection)`
   C. bind that finalized schema onto the compiled model

4. Keep concrete SQL implementations close to the feature they implement.
   A. `src/sql/jsonb/read/operators/jsonpath-exists-native.js`
   B. `src/sql/jsonb/read/operators/jsonpath-exists-compat.js`
   C. `src/sql/jsonb/read/operators/jsonpath-match-native.js`
   D. `src/sql/jsonb/read/operators/jsonpath-match-compat.js`

5. Keep the public operator dispatcher where it already lives: `src/sql/read/where/operators.js`.
   A. that file should dispatch by public operator name only
   B. it should use the implementation already bound onto `compile_context.schema_instance.$runtime`
   C. it should not branch on server version or capability flags

6. Keep `src/sql/read/where/context.js` simple.
   A. pass the schema instance through as it already does
   B. do not add a parallel runtime object if the bound schema can already answer the question

7. Keep `src/connection/connect.js` as the bootstrap seam.
   A. create pool
   B. scan capabilities
   C. create `Connection`

8. Keep `src/connection/connection.js` as the state holder.
   A. store `server_capabilities`
   B. do not store another `sql_runtime` object if the compiled schema is the finalized source of truth

## Proposed Lifecycle

1. `src/connection/connect.js`
   A. create the `pg` pool
   B. call `scan_server_capabilities(pool_instance)`
   C. create `new Connection(pool_instance, final_options, server_capabilities)`

2. `src/connection/server-capabilities.js`
   A. return raw booleans and facts
   B. examples:
      1. `supports_uuidv7`
      2. `supports_jsonpath`
      3. `server_version`
      4. `server_version_num`

3. `src/model/factory/index.js`
   A. clone the source schema
   B. call `cloned_schema.$bind_connection(connection)`
   C. assign `model.schema = cloned_schema`

4. `src/schema/schema.js`
   A. `$bind_connection(connection)` chooses native implementation when supported
   B. otherwise chooses compatibility implementation when supported
   C. otherwise throws a clear unsupported-feature error when no valid fallback exists

5. `src/model/operations/query-builder.js`
   A. keep passing `schema` into `where_compiler(...)`
   B. do not pass a second runtime-selection object

6. `src/sql/read/where/context.js`
   A. continue storing `schema_instance`
   B. let operators read bound implementations from `schema_instance.$runtime`

7. `src/sql/read/where/operators.js`
   A. keep the public operator switch by user-facing operator name
   B. delegate implementation choice to the bound schema
   C. do not inspect `server_capabilities` here

## `null` Connection Rule

1. `schema.$bind_connection(null)` should be allowed.

2. `null` means: resolve connection-independent runtime state only.

3. If a schema configuration can be finalized without server capabilities, `schema.$bind_connection(null)` should succeed.
   A. examples:
      1. numeric database-backed identity defaults
      2. application-forced UUID generation when a generator is present

4. If a schema configuration still needs server capability information, `schema.$bind_connection(null)` should fail clearly.
   A. examples:
      1. `identity.mode = fallback` for UUIDv7
      2. `identity.mode = database` for UUIDv7

5. This keeps tests and non-connected compilation possible without pretending that unresolved capability-dependent paths are valid.

## Decision Rules

1. Native-first rule.
   A. if PostgreSQL supports the native feature, `schema.$bind_connection(connection)` binds the native implementation

2. Compatibility-second rule.
   A. if PostgreSQL does not support the native feature, but JsonBadger has a compatible rewrite, `schema.$bind_connection(connection)` binds the compatibility implementation

3. Fail-last rule.
   A. if neither native nor compatibility implementations exist, `schema.$bind_connection(connection)` throws a clear error

4. One-choice rule.
   A. choose the implementation once during model compilation
   B. do not re-run capability branching during query compilation or SQL building

5. Bound-schema rule.
   A. after model compilation, `model.schema` is the finalized runtime truth for that model/connection pair
   B. downstream code should consume only that finalized schema

## Near-Factual Runtime Shape

1. `src/connection/server-capabilities.js`

```js
const MIN_POSTGRES_NATIVE_JSONPATH_VERSION_NUM = 120000;

async function scan_server_capabilities(pool_instance) {
	const server_version_num_result = await pool_instance.query('SHOW server_version_num;');
	const server_version_result = await pool_instance.query('SHOW server_version;');
	const uuidv7_function_result = await pool_instance.query(
		"SELECT to_regprocedure('uuidv7()') IS NOT NULL AS has_uuidv7_function;"
	);

	const server_version_num = Number.parseInt(String(server_version_num_result.rows?.[0]?.server_version_num), 10);
	const server_version = server_version_result.rows?.[0]?.server_version;
	const has_uuidv7_function = uuidv7_function_result.rows?.[0]?.has_uuidv7_function === true;

	return {
		server_version,
		server_version_num,
		supports_uuidv7: server_version_num >= 180000 && has_uuidv7_function,
		supports_jsonpath: server_version_num >= MIN_POSTGRES_NATIVE_JSONPATH_VERSION_NUM
	};
}
```

2. `src/model/factory/index.js`

```js
const $schema = schema.clone();
$schema.$bind_connection(connection);

model.schema = $schema;
```

3. `src/schema/schema.js`

```js
Schema.prototype.$bind_connection = function (connection) {
	const capabilities = connection?.server_capabilities ?? null;
	const supports_jsonpath = capabilities?.supports_jsonpath === true;
	this.$runtime = this.$runtime ?? {};

	this.$runtime.read_operators = {
		$json_path_exists: supports_jsonpath ? jsonpath_exists_native : jsonpath_exists_compat,
		$json_path_match: supports_jsonpath ? jsonpath_match_native : jsonpath_match_compat
	};

	return this;
};
```

4. `src/schema/schema.js` identity example

```js
Schema.prototype.$bind_connection = function (connection) {
	const supports_uuidv7 = connection?.server_capabilities?.supports_uuidv7 === true;
	this.$runtime = this.$runtime ?? {};
	this.$runtime.identity = null;

	if(this.identity.type === IDENTITY_TYPE.uuid && this.identity.format === IDENTITY_FORMAT.uuidv7) {
		if(this.identity.mode === IDENTITY_MODE.application) {
			if(typeof this.identity.generator !== 'function') {
				throw new Error('identity.mode=application requires schema.options.identity.generator');
			}

			this.$runtime.identity = {
				mode: IDENTITY_MODE.application,
				column_sql: 'id UUID PRIMARY KEY',
				insert_includes_id: true
			};
			return this;
		}

		if(connection == null) {
			throw new Error('identity.mode=' + this.identity.mode + ' requires a connection so jsonbadger can inspect server capabilities');
		}
	}

	return this;
};
```

5. `src/sql/read/where/operators.js`

```js
if(name === '$json_path_exists') {
	return compile_context.schema_instance.$runtime.read_operators.$json_path_exists(json_expression, value, parameter_state);
}

if(name === '$json_path_match') {
	return compile_context.schema_instance.$runtime.read_operators.$json_path_match(json_expression, value, parameter_state);
}
```

## Why This Is The Right Seam

1. `connect(...)` already owns the server handshake.
   A. capability detection naturally belongs there

2. `model_factory(...)` already owns schema finalization for one model/connection pair.
   A. that is the right place to turn declarative schema intent into runtime-finalized behavior

3. `Schema` already owns query, validation, and identity semantics.
   A. binding capability-dependent implementations onto the cloned schema keeps the final truth in one place

4. Downstream SQL modules stay focused.
   A. they compile SQL
   B. they do not make product or capability decisions

## Scope Boundary

1. This design should only be used for features that have more than one valid implementation.

2. Do not use it for features that only have one valid path.
   A. if there is no valid fallback, `schema.$bind_connection(connection)` should fail clearly

3. Do not expose compatibility translators as a normal public API.
   A. users should still see the clean JsonBadger operator surface first




