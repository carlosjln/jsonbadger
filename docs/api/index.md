# API Index

Use this directory for module-scoped API reference pages.

## TOC

- [API Index](#api-index)
- [Top-level Exports](#top-level-exports)
- [Module Docs](#module-docs)

## Top-level Exports

Named exports:
- `connect(uri, options)`
- `Schema`
- `ID_STRATEGY`
- `field_type`

Default export (`JsonBadger`) includes the same plus:
- `field_type.register(name, type_constructor, aliases?)`
- `field_type.resolve(type)`
- `field_types.UUIDv7`
- `field_types.boolean_convert_to_true`
- `field_types.boolean_convert_to_false`

## Module Docs

- [`connection.md`](connection.md)
- [`delta-tracker.md`](delta-tracker.md)
- [`document.md`](document.md)
- [`schema.md`](schema.md)
- [`model.md`](model.md)
- [`query-builder.md`](query-builder.md)
- [`field-types.md`](field-types.md)
- [`../advanced/query-translation.md`](../advanced/query-translation.md)
