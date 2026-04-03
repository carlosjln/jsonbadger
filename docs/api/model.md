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

> **Note:** Prefer `Model.from(...)` and `Model.hydrate(...)` over direct `new Model(...)` construction. Those entry points apply the current normalization and validation flow.

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
- validates the normalized document before construction
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
6. validate the final document envelope

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

Options:
- `strict`
  - resolves as `options.strict ?? schema.strict`
  - use `user_model.from(source, {strict: false})` to keep unknown keys inside the default slug

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
- does not expand dotted payload keys during hydration

Input flow:
1. check whether the input is object-like
2. serialize non-plain objects through `to_json`, `toJSON`, or `to_plain_object(...)`
3. copy top-level base fields from the row
4. read `schema.get_slugs()` from the row and default missing slug roots to `{}`
5. validate the final document envelope

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

Direct document access:

```js
const default_slug = user_model.schema.get_default_slug();
const payload = doc.document[default_slug];
```

> **Note:** Direct `doc.document[...]` mutation is still allowed, but it bypasses `doc.set(...)` and assignment-time casting.

## Related Docs

- [`connection.md`](connection.md)
- [`schema.md`](schema.md)
- [`query-builder.md`](query-builder.md)
- [`../lifecycle.md`](../lifecycle.md)
- [`../examples.md`](../examples.md)
