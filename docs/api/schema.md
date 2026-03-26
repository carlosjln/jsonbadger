# Schema API

## TOC

- [Schema API](#schema-api)
- [Constructor](#constructor)
- [Ownership Boundary](#ownership-boundary)
- [Core Methods](#core-methods)
- [create_index](#create_index)
- [method](#method)
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

It is not the place where table/storage configuration is chosen. That belongs to the owning model registration.

Use `Schema` to describe the document contract, then use `connection.model(...)` to decide how that schema is persisted.

In practice, `Schema` owns:

1. Document structure
2. Path introspection
3. Index declarations

`definition` must be a plain JSON-like object:
- use object literals for nested schema branches
- use field definitions like `{type: String, required: true}`
- avoid custom class instances for schema definition objects

> **Note:** JsonBadger treats only default-prototype or null-prototype objects as plain schema objects. Custom instances are not parsed as nested schema branches.

## Core Methods

- `validate(payload)`
- `get_path(path)`
- `get_path_type(path)`
- `is_array_root(path)`
- `create_index(index_definition)`
- `get_indexes()`
- `method(name, method_implementation)`

Base-field notes:
- `id`, `created_at`, and `updated_at` exist in schema/runtime introspection
- if user schema declares those base fields, user definitions are preserved

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

## method

Install a custom instance method onto documents generated from the schema.

```js
schema.method('to_object', function () {
	return this.$serialize({transform: false});
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
- invalid/unsupported inline index option values are normalized permissively
