# jsonbadger examples cheat sheet

This page is an example-first cheat sheet for users and AI agents. It shows copy-pasteable jsonbadger usage in increasing complexity and covers the currently implemented query and update operator surface.

Use this page for syntax and working shapes. Use `docs/api.md` for API reference details and `docs/query-translation.md` for PostgreSQL operator/function semantics.

## How to Read This Page

- Examples are ordered from setup -> model usage -> queries -> updates -> runtime behavior.
- Snippets reuse a `User` model shape where possible.
- Query operators use the current `$` + `snake_case` naming (for example `$elem_match`, `$has_key`, `$json_path_exists`).
- This page only includes currently implemented behavior.
- `Assumes:` notes tell you what earlier setup/data a snippet depends on.

## Shared Fixture and Assumptions

Most snippets below are intentionally short and not fully standalone. Unless a section says otherwise, examples assume:

- You already connected with `jsonbadger.connect(...)`.
- You defined the `User` model from `Schema and Model Definition`.
- You either ran manual migrations (`ensure_table()` / `ensure_schema()`) or allowed a first write to create the table.
- You seeded at least one `User` document using the `Create and Save Documents` example (including `tags`, `orders`, and `payload`).

When a snippet uses a different value (for example `user_name: 'jane'`), either seed a matching row first or replace the filter value with one that exists in your local data.


## Setup and Connect

```js
import jsonbadger from 'jsonbadger';

await jsonbadger.connect(process.env.APP_POSTGRES_URI, {
	debug: false,
	max: 10,
	ssl: false,
	auto_index: true,
	id_strategy: jsonbadger.IdStrategies.bigserial
});
```

UUIDv7 server default (PostgreSQL 18+ native `uuidv7()` required):

```js
await jsonbadger.connect(process.env.APP_POSTGRES_URI, {
	id_strategy: jsonbadger.IdStrategies.uuidv7
});
```

Notes:
- jsonbadger checks native `uuidv7()` support automatically during `connect(...)` and caches the capability result.
- Reads do not auto-create tables. A first write (`save()` / `update_one(...)`) can create the table, or you can call `ensure_table()` / `ensure_schema()` explicitly.

## ID Strategy Examples

Server-wide default (`connect`) plus model override (`model(...)`):

```js
await jsonbadger.connect(process.env.APP_POSTGRES_URI, {
	id_strategy: jsonbadger.IdStrategies.uuidv7 // PostgreSQL 18+ native uuidv7() required
});

const AuditLog = jsonbadger.model(new jsonbadger.Schema({
	event_name: String
}), {
	table_name: 'audit_logs',
	// inherits server id_strategy: uuidv7
});

const Counter = jsonbadger.model(new jsonbadger.Schema({
	label: String
}), {
	table_name: 'counters',
	id_strategy: jsonbadger.IdStrategies.bigserial // model override
});
```

Notes:
- `id_strategy` precedence is: model option -> connection option -> library default (`bigserial`).
- `IdStrategies.uuidv7` uses database-generated IDs (`DEFAULT uuidv7()`) and jsonbadger validates support internally.

## Schema and Model Definition

```js
const user_schema = new jsonbadger.Schema({
	user_name: {type: String, required: true, trim: true, index: true, get: (value) => value && value.toUpperCase()},
	age: {type: Number, min: 0, index: -1},
	status: {type: String, immutable: true},
	tags: [String],
	profile: {
		city: String,
		country: String
	},
	orders: [{sku: String, qty: Number, price: Number}],
	payload: {},
	owner_id: {type: 'UUIDv7'},
	created_at: Date,
	updated_at: Date
});

// Schema-level indexes (single path and compound)
user_schema.create_index('profile.city');
user_schema.create_index({user_name: 1, age: -1});

const User = jsonbadger.model(user_schema, {
	table_name: 'users',
	data_column: 'data',
	auto_index: true,
	id_strategy: jsonbadger.IdStrategies.bigserial
});
```

Migration helpers (manual/explicit path):

```js
await User.ensure_table();
await User.ensure_index();
// or: ensure_schema() does both (table + declared schema indexes)
await User.ensure_schema();
```

## Built-in FieldType Examples

```js
const account_schema = new jsonbadger.Schema({
	user_name: { type: String, trim: true, required: true },
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
	user_name: 'john',
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

## Query Basics (find, find_one, count)

Assumes (for the query sections below):
- `User` is defined and at least one document was saved (see `## create and save documents`).
- Examples that filter by `user_name: 'john'`, `tags`, `orders`, or `payload` assume those fields/values exist in seeded data.


```js
const all_users = await User.find({}).exec();

const found_user = await User.find_one({user_name: 'john'}).exec(); // document or null

const adult_count = await User.count_documents({age: {$gte: 18}}).exec(); // integer count
```

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
await User.find({user_name: 'john'}).exec();
await User.find({user_name: {$eq: 'john'}}).exec();
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

## Regex Operators

Regex literal shorthand:

```js
await User.find({user_name: /jo/i}).exec();
```

`$regex` with `$options`:

```js
await User.find({
	user_name: {
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

Nested-scope existence (jsonbadger extracts the nested JSONB value first, then applies top-level existence there):

```js
await User.find({'payload.profile': {$has_key: 'city'}}).exec();

// This checks for a literal key name "profile.city" at the top level of payload (usually false)
await User.find({payload: {$has_key: 'profile.city'}}).exec();
```

## JSONPath Operators

`$json_path_exists` (`@?`) and `$json_path_match` (`@@`):

Assumes:
- Your seeded `payload` includes shapes like `items[*].qty` and `score` (as shown in `## create and save documents`).


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
- A matching row exists (examples use `user_name: 'john'` and `user_name: 'missing'`).
- The seeded row includes `tags` and `payload` fields from the create/save example.


Basic `$set` (maps to `jsonb_set(...)`):

```js
const updated_user = await User.update_one(
	{user_name: 'john'},
	{
		$set: {
			age: 31,
			'profile.city': 'Orlando',
			'payload.profile.state': 'FL'
		}
	}
);
```

`$insert` (maps to `jsonb_insert(...)`) with numeric array index paths:

```js
await User.update_one({user_name: 'john'}, {
	$insert: {
		'tags.0': 'first_tag'
	}
});

await User.update_one({user_name: 'john'}, {
	$insert: {
		'tags.0': {
			value: 'after_first',
			insert_after: true
		}
	}
});
```

`$set_lax` (maps to `jsonb_set_lax(...)`) object form:

```js
await User.update_one({user_name: 'john'}, {
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
await User.update_one({user_name: 'john'}, {
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
await User.update_one({user_name: 'john'}, {
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
await User.update_one({user_name: 'john'}, {
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

`delete_one(...)` deletes one matching row and returns the deleted document data.

```js
const deleted_user = await User.delete_one({user_name: 'john'});
```

No match (or missing table) returns `null`:

```js
const maybe_deleted = await User.delete_one({user_name: 'missing'});
if(maybe_deleted === null) {
	// no matching row, or table does not exist yet
}
```

## Runtime Document Methods (get/set, dirty tracking, serialization)

Runtime getters/setters and dirty tracking:

Assumes:
- `User` is defined from the schema/model example and includes the `user_name` getter configuration shown there.
- This snippet demonstrates in-memory runtime behavior; no database read is required until `save()`.


```js
const doc = new User({
	user_name: 'jane',
	status: 'active',
	payload: {count: 1},
	profile: {city: 'Miami'}
});

// normal path set/get

doc.set('user_name', '  jane_doe  ');
const upper_name = doc.get('user_name');

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
const alias_schema = new jsonbadger.Schema({
	profile: {
		city: {type: String, alias: 'city'}
	}
});

const AliasUser = jsonbadger.model('alias_users', alias_schema);
const alias_doc = new AliasUser({profile: {city: 'Miami'}});

// alias path -> underlying path
alias_doc.get('city'); // 'Miami'
alias_doc.set('city', 'Orlando');
alias_doc.get('profile.city'); // 'Orlando'
```

Aliases are path aliases for `doc.get(...)`, `doc.set(...)`, and `doc.mark_modified(...)`. They do not create direct properties (for example, `alias_doc.city`).

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

This page includes examples for:
- direct equality and `$eq`
- `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- `$in`, `$nin`
- `$regex` + `$options` (and RegExp literal shorthand)
- `$all`, `$size`, `$elem_match`
- `$contains`
- `$has_key`, `$has_any_keys`, `$has_all_keys`
- `$json_path_exists`, `$json_path_match`
- `update_one.$set`, `update_one.$insert`, `update_one.$set_lax`

## Related Docs

- `README.md` (quick start + selected examples)
- `docs/api.md` (API surface and behavior notes)
- `docs/query-translation.md` (PostgreSQL operator/function mapping)
- `docs/local-integration-testing.md` (local integration test setup)



