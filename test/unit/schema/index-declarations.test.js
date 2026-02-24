import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';

describe('Schema index declarations', function () {
	test('stores single-path and compound index declarations', function () {
		const schema_instance = new Schema({
			name: String,
			type: String
		});

		schema_instance
			.create_index('name')
			.create_index({name: 1, type: -1}, {unique: true, name: 'idx_name_type'});

		expect(schema_instance.get_indexes()).toEqual([
			{
				index_spec: 'name',
				index_options: {}
			},
			{
				index_spec: {name: 1, type: -1},
				index_options: {unique: true, name: 'idx_name_type'}
			}
		]);
	});

	test('auto-registers path-level index options from schema definition', function () {
		const schema_instance = new Schema({
			name: {type: String, index: true},
			age: {type: Number, index: 1},
			rank: {type: Number, index: -1},
			email: {type: String, index: {unique: true, name: 'idx_users_email_unique'}},
			score: {type: Number, index: {order: -1}},
			profile: {
				city: {type: String, index: true},
				zip: {type: Number, index: -1}
			},
			meta: {
				index: String
			}
		});

		expect(schema_instance.get_indexes()).toEqual([
			{
				index_spec: 'name',
				index_options: {}
			},
			{
				index_spec: {age: 1},
				index_options: {}
			},
			{
				index_spec: {rank: -1},
				index_options: {}
			},
			{
				index_spec: {email: 1},
				index_options: {unique: true, name: 'idx_users_email_unique'}
			},
			{
				index_spec: {score: -1},
				index_options: {}
			},
			{
				index_spec: 'profile.city',
				index_options: {}
			},
			{
				index_spec: {'profile.zip': -1},
				index_options: {}
			}
		]);
	});

	test('ignores path-level index false', function () {
		const schema_instance = new Schema({
			name: {type: String, index: false}
		});

		expect(schema_instance.get_indexes()).toEqual([]);
	});

	test('returns cloned index definitions', function () {
		const schema_instance = new Schema({name: String, type: String});
		schema_instance.create_index({name: 1}, {name: 'idx_name'});

		const first_read = schema_instance.get_indexes();
		first_read[0].index_spec.name = -1;
		first_read[0].index_options.name = 'changed';

		expect(schema_instance.get_indexes()).toEqual([
			{
				index_spec: {name: 1},
				index_options: {name: 'idx_name'}
			}
		]);
	});

	test('throws for invalid compound sort direction', function () {
		const schema_instance = new Schema({name: String});

		expect(function create_invalid_direction_index() {
			schema_instance.create_index({name: 0});
		}).toThrow('index direction for path "name" must be 1 or -1');
	});

	test('throws for invalid path-level index option values', function () {
		expect(function create_invalid_path_index() {
			return new Schema({
				name: {type: String, index: 'asc'}
			});
		}).toThrow('index option at path "name" must be true, false, 1, -1, or an options object');
	});

	test('throws for invalid path-level index object direction values', function () {
		expect(function create_invalid_path_index_direction() {
			return new Schema({
				name: {type: String, index: {direction: 0}}
			});
		}).toThrow('index direction for path "name" must be 1 or -1');
	});
});
