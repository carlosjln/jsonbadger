# Field Types API

## TOC

- [Field Types API](#field-types-api)
- [Namespace](#namespace)
- [register](#register)
- [resolve](#resolve)

## Namespace

Public namespace:
- `JsonBadger.field_type.register(name, type_constructor, aliases?)`
- `JsonBadger.field_type.resolve(type)`

Use the namespace to extend or inspect the field-type registry.

## register

```js
JsonBadger.field_type.register('Money', MoneyFieldType, ['money']);
```

Registers a custom field type name and optional aliases.

## resolve

```js
const name = JsonBadger.field_type.resolve('money');
```

Resolves a type alias or canonical name to the registered field type name.
