# Model API

Models are created through the owning connection:

```js
const connection = await JsonBadger.connect(uri, options);
const user_model = connection.model({name: 'User', schema: user_schema, table_name: 'users'});
```

## TOC

- [Model API](#model-api)
- [Construction](#construction)
- [Ownership Boundary](#ownership-boundary)
- [Static Methods](#static-methods)
- [Model.from](#modelfrom)
- [Model.hydrate](#modelhydrate)
- [Model.cast](#modelcast)
- [Instance Methods](#instance-methods)
- [Related Docs](#related-docs)

## Construction

Build new documents with `Model.from(...)`:

```js
const user_document = user_model.from({
	name: 'john',
	age: 30
});
```

Hydrate persisted row-like data with `Model.hydrate(...)`:

```js
const hydrated_user = user_model.hydrate({
	id: '7',
	data: {
		name: 'maria'
	},
	created_at: '2026-03-03T08:00:00.000Z',
	updated_at: '2026-03-03T09:00:00.000Z'
});
```

> **Note:** Prefer `Model.from(...)` and `Model.hydrate(...)` over direct `new Model(...)` construction. Those entry points apply schema defaults, casting, and validation before returning the document instance.
>
> Direct `new user_model(document)` construction remains available as a low-level path. It bypasses lifecycle until you call `doc.$apply_defaults(...)`, `doc.$cast(...)`, `doc.$validate(...)`, or `doc.$normalize(...)` manually.

## Ownership Boundary

`Model` owns how a schema is persisted and used at runtime.

It is the right place for:

1. `table_name`, `data_column`, and related storage options
2. Startup/bootstrap helpers such as `ensure_table()`, `ensure_indexes()`, and `ensure_model()`
3. Query and update entry points
4. Document construction and row hydration

`Model` consumes a `Schema`; it does not replace it.

## Static Methods

- `Model.create(document_or_list)`
  - validates and saves one or more documents
- `Model.find(filter)`
  - returns a query builder
- `Model.find_one(filter)`
  - returns a query builder that resolves to one document or `null`
- `Model.find_by_id(id_value)`
  - returns a query builder for one document by top-level `id`
- `Model.count_documents(filter)`
  - returns a query builder that resolves to a count
- `Model.insert_one(input_data)`
  - inserts one plain payload input and returns the persisted document
- `Model.update_one(filter, update_definition)`
  - updates one matching row and returns the updated document or `null`
- `Model.delete_one(filter)`
  - deletes one matching row and returns the deleted document or `null`
- `Model.ensure_table()`
  - creates the backing table during startup/bootstrap setup
- `Model.ensure_indexes()`
  - creates declared indexes during startup/bootstrap setup
- `Model.ensure_model()`
  - runs table setup and, when `schema.auto_index` is enabled, declared indexes
- `Model.from(input_data, options?)`
  - builds a new document from external payload input without marking it persisted
- `Model.hydrate(input_data, options?)`
  - builds a persisted document from existing row-like data with no modified paths
- `Model.cast(document)`
  - delegates to `schema.cast(document)`

Example:

```js
const saved_user = await user_model.create({
	name: 'maria',
	age: 29
});

const found_user = await user_model.find_one({name: 'maria'}).exec();
```

> **Note:** `Model.insert_one(...)` accepts plain input only. If you already have a document instance, use `doc.insert()` or `doc.save()`.

## Model.from

Use `Model.from(...)` when the source is external payload input and you want a new document:

```js
const imported_user = user_model.from({
	name: '  maria  ',
	age: '29',
	created_at: '2026-03-03T08:00:00.000Z'
});
```

Behavior:
- returns a new document instance
- keeps `is_new = true`
- applies schema defaults, casting, and validation before returning
- expands dotted payload keys at the input boundary
- routes root keys listed in `schema.options.slugs` out of the default slug
- keeps every other non-base root key inside the default slug
- does not interpret payload input as a persisted row envelope

Input flow:
1. check whether the input is object-like
2. serialize non-plain objects through `to_json`, `toJSON`, or `to_plain_object(...)`
3. expand dotted payload keys into nested objects
4. route registered extra slug roots out of the default slug
5. keep every remaining root key in the default slug
6. conform the final document envelope to registered slug roots and schema-owned paths
7. build the document instance
8. apply schema defaults, casting, and validation

Example with a custom default slug:

```js
const user_schema = new JsonBadger.Schema({
	name: String,
	settings: {
		theme: String
	}
}, {
	default_slug: 'payload',
	slugs: ['settings']
});

const user_model = connection.model({
	name: 'User',
	schema: user_schema,
	table_name: 'users'
});

const imported_user = user_model.from({
	id: '7',
	created_at: '2026-03-03T08:00:00.000Z',
	name: 'maria',
	settings: {
		theme: 'dark'
	}
});
```

Result:
- `imported_user.document.id === '7'`
- `imported_user.document.created_at === '2026-03-03T08:00:00.000Z'`
- `imported_user.document.payload.name === 'maria'`
- `imported_user.document.settings.theme === 'dark'`

## Model.hydrate

Use `Model.hydrate(...)` when the source already represents a persisted row:

```js
const hydrated_user = user_model.hydrate({
	id: '7',
	payload: {
		name: 'maria',
		age: '29'
	},
	settings: {
		theme: 'dark'
	},
	created_at: '2026-03-03T08:00:00.000Z',
	updated_at: '2026-03-03T09:00:00.000Z'
});
```

Behavior:
- returns a document instance
- sets `is_new = false`
- leaves no paths marked as modified initially
- treats the outer object as the persisted row envelope
- reads the payload from `input_data[default_slug]`
- preserves registered extra slug objects as sibling roots
- ignores unregistered extra root slugs
- applies schema defaults, casting, and validation before rebasing tracker state
- does not expand dotted payload keys during hydration

Input flow:
1. check whether the input is object-like
2. serialize non-plain objects through `to_json`, `toJSON`, or `to_plain_object(...)`
3. copy top-level base fields from the row
4. read `schema.get_slugs()` from the row and default missing slug roots to `{}`
5. conform the final document envelope to registered slug roots and schema-owned paths
6. build the document instance
7. apply schema defaults, casting, and validation
8. mark the document persisted and clear tracked changes

> **Note:** `Model.hydrate(...)` is strict about row shape. It does not rebuild the default slug from unrelated root keys.

## Model.cast

Use `Model.cast(...)` when you want schema casting without building a document instance:

```js
const casted_document = user_model.cast({
	payload: {
		age: '29'
	},
	settings: {
		count: '7'
	}
});
```

Behavior:
- delegates to `schema.cast(...)`
- deep-clones the input document first
- casts existing base-field, default-slug, and extra-slug values
- does not validate
- does not conform

## Instance Methods

- `doc.save()`
  - inserts a new row or updates an existing persisted document
- `doc.insert()`
  - inserts the current document as a new row
- `doc.update()`
  - updates the current persisted document by `id`
- `doc.get(path_name)`
  - resolves aliases and reads the exact path from `doc.document`
- `doc.set(path_name, value)`
  - resolves aliases, applies schema setter/cast logic, and writes the exact path into `doc.document`
- `doc.$apply_defaults(options?)`
  - fills missing paths from schema defaults on the current tracked document
- `doc.$cast(options?)`
  - applies schema setter/cast logic across the current tracked document
- `doc.$validate(options?)`
  - validates the current document envelope against the schema
- `doc.$normalize(options?)`
  - runs `$apply_defaults(...)`, `$cast(...)`, and `$validate(...)` in order
- `doc.bind_document(target)`
  - binds live forwarding properties onto `target` from the current document instance
- `doc.rebase(reference)`
  - replaces the current document state from another `Model` or `Document` and clears tracked changes
- `doc.id`
- `doc.created_at`
- `doc.updated_at`
- `doc.timestamps`

Example:

```js
const doc = user_model.from({
	name: 'john',
	profile: {city: 'Miami'}
});

const default_slug = user_model.schema.get_default_slug();

doc.set(default_slug + '.profile.city', 'Orlando');
const city = doc.get(default_slug + '.profile.city');

await doc.save();
```

Low-level constructor path with manual lifecycle:

```js
const doc = new user_model({
	payload: {
		age: '29'
	}
});

doc.$normalize({mode: 'from'});
```

Behavior:
- direct `new user_model(document)` keeps the raw tracked state as given
- defaults, casting, and validation do not run automatically on that low-level path
- manual lifecycle methods are available when you intentionally want that control

`doc.bind_document(target)` projects live document-backed fields onto another object, such as a domain entity wrapper.

```js
const doc = user_model.hydrate({
	id: '7',
	payload: {
		name: 'maria',
		profile: {city: 'Miami'}
	},
	settings: {
		theme: 'dark'
	}
});

const entity = {};
doc.bind_document(entity);

entity.name; // 'maria'
entity.profile.city = 'Orlando';
entity.settings.theme = 'light';
```

Behavior:
- returns the same `target`
- flattens default-slug root fields onto the target root
- keeps extra slugs nested at their slug root
- returns live tracked objects, not snapshots
- throws if `target` already owns a conflicting property name

> **Note:** `bind_document(...)` does not create or require `target.model`. It binds directly to the current document instance. To rebind a different document later, clear or replace the old bound properties first, then call `next_doc.bind_document(target)` again.

`doc.rebase(reference)` is useful when you want to keep the same outer object but adopt a fresh persisted document state.

Scenario A: keep a bound entity wrapper and adopt the saved state.

```js
const doc = user_model.from({
	name: 'maria',
	profile: {city: 'Miami'}
});

const entity = {};
doc.bind_document(entity);

entity.profile.city = 'Orlando';

const saved_doc = await doc.save();
doc.rebase(saved_doc);
```

Scenario B: refresh the current instance from a newer persisted copy.

```js
const current_doc = await user_model.find_one({id: user_id}).exec();
const fresh_doc = await user_model.find_one({id: user_id}).exec();

current_doc.rebase(fresh_doc);
```

Scenario C: adopt a trusted `Document` returned by a custom persistence path.

```js
const next_document = custom_save_flow(doc.document);
doc.rebase(next_document);
```

Behavior:
- accepts only a `Model` or `Document` reference
- sets `doc.is_new = false`
- replaces the current `doc.document` state
- clears pending tracker changes after rebasing

> **Note:** Use `Model.hydrate(...)` for plain row-like input. `rebase(...)` is for adopting an already-built `Model` or `Document`.

Direct document access:

```js
const default_slug = user_model.schema.get_default_slug();
const payload = doc.document[default_slug];
```

> **Note:** Direct `doc.document[...]` mutation is still allowed, but it bypasses `doc.set(...)` and assignment-time casting.

## Related Docs

- [`connection.md`](connection.md)
- [`document.md`](document.md)
- [`schema.md`](schema.md)
- [`query-builder.md`](query-builder.md)
- [`../lifecycle.md`](../lifecycle.md)
- [`../examples.md`](../examples.md)
