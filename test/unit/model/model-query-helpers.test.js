import {describe, expect, jest, test} from '@jest/globals';

import QueryBuilder from '#src/model/operations/query-builder.js';
import {create_model} from '#test/unit/model/test-helpers.js';

describe('Model query helper lifecycle', function () {
	test('read helpers create query builders with the expected operation and base filter', function () {
		const User = create_model({name: String});
		const find_query = User.find({active: true});
		const find_one_query = User.find_one({name: 'Nell'});
		const find_by_id_query = User.find_by_id('17');
		const count_query = User.count_documents({active: true});

		expect(find_query).toBeInstanceOf(QueryBuilder);
		expect(find_query.model).toBe(User);
		expect(find_query.operation).toBe('find');
		expect(find_query.base_filter).toEqual({active: true});

		expect(find_one_query.operation).toBe('find_one');
		expect(find_one_query.base_filter).toEqual({name: 'Nell'});

		expect(find_by_id_query.operation).toBe('find_one');
		expect(find_by_id_query.base_filter).toEqual({id: '17'});

		expect(count_query.operation).toBe('count_documents');
		expect(count_query.base_filter).toEqual({active: true});
	});

	test('create inserts single and array inputs through direct write path', async function () {
		const connection = {
			pool_instance: {
				query: jest.fn()
					.mockResolvedValueOnce({rows: [{id: '1', data: {name: 'Nell'}, created_at: new Date(), updated_at: new Date()}]})
					.mockResolvedValueOnce({rows: [{id: '2', data: {name: 'Draco'}, created_at: new Date(), updated_at: new Date()}]})
					.mockResolvedValueOnce({rows: [{id: '3', data: {name: 'Nell'}, created_at: new Date(), updated_at: new Date()}]})
			},
			options: {debug: false}
		};
		const User = create_model({name: String}, {}, {}, connection);
		const insert_spy = jest.spyOn(User.prototype, 'insert');

		const single_result = await User.create({name: 'Nell'});
		const list_result = await User.create([{name: 'Draco'}, {name: 'Nell'}]);

		expect(single_result).toBeInstanceOf(User);
		expect(single_result.document.data).toEqual({name: 'Nell'});
		expect(list_result).toHaveLength(2);
		expect(list_result[0].document.data).toEqual({name: 'Draco'});
		expect(list_result[1].document.data).toEqual({name: 'Nell'});
		expect(insert_spy).not.toHaveBeenCalled();
		expect(connection.pool_instance.query).toHaveBeenCalledTimes(3);

		insert_spy.mockRestore();
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
