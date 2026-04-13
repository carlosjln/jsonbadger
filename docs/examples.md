# JsonBadger examples cheat sheet

JsonBadger is a PostgreSQL-backed document mapper for working with JSONB data through a model/document API.

This page is an example-first cheat sheet for users and AI agents. It shows copy-pasteable JsonBadger usage in increasing complexity and covers the currently implemented query and update operator surface.

Use this page for syntax and working shapes. Use [`docs/api/index.md`](api/index.md) for the module API map and [`docs/advanced/query-translation.md`](advanced/query-translation.md) only when you want the advanced PostgreSQL reference behind the query surface.
Use [`docs/lifecycle.md`](lifecycle.md) when you need the document phase map instead of operator syntax.

## How to Read This Page

- Examples are ordered from setup -> model usage -> queries -> updates -> runtime behavior.
- Snippets reuse a `User` model shape where possible.
- Query operators use the current `$` + `snake_case` naming (for example `$elem_match`, `$has_key`, `$exists`).
- This page only includes currently implemented behavior.
- `Assumes:` notes tell you what earlier setup/data a snippet depends on.
- Important mechanics: queries run when you call `.exec()` (for example `await User.find({}).exec()`), and direct in-place mutations on `doc.document[...]` bypass `doc.set(...)` and assignment-time casting.
- Operation scope: this page covers `create`, `save`, `find`, `find_one`, `find_by_id`, `count_documents`, `update_one`, and `delete_one`. Bulk helpers (`insert_many`, `update_many`, `delete_many`) are not part of the current API surface.

Quick jump:

Setup
- [How to Read This Page](#how-to-read-this-page)
- [Shared Fixture and Assumptions](#shared-fixture-and-assumptions)
- [Reserved Base Fields](#reserved-base-fields)
- [Setup and Connect](#setup-and-connect)
- [Identity Examples](#identity-examples)
- [Schema and Model Definition](#schema-and-model-definition)
- [Built-in FieldType Examples](#built-in-fieldtype-examples)
- [Create and Save Documents](#create-and-save-documents)

Queries
- [Query Basics (find, find_one, count_documents)](#query-basics-find-find_one-count_documents)
- [Direct Equality and Scalar Comparisons](#direct-equality-and-scalar-comparisons)
- [Regex Operators](#regex-operators)
- [Array and JSON Query Operators](#array-and-json-query-operators)
- [JSONB Key Existence Operators](#jsonb-key-existence-operators)
- [JSONPath Operators](#jsonpath-operators)

Mutations
- [Update Operators (`update_one`)](#update-operators-update_one)
- [Delete Operations](#delete-operations)

Advanced
- [Runtime Document Methods (get/set, dirty tracking, serialization)](#runtime-document-methods-getset-dirty-tracking-serialization)
- [Lifecycle Quick Reference](#lifecycle-quick-reference)
- [Optional Alias Path Example](#optional-alias-path-example)
- [Complete Operator Checklist (Query and Update)](#complete-operator-checklist-query-and-update)
- [Related Docs](#related-docs)

## Shared Fixture and Assumptions

Most snippets below are intentionally short and not fully standalone. Unless a section says otherwise, examples assume:

- You are running ESM (`import ...`) with top-level `await` enabled.
- You already connected with `JsonBadger.connect(...)`.
- You defined the `User` model from `Schema and Model Definition`.
- You already ran startup/bootstrap setup from the migration section below.
- You seeded at least one `User` document using the `Create and Save Documents` example (including `tags`, `orders`, and `payload`).

When a snippet uses a different value (for example `name: 'jane'`), either seed a matching row first or replace the filter value with one that exists in your local data.


## Reserved Base Fields

- `id`, `created_at`, and `updated_at` are top-level base fields returned in data-returning operations.
- These base fields exist in schema/runtime introspection even when omitted from user schema input.
- If user schema declares any of these paths, the user definition is preserved.
- Query/sort support for base fields is top-level only (no dotted base-field paths like `created_at.value`).

`id` behavior:
- Default schema identity uses database-generated bigint ids.
  - caller-provided `id` is rejected on create in phase one.
  - PostgreSQL generates the value.
- UUIDv7 schemas use the bound runtime path.
  - database path: PostgreSQL generates the id with `uuidv7()`.
  - application path: JsonBadger uses `identity.generator` before validation and includes the id in the insert.
- Update paths cannot mutate `id`.

Timestamp helper behavior:
- Create:
  - provided `created_at` / `updated_at` values are kept.
  - omitted values are auto-filled.
- Update:
  - provided `updated_at` is kept.
  - omitted `updated_at` is auto-set.
  - `created_at` is not auto-updated.

## Setup and Connect

```js
import JsonBadger from 'jsonbadger';

const db_uri = 'postgresql://user:pass@localhost:5432/dbname';
const options = {
	debug: false,
	max: 10,
	ssl: false
};

const connection = await JsonBadger.connect(db_uri, options);
```

Schema-level UUIDv7 selection:

```js
import {v7 as uuidv7} from 'uuid';

const db_uri = 'postgresql://user:pass@localhost:5432/dbname';
const connection = await JsonBadger.connect(db_uri);

const event_schema = new JsonBadger.Schema({
	name: String
}, {
	identity: {
		type: JsonBadger.IDENTITY_TYPE.uuid,
		format: JsonBadger.IDENTITY_FORMAT.uuidv7,
		mode: JsonBadger.IDENTITY_MODE.fallback,
		generator: uuidv7
	}
});
```

Notes:
- JsonBadger scans server capabilities during `connect(...)`.
- `IDENTITY_MODE.fallback` binds the database path when native `uuidv7()` is available.
- If the server does not support native `uuidv7()`, JsonBadger uses `identity.generator`.
- Run `ensure_table()` / `ensure_indexes()` during startup/bootstrap before normal runtime operations, or use `ensure_model()` when you want the combined path.

Teardown example:

```js
await connection.disconnect();
```

Connection failure pattern (before a pool is established in the process):

```js
try {
	await JsonBadger.connect('postgresql://wrong_user:wrong_pass@localhost:5432/dbname');
} catch(error) {
	// connection/auth/network failures bubble directly from `pg`
	console.error(error.message);
}
```

## Identity Examples

Schema-level `identity` selection:

```js
import {v7 as uuidv7} from 'uuid';

const db_uri = 'postgresql://user:pass@localhost:5432/dbname';
const connection = await JsonBadger.connect(db_uri);

const AuditLog = connection.model({
	name: 'AuditLog',
	schema: new JsonBadger.Schema({
		event_name: String
	}, {
		identity: {
			type: JsonBadger.IDENTITY_TYPE.uuid,
			format: JsonBadger.IDENTITY_FORMAT.uuidv7,
			mode: JsonBadger.IDENTITY_MODE.fallback,
			generator: uuidv7
		}
	}),
	table_name: 'audit_logs'
});

const Counter = connection.model({
	name: 'Counter',
	schema: new JsonBadger.Schema({
		label: String
	}),
	table_name: 'counters'
});
```

Notes:
- `identity` lives on the schema.
- If omitted, the library default is bigint + database-generated ids.
- `IDENTITY_MODE.fallback` uses the database path when available and the application path otherwise.

Create-time `id` behavior example:

```js
// uuidv7 fallback model: database or application path is chosen during schema binding
const generated_uuid_user = await AuditLog.create({
	event_name: 'logout'
});

// bigint default model: caller id is rejected, DB generates numeric id
await Counter.create({label: 'requests'});
```

## Schema and Model Definition

```js
const user_schema = new JsonBadger.Schema({
	name: {type: String, required: true, trim: true, index: true, get: (value) => value && value.toUpperCase()},
	age: {type: Number, min: 0, index: -1},
	status: {type: String, immutable: true},
	tags: [String],
	profile: {
		city: String,
		country: String
	},
	orders: [{sku: String, qty: Number, price: Number}],
	payload: {}
}, {
	identity: {
		type: JsonBadger.IDENTITY_TYPE.bigint,
		format: null,
		mode: JsonBadger.IDENTITY_MODE.fallback,
		generator: null
	}
});

// Schema-level indexes (single path and compound)
user_schema.create_index({using: 'gin', path: 'profile.city'});
user_schema.create_index({using: 'btree', paths: {name: 1, age: -1}});

const connection = await JsonBadger.connect(db_uri, options);
const User = connection.model({
	name: 'User',
	schema: user_schema,
	table_name: 'users'
});
```

Migration helpers (manual/explicit path):

```js
// Option A: run table and indexes explicitly
await User.ensure_table();
await User.ensure_indexes();

// Option B: run the combined model bootstrap path
await User.ensure_model();
```

## Built-in FieldType Examples

```js
const account_schema = new JsonBadger.Schema({
	name: { type: String, trim: true, required: true },
	age: { type: Number, min: 0 },
	is_active: Boolean,
	joined_at: Date,
	owner_id: { type: 'UUIDv7' },
	avatar: Buffer,
	payload: {}, // Mixed
	tags: [String],
	handles: { type: Map, of: String },
	amount: { type: 'Decimal128' },
	visits_64: { type: 'BigInt' },
	ratio: { type: 'Double' },
	score_32: { type: 'Int32' },
	code_or_label: { type: 'Union', of: [String, Number] }
});
```

Quick FieldType reference:

| Field | FieldType | Example |
| --- | --- | --- |
| `name` | `String` | `{ type: String, trim: true, required: true }` |
| `age` | `Number` | `{ type: Number, min: 0 }` |
| `is_active` | `Boolean` | `is_active: Boolean` |
| `joined_at` | `Date` | `joined_at: Date` |
| `owner_id` | `UUIDv7` | `{ type: 'UUIDv7' }` |
| `avatar` | `Buffer` | `avatar: Buffer` |
| `payload` | `Mixed` | `payload: {}` |
| `tags` | `Array<String>` | `tags: [String]` |
| `handles` | `Map<String>` | `{ type: Map, of: String }` |
| `amount` | `Decimal128` | `{ type: 'Decimal128' }` |
| `visits_64` | `BigInt` | `{ type: 'BigInt' }` |
| `ratio` | `Double` | `{ type: 'Double' }` |
| `score_32` | `Int32` | `{ type: 'Int32' }` |
| `code_or_label` | `Union<String, Number>` | `{ type: 'Union', of: [String, Number] }` |

Edge cases and practical notes:
- In-place changes to nested values under `doc.document[...]` bypass `doc.set(...)`; prefer `doc.set(...)` when you want assignment-time casting and setter logic.
- Arrays default to `null` unless you explicitly declare a default such as `default: []`.
- For `Map`-like paths, prefer `document.set('handles.github', 'name')` so casting and dirty tracking run.

## Create and Save Documents

Assumes:
- `User` is defined from the schema/model section above.

```js
const user_doc = User.from({
	name: 'john',
	age: 30,
	status: 'active',
	tags: ['vip', 'beta'],
	profile: {city: 'Miami', country: 'US'},
	orders: [
		{sku: 'A1', qty: 2, price: 20},
		{sku: 'B2', qty: 1, price: 5}
	],
	payload: {
		flags: ['vip', 'beta'],
		score: 42,
		profile: {city: 'Miami', country: 'US'},
		items: [{sku: 'A1', qty: 2}, {sku: 'B2', qty: 0}],
		text_value: 'abc'
	}
});

const saved_user = await user_doc.save();
```

Returns: `saved_user` is a `User` document instance.  
Raw document shape: `saved_user.document` -> `{ id, data, created_at, updated_at }` when the default slug is still `data`.  
Runtime note: read the default slug through `saved_user.document[User.schema.get_default_slug()]`.

Static create and id lookup:

```js
const created_user = await User.create({
	name: 'maria',
	age: 29
});

const same_user = await User.find_by_id(created_user.id).exec();
```

Build a new document from external input without marking it persisted:

```js
const imported_user = User.from({
	name: '  maria  ',
	age: '29',
	created_at: '2026-03-03T08:00:00.000Z'
});
```

`User.from(...)` extracts root `id`, `created_at`, and `updated_at` into base fields and treats every other non-base root key as default-slug payload unless that root key is registered in `schema.options.slugs`. It does not interpret payload input as a persisted row envelope.

Set base fields after construction when needed:

```js
const imported_user = User.from({
	name: 'maria'
});

imported_user.id = '7';
imported_user.created_at = '2026-03-03T08:00:00.000Z';
imported_user.updated_at = '2026-03-03T09:00:00.000Z';
```

Hydrate a persisted document from raw row-like data:

```js
const hydrated_user = User.hydrate({
	id: '7',
	data: {
		name: 'maria',
		age: '29'
	},
	created_at: '2026-03-03T08:00:00.000Z',
	updated_at: '2026-03-03T09:00:00.000Z'
});
```

`User.hydrate(...)` is the row-like path. It reads the payload from the configured default slug key on the outer object and ignores unregistered extra root slugs.

Timestamp helper examples on create:

```js
// Caller-provided timestamp values are kept
const user_with_timestamps = await User.create({
	name: 'timed-user',
	created_at: '2026-03-03T08:00:00.000Z',
	updated_at: '2026-03-03T09:00:00.000Z'
});

// Omitted timestamps are auto-filled
const user_with_auto_timestamps = await User.create({
	name: 'auto-timestamp-user'
});
```

Validation failure pattern (`validation_error`):

```js
try {
	const invalid_user = User.from({
		name: 'bad_input',
		age: -1 // violates `min: 0` from the schema example
	});

	await invalid_user.save();
} catch(error) {
	if(error.name === 'validation_error') {
		const error_payload = error.to_json();
		// shape: { success: false, error: { type: 'validation_error', message: '...', details: ... } }
		// `error.details` is the same validation detail payload included in `error_payload.error.details`
	}
}
```

Constraint/query failure pattern (`query_error`):

Assumes:
- You created a unique index and applied it (for example via `ensure_table()` + `ensure_indexes()` or `ensure_model()`).

```js
const unique_user_schema = new JsonBadger.Schema({
	email: {type: String, required: true}
});
unique_user_schema.create_index({
	using: 'btree',
	path: 'email',
	unique: true,
	name: 'idx_unique_users_email'
});

const UniqueUser = connection.model({
	name: 'UniqueUser',
	schema: unique_user_schema,
	table_name: 'unique_users'
});
await UniqueUser.ensure_table();
await UniqueUser.ensure_indexes();

await UniqueUser.from({email: 'john@example.com'}).save();

try {
	await UniqueUser.from({email: 'john@example.com'}).save();
} catch(error) {
	if(error.name === 'query_error') {
		const error_payload = error.to_json();
		const cause_message = error_payload.error.details?.cause;
		// usually includes: duplicate key value violates unique constraint
	}
}
```

## Query Basics (find, find_one, count_documents)

Assumes (for the query sections below):
- `User` is defined and at least one document was saved (see `## Create and Save Documents`).
- Examples that filter by `name: 'john'`, `tags`, `orders`, or `payload` assume those fields/values exist in seeded data.


```js
const all_users = await User.find({}).exec();

const found_user = await User.find_one({name: 'john'}).exec();

const by_id_user = await User.find_by_id('1').exec();

const adult_count = await User.count_documents({age: {$gte: 18}}).exec();
```

Returns:
- `all_users`: `User[]` (document instances)
- `found_user`: `User | null`
- `by_id_user`: `User | null`
- `adult_count`: `number`
- Snapshot example: `all_users[0]?.document` -> `{ id, data, created_at, updated_at }` when the default slug is still `data`

Query builder chaining:

```js
const page_of_users = await User.find({status: 'active'})
	.where({'profile.country': 'US'})
	.sort({age: -1})
	.limit(20)
	.skip(0)
	.exec();
```

## Direct Equality and Scalar Comparisons

Direct equality and explicit `$eq` both work:

```js
await User.find({name: 'john'}).exec();
await User.find({name: {$eq: 'john'}}).exec();
```

Scalar comparison operators:

```js
await User.find({age: {$ne: 21}}).exec();
await User.find({age: {$gt: 18}}).exec();
await User.find({age: {$gte: 18}}).exec();
await User.find({age: {$lt: 65}}).exec();
await User.find({age: {$lte: 65}}).exec();
```

Set membership operators:

```js
await User.find({status: {$in: ['active', 'pending']}}).exec();
await User.find({status: {$nin: ['disabled', 'banned']}}).exec();
```

Reserved base-field filters (top-level only):

```js
await User.find({id: {$in: [1, 2, 3]}}).exec(); // bigserial default
await User.find({created_at: {$gte: '2026-01-01T00:00:00.000Z'}}).exec();
await User.find({updated_at: {$lt: '2026-12-31T23:59:59.999Z'}}).sort({updated_at: -1}).exec();
```

## Regex Operators

Regex literal shorthand:

```js
await User.find({name: /jo/i}).exec();
```

`$regex` with `$options`:

```js
await User.find({
	name: {
		$regex: '^jo',
		$options: 'i'
	}
}).exec();
```

## Array and JSON Query Operators

Array-root shorthand (for array fields) uses containment behavior:

```js
await User.find({tags: 'vip'}).exec();
```

`$all` and `$size`:

```js
await User.find({tags: {$all: ['vip', 'beta']}}).exec();
await User.find({tags: {$size: 2}}).exec();
```

`$elem_match` on scalar arrays:

```js
await User.find({
	tags: {
		$elem_match: {
			$regex: '^v',
			$options: 'i'
		}
	}
}).exec();
```

`$elem_match` on arrays of objects:

```js
await User.find({
	orders: {
		$elem_match: {
			qty: {$gt: 1},
			sku: {$regex: '^A'}
		}
	}
}).exec();
```

JSON containment with `$contains` (`@>` semantics):

```js
await User.find({
	payload: {$contains: {profile: {city: 'Miami'}}}
}).exec();

await User.find({
	payload: {$contains: {flags: ['vip']}}
}).exec();
```

## JSONB Key Existence Operators

Top-level existence on the selected JSONB value:

```js
await User.find({payload: {$has_key: 'profile'}}).exec();
await User.find({payload: {$has_any_keys: ['profile', 'flags']}}).exec();
await User.find({payload: {$has_all_keys: ['profile', 'score']}}).exec();
```

Nested-scope existence (JsonBadger extracts the nested JSONB value first, then applies top-level existence there):

```js
await User.find({'payload.profile': {$has_key: 'city'}}).exec();

// This checks for a literal key name "profile.city" at the top level of payload (usually false)
await User.find({payload: {$has_key: 'profile.city'}}).exec();
```

## Path Existence

`$exists` checks whether the selected dotted path is present.

Assumes:
- Your seeded `payload` includes nested shapes like `profile.city`.

Target shape reminder:
- `payload` is a JSON object with keys like `profile`, where `profile.city` may or may not be present.

```js
await User.find({
	'payload.profile.city': {$exists: true}
}).exec();

await User.find({
	'payload.missing.deep': {$exists: true}
}).exec();
```


Expected behavior:
- Existing paths match when `$exists: true`.
- Missing paths return `[]` when `$exists: true`.

## Update Operators (`update_one`)

`update_one(...)` supports `$set`, `$unset`, `$replace_roots`, plus implicit top-level keys that are routed into `$set`.

Assumes (for update and delete sections below):
- A matching row exists (examples use `name: 'john'` and `name: 'missing'`).
- The seeded row includes `tags` and `payload` fields from the create/save example.

Target shape reminder:
- `tags` is an array, `profile` is an object, and `payload.profile` / `payload.score` are nested JSON values in the seeded row.

Use `$set` to assign or replace one or more JSON values:

```js
const updated_user = await User.update_one(
	{name: 'john'},
	{
		$set: {
			age: 31,
			'profile.city': 'Orlando',
			'payload.profile.state': 'FL'
		}
	}
);
```

Returns: `updated_user` is `User | null`.  
Snapshot shape: `updated_user?.document` -> `{ id, data, created_at, updated_at }` when the default slug is still `data`.

Use `$unset` to remove one or more JSON paths:

```js
await User.update_one({name: 'john'}, {
	$unset: [
		'payload.cleanup_flag',
		'profile.country'
	]
});
```

`$replace_roots` (replaces the full JSONB document):

```js
await User.update_one({name: 'john'}, {
	$replace_roots: {
		name: 'john',
		age: 31,
		status: 'active',
		profile: {city: 'Orlando'}
	}
});
```

Implicit top-level keys are routed into `$set`:

```js
await User.update_one({name: 'john'}, {
	age: 32,
	'profile.city': 'Tampa'
});
```

Multiple update operators in one call (application order is `$replace_roots` -> `$unset` -> `$set`):

```js
await User.update_one({name: 'john'}, {
	$replace_roots: {
		name: 'john',
		status: 'active',
		profile: {city: 'Miami'}
	},
	$unset: [
		'profile.country'
	],
	$set: {
		'payload.score': 50
	}
});
```

Timestamp helper examples on update:

```js
// Caller-provided updated_at is kept
await User.update_one({name: 'john'}, {
	$set: {
		age: 32,
		updated_at: '2026-03-03T10:00:00.000Z'
	}
});

// Omitted updated_at is auto-refreshed
await User.update_one({name: 'john'}, {
	$set: {
		age: 33
	}
});
```

## Delete Operations

`delete_one(...)` deletes one matching row and returns the deleted document instance.

```js
const deleted_user = await User.delete_one({name: 'john'});
```

Returns: `deleted_user` is `User | null`.  
Snapshot shape: `deleted_user?.document` -> `{ id, data, created_at, updated_at }` when the default slug is still `data`.

No match (or missing table) returns `null`:

```js
const maybe_deleted = await User.delete_one({name: 'missing'});
if(maybe_deleted === null) {
	// no matching row, or table does not exist yet
}
```

Returns: `null` when no row matches (or when the table does not exist yet).

## Runtime Document Methods (get/set and direct document access)

Runtime getters/setters:

Assumes:
- `User` is defined from the schema/model example and includes the `name` getter configuration shown there.
- This snippet demonstrates in-memory runtime behavior; no database read is required until `save()`.


```js
const doc = User.from({
	name: 'jane',
	status: 'active',
	payload: {count: 1},
	profile: {city: 'Miami'}
});

const default_slug = User.schema.get_default_slug();

doc.set(default_slug + '.name', '  jane_doe  ');
const user_name = doc.get(default_slug + '.name');

doc.set(default_slug + '.profile.city', 'Orlando');
const city = doc.get(default_slug + '.profile.city');

// raw document access still works
doc.document[default_slug].payload.count += 1;
const pending_delta = doc.document.$get_delta();
```

Bind live document fields onto another object:

```js
const user_entity = {};
doc.bind_document(user_entity);

user_entity.name; // reads from the default slug
user_entity.profile.city = 'Tampa'; // live nested default-slug object
```

> **Note:** `bind_document(...)` flattens default-slug root fields onto the target root, but keeps extra slugs nested. It also throws if the target already owns one of the field names it needs to bind.

### Optional Alias Path Example

Use aliases only when you need an alternate path name (for example, a short path shortcut for a nested field).

```js
const alias_schema = new JsonBadger.Schema({
	profile: {
		city: {type: String, alias: 'city'}
	}
});

const AliasUser = connection.model({
	name: 'AliasUser',
	schema: alias_schema,
	table_name: 'alias_users'
});
const alias_doc = AliasUser.from({profile: {city: 'Miami'}});

// alias path -> underlying path
alias_doc.get('city'); // 'Miami'
alias_doc.set('city', 'Orlando');
alias_doc.get('data.profile.city'); // 'Orlando' when the default slug is still `data`
```

Aliases are schema-defined alternate path names for `doc.get(...)` and `doc.set(...)`. They are collected when the schema is created, while canonical schema paths remain the persisted keys.

Immutable behavior (`immutable: true`) after first persist:

```js
await doc.save();

// after successful save, immutable fields reject updates
// doc.set('status', 'disabled'); // throws
```

## Lifecycle Quick Reference

```js
const doc = User.from({name: 'john'});
doc.set('data.profile.city', 'Miami');
await doc.save();

const found = await User.find_by_id(doc.id).exec();
const snapshot = found.document;
```

Phase summary:
- `User.from(...)` -> constructed
- first runtime interaction (`set/get/save/delete`) -> runtime-ready
- `save()` on new doc -> persisted
- `find_one(...).exec()` / `find_by_id(...).exec()` -> queried/hydrated

For the full lifecycle contract, see [`docs/lifecycle.md`](lifecycle.md).

## Complete Operator Checklist (Query and Update)

| Family | Supported operators/methods |
| --- | --- |
| Scalar equality/comparison | direct equality, `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte` |
| Set membership | `$in`, `$nin` |
| Regex | RegExp literal shorthand, `$regex`, `$options` |
| Array operators | `$all`, `$size`, `$elem_match` |
| JSON containment | `$contains` |
| JSONB key existence | `$has_key`, `$has_any_keys`, `$has_all_keys` |
| Path existence | `$exists` |
| Updates (`update_one`) | implicit keys, `$set`, `$unset`, `$replace_roots` |

## Related Docs

- [`README.md`](../README.md) (quick start + selected examples)
- [`docs/api/index.md`](api/index.md) (module API map)
- [`docs/api/model.md`](api/model.md) (model construction, queries, persistence, and document methods)
- [`docs/api/schema.md`](api/schema.md) (schema API and index declaration rules)
- [`docs/api/query-builder.md`](api/query-builder.md) (query builder chain and filter families)
- [`docs/lifecycle.md`](lifecycle.md) (document phases, hydration/save flow, dirty tracking, and serialization)
- [`docs/advanced/query-translation.md`](advanced/query-translation.md) (advanced PostgreSQL reference)
- [`docs/local-integration-testing.md`](local-integration-testing.md) (local integration test setup)
