import {assert_condition} from '#src/utils/assert.js';

const IdStrategies = Object.freeze({
	bigserial: 'bigserial',
	uuidv7: 'uuidv7'
});

const id_strategy_values = Object.freeze(Object.values(IdStrategies));

function is_valid(id_strategy) {
	return id_strategy_values.includes(id_strategy);
}

function id_strategy_error() {
	return 'id_strategy must be one of: ' + id_strategy_values.join(', ');
}

// TODO: consider moving this to assert file
function assert_valid_id_strategy(id_strategy) {
	assert_condition(is_valid(id_strategy), id_strategy_error());
}

export {
	IdStrategies,
	is_valid,
	assert_valid_id_strategy
};

export default IdStrategies;
