# PostgreSQL ID Policy Proposal

Audience: repo contributors.

This note proposes the new direction for base `id` handling after deciding that PostgreSQL `9.6` must remain a real target.

The problem is that the current `id_strategy` design mixes together too many concerns:

1. storage type
2. desired id format
3. generation source
4. validation rules
5. DDL shape
6. server capability checks

That is why `uuidv7` ended up as a schema strategy even though what we really want is often an application-generated UUID stored in a PostgreSQL `UUID` column, with a database-native path only when the connected server can actually do it.

## Example End State

1. Default model, database-generated numeric id.

```js
const UserSchema = new JsonBadger.Schema({
	name: String
});
```

2. UUIDv7 model with fallback mode.

```js
import {v7 as uuidv7} from 'uuid';

const SessionSchema = new JsonBadger.Schema({
	token: String
}, {
	identity: {
		type: JsonBadger.IDENTITY_TYPE.uuid,
		format: JsonBadger.IDENTITY_FORMAT.uuidv7,
		mode: JsonBadger.IDENTITY_MODE.fallback,
		generator: uuidv7
	}
});
```

3. Runtime behavior for that second case.
   A. if the connected server supports native `uuidv7()`, the schema binds the database path
   B. otherwise, if `identity.generator` exists, the schema binds the application path
   C. otherwise, schema binding fails with a clear error

## Core Business Rule

1. The library default should move back to database-generated numeric ids.

2. `uuidv7` should stop being the whole public id strategy.

3. UUIDv7 should be treated as an id format requirement that can be satisfied by more than one generation path.

4. Application-generated ids should be a first-class concept.

5. Identity-column support should be treated as an internal DDL implementation detail for database-generated numeric ids, not as the main public API concept.

## Proposed Public API

1. Replace the current single `id_strategy` concept with one explicit schema namespace.
   A. `identity.type`
   B. `identity.format`
   C. `identity.mode`
   D. `identity.generator`

2. Proposed constants.

```js
const IDENTITY_TYPE = Object.freeze({
	bigint: 'bigint',
	uuid: 'uuid'
});

const IDENTITY_FORMAT = Object.freeze({
	uuidv7: 'uuidv7'
});

const IDENTITY_MODE = Object.freeze({
	database: 'database',
	application: 'application',
	fallback: 'fallback'
});
```

3. Proposed schema defaults.

```js
schema_options: {
	identity: {
		type: IDENTITY_TYPE.bigint,
		format: null,
		mode: IDENTITY_MODE.fallback,
		generator: null
	},
	auto_index: true,
	default_slug: 'data',
	slugs: []
}
```

4. `identity.mode` semantics.
   A. `fallback`
      1. prefer the database-native path when available
      2. otherwise use `identity.generator`
      3. otherwise fail during `$bind_connection(connection)`
   B. `database`
      1. require the database-native path
      2. fail during `$bind_connection(connection)` if the server cannot support it
   C. `application`
      1. always use `identity.generator`
      2. ignore native server capability for generation choice
      3. fail if no generator is provided

## Phase-One Supported Combinations

1. Support `bigint + null format`.
   A. this is the library default
   B. it works on PostgreSQL `9.6`
   C. it binds to the database numeric path
   D. immediate DDL can remain `BIGSERIAL PRIMARY KEY`

2. Support `uuid + uuidv7 + fallback`.
   A. native path when the server supports `uuidv7()`
   B. application fallback when the server does not support it and `identity.generator` is provided

3. Support `uuid + uuidv7 + database`.
   A. this forces native database generation
   B. it fails at bind time if the server does not support `uuidv7()`

4. Support `uuid + uuidv7 + application`.
   A. this forces application generation
   B. this does not require PostgreSQL native `uuidv7()` support

5. Do not support the other combinations yet.
   A. `bigint + application`
   B. `uuid + database + null format`
   C. other UUID formats

6. Reject unsupported static combinations at schema construction time.

7. Reject unsupported capability-dependent combinations at `schema.$bind_connection(connection)` time.

## Why This Is Better

1. It separates logical policy from PostgreSQL implementation detail.

2. It removes the false assumption that `uuidv7` must always come from PostgreSQL.

3. It lets consuming apps own id generation when that is the right seam.

4. It keeps PostgreSQL `9.6` support real without forcing the library to stay numeric-only.

5. It keeps the door open for native database generation when the server supports it.

6. It gives us room to use identity columns later without changing the public API again.

## Dependency Rule

1. Do not add `uuid` as a normal dependency of this library.

2. Do not require a peer dependency for `uuid` either.

3. Keep the core library dependency-light.

4. If a consuming app wants UUIDv7 generation, it installs `uuid` itself and provides `identity.generator`.

## DDL Rules

1. For `bigint + null format`, phase one should generate:

```sql
id BIGSERIAL PRIMARY KEY
```

2. Later, if we decide to use modern PostgreSQL identity columns internally, the same logical policy can emit:

```sql
id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY
```

3. For `uuid + uuidv7 + fallback`, DDL depends on `schema.$runtime.identity`.
   A. native-database path:

```sql
id UUID PRIMARY KEY DEFAULT uuidv7()
```

   B. application path:

```sql
id UUID PRIMARY KEY
```

4. For `uuid + uuidv7 + database`, generate:

```sql
id UUID PRIMARY KEY DEFAULT uuidv7()
```

5. For `uuid + uuidv7 + application`, generate:

```sql
id UUID PRIMARY KEY
```

## Capability Rule

1. Keep `supports_uuidv7` detection in `src/connection/server-capabilities.js`.

2. `supports_uuidv7` should become one branch in runtime resolution, not a hard-coded global strategy.

3. Resolution should happen on the cloned schema during model compilation.
   A. `const runtime_schema = schema.clone();`
   B. `runtime_schema.$bind_connection(connection);`

4. Runtime rules.
   A. `uuid + uuidv7 + fallback`
      1. if `connection.server_capabilities.supports_uuidv7 === true`, bind the database path
      2. otherwise, if `identity.generator` is a function, bind the application path
      3. otherwise, throw a clear configuration error
   B. `uuid + uuidv7 + database`
      1. require `connection.server_capabilities.supports_uuidv7 === true`
      2. otherwise throw a clear configuration error
   C. `uuid + uuidv7 + application`
      1. require `identity.generator`
      2. ignore native server capability for generation choice

5. This keeps capability selection aligned with the broader capability-runtime design.

## Insert Lifecycle

1. For `bigint + null format`.
   A. if `document.id` is present on insert, reject it in phase one
   B. insert without an `id` column
   C. read the generated id from `RETURNING`

2. For `uuid + uuidv7 + fallback` after binding.
   A. if `schema.$runtime.identity.mode = database`, insert without an `id` column
   B. if `schema.$runtime.identity.mode = application`, generate `document.id` before validation and insert it explicitly

3. For `uuid + uuidv7 + database`.
   A. insert without an `id` column
   B. read the generated id from `RETURNING`

4. For `uuid + uuidv7 + application`.
   A. if `document.id` is missing and `identity.generator` exists, call `identity.generator()` before validation
   B. if `document.id` is still missing, throw a clear error
   C. insert the explicit `id`

5. Generation should happen in the model insert lifecycle, after `schema.$bind_connection(connection)` has already resolved which path the compiled model will use.

## Public ID Value Rule

1. Public `document.id` should remain a string in every supported identity mode.

2. This applies to:
   A. hydrated model instances
   B. query filters
   C. save and update flows
   D. returned ids from inserts

3. SQL can still cast by the bound identity type internally.
   A. public JavaScript value stays a string
   B. SQL parameter casting is an internal concern

## Validation Rule

1. Base id validation should stop being keyed directly off the old `id_strategy` enum.

2. Validation should accept that the public `document.id` value is string-shaped in both numeric and UUID-backed modes.

3. In phase one.
   A. `bigint + null format` validates numeric ids on read/query paths
   B. `uuid + uuidv7 + fallback` validates UUIDv7 strings after the runtime path is resolved
   C. `uuid + uuidv7 + database` validates UUIDv7 strings
   D. `uuid + uuidv7 + application` validates UUIDv7 strings

4. The UUID version check is now justified because the schema explicitly declared `identity.format: uuidv7`.

## Proposed File Changes

1. Replace `src/constants/id-strategy.js` with three smaller constants modules.
   A. `src/constants/identity-type.js`
   B. `src/constants/identity-format.js`
   C. `src/constants/identity-mode.js`

2. Update `src/constants/defaults.js`.
   A. add one nested `identity` object under `schema_options`
   B. default `identity.type = bigint`
   C. default `identity.format = null`
   D. default `identity.mode = fallback`
   E. default `identity.generator = null`

3. Update `src/schema/schema.js`.
   A. keep declarative identity config under `schema.options.identity`
   B. merge it from `defaults.schema_options.identity` plus user overrides
   C. reserve `schema.$runtime` for runtime-finalized artifacts on the cloned schema
   D. store resolved identity behavior in `schema.$runtime.identity`
   E. add `Schema.prototype.$bind_connection(connection)`
   F. resolve UUIDv7 native-vs-application behavior there
   G. validate supported combinations during schema construction
   H. validate capability-dependent viability during binding

4. Update `src/model/factory/index.js`.
   A. clone the schema
   B. call `cloned_schema.$bind_connection(connection)`
   C. bind the finalized schema to the compiled model

5. Update `src/migration/ensure-table.js`.
   A. choose DDL from `schema.$runtime.identity`
   B. phase-one numeric database mode uses `BIGSERIAL`
   C. uuidv7 native path uses `UUID PRIMARY KEY DEFAULT uuidv7()`
   D. uuidv7 application path uses `UUID PRIMARY KEY`

6. Update `src/model/model.js`.
   A. stop treating `supports_uuidv7` as a top-level insert strategy on its own
   B. generate application ids before insert when `schema.$runtime.identity` says so
   C. reject explicit ids for database-generated numeric mode in phase one

7. Update `src/sql/write/build-insert-query.js`.
   A. include `id` only when `schema.$runtime.identity.insert_includes_id = true`
   B. choose the SQL cast from the bound schema id type

8. Update `src/sql/read/where/context.js` and `src/sql/read/where/base-fields.js`.
   A. cast and normalize by the bound schema id type and format
   B. keep public id values string-shaped at the model boundary
   C. stop keying that behavior off the old `uuidv7` strategy enum

9. Keep `src/connection/server-capabilities.js`.
   A. keep `supports_uuidv7`
   B. add `supports_identity_columns` later only if we actually adopt identity DDL internally

## Near-Factual End-State Shape

1. Schema configuration.

```js
const SessionSchema = new Schema({
	token: String
}, {
	identity: {
		type: IDENTITY_TYPE.uuid,
		format: IDENTITY_FORMAT.uuidv7,
		mode: IDENTITY_MODE.fallback,
		generator: uuidv7
	}
});
```

2. Schema binding.

```js
Schema.prototype.$bind_connection = function (connection) {
	const supports_uuidv7 = connection?.server_capabilities?.supports_uuidv7 === true;
	this.$runtime = this.$runtime ?? {};
	this.$runtime.identity = null;

	if(this.options.identity.type === IDENTITY_TYPE.uuid && this.options.identity.format === IDENTITY_FORMAT.uuidv7) {
		if(this.options.identity.mode === IDENTITY_MODE.database) {
			if(!supports_uuidv7) {
				throw new Error('identity.mode=database requires PostgreSQL uuidv7() support');
			}

			this.$runtime.identity = {
				mode: IDENTITY_MODE.database,
				column_sql: 'id UUID PRIMARY KEY DEFAULT uuidv7()',
				insert_includes_id: false
			};
			return this;
		}

		if(this.options.identity.mode === IDENTITY_MODE.application) {
			if(typeof this.options.identity.generator !== 'function') {
				throw new Error('identity.mode=application requires schema.options.identity.generator');
			}

			this.$runtime.identity = {
				mode: IDENTITY_MODE.application,
				column_sql: 'id UUID PRIMARY KEY',
				insert_includes_id: true
			};
			return this;
		}

		if(this.options.identity.mode === IDENTITY_MODE.fallback) {
			if(supports_uuidv7) {
				this.$runtime.identity = {
					mode: IDENTITY_MODE.database,
					column_sql: 'id UUID PRIMARY KEY DEFAULT uuidv7()',
					insert_includes_id: false
				};
				return this;
			}

			if(typeof this.options.identity.generator === 'function') {
				this.$runtime.identity = {
					mode: IDENTITY_MODE.application,
					column_sql: 'id UUID PRIMARY KEY',
					insert_includes_id: true
				};
				return this;
			}

			throw new Error('identity.mode=fallback requires PostgreSQL uuidv7() support or schema.options.identity.generator');
		}
	}

	return this;
};
```

3. Insert preparation.

```js
function prepare_insert_id(model, document) {
	if(model.schema.$runtime.identity.insert_includes_id !== true) {
		return;
	}

	if(document.id == null && typeof model.schema.options.identity.generator === 'function') {
		document.id = model.schema.options.identity.generator();
	}

	if(document.id == null) {
		throw new ValidationError('Application-generated ids require document.id or schema.options.identity.generator');
	}
}
```

## Scope Recommendation

1. Make the semantic split first.

2. Change the default back to numeric database-generated ids first.

3. Add UUIDv7 fallback mode next.

4. Do not add identity-column DDL in the same first pass unless we explicitly want that extra scope.

5. If we later want identity columns, add them behind the same `bigint + database` logical policy so the public API does not move again.

## Source Note

1. PostgreSQL identity columns are the modern `GENERATED ... AS IDENTITY` feature in current PostgreSQL documentation.
2. PostgreSQL `9.6` exposes `bigserial` as the legacy auto-incrementing numeric type.
3. This proposal uses that distinction to keep the public API logical while keeping the first implementation compatible with PostgreSQL `9.6`.




