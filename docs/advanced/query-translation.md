# query translation

Advanced reference for people who want to understand how JsonBadger queries relate to PostgreSQL JSONB features.

If you only want to use the library, start with [`../examples.md`](../examples.md) and [`../api/query-builder.md`](../api/query-builder.md).

## base behavior

- all model records are stored in one JSONB column (`data` by default)
- dot paths are translated to PostgreSQL JSON operators (`->`, `->>`, `#>`, `#>>`)
- filters are parameterized (`$1`, `$2`, ...) for query safety

## scalar equality

- `{ user_name: 'john' }` -> text extraction + `=`
- `{ age: { $ne: 20 } }` -> text extraction + `!=`

## numeric comparisons

- `$gt`, `$gte`, `$lt`, `$lte` cast extracted text to `numeric`
- invalid numeric inputs throw `query_error` before SQL execution
- `bigint` query values are bound without `Number(...)` coercion to avoid precision loss

## set and array operators

- `$in`, `$nin` -> `ANY($n::text[])`
- `$all` -> JSONB containment `@>` with JSON array param
- `$size` -> `jsonb_array_length(...) = $n`
- `$contains` -> JSONB containment `@>`
- `$elem_match` -> `EXISTS (SELECT 1 FROM jsonb_array_elements(...) ...)`

## JSONB key existence operators

- `$has_key` -> `?`
- `$has_any_keys` -> `?|`
- `$has_all_keys` -> `?&`

Top-level semantics note:
- PostgreSQL key-existence operators only check keys at the top level of the left-hand JSONB value.
- JsonBadger preserves that behavior exactly.
- If the filter path is nested (for example `profile.city`), JsonBadger first extracts that nested JSONB value (`#>`), then applies the existence operator to the extracted value's top level.
- JsonBadger does not emulate recursive/deep key search for these operators.

## JSONPath operators

- `$json_path_exists` -> `@?` with a `::jsonpath` parameter
- `$json_path_match` -> `@@` with a `::jsonpath` parameter
- invalid/empty JSONPath values fail before SQL execution
- these operators require native PostgreSQL JSONPath support

## JSON update operators

- `$set` -> `jsonb_set(target, path, value, true)`
- `$unset` -> `target #- path`
- `$replace_roots` -> replace the full JSONB target
- implicit top-level keys are normalized into `$set`

Update path behavior:
- Dot paths are validated before SQL execution.
- Tracker-delta shapes (`replace_roots`, `set`, `unset`) are normalized into operator-style buckets before SQL generation.

## regex

- `$regex` uses PostgreSQL regex operators:
- `~` (case-sensitive)
- `~*` when `$options` includes `i`

## sort, limit, skip

- sort values use `-1` for `DESC`, everything else as `ASC`
- limit/skip only apply for non-negative numeric values


## PostgreSQL capability map

This table is an advanced PostgreSQL reference for the currently supported query and update operators.

| JsonBadger feature | PostgreSQL operator/function | Notes | Indexability expectation |
| --- | --- | --- | --- |
| scalar equality (`{ path: value }`, `$ne`) | JSON extraction (`->>`, `#>>`) + `=` / `!=` | Compares extracted text/scalar representation | Manual expression indexes required for fast path filtering/sorting; current schema index helpers do not auto-create these expression indexes |
| numeric comparisons (`$gt`, `$gte`, `$lt`, `$lte`) | JSON extraction + `::numeric` + comparison | Invalid numeric inputs fail before SQL execution | Manual expression indexes may be used; no automatic expression-index creation |
| `$in`, `$nin` | `= ANY($n::text[])` / `!= ALL(...)` over extracted text | Set membership over extracted scalar text | Manual expression indexes only |
| `$contains` | `@>` | JSONB containment over extracted JSONB value | GIN on JSONB value is typically the relevant index strategy |
| `$all` | `@>` (JSON array containment) | Encodes requested list as JSON array | GIN on JSONB value is typically the relevant index strategy |
| `$size` | `jsonb_array_length(...)` | Array length equality | Usually expression-based optimization if needed; no auto-created support |
| `$elem_match` | `jsonb_array_elements(...)` + nested predicates | Uses set-returning expansion | Often less index-friendly than direct containment; depends on query shape |
| `$regex` | `~` / `~*` on extracted text | PostgreSQL regex semantics | Manual text/expression indexing strategy required; JsonBadger does not auto-create regex-specific indexes |
| `$has_key` | `?` | Top-level key existence on the left JSONB value | GIN on JSONB value is the expected index family |
| `$has_any_keys` | `?|` | Any-key existence | GIN on JSONB value is the expected index family |
| `$has_all_keys` | `?&` | All-keys existence | GIN on JSONB value is the expected index family |
| `$json_path_exists` | `@?` | JSONPath existence predicate; requires native PostgreSQL JSONPath support | Can benefit from JSONB GIN indexing depending on operator class/query shape |
| `$json_path_match` | `@@` | JSONPath predicate match; requires native PostgreSQL JSONPath support | Can benefit from JSONB GIN indexing depending on operator class/query shape |
| `update_one.$set` | `jsonb_set(...)` | Creates missing path segments when configured (`true`) | N/A (write-path function) |
| `update_one.$unset` | `#-` | Removes one JSON path from the target | N/A (write-path function) |
| `update_one.$replace_roots` | direct JSONB replacement | Replaces the full JSONB root before later operations | N/A (write-path function) |

Index helper behavior:
- `schema.create_index({using: 'gin', path: 'profile.city'})` creates a GIN index on the extracted JSONB path expression.
- `schema.create_index({using: 'btree', path: 'age', order: -1})` creates a BTREE index on extracted text path expressions.
- `schema.create_index({using: 'btree', paths: {name: 1, age: -1}})` creates compound BTREE indexes.
- GIN descriptors reject `unique`; BTREE descriptors support `unique`.

