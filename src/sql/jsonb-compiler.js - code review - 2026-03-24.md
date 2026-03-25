src/sql/jsonb-compiler.js
- [x] line 8: JSDoc references `JsonbPipeline.from()` but the parser is `JsonbOps.from(...)`. Update the docstring to match the actual module contract. update module contract comments
- [x] line 14: Loop counter `i` makes the reducer harder to scan. Rename it to `step_index` for readability. improve expression-level readability
- [x] line 1: If compilation moves onto a `JsonbOps` instance (`jsonb_ops.compile(parameter_state)`), deprecate `src/sql/jsonb-compiler.js` or refactor it into an internal helper called by `JsonbOps.prototype.compile`. align module contracts

src/sql/jsonb-ops.js
- [stale] line 3: `jsonb_stringify` is imported but never used. This is no longer accurate after `JsonbOps.from(...)` moved JSON serialization earlier in the flow. stale review item
- [x] line 51: JSDoc says "raw delta or user input", but the implementation only supports operator-style update definitions (`$replace_roots`, `$unset`, `$set`) plus implicit top-level `$set`. Narrow the contract comment. update module contract comments
- [x] line 67: `options.column_name` is required for `JsonbOps.from(...)`. Throw `QueryError` when missing so the contract fails early instead of generating invalid SQL. move rule to module boundary
- [x] line 85: Expand the single-line `$unset` array guard into a braced block and use shared `is_array(...)` for consistency. improve expression-level readability
- [x] line 17: Rename the IR array from `pipeline` to `operations` (including locals and returned shape) to match the agreed contract. update module contract comments
- [x] line 29: Change `JsonbOps.from(...)` to return a `JsonbOps` instance with `target` + `operations`, and add `jsonb_ops.compile(parameter_state)` so the SQL builder can compile/bind in one explicit call. align module contracts

src/model/factory/exec-update-one.js
- [x] line 5: Import `JsonbOps` from `#src/sql/jsonb-ops.js` so `src/model/factory/exec-update-one.js` matches the current module location. align module contracts
- [x] line 45: `update_expression` still uses `{ jsonb_fragment, timestamp_set }`, but the new `JsonbOps` contract is an instance with `.compile(parameter_state)`. Replace the fragment shape with a `jsonb_ops`-based contract. align module contracts
- [stale] line 61: The earlier `Object.assign(...)` preference is no longer the active repo rule. Simple object spread cloning in `split_update_definition(...)` is now acceptable under the updated JS standards. stale review item
- [x] line 74: `split_update_definition(...)` only extracts timestamps from top-level and `payload.$set`, but tracked updates currently emit `set` (no `$`). Either normalize upstream or extend the split to cover the tracked delta shape. move rule to module boundary
- [x] line 45: Pass a `jsonb_ops` instance through `update_expression` (not a plain fragment) so `build_update_query(...)` can call `jsonb_ops.compile(parameter_state)` at the SQL boundary. align module contracts

src/sql/build-update-query.js
- [x] line 25: Update the comment to reflect the new `JsonbOps` contract. The SQL builder should compile via `jsonb_ops.compile(parameter_state)`, not `JsonbQuery.from(...)`. update module contract comments
- [x] line 27: `build_update_query(...)` still reads `update_expression.data_expression`, but `exec_update_one(...)` now passes `update_expression.jsonb_ops`. Accept the `jsonb_ops` contract here, or fail explicitly until that migration lands. move rule to module boundary
- [x] line 21: Accept `update_expression.jsonb_ops` and call `jsonb_ops.compile(parameter_state)` to produce the RHS while binding JSON params in the correct global order. align module contracts

src/model/model.js
- [x] line 30: `DeltaTracker(..., {track: ['data']})` emits tracked delta keys as `data.*` because nested writes are stored by full path under the tracked root. The JSONB update boundary now strips/maps that tracked-root prefix before compiling JSONB paths. move rule to module boundary
- [x] line 233: `update_payload.updated_at = document.updated_at` now keeps `updated_at` at the row boundary instead of pushing it into the JSON payload delta. move rule to module boundary

src/utils/delta-tracker/index.js
- [x] line 61: `DeltaTracker.from(...)` no longer claims it supports "flat paths". The docstring now reflects nested objects or direct top-level keys only. update module contract comments

src/model/factory/exec-update-one.1.js
- [ ] line 1: This appears to be an archived implementation but lives next to the active factory module. Move it under an archive folder or remove from the runtime surface to avoid accidental imports. move rule to module boundary
