import {describe, expect, test} from '@jest/globals';

import Schema from '#src/schema/schema.js';

describe('Schema index declarations', function () {
	test('stores single-path and compound index declarations', function () {
		const schema_instance = new Schema({
			name: String,
			type: String
		});

		schema_instance
			.create_index({using: 'gin', path: 'name'})
			.create_index({using: 'btree', paths: {name: 1, type: -1}, unique: true, name: 'idx_name_type'});

		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'gin',
				path: 'name'
			},
			{
				using: 'btree',
				paths: {name: 1, type: -1},
				unique: true,
				name: 'idx_name_type'
			}
		]);
	});

	test('auto-registers path-level index options from schema definition', function () {
		const schema_instance = new Schema({
			name: {type: String, index: true},
			age: {type: Number, index: 1},
			rank: {type: Number, index: -1},
			email: {type: String, index: {using: 'btree', unique: true, name: 'idx_users_email_unique'}},
			score: {type: Number, index: {using: 'btree', order: -1}},
			nick_name: {type: String, index: {using: 'gin', name: 'idx_users_nickname_gin'}},
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
				using: 'gin',
				path: 'name'
			},
			{
				using: 'btree',
				path: 'age',
				order: 1
			},
			{
				using: 'btree',
				path: 'rank',
				order: -1
			},
			{
				using: 'btree',
				path: 'email',
				order: 1,
				unique: true,
				name: 'idx_users_email_unique'
			},
			{
				using: 'btree',
				path: 'score',
				order: -1
			},
			{
				using: 'gin',
				path: 'nick_name',
				name: 'idx_users_nickname_gin'
			},
			{
				using: 'gin',
				path: 'profile.city'
			},
			{
				using: 'btree',
				path: 'profile.zip',
				order: -1
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
		schema_instance.create_index({
			using: 'btree',
			paths: {name: 1, type: -1},
			name: 'idx_name_type'
		});

		const first_read = schema_instance.get_indexes();
		first_read[0].paths.name = -1;
		first_read[0].name = 'changed';

		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'btree',
				paths: {name: 1, type: -1},
				name: 'idx_name_type'
			}
		]);
	});

	test('silently drops invalid compound index order entries', function () {
		const schema_instance = new Schema({name: String});

		schema_instance.create_index({
			using: 'btree',
			paths: {name: 0}
		});

		expect(schema_instance.get_indexes()).toEqual([]);
	});

	test('silently drops invalid path-level index option values', function () {
		const schema_instance = new Schema({
			name: {type: String, index: 'asc'}
		});

		expect(schema_instance.get_indexes()).toEqual([]);
	});

	test('silently defaults invalid path-level index order values to ascending', function () {
		const schema_instance = new Schema({
			name: {type: String, index: {order: 0}}
		});

		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'btree',
				path: 'name',
				order: 1
			}
		]);
	});

	test('silently defaults invalid path-level using values to btree', function () {
		const schema_instance = new Schema({
			name: {type: String, index: {using: 'hash'}}
		});

		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'btree',
				path: 'name',
				order: 1
			}
		]);
	});

	test('silently drops path-level order when using gin', function () {
		const schema_instance = new Schema({
			name: {type: String, index: {using: 'gin', order: -1}}
		});

		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'gin',
				path: 'name'
			}
		]);
	});

	test('silently drops path-level unique when using gin', function () {
		const schema_instance = new Schema({
			name: {type: String, index: {using: 'gin', unique: true}}
		});

		expect(schema_instance.get_indexes()).toEqual([
			{
				using: 'gin',
				path: 'name'
			}
		]);
	});
});
