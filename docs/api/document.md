# Document API

`Document` is the plain runtime container behind every model instance.

Most app code should go through `Model.from(...)`, `Model.hydrate(...)`, and model instance methods such as `doc.get(...)`, `doc.set(...)`, and `doc.save()`.

Use `Document` directly when you are working on runtime internals, custom persistence flows, or when you need to adopt trusted state through `doc.rebase(...)`.

## TOC

- [Document API](#document-api)
- [Construction](#construction)
- [Instance Methods](#instance-methods)
- [Related Docs](#related-docs)

## Construction

Create a document from normalized root state:

```js
import Document from '#src/model/document.js';

const document = new Document({
	id: '9',
	payload: {
		name: 'alice'
	},
	settings: {
		theme: 'dark'
	},
	created_at: '2026-03-03T08:00:00.000Z',
	updated_at: '2026-03-03T09:00:00.000Z'
});
```

> **Note:** `Document` does not validate, cast, or normalize external input. If the source is not already trusted runtime state, prefer `Model.from(...)` or `Model.hydrate(...)`.

## Instance Methods

- `document.init(data)`
  - applies replacement state onto the same document instance
- `document.get(path_name)`
  - reads one exact root or nested path
- `document.set(path_name, value)`
  - writes one exact root or nested path
- `document.id`
- `document.created_at`
- `document.updated_at`

Example:

```js
const document = new Document({
	payload: {
		profile: {
			city: 'Miami'
		}
	}
});

document.get('payload.profile.city'); // 'Miami'

document.set('payload.profile.city', 'Madrid');
document.set('settings.theme', 'dark');
```

Behavior:
- keeps document state at the root level
- supports exact-path reads and writes
- returns the same instance from `init(...)` and `set(...)`
- returns `undefined` when `get(...)` reads a missing path

## Related Docs

- [`model.md`](model.md)
- [`schema.md`](schema.md)
- [`../lifecycle.md`](../lifecycle.md)
