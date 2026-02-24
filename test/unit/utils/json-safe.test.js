import {describe, expect, test} from '@jest/globals';

import safe_json_stringify, {safe_json_stringify as safe_json_stringify_named} from '#src/utils/json-safe.js';

describe('safe_json_stringify', function () {
	test('default export matches named export', function () {
		expect(safe_json_stringify).toBe(safe_json_stringify_named);
	});

	test('returns JSON.stringify output for serializable values', function () {
		expect(safe_json_stringify({ok: true, count: 2})).toBe('{"ok":true,"count":2}');
		expect(safe_json_stringify_named(['a', 1, null])).toBe('["a",1,null]');
	});

	test('returns fallback string for unserializable values', function () {
		const circular_value = {name: 'loop'};
		circular_value.self = circular_value;

		expect(safe_json_stringify(circular_value)).toBe('"[unserializable]"');
	});
});
