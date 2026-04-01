import {beforeEach, describe, expect, jest, test} from '@jest/globals';

const sql_runner_mock = jest.fn();

jest.unstable_mockModule('#src/sql/run.js', function () {
	return {
		default: sql_runner_mock
	};
});

const {default: Schema} = await import('#src/schema/schema.js');
const {default: model} = await import('#src/model/factory/index.js');

describe('Model.update_one gateway normalization', function () {
	let connection;

	beforeEach(function () {
		sql_runner_mock.mockReset();
		sql_runner_mock.mockResolvedValue({rows: []});
		connection = {
			pool_instance: {query: jest.fn()},
			options: {debug: false}
		};
	});

	test('returns null when update_definition is undefined', async function () {
		const User = create_model(new Schema({name: String}), connection);
		const result = await User.update_one({}, undefined);

		expect(result).toBeNull();
		expect(sql_runner_mock).not.toHaveBeenCalled();
	});

	test('accepts a null query filter and compiles WHERE TRUE', async function () {
		const User = create_model(new Schema({active: Boolean}), connection);

		await User.update_one(null, {
			$set: {
				active: true
			}
		});

		expect(sql_runner_mock.mock.calls[0][0]).toContain('WHERE TRUE');
	});

	test('rejects invalid operator payload types and unsupported operators', async function () {
		const User = create_model(new Schema({name: String}), connection);

		await expect(User.update_one({}, {$set: 1})).rejects.toThrow('$set expects plain object');
		await expect(User.update_one({}, {$unset: 1})).rejects.toThrow('$unset expects array');
		await expect(User.update_one({}, {$insert: 1})).rejects.toThrow('Unsupported JSONB operator: $insert');
	});

	test('expands dotted keys inside $set and leaves non-object operators unchanged', async function () {
		const User = create_model(new Schema({
			profile: {
				city: String
			}
		}), connection);

		await User.update_one({}, {
			$set: {
				'profile.city': 'Madrid'
			},
			$unset: ['profile.legacy']
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain(`'{"profile","city"}'`);
		expect(sql_text).toContain('#-');
		expect(sql_params).toEqual([
			'"Madrid"'
		]);
	});

	test('expands dotted keys inside $replace_roots before SQL compilation', async function () {
		const User = create_model(new Schema({
			profile: {
				city: String
			}
		}), connection);

		await User.update_one({}, {
			$replace_roots: {
				'profile.city': 'Madrid'
			}
		});

		expect(sql_runner_mock.mock.calls[0][1]).toEqual([
			'{"profile":{"city":"Madrid"}}'
		]);
	});

	test('merges tracker set payloads into $set and strips the tracked root prefix', async function () {
		const User = create_model(new Schema({
			name: String,
			profile: {
				city: String
			}
		}), connection);

		await User.update_one({}, {
			$set: {
				name: 'alice'
			},
			set: {
				'data.profile.city': 'Madrid'
			},
			replace_roots: {}
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain(`'{"name"}'`);
		expect(sql_text).toContain(`'{"profile","city"}'`);
		expect(sql_params).toEqual([
			'"alice"',
			'"Madrid"'
		]);
	});

	test('merges implicit root updates into an existing $set bucket', async function () {
		const User = create_model(new Schema({
			name: String,
			profile: {
				city: String
			}
		}), connection);

		await User.update_one({}, {
			$set: {
				name: 'alice'
			},
			profile: {
				city: 'Madrid'
			}
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain(`'{"name"}'`);
		expect(sql_text).toContain(`'{"profile","city"}'`);
		expect(sql_params).toEqual([
			'"alice"',
			'"Madrid"'
		]);
	});

	test('routes tracker root replacement through $replace_roots for the data column only', async function () {
		const User = create_model(new Schema({name: String}), connection);

		await User.update_one({}, {
			replace_roots: {
				data: {
					name: 'replaced'
				},
				settings: {
					theme: 'ignored'
				}
			}
		});

		expect(sql_runner_mock.mock.calls[0][1]).toEqual([
			'{"name":"replaced"}'
		]);
		expect(sql_runner_mock.mock.calls[0][0]).not.toContain('settings');
	});

	test('keeps tracker replace_roots untouched when the tracked data column is missing', async function () {
		const User = create_model(new Schema({name: String}), connection);

		await User.update_one({}, {
			replace_roots: {
				settings: {
					theme: 'dark'
				}
			}
		});

		expect(sql_runner_mock.mock.calls[0][0]).toContain('UPDATE "users" AS target_table');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('maps tracker root unsets to an empty root replacement payload', async function () {
		const User = create_model(new Schema({name: String}), connection);

		await User.update_one({}, {
			unset: ['data']
		});

		expect(sql_runner_mock.mock.calls[0][0]).toContain('UPDATE "users" AS target_table');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('maps tracker unset entries into an explicit $unset bucket for nested paths', async function () {
		const User = create_model(new Schema({
			profile: {
				city: String
			}
		}), connection);

		await User.update_one({}, {
			unset: ['data.profile.city']
		});

		expect(sql_runner_mock.mock.calls[0][0]).toContain('#-');
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('keeps tracker unset paths unchanged when they do not start with the tracked root', async function () {
		const User = create_model(new Schema({
			profile: {
				city: String
			},
			settings: {
				theme: String
			}
		}), connection);

		await User.update_one({}, {
			unset: ['settings.theme']
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];

		expect(sql_text).toContain(`'{"settings","theme"}'`);
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('merges tracker unset entries into an existing $unset array', async function () {
		const User = create_model(new Schema({
			profile: {
				city: String,
				legacy: String
			}
		}), connection);

		await User.update_one({}, {
			$unset: ['profile.legacy'],
			unset: ['data.profile.city']
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];

		expect(sql_text).toContain(`'{"profile","legacy"}'`);
		expect(sql_text).toContain(`'{"profile","city"}'`);
		expect(sql_runner_mock.mock.calls[0][1]).toEqual([]);
	});

	test('pulls row timestamps out of tracker set payloads before JSONB compilation', async function () {
		const User = create_model(new Schema({name: String}), connection);
		const next_updated_at = '2026-03-31T12:00:00.000Z';

		await User.update_one({id: '21'}, {
			set: {
				'data.name': 'alice',
				updated_at: next_updated_at
			}
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain('updated_at =');
		expect(sql_params).toEqual([
			'21',
			'"alice"',
			next_updated_at
		]);
	});

	test('keeps empty plain objects as leaf replacements while flattening nested updates', async function () {
		const User = create_model(new Schema({
			profile: {
				meta: {
					empty: Object
				}
			}
		}), connection);

		await User.update_one({}, {
			profile: {
				meta: {}
			}
		});

		const sql_text = sql_runner_mock.mock.calls[0][0];
		const sql_params = sql_runner_mock.mock.calls[0][1];

		expect(sql_text).toContain(`'{"profile","meta"}'`);
		expect(sql_params).toEqual([
			'{}'
		]);
	});

	test('returns a hydrated document when update_one receives a row', async function () {
		sql_runner_mock.mockResolvedValueOnce({
			rows: [{
				id: '12',
				data: {
					name: 'alice'
				},
				created_at: new Date('2026-04-01T10:00:00.000Z'),
				updated_at: new Date('2026-04-01T11:00:00.000Z')
			}]
		});

		const User = create_model(new Schema({name: String}), connection);
		const updated_document = await User.update_one({}, {
			$set: {
				name: 'alice'
			}
		});

		expect(updated_document).toBeInstanceOf(User);
		expect(updated_document.document.data).toEqual({
			name: 'alice'
		});
	});
});

function create_model(schema_instance, connection) {
	return model('User', schema_instance, {
		table_name: 'users'
	}, connection);
}
