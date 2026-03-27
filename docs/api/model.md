# Model API

Models are created through the owning connection:

```js
const connection = await JsonBadger.connect(uri, options);
const User = connection.model({name: 'User', schema: user_schema, table_name: 'users'});
```

## TOC

- [Model API](#model-api)
- [Construction](#construction)
- [Ownership Boundary](#ownership-boundary)
- [Static Methods](#static-methods)
- [Model.from](#modelfrom)
- [Model.hydrate](#modelhydrate)
- [Instance Methods](#instance-methods)
- [Related Docs](#related-docs)

## Construction

Create a document instance with `new Model(payload)`:

```js
const user_document = new User({
	name: 'john',
	age: 30
});
```

New documents start in the `is_new = true` state until they are persisted.

## Ownership Boundary

`Model` owns how a schema is persisted and used at runtime.

It is the right place for:

1. `table_name`, `data_column`, and related storage options
2. Table and index execution helpers such as `ensure_table()` and `ensure_index()`
3. Query/update entry points
4. Document construction and hydration

`Model` consumes a `Schema`; it does not replace it. The schema defines the document contract, and the model defines how that contract is stored and operated on.

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
  - creates the backing table when needed
- `Model.ensure_index()`
  - creates declared indexes
- `Model.ensure_schema()`
  - runs table + index setup together
- `Model.from(input_data, options?)`
  - builds a new document from external payload input without marking it persisted
- `Model.hydrate(input_data)`
  - builds a persisted document from existing raw data with no modified paths

Example:

```js
const saved_user = await User.create({
	name: 'maria',
	age: 29
});

const found_user = await User.find_one({name: 'maria'}).exec();
```

## Model.from

Use `Model.from(...)` when you want schema casting/setters on payload input but still want a new document:

```js
const imported_user = User.from({
	name: '  maria  ',
	age: '29',
	created_at: '2026-03-03T08:00:00.000Z'
});
```

Behavior:
- returns a new document instance
- keeps `is_new = true`
- applies schema casting/setters to known payload fields
- treats `id`, `created_at`, and `updated_at` as reserved root base fields
- extracts those root base fields into runtime state when present
- treats every other root key as payload, including a root `data` key
- drops unknown payload keys by default
- does not interpret payload input as a persisted row envelope

Input flow:
1. check whether the input is object-like
2. extract reserved root base fields (`id`, `created_at`, `updated_at`)
3. treat everything else as payload

Example:

```js
const imported_user = User.from({
	id: '7',
	created_at: '2026-03-03T08:00:00.000Z',
	data: {
		name: 'maria'
	},
	username: 'maria'
});
```

Result:
- `base_fields.id = '7'`
- `base_fields.created_at = '2026-03-03T08:00:00.000Z'`
- `payload = {data: {name: 'maria'}, username: 'maria'}`

Assign base fields after construction when needed:

```js
const imported_user = User.from({
	name: 'maria'
});

imported_user.id = '7';
imported_user.created_at = '2026-03-03T08:00:00.000Z';
imported_user.updated_at = '2026-03-03T09:00:00.000Z';
```

Payload fields are not promoted to top-level document properties.

Use:

1. `doc.get('path')` / `doc.set('path', value)` for the normal document API
2. `doc.document.data` when you need the raw tracked payload object

Example:

```js
const imported_user = User.from({
	name: 'maria',
	profile: {city: 'Miami'}
});

imported_user.get('name'); // 'maria'
imported_user.get('profile.city'); // 'Miami'

imported_user.set('name', 'jane');
imported_user.set('profile.city', 'Santiago');
```

Use payload paths like `'name'` or `'profile.city'`.

Options:
- `strict`
  - resolves as `options.strict ?? schema.strict`
  - use `User.from(source, {strict: false})` to keep unknown payload keys

## Model.hydrate

Use `Model.hydrate(...)` when the source data already represents a persisted document:

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

Behavior:
- returns a new document instance
- sets `is_new = false`
- leaves no paths marked as modified initially
- treats row-like input as the persisted envelope
- extracts top-level base fields (`id`, `created_at`, `updated_at`) from the outer object
- uses `input_data.data` as the payload source when it is present
- is the only construction path that interprets a root `data` key as the persisted payload slot

Input flow:
1. check whether the input is object-like
2. extract reserved root base fields (`id`, `created_at`, `updated_at`) from the outer object
3. use `input_data.data` as payload when present, otherwise use the root object payload

Example:

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

Result:
- `base_fields.id = '7'`
- `base_fields.created_at = '2026-03-03T08:00:00.000Z'`
- `base_fields.updated_at = '2026-03-03T09:00:00.000Z'`
- `payload = {name: 'maria', age: '29'}`

## Instance Methods

- `doc.validate()`
  - validates the current document payload
- `doc.save()`
  - inserts a new row or updates an existing persisted document
- `doc.delete().exec()`
  - deletes the current persisted document
- `doc.get(path)`
- `doc.set(path, value)`
- `doc.mark_modified(path)`
- `doc.clear_modified()`
- `doc.is_modified(path?)`
- `doc.$serialize(options?)`
- `doc.to_json(options?)`

Example:

```js
const user_document = new User({name: 'john'});

user_document.set('profile.city', 'Miami');
await user_document.save();

const snapshot = user_document.to_json();
```

## Related Docs

- [`connection.md`](connection.md)
- [`schema.md`](schema.md)
- [`query-builder.md`](query-builder.md)
- [`../lifecycle.md`](../lifecycle.md)
- [`../examples.md`](../examples.md)
