# PostgreSQL capability runtime checklist

Source proposal: `/0001-postgresql-capability-runtime/proposal.md`

Purpose: implement one upstream capability-binding seam so downstream SQL code consumes `model.schema.$runtime` and never branches on server capability directly.

## Order

1. Implement this checklist before the identity-policy checklist.
2. The identity work reuses `schema.$runtime` and `Schema.prototype.$bind_connection(connection)`.

## Checklist

- [x] T1. Update `src/connection/server-capabilities.js` to expose only factual capability data such as `server_version`, `server_version_num`, `supports_uuidv7`, and `supports_jsonpath`.
- [ ] T2. Keep capability detection in `src/connection/connect.js`; create `Connection` with `server_capabilities` and do not add any extra runtime-selection object there.
- [ ] T3. Update `src/schema/schema.js` so `schema.identity` remains declarative and runtime artifacts live under `schema.$runtime`.
- [ ] T4. Add `Schema.prototype.$bind_connection(connection)` in `src/schema/schema.js`.
- [ ] T5. Allow `schema.$bind_connection(null)` for connection-independent binding and fail clearly for capability-dependent paths.
- [ ] T6. Update `src/model/factory/index.js` to clone the source schema, call `cloned_schema.$bind_connection(connection)`, and assign the bound clone to `model.schema`.
- [ ] T7. Split JSONPath implementations into native and compat files under `src/sql/jsonb/read/operators/`.
- [ ] T8. Bind JSONPath operator implementations into `schema.$runtime.read_operators` inside `Schema.prototype.$bind_connection(connection)`.
- [ ] T9. Update `src/sql/read/where/operators.js` to dispatch by public operator name and call the already-bound implementation from `compile_context.schema_instance.$runtime.read_operators`.
- [ ] T10. Keep `src/sql/read/where/context.js` simple; pass the schema instance through and do not introduce another runtime container.
- [ ] T11. Add or update focused unit tests for capability scanning, `$bind_connection(connection)`, `$bind_connection(null)`, native binding, compat binding, and fail-fast cases.
- [ ] T12. Update any internal docs that describe the old capability-selection flow after the code is settled.

## Validation

- [ ] V1. Run `npm run test-unit`.
- [ ] V2. Run focused unit tests covering server capability detection, schema binding, and read-operator dispatch.

## Notes

1. Public query operators stay clean and stable.
2. JSONPath remains an internal implementation choice, not the normal user-facing API.

