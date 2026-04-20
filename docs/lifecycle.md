# JsonBadger Document Lifecycle

This page explains what happens to a document instance from construction to persistence and hydration.

Use this page when you need to answer:
- when `is_new` changes
- when base fields are populated
- how `from(...)` and `hydrate(...)` differ
- what `get(...)`, `set(...)`, and direct `document` mutation actually do

## Lifecycle Overview

```js
const doc = User.from({
	name: 'john'
});

doc.set('data.profile.city', 'Miami');
await doc.save();

const found = await User.find_one({id: doc.id}).exec();
const snapshot = found.document;
```

> **Note:** Query builders are not thenables. Run them with `.exec()`.

Phases:
- `constructed`: `Model.from(...)`
- `hydrated`: `Model.hydrate(...)` or document-returning query results
- `persisted`: successful `doc.save()` on a new document
- `mutated`: `set(...)` or direct `document` mutation

## Transition Table

| Trigger | From | To | What changes |
| --- | --- | --- | --- |
| `Model.from(input)` | none | constructed | builds a new validated document envelope |
| `Model.hydrate(row)` | none | hydrated | builds a persisted validated document envelope from row-like input |
| `doc.save()` on new document | constructed | persisted | inserts one row, sets `is_new = false`, and rebases tracked changes |
| `doc.save()` on existing document | mutated/persisted | persisted | validates current state, updates one row, refreshes `updated_at`, and rebases tracked changes |
| `find(...).exec()` / `find_one(...).exec()` / `find_by_id(...).exec()` | none | hydrated | row results become hydrated document instances |
| `update_one(...)` / `delete_one(...)` | none | hydrated | returned row becomes a hydrated document instance, or `null` |

## Constructed

```js
const doc = User.from({
	name: 'john',
	created_at: '2026-03-03T08:00:00.000Z'
});
```

At construction time:
- `doc.is_new === true`
- base fields are kept at the document root
- payload values are stored under the schema-owned default slug
- registered extra slugs stay as sibling document roots

## Hydrated

```js
const doc = User.hydrate({
	id: '7',
	data: {
		name: 'john'
	},
	created_at: '2026-03-03T08:00:00.000Z',
	updated_at: '2026-03-03T09:00:00.000Z'
});
```

Hydration rules:
- `doc.is_new === false`
- the outer object is treated as the persisted row envelope
- the payload is read from the configured default slug key
- registered extra slugs are read from sibling roots
- unregistered extra root slugs are ignored
- dotted payload keys are not expanded during hydration

## Persisted

Create path:

```js
const created = await User.from({name: 'john'}).save();
```

Update path:

```js
const found = await User.find_one({name: 'john'}).exec();

if(found) {
	const default_slug = User.schema.get_default_slug();
	found.set(default_slug + '.profile.city', 'Orlando');
	await found.save();
}
```

After a successful save:
- `doc.is_new === false`
- `doc.id`, `doc.created_at`, and `doc.updated_at` reflect persisted row values
- tracked changes are rebased

Timestamp behavior:
- `Model.create(...)` and `doc.save()` on new documents apply the insert timestamp lifecycle
- lifecycle inserts keep caller-provided `created_at`; missing `created_at` is filled
- lifecycle inserts always refresh `updated_at`
- static `Model.insert_one(...)` writes `created_at` / `updated_at` only when the input includes them
- `doc.save()` updates always refresh `updated_at`
- static `Model.update_one(...)` writes `updated_at` only when the update payload includes it
- updates do not auto-change `created_at`

## Mutated

```js
const doc = User.from({
	name: 'john'
});

const default_slug = User.schema.get_default_slug();

doc.set(default_slug + '.profile.city', 'Miami');
doc.document[default_slug].profile.city = 'Orlando';

const pending_delta = doc.document.$get_delta();
```

Mutation rules:
- `set(...)` resolves aliases, applies schema setter/cast logic, and writes the exact path
- direct `doc.document[...]` mutation stays allowed
- direct mutation bypasses `set(...)` and assignment-time casting
- later `schema.validate(...)` and persistence still enforce the contract

Base-field write rules:
- `id` is read-only through `set(...)`
- `created_at` and `updated_at` only allow top-level assignment through `set(...)`
- dotted timestamp writes are rejected

## FAQ

### Why is `id` not inside the default slug?

Because `id`, `created_at`, and `updated_at` are row-level base fields, not payload fields.

### Why do I need `.exec()` on `find_one()` and `find_by_id()`?

Because those methods return a query builder, not a promise.

### Why did a direct nested mutation skip casting?

Because direct `doc.document[...]` mutation is the lower-level escape hatch. Use `doc.set(...)` when you want schema-aware setter and cast behavior.
