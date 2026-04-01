import {describe, expect, test} from '@jest/globals';

import DeltaTracker from '#src/utils/delta-tracker/index.js';
import {has_own} from '#src/utils/object.js';

describe('DeltaTracker', function () {
	test('returns an empty delta for non-object input in DeltaTracker.from(...)', function () {
		expect(DeltaTracker.from(null)).toEqual({
			replace_roots: {},
			set: {},
			unset: []
		});
	});

	test('builds deltas from plain objects, including undefined deletions', function () {
		expect(DeltaTracker.from({
			name: 'alice',
			missing: undefined
		})).toEqual({
			replace_roots: {},
			set: {
				name: 'alice'
			},
			unset: ['missing']
		});
	});

	test('supports full tracking when no track list is provided', function () {
		const tracker = new DeltaTracker({
			profile: {
				city: 'Madrid'
			}
		});

		tracker.profile.city = 'Miami';

		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {
				'profile.city': 'Miami'
			},
			unset: []
		});
	});

	test('tracks root replacement and tracked-root deletion', function () {
		const tracker = new DeltaTracker({
			data: {
				name: 'alice'
			}
		}, {
			track: ['data']
		});

		tracker.data = {name: 'bob'};

		expect(tracker.$get_delta()).toEqual({
			replace_roots: {
				data: {
					name: 'bob'
				}
			},
			set: {},
			unset: []
		});

		delete tracker.data;

		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {},
			unset: ['data']
		});
	});

	test('reverting a nested value back to its baseline clears the pending delta', function () {
		const tracker = new DeltaTracker({
			data: {
				name: 'alice'
			}
		}, {
			track: ['data']
		});

		tracker.data.name = 'bob';
		tracker.data.name = 'alice';

		expect(tracker.$has_changes()).toBe(false);
		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {},
			unset: []
		});
	});

	test('keeps untracked root branches raw and out of delta bookkeeping', function () {
		const tracker = new DeltaTracker({
			data: {
				name: 'alice'
			},
			cache: {
				count: 1
			}
		}, {
			track: ['data']
		});

		tracker.cache.count = 2;

		expect(tracker.$has_changes()).toBe(false);
		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {},
			unset: []
		});
	});

	test('bypasses delete tracking for untracked top-level branches', function () {
		const tracker = new DeltaTracker({
			data: {
				name: 'alice'
			},
			cache: {
				count: 1
			}
		}, {
			track: ['data']
		});

		delete tracker.cache;

		expect(tracker.$has_changes()).toBe(false);
		expect(has_own(tracker, 'cache')).toBe(false);
	});

	test('reuses the same nested proxy instance across repeated reads', function () {
		const tracker = new DeltaTracker({
			data: {
				profile: {
					city: 'Madrid'
				}
			}
		}, {
			track: ['data']
		});

		expect(tracker.data).toBe(tracker.data);
		expect(tracker.data.profile).toBe(tracker.data.profile);
	});

	test('passes through symbol and function root properties without tracking them', function () {
		const internal_symbol = Symbol('internal');
		const target = {
			data: {
				name: 'alice'
			},
			run() {
				return 'ok';
			}
		};

		target[internal_symbol] = 1;

		const tracker = new DeltaTracker(target, {
			track: ['data']
		});

		expect(tracker[internal_symbol]).toBe(1);
		expect(tracker.run()).toBe('ok');

		tracker[internal_symbol] = 2;
		tracker.run = function () {
			return 'patched';
		};

		expect(tracker[internal_symbol]).toBe(2);
		expect(tracker.run()).toBe('patched');
		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {},
			unset: []
		});

		delete tracker[internal_symbol];
		expect(tracker[internal_symbol]).toBeUndefined();
	});

	test('deletes a path when intercept_set returns undefined', function () {
		const tracker = new DeltaTracker({
			data: {
				name: 'alice',
				role: 'admin'
			}
		}, {
			track: ['data'],
			intercept_set: function (_path, next_value) {
				return next_value === null ? undefined : next_value;
			}
		});

		tracker.data.name = null;

		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {},
			unset: ['data.name']
		});
	});

	test('ignores array length mutations for tracked array branches', function () {
		const tracker = new DeltaTracker({
			data: [1, 2, 3]
		}, {
			track: ['data']
		});

		tracker.data.length = 1;

		expect(tracker.$has_changes()).toBe(false);
		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {},
			unset: []
		});
	});

	test('ignores root array length mutations during full tracking', function () {
		const tracker = new DeltaTracker([1, 2, 3]);

		tracker.length = 1;

		expect(tracker.$has_changes()).toBe(false);
		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {},
			unset: []
		});
	});

	test('resets changes back to the rebased baseline snapshot', function () {
		const tracker = new DeltaTracker({
			data: {
				name: 'alice'
			}
		}, {
			track: ['data']
		});

		tracker.data.name = 'bob';
		expect(tracker.$has_changes()).toBe(true);

		tracker.$reset_changes();

		expect(tracker.data.name).toBe('alice');
		expect(tracker.$has_changes()).toBe(false);
		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {},
			unset: []
		});
	});

	test('reset_changes removes replaced roots that did not exist in the baseline', function () {
		const tracker = new DeltaTracker({}, {
			track: ['data']
		});

		tracker.data = {
			name: 'alice'
		};
		expect(tracker.$has_changes()).toBe(true);

		tracker.$reset_changes();

		expect(has_own(tracker, 'data')).toBe(false);
		expect(tracker.$has_changes()).toBe(false);
	});

	test('returns false when deleting a non-configurable property through Reflect.deleteProperty', function () {
		const target = {};

		Object.defineProperty(target, 'fixed', {
			value: 1,
			writable: true,
			enumerable: true,
			configurable: false
		});

		const tracker = new DeltaTracker(target);

		expect(Reflect.deleteProperty(tracker, 'fixed')).toBe(false);
		expect(tracker.fixed).toBe(1);
	});

	test('rebases the current root object as the next baseline snapshot', function () {
		const tracker = new DeltaTracker({
			data: {
				name: 'alice'
			}
		}, {
			track: ['data']
		});

		tracker.data.name = 'bob';
		tracker.$rebase_changes();

		expect(tracker.$has_changes()).toBe(false);

		tracker.data.name = 'carol';

		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {
				'data.name': 'carol'
			},
			unset: []
		});
	});

	test('clears nested unset entries when a parent branch is replaced', function () {
		const tracker = new DeltaTracker({
			data: {
				profile: {
					city: 'Madrid',
					country: 'ES'
				}
			}
		}, {
			track: ['data']
		});

		delete tracker.data.profile.city;
		tracker.data.profile = {
			country: 'US'
		};

		expect(tracker.$get_delta()).toEqual({
			replace_roots: {},
			set: {
				'data.profile': {
					country: 'US'
				}
			},
			unset: []
		});
	});

	test('batches exact-path, deep, and immediate-once watchers', async function () {
		const tracker = new DeltaTracker({
			data: {
				name: 'alice',
				profile: {
					city: 'Madrid'
				}
			}
		}, {
			track: ['data']
		});

		const exact_calls = [];
		const deep_calls = [];
		const immediate_calls = [];

		tracker.$watch('data.name', function (next_value, previous_value) {
			exact_calls.push([next_value, previous_value]);
		});

		tracker.$watch('data', {
			deep: true,
			handler: function (next_value, previous_value) {
				deep_calls.push([next_value.name, previous_value.name]);
			}
		});

		tracker.$watch('data.profile.city', {
			immediate: true,
			once: true,
			handler: function (next_value, previous_value) {
				immediate_calls.push([next_value, previous_value]);
			}
		});

		tracker.data.name = 'bob';
		tracker.data.name = 'carol';
		tracker.data.profile.city = 'Miami';

		await Promise.resolve();

		expect(exact_calls).toEqual([
			['carol', 'alice']
		]);
		expect(deep_calls).toEqual([
			['carol', 'carol']
		]);
		expect(immediate_calls).toEqual([
			['Madrid', undefined]
		]);
	});

	test('supports constructor watch configuration and root immediate watchers', async function () {
		const root_calls = [];
		const name_calls = [];

		const tracker = new DeltaTracker({
			data: {
				name: 'alice'
			}
		}, {
			track: ['data'],
			watch: {
				'': {
					immediate: true,
					handler: function (next_value) {
						root_calls.push(next_value);
					}
				},
				'data.name': function (next_value, previous_value) {
					name_calls.push([next_value, previous_value]);
				}
			}
		});

		tracker.data.name = 'bob';
		await Promise.resolve();

		expect(root_calls).toHaveLength(1);
		expect(root_calls[0].data.name).toBe('bob');
		expect(name_calls).toEqual([
			['bob', 'alice']
		]);
	});

	test('queued once watchers run only once and parent replacement watchers receive old nested values', async function () {
		const calls = [];
		const tracker = new DeltaTracker({
			data: {
				profile: {
					city: 'Madrid'
				}
			}
		}, {
			track: ['data']
		});

		tracker.$watch('data.profile.city', {
			once: true,
			handler: function (next_value, previous_value) {
				calls.push([next_value, previous_value]);
			}
		});

		tracker.data.profile = 'offline';
		await Promise.resolve();

		tracker.data.profile = {
			city: 'Lisbon'
		};
		await Promise.resolve();

		expect(calls).toEqual([
			[undefined, 'Madrid']
		]);
	});

	test('accepts watcher registration without an explicit handler object', async function () {
		const tracker = new DeltaTracker({
			data: {
				name: 'alice'
			}
		}, {
			track: ['data']
		});

		const unwatch = tracker.$watch('data.name');

		tracker.data.name = 'bob';
		await Promise.resolve();

		expect(typeof unwatch).toBe('function');
		expect(tracker.data.name).toBe('bob');
	});

	test('unwatch removes the registered watcher before the next mutation', async function () {
		const tracker = new DeltaTracker({
			data: {
				name: 'alice'
			}
		}, {
			track: ['data']
		});

		const calls = [];
		const unwatch = tracker.$watch('data.name', function (next_value) {
			calls.push(next_value);
		});

		unwatch();
		tracker.data.name = 'bob';

		await Promise.resolve();

		expect(calls).toEqual([]);
	});
});
