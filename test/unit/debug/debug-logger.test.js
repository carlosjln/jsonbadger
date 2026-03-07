import {afterEach, beforeEach, describe, expect, jest, test} from '@jest/globals';

const console_log_spy = jest.spyOn(console, 'log').mockImplementation(function () {
});

const {default: debug_logger} = await import('#src/debug/debug-logger.js');

describe('debug_logger', function () {
	beforeEach(function () {
		console_log_spy.mockClear();
	});

	afterEach(function () {
		console_log_spy.mockClear();
	});

	test('does nothing when debug mode is disabled', function () {
		debug_logger(false, 'connection_ready', {ok: true});

		expect(console_log_spy).not.toHaveBeenCalled();
	});

	test('logs a formatted JSON payload when debug mode is enabled', function () {
		debug_logger(true, 'connection_ready', {
			max: 10
		});

		expect(console_log_spy).toHaveBeenCalledTimes(1);

		const output_value = console_log_spy.mock.calls[0][0];
		expect(output_value.startsWith('[jsonbadger][debug] ')).toBe(true);

		const log_entry = JSON.parse(output_value.replace('[jsonbadger][debug] ', ''));
		expect(log_entry.event_name).toBe('connection_ready');
		expect(log_entry.event_data).toEqual({max: 10});
		expect(Number.isNaN(new Date(log_entry.created_at).getTime())).toBe(false);
	});

	test('normalizes missing event data to null', function () {
		debug_logger(true, 'connection_closed');

		const output_value = console_log_spy.mock.calls[0][0];
		const log_entry = JSON.parse(output_value.replace('[jsonbadger][debug] ', ''));

		expect(log_entry.event_data).toBeNull();
	});
});
