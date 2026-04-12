import ID_STRATEGY from '#src/constants/id-strategy.js';
import {assert_condition} from '#src/utils/assert.js';

function assert_id_strategy_capability(id_strategy, server_capabilities) {
	if(id_strategy !== ID_STRATEGY.uuidv7) {
		return;
	}

	assert_condition(
		server_capabilities && typeof server_capabilities === 'object',
		'PostgreSQL server capabilities are unavailable. Reconnect so jsonbadger can run compatibility checks for id_strategy=uuidv7.'
	);

	assert_condition(server_capabilities.supports_uuidv7 === true, build_uuidv7_capability_error(server_capabilities));
}

function build_uuidv7_capability_error(server_capabilities) {
	const server_version = server_capabilities.server_version ?? 'unknown';
	const server_version_num = server_capabilities.server_version_num ?? 'unknown';
	const supports_uuidv7 = server_capabilities.supports_uuidv7 === true ? 'true' : 'false';

	return 'id_strategy=uuidv7 requires PostgreSQL native uuidv7() support (PostgreSQL 18+). ' +
		'Detected server_version=' + server_version + ', server_version_num=' + server_version_num +
		', supports_uuidv7=' + supports_uuidv7 + '.';
}

export {
	assert_id_strategy_capability
};
