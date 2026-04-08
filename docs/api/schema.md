# Schema API

## TOC

- [Schema API](#schema-api)
- [Constructor](#constructor)
- [Ownership Boundary](#ownership-boundary)
- [Core Methods](#core-methods)
- [Slug Access](#slug-access)
- [Casting and Validation](#casting-and-validation)
- [create_index](#create_index)
- [add_method](#add_method)
- [Path-level Index Sugar](#path-level-index-sugar)

## Constructor

```js
const user_schema = new JsonBadger.Schema(definition, options);
```

## Ownership Boundary

`Schema` defines what a document looks like.

It is the right place for:

1. Field definitions
2. Validation and path introspection
3. Schema-declared indexes
4. Schema-level document methods
5. Slug ownership and validator domains

Use `Schema` to define document structure and behavior. Specify table names, connection details, and other storage options later when you register the model through `connection.model(...)`.

`definition` must be a plain JSON-like object:
- use object literals for nested schema branches
- use field definitions like `{type: String, required: true}`
- avoid custom class instances for schema definition objects

> **Note:** JsonBadger treats only default-prototype or null-prototype objects as plain schema objects. Custom instances are not parsed as nested schema branches.

## Core Methods

- `validate(document)`
- `validate_base_fields(document)`
- `cast(document)`
- `conform(payload)`
- `get_path(path)`
- `get_path_type(path)`
- `is_array_root(path)`
- `create_index(index_definition)`
- `get_indexes()`
- `add_method(name, method_implementation)`

Base-field notes:
- `id`, `created_at`, and `updated_at` exist in schema/runtime introspection
- if user schema declares those base fields, user definitions are preserved
- `validate(document)` validates the full document envelope, not just the default slug
- when a schema registers extra root slugs through `schema.options.slugs`, validation fans out across those document roots

## Slug Access

Read slug ownership directly from the schema:

```js
const default_slug = schema.get_default_slug();
const extra_slugs = schema.get_extra_slugs();
const all_slugs = schema.get_slugs();
```

Rules:
- `get_default_slug()` returns the catch-all payload root
- `get_extra_slugs()` returns only explicitly registered sibling roots
- `get_slugs()` returns `[default_slug, ...extra_slugs]`
- duplicate extra slugs are collapsed during schema option normalization

## Casting and Validation

Validate a full document envelope:

```js
schema.validate({
	id: '0194f028-579a-7b5b-8107-b9ad31395f43',
	payload: {
		name: 'maria'
	},
	settings: {
		theme: 'dark'
	}
});
```

Validate only root base fields:

```js
schema.validate_base_fields({
	id: '0194f028-579a-7b5b-8107-b9ad31395f43',
	created_at: '2026-03-03T08:00:00.000Z',
	updated_at: '2026-03-03T09:00:00.000Z'
});
```

Cast a document envelope without validating or conforming:

```js
const casted_document = schema.cast({
	payload: {
		age: '29'
	},
	settings: {
		count: '7'
	}
});
```

Behavior:
- `schema.cast(...)` deep-clones the input first
- casts existing base-field, default-slug, and extra-slug values
- leaves missing paths untouched
- does not validate
- does not conform

Conform one payload object to the schema-owned allowed tree:

```js
const payload = {
	name: 'maria',
	unknown_key: true
};

schema.conform(payload);
```

After conforming:
- known keys remain
- unknown keys are removed

## create_index

GIN single-path index:

```js
schema.create_index({using: 'gin', path: 'profile.city', name: 'idx_users_city_gin'});
```

BTREE single-path index:

```js
schema.create_index({using: 'btree', path: 'age', order: -1, unique: true});
```

BTREE compound index:

```js
schema.create_index({using: 'btree', paths: {name: 1, type: -1}, unique: true, name: 'idx_name_type'});
```

Rules:
- `using: 'gin'` requires `path`
- `using: 'gin'` ignores `order` and `unique`
- `using: 'btree'` requires `path` or `paths`
- `order` is only valid when using a single `path` with `using: 'btree'`

## add_method

Install a custom document-instance method onto models generated from the schema.

```js
schema.add_method('full_name', function () {
	const default_slug = this.constructor.schema.get_default_slug();
	const payload = this.document[default_slug];
	return payload.first_name + ' ' + payload.last_name;
});
```

Rules:
- `name` must be a valid identifier
- `method_implementation` must be a function
- duplicate schema method names are rejected
- names that conflict with built-in document properties are rejected when the model is created

## Path-level Index Sugar

Examples:

```js
{
	name: {type: String, index: true},
	age: {type: Number, index: 1},
	score: {type: Number, index: -1},
	email: {type: String, index: {unique: true, name: 'idx_users_email_unique'}},
	nick_name: {type: String, index: {using: 'gin'}}
}
```

Normalization notes:
- object-form `index` defaults to `btree` unless `using` says otherwise
- invalid or unsupported inline index values are ignored permissively
