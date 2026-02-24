import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';

describe('Schema foundational field types', function () {
	test('casts and validates foundational field types', function () {
		const schema_instance = new Schema({
			name: {type: String, trim: true, lowercase: true},
			age: Number,
			created_at: Date,
			active: Boolean,
			owner_id: {type: 'UUIDv7'},
			bin_data: Buffer,
			payload: {},
			tags: [String],
			handles: {type: Map, of: String}
		});

		const validated_payload = schema_instance.validate({
			name: '  ALICE  ',
			age: '42',
			created_at: '2026-02-01T00:00:00.000Z',
			active: 'yes',
			owner_id: '0194f028-579a-7b5b-8107-b9ad31395f43',
			bin_data: [65, 66],
			payload: {nested: {ok: true}},
			tags: [1, 'two'],
			handles: {
				github: 123
			}
		});

		expect(validated_payload.name).toBe('alice');
		expect(validated_payload.age).toBe(42);
		expect(validated_payload.created_at instanceof Date).toBe(true);
		expect(validated_payload.active).toBe(true);
		expect(validated_payload.owner_id).toBe('0194f028-579a-7b5b-8107-b9ad31395f43');
		expect(Buffer.isBuffer(validated_payload.bin_data)).toBe(true);
		expect(validated_payload.bin_data.toString('utf8')).toBe('AB');
		expect(validated_payload.payload).toEqual({nested: {ok: true}});
		expect(validated_payload.tags).toEqual(['1', 'two']);
		expect(validated_payload.handles).toEqual({github: '123'});
	});

	test('applies implicit array default and returns deterministic validation details', function () {
		const schema_instance = new Schema({
			tags: [String],
			owner_id: {type: 'UUIDv7'},
			active: Boolean
		});

		const valid_payload = schema_instance.validate({
			owner_id: '0194f028-579a-7b5b-8107-b9ad31395f43',
			active: false
		});

		expect(valid_payload.tags).toEqual([]);

		expect(function validate_invalid_payload() {
			schema_instance.validate({
				owner_id: 'not-a-uuid',
				active: 'invalid-token'
			});
		}).toThrow('Schema validation failed');

		try {
			schema_instance.validate({
				owner_id: 'not-a-uuid',
				active: 'invalid-token'
			});

		} catch(error) {
			expect(error.details).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						path: 'owner_id',
						code: 'cast_error'
					}),
					expect.objectContaining({
						path: 'active',
						code: 'cast_error'
					})
				])
			);
		}
	});
});
