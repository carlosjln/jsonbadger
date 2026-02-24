import IdStrategies from '#src/constants/id-strategies.js';

const defaults = {
	connection_options: {
		max: 10,
		debug: false,
		auto_index: true,
		id_strategy: IdStrategies.bigserial
	},

	schema_options: {},
	model_options: {
		table_name: null,
		data_column: 'data',
		auto_index: null,
		id_strategy: null
	}
};

export default defaults;
