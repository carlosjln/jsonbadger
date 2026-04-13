# Query Builder API

## TOC

- [Query Builder API](#query-builder-api)
- [Builder Chain](#builder-chain)
- [Execution](#execution)
- [Supported Filter Families](#supported-filter-families)
- [Base-field Query Rules](#base-field-query-rules)
- [JSON Key Existence](#json-key-existence)
- [Path Existence](#path-existence)

## Builder Chain

- `.where(filter)`
- `.sort(sort)`
- `.limit(limit)`
- `.skip(skip)`
- `.exec()`

## Execution

```js
const result = await user_model.find({status: 'active'}).sort({created_at: -1}).limit(10).exec();
```

Filter objects must be plain JSON-like objects:
- use object literals for operator objects like `{age: {$gte: 18}}`
- use plain nested objects for JSON containment filters
- use plain objects instead of custom class instances for operator objects

> **Note:** Base-field operator objects and nested filter objects only accept plain objects with a default or null prototype.

Read/query execution:
- `find(...).exec()`
- `find_one(...).exec()`
- `find_by_id(...).exec()`
- `count_documents(...).exec()`

> **Note:** Query builders are not thenables. Call `.exec()`.

## Supported Filter Families

- scalar comparisons: direct equality, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`
- sets/arrays: `$in`, `$nin`, `$all`, `$size`, `$contains`, `$elem_match`
- regex: `$regex` and `$options`
- path existence: `$exists`
- JSONB key existence: `$has_key`, `$has_any_keys`, `$has_all_keys`

See [`../advanced/query-translation.md`](../advanced/query-translation.md) when you want the advanced PostgreSQL reference behind these operators.

## Base-field Query Rules

Top-level base fields:
- `id`
- `created_at`
- `updated_at`

Rules:
- top-level base fields map to row columns
- dotted base-field paths are rejected

Operator matrix:
- `id`: direct equality, `$eq`, `$ne`, `$in`, `$nin`
- `created_at` / `updated_at`: direct equality, `$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`
- unsupported on base fields: `$regex`, `$contains`, `$all`, `$size`, `$has_key`, `$has_any_keys`, `$has_all_keys`, `$exists`, `$elem_match`

## JSON Key Existence

- `$has_key` checks whether one key is present
- `$has_any_keys` checks whether any key from a list is present
- `$has_all_keys` checks whether all keys from a list are present

When used with a nested field path, JsonBadger extracts that nested JSONB value first, then applies the existence operator to the extracted value.

## Path Existence

- `$exists: true` checks whether the selected dotted path is present
- `$exists: false` checks whether the selected dotted path is absent
