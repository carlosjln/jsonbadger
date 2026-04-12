# PostgreSQL identity policy checklist

Source proposal: `proposals/active/0002-postgresql-identity-policy/proposal.md`

Purpose: replace `id_strategy` with `identity`, default the library back to numeric database-generated ids, and bind UUIDv7 generation through `schema.$runtime.identity`.

## Order

1. Start after the capability-runtime checklist has established `schema.$runtime` and `Schema.prototype.$bind_connection(connection)`.
2. Keep the implementation end-state only; do not preserve `id_strategy` as an active public shape unless explicitly required later.

## Checklist

- [x] T1. Replace `src/constants/id-strategy.js` with `src/constants/identity-type.js`, `src/constants/identity-format.js`, and `src/constants/identity-mode.js`.
- [x] T2. Update public exports so callers use `IDENTITY_TYPE`, `IDENTITY_FORMAT`, and `IDENTITY_MODE`.
- [x] T3. Update `src/constants/defaults.js` so `defaults.schema_options.identity` is the single identity config namespace with:
  - [x] T3A. `type = bigint`
  - [x] T3B. `format = null`
  - [x] T3C. `mode = fallback`
  - [x] T3D. `generator = null`

- [x] T4. Update `src/schema/schema.js` to merge `defaults.schema_options.identity` with user-provided `schema_options.identity`.
- [x] T5. Validate static identity combinations during schema construction.
- [x] T6. Implement identity runtime resolution inside `Schema.prototype.$bind_connection(connection)` and store the result in `schema.$runtime.identity`.
- [x] T7. Support phase-one combinations only:
  - [x] T7A. `bigint + null format`
  - [x] T7B. `uuid + uuidv7 + fallback`
  - [x] T7C. `uuid + uuidv7 + database`
  - [x] T7D. `uuid + uuidv7 + application`
- [x] T8. Enforce `schema.$bind_connection(null)` behavior for identity:
  - [x] T8A. allow connection-independent cases
  - [x] T8B. fail clear on capability-dependent cases

- [x] T9. Update migration / table DDL code to choose the id column definition from `schema.$runtime.identity`.
- [x] T10. Keep phase-one numeric database mode on `BIGSERIAL PRIMARY KEY`.
- [x] T11. Emit `UUID PRIMARY KEY DEFAULT uuidv7()` for bound native UUIDv7 database mode.
- [x] T12. Emit `UUID PRIMARY KEY` for bound application-generated UUIDv7 mode.

- [ ] T13. Update model insert lifecycle so application-generated ids are created before validation when `schema.$runtime.identity.insert_includes_id === true`.
- [ ] T14. Reject explicit ids for phase-one numeric database mode.
- [ ] T15. Update insert SQL building so `id` is included only when the bound runtime says it should be included.
- [ ] T16. Update read/query id normalization and casting based on bound identity type and format.
- [ ] T17. Keep public `document.id` string-shaped in all supported modes.

- [ ] T18. Update focused unit and integration tests for defaults, schema construction, binding, insert lifecycle, id validation, query casting, and migration DDL.
- [ ] T19. Update public docs and examples after the implementation is stable.

## Validation

- [ ] V1. Run `npm run test-unit`.
- [ ] V2. Run focused unit tests for schema defaults, schema binding, model inserts, and id validation.
- [ ] V3. Run `npm run test-integration` for PostgreSQL migration and persistence coverage once unit tests pass.

## Notes

1. Keep `uuid` out of this library's direct dependencies.
2. Application UUIDv7 generation comes from the consumer-provided `identity.generator`.
