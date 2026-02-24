import safe_json_stringify from '#src/utils/json-safe.js';

export default function debug_logger(debug_mode, event_name, event_data) {
	if(!debug_mode) {
		return;
	}

	const log_entry = {
		event_name: event_name,
		event_data: event_data || null,
		created_at: new Date().toISOString()
	};

	console.log('[jsonbadger][debug] ' + safe_json_stringify(log_entry));
}
