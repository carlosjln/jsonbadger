import {describe, expect, jest, test} from '@jest/globals';

import QueryBuilder from '#src/model/operations/query-builder.js';
import {create_model} from '#test/unit/model/test-helpers.js';

describe('Model query helper lifecycle', function () {
	test('read helpers create query builders with the expected operation and base filter', function () {
		const User = create_model({name: String});
		const find_query = User.find({active: true});
		const find_one_query = User.find_one({name: 'alice'});
		const find_by_id_query = User.find_by_id('17');
		const count_query = User.count_documents({active: true});

		expect(find_query).toBeInstanceOf(QueryBuilder);
		expect(find_query.model).toBe(User);
		expect(find_query.operation).toBe('find');
		expect(find_query.base_filter).toEqual({active: true});

		expect(find_one_query.operation).toBe('find_one');
		expect(find_one_query.base_filter).toEqual({name: 'alice'});

		expect(find_by_id_query.operation).toBe('find_one');
		expect(find_by_id_query.base_filter).toEqual({id: '17'});

		expect(count_query.operation).toBe('count_documents');
		expect(count_query.base_filter).toEqual({active: true});
	});

	test('create delegates single and array inputs through insert_one', async function () {
		const User = create_model({name: String});
		const insert_one_spy = jest.spyOn(User, 'insert_one')
			.mockResolvedValueOnce({id: '1'})
			.mockResolvedValueOnce({id: '2'})
			.mockResolvedValueOnce({id: '3'});

		const single_result = await User.create({name: 'alice'});
		const list_result = await User.create([{name: 'bob'}, {name: 'carol'}]);

		expect(single_result).toEqual({id: '1'});
		expect(list_result).toEqual([{id: '2'}, {id: '3'}]);
		expect(insert_one_spy).toHaveBeenNthCalledWith(1, {name: 'alice'});
		expect(insert_one_spy).toHaveBeenNthCalledWith(2, {name: 'bob'});
		expect(insert_one_spy).toHaveBeenNthCalledWith(3, {name: 'carol'});
	});

	test('query-builder chain helpers merge and overwrite state as expected', function () {
		const User = create_model({name: String});
		const query_builder = User.find({active: true})
			.where({role: 'admin'})
			.where({active: false})
			.sort({created_at: -1})
			.limit(5)
			.skip(10);

		expect(query_builder.where_filter).toEqual({
			role: 'admin',
			active: false
		});
		expect(query_builder.sort_filter).toEqual({created_at: -1});
		expect(query_builder.limit_count).toBe(5);
		expect(query_builder.skip_count).toBe(10);
	});
});
