# Brainstorm: tracked-root prefixes, multi-slug documents, and where normalization should live

This note captures the current brainstorming around `DeltaTracker`, `JsonbOps`, and future multi-JSONB-column document shapes.

## Current tension

1. `Current tracker behavior in src/utils/delta-tracker/index.js`: `DeltaTracker` emits full tracked paths such as `data.profile.name` because it stores writes by full path under the tracked root.
2. `Current compiler behavior in src/sql/jsonb-ops.js`: `JsonbOps.from(...)` expects one operator-style JSONB update definition and should ideally stay focused on JSONB syntax and compilation.
3. `Current model/sql boundary in src/model/factory/exec-update-one.js`: `exec_update_one(...)` already knows the row column name, already splits timestamps, and already builds the `JsonbOps` input.

## Design goal

1. `Short-term goal`: Keep the system simple while finishing the current migration to `JsonbOps` instances.
2. `Long-term goal`: Support a model/document shape that can mirror row columns more directly, including the possibility of multiple JSONB slugs instead of a single `data` column.
3. `SRP goal`: Avoid teaching the SQL compiler too much about tracker/document internals unless that boundary decision is explicit.

## Option 1: normalize at the model/sql boundary

1. `Owner: src/model/factory/exec-update-one.js`: Keep `DeltaTracker` generic and let `exec_update_one(...)` strip `data.` and map tracker output into operator-style JSONB input.
2. `Why it is good`: This is the cleanest KISS/SRP option for the current codebase because the orchestrator already knows both domains: document/tracker output and SQL compiler input.
3. `What changes`: Add or expand one normalization helper so tracker-shaped deltas become `{ $set, $unset, $replace_roots }` before calling `JsonbOps.from(...)`.
4. `What stays simple`: `DeltaTracker` stays generic, `JsonbOps` stays SQL-focused, and future SQL compiler changes remain isolated.
5. `Weakness`: If the document layer later mirrors multiple JSONB columns 1:1, this boundary adapter may grow more translation logic over time.

## Option 2: add `strip_root` to `JsonbOps.from(...)`

1. `Owner: src/sql/jsonb-ops.js`: Add an option such as `strip_root: true` so the compiler removes the first tracked segment before building JSONB paths.
2. `Why it is attractive`: It centralizes the path rewrite near the place where JSONB paths are already being compiled.
3. `Why it is risky`: A bare `strip_root: true` is underspecified once there is more than one JSONB slug. It raises questions like “which root?” and starts pushing tracker/document semantics into the SQL compiler.
4. `SRP concern`: `JsonbOps` would no longer just compile JSONB operator syntax; it would also become a translator for tracker-specific path dialects.
5. `Verdict`: This is workable for a single-root world, but it is not the strongest long-term design if multi-slug documents are a real target.

## Option 3: make `DeltaTracker` export relative deltas

1. `Owner: src/utils/delta-tracker/index.js`: Add an export-style method or option such as `$get_delta({strip_root: true})`, `$export({root_mode: 'relative'})`, or similar.
2. `Why it is attractive`: `DeltaTracker` already knows the tracked roots, so asking it to emit either full paths or root-relative paths is a natural extension of its serialization contract.
3. `Why it fits the future better`: If documents later track multiple JSONB slugs, the tracker can stay the authoritative source for root metadata and emit deltas in a form that downstream systems can consume cleanly.
4. `SRP tradeoff`: This does expand `DeltaTracker` from “track changes” into “track changes plus serialize them in different boundary formats,” but that is still closer to tracker responsibility than teaching `JsonbOps` about document roots.
5. `Verdict`: Strong long-term option if multi-slug documents are a real roadmap item, especially if we want one tracker to serve several downstream consumers.

## Option 4: give `DeltaTracker` explicit tracked-root metadata

1. `Owner: src/utils/delta-tracker/index.js`: Keep full-path delta emission as the default, but expose metadata about tracked roots or slugs alongside the delta.
2. `Possible shape`: `$get_delta()` stays as-is, and a companion API exposes root metadata, or `$get_delta({include_roots: true})` returns both delta and tracked-root information.
3. `Why it helps`: Downstream consumers can make their own decisions about root stripping or routing without reverse-engineering the tracker configuration.
4. `Why it is incomplete alone`: Metadata helps, but some layer still has to do the actual rewrite. This option is best paired with either Option 1 or Option 3.

## Recommended direction

1. `Near-term recommendation: Option 1 in src/model/factory/exec-update-one.js`: It is the simplest thing that works today and keeps the current migration moving with minimal scope.
2. `Long-term recommendation: Option 3 plus Option 4 in src/utils/delta-tracker/index.js`: If the project is serious about multiple JSONB slugs and a more column-shaped document model, invest in a tracker export contract that can emit root-relative deltas and root metadata intentionally.
3. `Not recommended as the primary design: Option 2 in src/sql/jsonb-ops.js`: `JsonbOps.from({strip_root: true})` is tempting, but it makes the SQL compiler absorb tracker/document concerns too early.

## Decisions

1. `Decision for src/utils/delta-tracker/index.js`: Use one method, `get_delta(...options)`, and let options control export shape instead of introducing several differently named export methods.
2. `Decision for src/sql/jsonb-ops.js`: Keep `JsonbOps` operator-style only. It should continue to consume operator-style JSONB update definitions and should not become the boundary adapter for tracker/document-specific root rewriting.

## Pseudo code sketches

1. `Boundary adapter sketch in src/model/factory/exec-update-one.js`

```js
function normalize_jsonb_update(update_definition, data_column) {
	const timestamp_set = {};
	const jsonb_update_definition = {$set: {}, $unset: [], $replace_roots: null};

	if(update_definition.set) {
		for(const [path, value] of Object.entries(update_definition.set)) {
			if(path === 'updated_at' || path === 'created_at') {
				timestamp_set[path] = value;
				continue;
			}

			const next_path = path.startsWith(data_column + '.')
				? path.substring(data_column.length + 1)
				: path;

			jsonb_update_definition.$set[next_path] = value;
		}
	}

	return {timestamp_set, jsonb_update_definition};
}
```

2. `Tracker export sketch in src/utils/delta-tracker/index.js`

```js
tracker.$get_delta({root_mode: 'full'});
// {set: {'data.profile.name': 'John'}, unset: ['data.profile.age']}

tracker.$get_delta({root_mode: 'relative'});
// {set: {'profile.name': 'John'}, unset: ['profile.age']}
```

3. `Multi-slug export sketch in src/utils/delta-tracker/index.js`

```js
tracker.$get_delta({group_by_root: true, root_mode: 'relative'});
// {
//   data: {set: {'profile.name': 'John'}, unset: []},
//   settings: {set: {'theme': 'dark'}, unset: []}
// }
```

## Open questions

1. `Question for src/model/model.js`: Should the document layer eventually expose one tracked property per row column, with JSONB slugs tracked side by side?