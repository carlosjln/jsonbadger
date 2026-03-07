# Model API

Status:
- current + proposed model API notes
- `Model.from(...)` below is a planned contract, not implemented API yet

## TOC

- [Model API](#model-api)
- [Model.from](#modelfrom)
- [Contract](#contract)
- [Behavior](#behavior)
- [Row-like Input Rule](#row-like-input-rule)
- [Internal API](#internal-api)
- [Design Split](#design-split)

## Model.from

```js
const user_document = User.from(source, options);
```

Use `Model.from(...)` as the public entry point for constructing a document from external data.

## Contract

- `Model.from(source, options?)`
  - public
  - always returns a constructed document
  - always sets `is_new = true`
  - if `source.data` exists, treat it as row-shaped input for payload extraction
  - even in that case, `from(...)` does not mark the doc as persisted
- `hydrate(...)`
  - internal only
  - used when data is known to come from the database/runtime persistence path
  - sets `is_new = false`
  - applies row/base-field hydration semantics

## Behavior

- default: `strict = true`
- known schema fields:
  - apply setters/casting
- unknown fields:
  - dropped when `strict = true`
  - copied as-is when `strict = false`
- base fields:
  - read from top-level source
  - validate/cast if possible
  - silently drop invalid values for now

## Row-like Input Rule

- if `source.data` exists and is an object:
  - treat `source.data` as the payload candidate
  - read top-level base fields from the outer object
  - `from(...)` still returns `is_new = true`

## Internal API

Use internal `hydrate(...)` for database-backed hydration only.

Expected internal behavior:
- input is known runtime/persistence data
- base fields are trusted as hydration candidates
- hydrated document is marked persisted
- `is_new = false`

## Design Split

- `from(...)` = normalize external input into a new document
- `hydrate(...)` = mark a document as DB-backed/persisted
