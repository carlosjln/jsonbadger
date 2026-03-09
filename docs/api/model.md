# Model API

Models are created through the owning connection:

```js
const connection = await JsonBadger.connect(uri, options);
const User = connection.model({name: 'User', schema: user_schema, table_name: 'users'});
```

## TOC

- [Model API](#model-api)
- [Construction](#construction)
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
- `Model.from(source, options?)`
  - builds a new document from external payload or row-like input without marking it persisted
- `Model.hydrate(source)`
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

Use `Model.from(...)` when you want schema casting/setters on imported input but still want a new document:

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
- reads top-level base fields (`id`, `created_at`, `updated_at`) from the source object
- when `source.data` exists, it is treated as the payload source
- drops unknown payload keys by default

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
- uses the same payload/base-field normalization rules as `Model.from(...)`

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
- `doc.to_object(options?)`
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
