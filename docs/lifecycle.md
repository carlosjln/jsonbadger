# JsonBadger Document Lifecycle

This page explains what happens to a document instance from construction to serialization.

Use this page when you need to answer:
- when `is_new` changes
- when base fields are populated
- when dirty paths are tracked or cleared
- what shape `to_object()` / `to_json()` return

## Lifecycle Overview

```js
const doc = new User({name: 'john'});

doc.set('profile.city', 'Miami');
await doc.save();

const found = await User.find_one({id: doc.id}).exec();
const snapshot = found.to_json();
```

> **Note:** Query builders are not thenables. Run them with `.exec()`.

Phases:
- `constructed`: `new Model(payload)`
- `runtime-ready`: first runtime interaction initializes internal state
- `validated`: `doc.validate()`
- `persisted`: successful `doc.save()`
- `queried/hydrated`: `find(...)`, `find_one(...)`, `find_by_id(...)`, `update_one(...)`, `delete_one(...)`
- `mutated`: `set(...)`, `mark_modified(...)`, in-place mutation + manual `mark_modified(...)`
- `serialized`: `to_object()`, `to_json()`, `toJSON()`

## Transition Table

| Trigger | From | To | What changes |
| --- | --- | --- | --- |
| `new Model(payload)` | none | constructed | `doc.data` gets the payload |
| first `set/get/is_modified/mark_modified/save/delete` path | constructed | runtime-ready | runtime state is created, base fields are pulled out of payload if present |
| `doc.validate()` | constructed/runtime-ready | validated | payload is cast and validated through schema |
| `doc.save()` on new document | validated/runtime-ready | persisted | row is inserted, `is_new` becomes `false`, base fields are hydrated, dirty paths are cleared |
| `doc.save()` on existing document | mutated/persisted | persisted | modified payload paths are sent through `update_one(...)`, returned row re-hydrates document state |
| `find(...).exec()` / `find_one(...).exec()` / `find_by_id(...).exec()` | none | queried/hydrated | rows become document instances with top-level base fields |
| `update_one(...)` / `delete_one(...)` | none | queried/hydrated | returned row becomes a document instance, or `null` |
| `to_object()` / `to_json()` | any document phase | serialized | returns plain object snapshot with base fields + payload |

## Constructed

```js
const doc = new User({
	name: 'john',
	created_at: '2026-03-03T08:00:00.000Z'
});
```

At construction time:
- `doc.data` gets the input payload
- runtime state is not created yet
- `doc.is_new` becomes explicit on the first runtime-ready transition

> **Note:** If the constructor payload includes `id`, `created_at`, or `updated_at`, those values are moved into runtime base fields the first time runtime state initializes.

## Runtime-Ready

```js
doc.set('profile.city', 'Miami');
```

The first runtime interaction initializes:
- `doc.is_new` when not already set
- dirty-path tracking
- base-field storage for `id`, `created_at`, `updated_at`

This happens lazily today. That is intentional in the current runtime.

## Validated

```js
doc.validate();
```

Validation:
- runs schema casting and validators
- writes the validated payload back into `doc.data`
- does not persist anything by itself

## Persisted

Create path:

```js
const created = await new User({name: 'john'}).save();
```

Update path:

```js
const found = await User.find_one({name: 'john'}).exec();
found.set('profile.city', 'Orlando');
await found.save();
```

After a successful save:
- `doc.is_new === false`
- `doc.id`, `doc.created_at`, and `doc.updated_at` reflect the returned row
- dirty paths are cleared

Timestamp helper behavior:
- create keeps caller-provided `created_at` / `updated_at`, otherwise fills them
- update keeps caller-provided `updated_at`, otherwise refreshes it
- update does not auto-change `created_at`

## Queried / Hydrated

```js
const doc = await User.find_by_id('1').exec();
```

Hydration rules:
- query rows become document instances
- row columns map to top-level base fields
- JSON payload stays in `doc.data`
- `doc.is_new === false`

Returned values:
- `find(...).exec()` -> `Model[]`
- `find_one(...).exec()` -> `Model | null`
- `find_by_id(...).exec()` -> `Model | null`
- `update_one(...)` -> `Model | null`
- `delete_one(...)` -> `Model | null`
- `doc.delete().exec()` -> `Model | null`

## Mutated / Dirty

```js
doc.set('profile.city', 'Miami');
doc.is_modified('profile.city'); // true

doc.data.payload.flags.push('vip');
doc.mark_modified('payload.flags');
```

Dirty tracking rules:
- `set(...)` marks the written path as modified
- in-place mutations need `mark_modified(...)`
- `clear_modified()` clears all dirty paths

Base-field write rules:
- `id` is read-only
- `created_at` and `updated_at` only allow top-level assignment
- dotted timestamp writes are rejected

## Serialized

```js
const as_object = doc.to_object();
const as_json = doc.to_json();
```

Serialization returns:

```js
{
	id: '1',
	name: 'john',
	created_at: '2026-03-03T08:00:00.000Z',
	updated_at: '2026-03-03T09:00:00.000Z'
}
```

Serialization rules:
- returns a plain object snapshot
- applies getters by default
- can run schema or call-level transforms
- keeps base fields at the top level

## FAQ

### Why does `doc.data` not include `id`?

Because `id`, `created_at`, and `updated_at` are row-level base fields, not JSON payload fields.

### Why do I need `.exec()` on `find_one()` and `find_by_id()`?

Because those methods return a query builder, not a promise.

### Why did an in-place nested mutation not save?

Because JsonBadger cannot see that mutation automatically. Call `mark_modified('path')` after mutating nested `Mixed`, object, array, or `Date` values in place.
