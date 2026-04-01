import {describe, expect, test} from '@jest/globals';

import resolve_schema_indexes from '#src/migration/schema-indexes-resolver.js';

describe('Schema index resolver lifecycle', function () {
	test('returns schema indexes when get_indexes() returns an array', function () {
		const schema_indexes = [{path: 'name', using: 'btree'}];
		const schema_stub = {
			get_indexes() {
				return schema_indexes;
			}
		};

		expect(resolve_schema_indexes(schema_stub)).toBe(schema_indexes);
	});

	test('falls back to an empty array when get_indexes() does not return an array', function () {
		const schema_stub = {
			get_indexes() {
				return null;
			}
		};

		expect(resolve_schema_indexes(schema_stub)).toEqual([]);
	});
});
