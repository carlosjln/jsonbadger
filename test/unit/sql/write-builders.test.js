import {describe, expect, test} from '@jest/globals';

import {bind_parameter, create_parameter_state} from '#src/sql/parameter-binder.js';
import build_delete_query from '#src/sql/write/build-delete-query.js';
import build_insert_query from '#src/sql/write/build-insert-query.js';
import build_update_query from '#src/sql/write/build-update-query.js';

describe('SQL write builder lifecycle', function () {
	test('build_insert_query omits id when the base fields do not include one', function () {
		const created_at = new Date('2026-03-31T10:00:00.000Z');
		const updated_at = new Date('2026-03-31T11:00:00.000Z');
		const insert_query = build_insert_query({
			table_identifier: '"users"',
			data_identifier: '"data"',
			payload: {
				name: 'alice'
			},
			identity_runtime: {
				type: 'bigint',
				requires_explicit_id: false
			},
			base_fields: {
				created_at,
				updated_at
			}
		});

		expect(insert_query.sql_text).toContain('INSERT INTO "users" ("data", created_at, updated_at)');
		expect(insert_query.sql_text).not.toContain(', id,');
		expect(insert_query.sql_params).toEqual([
			'{"name":"alice"}',
			created_at,
			updated_at
		]);
	});

	test('build_insert_query omits timestamp columns when base fields do not include them', function () {
		const insert_query = build_insert_query({
			table_identifier: '"users"',
			data_identifier: '"data"',
			payload: {
				name: 'alice'
			},
			identity_runtime: {
				type: 'bigint',
				requires_explicit_id: false
			},
			base_fields: {}
		});

		expect(insert_query.sql_text).toContain('INSERT INTO "users" ("data") VALUES ($1::jsonb)');
		expect(insert_query.sql_text).not.toContain('("data", created_at');
		expect(insert_query.sql_text).not.toContain('("data", updated_at');
		expect(insert_query.sql_params).toEqual([
			'{"name":"alice"}'
		]);
	});

	test('build_insert_query includes explicit timestamp columns independently', function () {
		const updated_at = new Date('2026-03-31T11:00:00.000Z');
		const insert_query = build_insert_query({
			table_identifier: '"users"',
			data_identifier: '"data"',
			payload: {
				name: 'alice'
			},
			identity_runtime: {
				type: 'bigint',
				requires_explicit_id: false
			},
			base_fields: {
				updated_at
			}
		});

		expect(insert_query.sql_text).toContain('INSERT INTO "users" ("data", updated_at)');
		expect(insert_query.sql_text).not.toContain('("data", created_at');
		expect(insert_query.sql_params).toEqual([
			'{"name":"alice"}',
			updated_at
		]);
	});

	test('build_insert_query includes the uuid id column when one is present', function () {
		const created_at = new Date('2026-03-31T10:00:00.000Z');
		const updated_at = new Date('2026-03-31T11:00:00.000Z');
		const insert_query = build_insert_query({
			table_identifier: '"users"',
			data_identifier: '"data"',
			payload: {
				name: 'alice'
			},
			identity_runtime: {
				type: 'uuid',
				requires_explicit_id: true
			},
			base_fields: {
				id: '019631f7-ef80-7c17-8cf0-a9b241551111',
				created_at,
				updated_at
			}
		});

		expect(insert_query.sql_text).toContain('("data", id, created_at, updated_at)');
		expect(insert_query.sql_text).toContain('$2::uuid');
		expect(insert_query.sql_params).toEqual([
			'{"name":"alice"}',
			'019631f7-ef80-7c17-8cf0-a9b241551111',
			created_at,
			updated_at
		]);
	});

	test('build_delete_query returns the final handoff contract unchanged', function () {
		const delete_query = build_delete_query({
			table_identifier: '"users"',
			data_identifier: '"payload"',
			where_result: {
				sql: `"payload" ->> 'name' = $1`,
				params: ['alice']
			}
		});

		expect(delete_query.sql_text).toContain('WITH target_row AS (SELECT id FROM "users" WHERE "payload" ->> \'name\' = $1 LIMIT 1)');
		expect(delete_query.sql_text).toContain('RETURNING target_table.id::text AS id, target_table."payload" AS data');
		expect(delete_query.sql_params).toEqual(['alice']);
	});

	test('build_update_query merges where params, compiled jsonb params, and timestamps in order', function () {
		const updated_at = new Date('2026-03-31T12:00:00.000Z');
		const parameter_state = create_parameter_state(2);
		const update_query = build_update_query({
			table_identifier: '"users"',
			data_identifier: '"data"',
			update_expression: {
				jsonb_ops: {
					compile(state) {
						const placeholder = bind_parameter(state, '"alice"');
						return `jsonb_set("data", '{name}', ${placeholder}::jsonb, true)`;
					}
				},
				timestamp_set: {
					updated_at
				}
			},
			parameter_state,
			where_result: {
				sql: '"id" = $1',
				params: ['17']
			}
		});

		expect(update_query.sql_text).toContain('SET "data" = jsonb_set("data", \'{name}\', $2::jsonb, true), updated_at = $3::timestamptz');
		expect(update_query.sql_text).toContain('WHERE target_table.id = target_row.id');
		expect(update_query.sql_params).toEqual([
			'17',
			'"alice"',
			updated_at
		]);
	});

	test('build_update_query includes created_at assignments when explicitly provided', function () {
		const created_at = new Date('2026-03-31T10:00:00.000Z');
		const updated_at = new Date('2026-03-31T12:00:00.000Z');
		const parameter_state = create_parameter_state(2);
		const update_query = build_update_query({
			table_identifier: '"users"',
			data_identifier: '"data"',
			update_expression: {
				jsonb_ops: {
					compile(state) {
						const placeholder = bind_parameter(state, '"alice"');
						return `jsonb_set("data", '{name}', ${placeholder}::jsonb, true)`;
					}
				},
				timestamp_set: {
					created_at,
					updated_at
				}
			},
			parameter_state,
			where_result: {
				sql: '"id" = $1',
				params: ['17']
			}
		});

		expect(update_query.sql_text).toContain('created_at = $3::timestamptz');
		expect(update_query.sql_text).toContain('updated_at = $4::timestamptz');
		expect(update_query.sql_params).toEqual([
			'17',
			'"alice"',
			created_at,
			updated_at
		]);
	});
});
