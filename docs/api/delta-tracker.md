# DeltaTracker

Use `DeltaTracker` to watch object changes and export them as one delta snapshot.

## Example

```js
const tracker = DeltaTracker({
	data: {
		profile: {
			name: 'John'
		}
	}
}, {
	track: ['data']
});

tracker.data.profile.name = 'Jane';
delete tracker.data.profile.age;

const delta = tracker.$get_delta();

// {
//   replace_roots: {},
//   set: {'data.profile.name': 'Jane'},
//   unset: ['data.profile.age']
// }
```

> **Note:** When you use `track: ['data']`, emitted paths stay rooted at `data.*`. Downstream code decides whether to keep or strip that root at the handoff boundary.

## What It Does

`DeltaTracker` keeps three kinds of change state:
1. `replace_roots`: full tracked-root replacements.
2. `set`: path-to-value assignments.
3. `unset`: removed paths.

It also collapses conflicting nested changes so the exported delta stays logically consistent.

## Current API

### `DeltaTracker(target, options)`

Create one tracked proxy around `target`.

Current options:
1. `track`: top-level keys to track.
2. `watch`: watcher configuration.
3. `intercept_set`: transform assigned values before they are recorded.

### `tracker.$get_delta()`

Return the current delta snapshot:

```js
{
	replace_roots: {},
	set: {},
	unset: []
}
```

### `DeltaTracker.from(object)`

Build one delta from plain input against an empty baseline.

```js
const delta = DeltaTracker.from({
	data: {
		profile: {
			name: 'Jane'
		}
	}
});
```

> **Note:** `DeltaTracker.from(...)` supports nested objects and direct top-level keys. It does not interpret dot-path keys like `'data.profile.name'`.

## Behavior Notes

1. Assigning `undefined` is treated like deletion.
2. Array `length` writes are ignored.
3. Replacing a tracked root records one `replace_roots` entry and clears nested child deltas under that root.

## Boundary Notes

`DeltaTracker` stays generic and reusable. It does not know about document-layer SRP, JSONB slugs, or SQL compilation. The model layer configures tracked roots and hands the exported delta to the next boundary.

## Planned Export Options

Future work is expected to stay on the same `get_delta(...options)` method instead of adding multiple export methods.

Planned shapes:

```js
tracker.$get_delta({strip_roots: true});
// strip all tracked roots

tracker.$get_delta({strip_roots: ['data']});
// strip only selected tracked roots
```

These options are not implemented yet. They are the planned handoff boundary for consumers that need root-relative paths.
