import {assert_condition} from '#src/utils/assert.js';
import IDENTITY_FORMAT from '#src/constants/identity-format.js';

const ID_STRATEGY = Object.freeze({
	bigserial: 'bigserial',
	uuidv7: IDENTITY_FORMAT.uuidv7
});

const id_strategy_values = Object.freeze(Object.values(ID_STRATEGY));

function is_valid(id_strategy) {
	return id_strategy_values.includes(id_strategy);
}

function id_strategy_error() {
	return 'id_strategy must be one of: ' + id_strategy_values.join(', ');
}

function assert_id_strategy(id_strategy) {
	assert_condition(is_valid(id_strategy), id_strategy_error());
}

export {
	ID_STRATEGY,
	is_valid,
	assert_id_strategy
};

export default ID_STRATEGY;
