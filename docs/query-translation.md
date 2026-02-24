# query translation

This project compiles Mongo-like filters into PostgreSQL SQL over JSONB data.

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
- jsonbadger preserves that behavior exactly.
- If the filter path is nested (for example `profile.city`), jsonbadger first extracts that nested JSONB value (`#>`), then applies the existence operator to the extracted value's top level.
- jsonbadger does not emulate recursive/deep key search for these operators.

## JSONPath operators

- `$json_path_exists` -> `@?` with a `::jsonpath` parameter
- `$json_path_match` -> `@@` with a `::jsonpath` parameter
- invalid/empty JSONPath values fail before SQL execution

## JSON update operators

- `$set` -> `jsonb_set(target, path, value, true)`
- `$insert` -> `jsonb_insert(target, path, value, insert_after)`
- `$set_lax` -> `jsonb_set_lax(target, path, value, create_if_missing, null_value_treatment)`

Update path behavior:
- Dot paths are validated before SQL execution.
- Nested numeric segments are allowed for JSON array index paths in updates (for example `tags.0`).
- Conflicting update paths in a single `update_one(...)` call (same path or parent/child overlap) fail before SQL execution.

## regex

- `$regex` uses PostgreSQL regex operators:
- `~` (case-sensitive)
- `~*` when `$options` includes `i`

## sort, limit, skip

- sort values use `-1` for `DESC`, everything else as `ASC`
- limit/skip only apply for non-negative numeric values


## PostgreSQL capability map

This table is the implementation-facing capability map for currently supported query/update operators over JSONB.

| jsonbadger feature | PostgreSQL operator/function | Notes | Indexability expectation |
| --- | --- | --- | --- |
| scalar equality (`{ path: value }`, `$ne`) | JSON extraction (`->>`, `#>>`) + `=` / `!=` | Compares extracted text/scalar representation | Manual expression indexes required for fast path filtering/sorting; current schema index helpers do not auto-create these expression indexes |
| numeric comparisons (`$gt`, `$gte`, `$lt`, `$lte`) | JSON extraction + `::numeric` + comparison | Invalid numeric inputs fail before SQL execution | Manual expression indexes may be used; no automatic expression-index creation |
| `$in`, `$nin` | `= ANY($n::text[])` / `!= ALL(...)` over extracted text | Set membership over extracted scalar text | Manual expression indexes only |
| `$contains` | `@>` | JSONB containment over extracted JSONB value | GIN on JSONB value is typically the relevant index strategy |
| `$all` | `@>` (JSON array containment) | Encodes requested list as JSON array | GIN on JSONB value is typically the relevant index strategy |
| `$size` | `jsonb_array_length(...)` | Array length equality | Usually expression-based optimization if needed; no auto-created support |
| `$elem_match` | `jsonb_array_elements(...)` + nested predicates | Uses set-returning expansion | Often less index-friendly than direct containment; depends on query shape |
| `$regex` | `~` / `~*` on extracted text | PostgreSQL regex semantics | Manual text/expression indexing strategy required; jsonbadger does not auto-create regex-specific indexes |
| `$has_key` | `?` | Top-level key existence on the left JSONB value | GIN on JSONB value is the expected index family |
| `$has_any_keys` | `?|` | Any-key existence | GIN on JSONB value is the expected index family |
| `$has_all_keys` | `?&` | All-keys existence | GIN on JSONB value is the expected index family |
| `$json_path_exists` | `@?` | JSONPath existence predicate | Can benefit from JSONB GIN indexing depending on operator class/query shape |
| `$json_path_match` | `@@` | JSONPath predicate match | Can benefit from JSONB GIN indexing depending on operator class/query shape |
| `update_one.$set` | `jsonb_set(...)` | Creates missing path segments when configured (`true`) | N/A (write-path function) |
| `update_one.$insert` | `jsonb_insert(...)` | Supports `insert_after` and numeric array-index path segments | N/A (write-path function) |
| `update_one.$set_lax` | `jsonb_set_lax(...)` | Supports `create_if_missing` + `null_value_treatment` | N/A (write-path function) |

Index helper behavior (current implementation):
- `schema.create_index('path')` creates a GIN index on the extracted JSONB path expression.
- `schema.create_index({ path: 1 })` (and compound object specs) create BTREE indexes on extracted text path expressions.
- Single-path string GIN indexes do not support `unique` in jsonbadger; object specs support `unique` because they compile to BTREE indexes.

