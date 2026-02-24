import {describe, expect, test} from '@jest/globals';

const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/model-factory.js');

describe('mark_modified mutable edge cases', function () {
	test('in-place Mixed mutations require explicit mark_modified', function () {
		const schema_instance = new Schema({
			payload: {}
		});
		const User = model(schema_instance, {
			table_name: 'users'
		});
		const user_document = new User({
			payload: {
				nested: {
					count: 1
				}
			}
		});

		expect(user_document.is_modified()).toBe(false);

		user_document.data.payload.nested.count = 2;

		expect(user_document.is_modified()).toBe(false);
		expect(user_document.is_modified('payload')).toBe(false);
		expect(user_document.is_modified('payload.nested')).toBe(false);

		user_document.mark_modified('payload');

		expect(user_document.is_modified()).toBe(true);
		expect(user_document.is_modified('payload')).toBe(true);
		expect(user_document.is_modified('payload.nested')).toBe(true);
	});

	test('in-place Date mutations require explicit mark_modified', function () {
		const schema_instance = new Schema({
			updated_at: Date
		});
		const User = model(schema_instance, {
			table_name: 'users'
		});
		const initial_date = new Date('2026-01-15T12:00:00.000Z');
		const user_document = new User({
			updated_at: initial_date
		});

		expect(user_document.is_modified()).toBe(false);

		user_document.data.updated_at.setUTCMonth(2);

		expect(user_document.is_modified()).toBe(false);
		expect(user_document.is_modified('updated_at')).toBe(false);

		user_document.mark_modified('updated_at');

		expect(user_document.is_modified()).toBe(true);
		expect(user_document.is_modified('updated_at')).toBe(true);
	});
});
