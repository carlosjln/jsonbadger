# Field Types API

Use field types inside `Schema` definitions to describe how each path is interpreted, cast, and validated.

## Quick Start

```js
import JsonBadger, {Schema} from 'jsonbadger';

const user_schema = new Schema({
	name: {type: String, trim: true, minLength: 2},
	age: {type: Number, min: 18},
	active: Boolean,
	tags: [String],
	preferences: {type: Map, of: String},
	payload: {},
	idempotency_key: JsonBadger.field_types.UUIDv7,
	score: {type: 'Double'},
	value: {type: 'Union', of: [String, Number]}
});
```

> **Note:** A field type is the per-path type definition. `JsonBadger.field_types.UUIDv7` is the type reference; `{type: JsonBadger.field_types.UUIDv7, required: true}` is the field definition.

## Declaration Forms

### Implicit form

```js
const schema = new Schema({
	name: String,
	age: Number,
	active: Boolean,
	tags: [String]
});
```

### Explicit form

```js
const schema = new Schema({
	name: {type: String, trim: true},
	age: {type: Number, min: 18},
	preferences: {type: Map, of: String},
	score: {type: 'Double'}
});
```

### Nested object form

```js
const schema = new Schema({
	profile: {
		name: String,
		city: String
	}
});
```

> **Note:** The key `type` is reserved inside schema definitions. If a nested object really needs a property named `type`, define that property explicitly:
>
> ```js
> const schema = new Schema({
> 	asset: {
> 		type: {type: String},
> 		ticker: String
> 	}
> });
> ```

## Built-in Field Types

The default registry includes these canonical field types:

1. `String`
2. `Number`
3. `Date`
4. `Boolean`
5. `UUIDv7`
6. `Buffer`
7. `Mixed`
8. `Array`
9. `Map`
10. `Decimal128`
11. `BigInt`
12. `Double`
13. `Int32`
14. `Union`

Use constructor references where they exist:

```js
const schema = new Schema({
	name: String,
	active: Boolean,
	payload: {},
	tags: [String],
	preferences: {type: Map, of: String}
});
```

Use string aliases for advanced built-ins:

```js
const schema = new Schema({
	score: {type: 'Double'},
	count: {type: 'Int32'},
	value: {type: 'Union', of: [String, Number]}
});
```

Use the public namespace for the built-in UUIDv7 reference and boolean casting sets:

```js
JsonBadger.field_types.UUIDv7;
JsonBadger.field_types.boolean_convert_to_true;
JsonBadger.field_types.boolean_convert_to_false;
```

## Common Options

These options are implemented by the base field-type layer and work across field types:

1. `required`
2. `default`
3. `validate`
4. `get`
5. `set`
6. `alias`

```js
const schema = new Schema({
	name: {
		type: String,
		required: true,
		default: 'Anonymous',
		set(value) {
			return value.trim();
		},
		get(value) {
			return value;
		},
		validate(value) {
			return value.length >= 2;
		},
		alias: 'display_name'
	}
});
```

## Type-Specific Options

### String

```js
const schema = new Schema({
	name: {
		type: String,
		trim: true,
		lowercase: true,
		match: /^[a-z ]+$/,
		minLength: 2,
		maxLength: 40
	}
});
```

Supported options:

1. `trim`
2. `lowercase`
3. `uppercase`
4. `match`
5. `enum`
6. `minLength`
7. `maxLength`

### Number

```js
const schema = new Schema({
	age: {
		type: Number,
		min: 18,
		max: 99
	}
});
```

Supported options:

1. `min`
2. `max`
3. `enum`

### Date

```js
const schema = new Schema({
	published_at: {
		type: Date,
		min: new Date('2020-01-01')
	}
});
```

Supported options:

1. `min`
2. `max`

### Array

```js
const schema = new Schema({
	tags: [String],
	scores: {type: Array, of: Number}
});
```

> **Note:** Arrays default to `[]`. Set `default: undefined` when you want to disable the implicit empty-array default.

### Map

```js
const schema = new Schema({
	preferences: {type: Map, of: String}
});
```

### Union

```js
const schema = new Schema({
	value: {
		type: 'Union',
		of: [String, Number]
	}
});
```

## Runtime Notes

1. `Mixed` accepts any value and skips type-specific casting.
2. `Boolean` casting uses the public sets `JsonBadger.field_types.boolean_convert_to_true` and `JsonBadger.field_types.boolean_convert_to_false`.
3. `UUIDv7` normalizes to lowercase and rejects non-v7 UUID strings.
4. `Map` casts input into a plain object with string keys.
5. `Union` keeps exact matches first, then tries casts in declared order.

## Introspection

Use `schema.get_path(path_name)` to inspect one compiled field type:

```js
const schema = new Schema({
	name: {type: String, minLength: 2}
});

const field_type = schema.get_path('name');
const type_name = schema.get_path_type('name');
```

The field-type instance exposes these introspection fields:

1. `path`
2. `instance`
3. `validators`
4. `regExp`
5. `enum_values`

## Registry Namespace

Use the public registry namespace to register or resolve field types.

### `JsonBadger.field_type.register(name, type_constructor, aliases?)`

```js
JsonBadger.field_type.register('Money', MoneyFieldType, ['money']);
```

Registers a canonical name and optional aliases.

### `JsonBadger.field_type.resolve(type)`

```js
const type_name = JsonBadger.field_type.resolve('money');
```

Returns the canonical registered name, or `null` when the alias is unknown.

## Custom Field Types

Custom field types are registered through the same namespace and then used in schema definitions by name.

```js
class MoneyFieldType {
	constructor(path, options) {
		this.path = path;
		this.options = options || {};
		this.instance = 'Money';
	}

	validate() {
		return;
	}
}

JsonBadger.field_type.register('Money', MoneyFieldType, ['money']);
```

```js
const schema = new Schema({
	price: {type: 'Money'}
});
```
