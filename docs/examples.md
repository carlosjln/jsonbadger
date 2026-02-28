# JsonBadger examples cheat sheet

JsonBadger is a PostgreSQL-backed document mapper for working with JSONB data through a model/document API.

This page is an example-first cheat sheet for users and AI agents. It shows copy-pasteable JsonBadger usage in increasing complexity and covers the currently implemented query and update operator surface.

Use this page for syntax and working shapes. Use [`docs/api.md`](api.md) for API reference details and [`docs/query-translation.md`](query-translation.md) for PostgreSQL operator/function semantics.

## How to Read This Page

- Examples are ordered from setup -> model usage -> queries -> updates -> runtime behavior.
- Snippets reuse a `User` model shape where possible.
- Query operators use the current `$` + `snake_case` naming (for example `$elem_match`, `$has_key`, `$json_path_exists`).
- This page only includes currently implemented behavior.
- `Assumes:` notes tell you what earlier setup/data a snippet depends on.
- Important mechanics: queries run when you call `.exec()` (for example `await User.find({}).exec()`), and direct in-place mutations on nested `doc.data` values may require `doc.mark_modified('path')` after mutating.
- Operation scope: this page covers `save`, `find`, `find_one`, `count_documents`, `update_one`, and `delete_one`. Bulk helpers (`insert_many`, `update_many`, `delete_many`) are not part of the current API surface.

Quick jump:

Setup
- [How to Read This Page](#how-to-read-this-page)
- [Shared Fixture and Assumptions](#shared-fixture-and-assumptions)
- [Reserved Metadata Fields](#reserved-metadata-fields)
- [Setup and Connect](#setup-and-connect)
- [ID Strategy Examples](#id-strategy-examples)
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
- [Optional Alias Path Example](#optional-alias-path-example)
- [Complete Operator Checklist (Query and Update)](#complete-operator-checklist-query-and-update)
- [Related Docs](#related-docs)

## Shared Fixture and Assumptions

Most snippets below are intentionally short and not fully standalone. Unless a section says otherwise, examples assume:

- You are running ESM (`import ...`) with top-level `await` enabled.
- You already connected with `JsonBadger.connect(...)`.
- You defined the `User` model from `Schema and Model Definition`.
- You either ran manual migrations (`ensure_table()` / `ensure_schema()`) or allowed a first write to create the table.
- You seeded at least one `User` document using the `Create and Save Documents` example (including `tags`, `orders`, and `payload`).

When a snippet uses a different value (for example `name: 'jane'`), either seed a matching row first or replace the filter value with one that exists in your local data.


## Reserved Metadata Fields

- `id`, `created_at`, and `updated_at` are reserved computed fields.
- They are read-only and returned at the top level in data-returning operations.
- You cannot declare them in schema definitions or target them in write/update payload paths.
- Query/sort support for these fields is top-level only (no dotted reserved paths).

## Setup and Connect

> Important: `IdStrategies.uuidv7` requires native PostgreSQL `uuidv7()` support (PostgreSQL 18+).

```js
import JsonBadger from 'jsonbadger';

const db_uri = 'postgresql://user:pass@localhost:5432/dbname';
const db_connection_options = {
	debug: false,
	max: 10,
	ssl: false,
	auto_index: true,
	id_strategy: JsonBadger.IdStrategies.bigserial
};

await JsonBadger.connect(db_uri, db_connection_options);
```

UUIDv7 server default (PostgreSQL 18+ native `uuidv7()` required):

```js
const db_uri = 'postgresql://user:pass@localhost:5432/dbname';
const db_connection_options = {
	id_strategy: JsonBadger.IdStrategies.uuidv7
};

await JsonBadger.connect(db_uri, db_connection_options);
```

Notes:
- JsonBadger checks native `uuidv7()` support automatically during `connect(...)` and caches the capability result.
- Reads do not auto-create tables. A first write (`save()` / `update_one(...)`) can create the table, or you can call `ensure_table()` / `ensure_schema()` explicitly.

Teardown example:

```js
await JsonBadger.disconnect();
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

## ID Strategy Examples

Server-wide default (`connect`) plus model override (`model(...)`):

```js
const db_uri = 'postgresql://user:pass@localhost:5432/dbname';
const db_connection_options = {
	id_strategy: JsonBadger.IdStrategies.uuidv7 // PostgreSQL 18+ native uuidv7() required
};

await JsonBadger.connect(db_uri, db_connection_options);

const AuditLog = JsonBadger.model(new JsonBadger.Schema({
	event_name: String
}), {
	table_name: 'audit_logs',
	// inherits server id_strategy: uuidv7
});

const Counter = JsonBadger.model(new JsonBadger.Schema({
	label: String
}), {
	table_name: 'counters',
	id_strategy: JsonBadger.IdStrategies.bigserial // model override
});
```

Notes:
- `id_strategy` precedence is: model option -> connection option -> library default (`bigserial`).
- `IdStrategies.uuidv7` uses database-generated IDs (`DEFAULT uuidv7()`) and JsonBadger validates support internally.

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
});

// Schema-level indexes (single path and compound)
user_schema.create_index('profile.city');
user_schema.create_index({name: 1, age: -1});

const User = JsonBadger.model(user_schema, {
	table_name: 'users',
	auto_index: true,
	id_strategy: JsonBadger.IdStrategies.bigserial
});
```

Migration helpers (manual/explicit path):

```js
// Option A: run table and indexes explicitly
await User.ensure_table();
await User.ensure_index();

// Option B: run both in one call
await User.ensure_schema();
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
- In-place changes to `Mixed` (`{}`) values and `Date` objects do not mark the path dirty automatically; call `doc.mark_modified('path')` after mutating them.
- Arrays default to `[]`; set `default: undefined` to disable the implicit empty-array default.
- For `Map`-like paths, prefer `document.set('handles.github', 'name')` so casting and dirty tracking run.
- Serialization applies getters by default; use `doc.to_object({ getters: false })` or `doc.to_json({ getters: false })` to bypass them.

## Create and Save Documents

First write can create the table if it does not exist yet.

Assumes:
- `User` is defined from the schema/model section above.

```js
const user_doc = new User({
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

await user_doc.validate();
const saved_user = await user_doc.save();
```

Returns: `saved_user` is a `User` document instance.  
Snapshot shape: `saved_user.to_json()` -> `{ id, name, age, status, tags, profile, orders, payload, created_at, updated_at }`.  
Runtime note: `user_doc.data` remains payload-only data.

Validation failure pattern (`validation_error`):

```js
try {
	const invalid_user = new User({
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
- You created a unique index and applied it (for example via `ensure_schema()`).

```js
const unique_user_schema = new JsonBadger.Schema({
	email: {type: String, required: true}
});
unique_user_schema.create_index({email: 1}, {
	unique: true,
	name: 'idx_unique_users_email'
});

const UniqueUser = JsonBadger.model(unique_user_schema, {
	table_name: 'unique_users'
});
await UniqueUser.ensure_schema();

await new UniqueUser({email: 'john@example.com'}).save();

try {
	await new UniqueUser({email: 'john@example.com'}).save();
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

const adult_count = await User.count_documents({age: {$gte: 18}}).exec();
```

Returns:
- `all_users`: `User[]` (document instances)
- `found_user`: `User | null`
- `adult_count`: `number`
- Snapshot example: `all_users[0]?.to_json()` -> `{ id, name: 'john', ..., created_at, updated_at }`

Query builder chaining:

```js
const page_of_users = await User.find({status: 'active'})
	.where({'profile.country': 'US'})
	.sort({age: -1})
	.limit(20)
	.skip(0)
	.exec();
```

Read behavior note:
- `find(...).exec()`, `find_one(...).exec()`, and `count_documents(...).exec()` do not call `ensure_table()`.

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

Reserved metadata filters (top-level only):

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

## JSONPath Operators

`$json_path_exists` (`@?`) and `$json_path_match` (`@@`):

Assumes:
- Your seeded `payload` includes shapes like `items[*].qty` and `score` (as shown in `## Create and Save Documents`).

Target shape reminder:
- `payload` is a JSON object with keys like `score` and `items`, where `items` is an array of objects (for example `{qty: 2}`).

```js
await User.find({
	payload: {$json_path_exists: '$.items[*] ? (@.qty > 1)'}
}).exec();

await User.find({
	payload: {$json_path_match: '$.score > 10'}
}).exec();
```


Expected behavior:
- If your seeded payload does not include those paths/types, these examples return `[]` instead of failing.

## Update Operators (`update_one`)

`update_one(...)` supports `$set`, `$insert`, and `$set_lax`.

Assumes (for update and delete sections below):
- A matching row exists (examples use `name: 'john'` and `name: 'missing'`).
- The seeded row includes `tags` and `payload` fields from the create/save example.

Target shape reminder:
- `tags` is an array, `profile` is an object, and `payload.profile` / `payload.score` are nested JSON values in the seeded row.

Basic `$set` (maps to `jsonb_set(...)`):

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
Snapshot shape: `updated_user?.to_json()` -> `{ id, ..., created_at, updated_at }`.

`$insert` (maps to `jsonb_insert(...)`) with numeric array index paths:

```js
await User.update_one({name: 'john'}, {
	$insert: {
		'tags.0': 'first_tag'
	}
});

await User.update_one({name: 'john'}, {
	$insert: {
		'tags.0': {
			value: 'after_first',
			insert_after: true
		}
	}
});
```

`$set_lax` (maps to `jsonb_set_lax(...)`) object form:

Target shape reminder for `$set_lax`:
- `payload` is a JSON object; these examples update or delete nested keys inside `payload`.

```js
await User.update_one({name: 'john'}, {
	$set_lax: {
		'payload.cleanup_flag': {
			value: null,
			null_value_treatment: 'delete_key'
		}
	}
});
```

`$set_lax` options example (`create_if_missing`, `null_value_treatment`):

```js
await User.update_one({name: 'john'}, {
	$set_lax: {
		'payload.archived_at': {
			value: null,
			create_if_missing: false,
			null_value_treatment: 'return_target'
		}
	}
});
```

Multiple update operators in one call (application order is `$set` -> `$insert` -> `$set_lax`):

```js
await User.update_one({name: 'john'}, {
	$set: {
		'payload.score': 50
	},
	$insert: {
		'tags.0': {value: 'vip', insert_after: true}
	},
	$set_lax: {
		'payload.cleanup_flag': {
			value: null,
			null_value_treatment: 'delete_key'
		}
	}
});
```

Conflict rule (rejected before SQL):

```js
await User.update_one({name: 'john'}, {
	$set: {
		payload: {nested: true}
	},
	$set_lax: {
		'payload.value': 'ok'
	}
});
// throws: conflicting update paths (same path or parent/child overlap)
```

## Delete Operations

`delete_one(...)` deletes one matching row and returns the deleted document instance.

```js
const deleted_user = await User.delete_one({name: 'john'});
```

Returns: `deleted_user` is `User | null`.  
Snapshot shape: `deleted_user?.to_json()` -> `{ id, ..., created_at, updated_at }`.

No match (or missing table) returns `null`:

```js
const maybe_deleted = await User.delete_one({name: 'missing'});
if(maybe_deleted === null) {
	// no matching row, or table does not exist yet
}
```

Returns: `null` when no row matches (or when the table does not exist yet).

## Runtime Document Methods (get/set, dirty tracking, serialization)

Runtime getters/setters and dirty tracking:

Assumes:
- `User` is defined from the schema/model example and includes the `name` getter configuration shown there.
- This snippet demonstrates in-memory runtime behavior; no database read is required until `save()`.


```js
const doc = new User({
	name: 'jane',
	status: 'active',
	payload: {count: 1},
	profile: {city: 'Miami'}
});

// normal path set/get

doc.set('name', '  jane_doe  ');
const upper_name = doc.get('name');

doc.set('profile.city', 'Orlando');
const city = doc.get('profile.city');

// dirty tracking
const before_dirty = doc.is_modified('payload');
doc.data.payload.count += 1;
if(!doc.is_modified('payload')) {
	doc.mark_modified('payload');
}
const after_dirty = doc.is_modified('payload');

doc.clear_modified();
```

### Optional Alias Path Example

Use aliases only when you need an alternate path name (for example, a short path shortcut for a nested field).

```js
const alias_schema = new JsonBadger.Schema({
	profile: {
		city: {type: String, alias: 'city'}
	}
});

const AliasUser = JsonBadger.model(alias_schema, {
	table_name: 'alias_users'
});
const alias_doc = new AliasUser({profile: {city: 'Miami'}});

// alias path -> underlying path
alias_doc.get('city'); // 'Miami'
alias_doc.set('city', 'Orlando');
alias_doc.get('profile.city'); // 'Orlando'
```

Aliases are path aliases for `doc.get(...)`, `doc.set(...)`, and `doc.mark_modified(...)`. Non-dotted alias names also get runtime property proxies (for example, `alias_doc.city`).

Serialization helpers (`to_object`, `to_json`) apply getters by default:

```js
const as_object = doc.to_object();
const as_object_without_getters = doc.to_object({getters: false});
const as_json_ready = doc.to_json();
```

Immutable behavior (`immutable: true`) after first persist:

```js
await doc.save();

// after successful save, immutable fields reject updates
// doc.set('status', 'disabled'); // throws
```

## Complete Operator Checklist (Query and Update)

| Family | Supported operators/methods |
| --- | --- |
| Scalar equality/comparison | direct equality, `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte` |
| Set membership | `$in`, `$nin` |
| Regex | RegExp literal shorthand, `$regex`, `$options` |
| Array operators | `$all`, `$size`, `$elem_match` |
| JSON containment | `$contains` |
| JSONB key existence | `$has_key`, `$has_any_keys`, `$has_all_keys` |
| JSONPath | `$json_path_exists`, `$json_path_match` |
| Updates (`update_one`) | `$set`, `$insert`, `$set_lax` |

## Related Docs

- [`README.md`](../README.md) (quick start + selected examples)
- [`docs/api.md`](api.md) (API surface and behavior notes)
- [`docs/query-translation.md`](query-translation.md) (PostgreSQL operator/function mapping)
- [`docs/local-integration-testing.md`](local-integration-testing.md) (local integration test setup)
