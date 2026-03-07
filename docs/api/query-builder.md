# Query Builder API

## TOC

- [Query Builder API](#query-builder-api)
- [Builder Chain](#builder-chain)
- [Execution](#execution)
- [Supported Filter Families](#supported-filter-families)
- [Base-field Query Rules](#base-field-query-rules)
- [JSON Key Existence](#json-key-existence)
- [JSONPath](#jsonpath)

## Builder Chain

- `.where(filter)`
- `.sort(sort)`
- `.limit(limit)`
- `.skip(skip)`
- `.exec()`

## Execution

```js
const result = await User.find({status: 'active'}).sort({created_at: -1}).limit(10).exec();
```

Filter objects must be plain JSON-like objects:
- use object literals for operator objects like `{age: {$gte: 18}}`
- use plain nested objects for JSON containment filters
- do not pass custom class instances where JsonBadger expects an operator object

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
- JSONB key existence: `$has_key`, `$has_any_keys`, `$has_all_keys`
- JSONPath: `$json_path_exists`, `$json_path_match`

See [`../query-translation.md`](../query-translation.md) for PostgreSQL operator/function mapping.

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
- unsupported on base fields: `$regex`, `$contains`, `$all`, `$size`, `$has_key`, `$has_any_keys`, `$has_all_keys`, `$json_path_exists`, `$json_path_match`, `$elem_match`

## JSON Key Existence

- `$has_key` maps to PostgreSQL `?`
- `$has_any_keys` maps to PostgreSQL `?|`
- `$has_all_keys` maps to PostgreSQL `?&`

When used with a nested field path, JsonBadger extracts that nested JSONB value first, then applies the existence operator to the extracted value.

## JSONPath

- `$json_path_exists` maps to `@?`
- `$json_path_match` maps to `@@`

JsonBadger binds the JSONPath string as a `::jsonpath` parameter.
