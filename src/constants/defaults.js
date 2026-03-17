import IdStrategies from '#src/constants/id-strategies.js';

const defaults = {
	connection_options: {
		max: 10,
		debug: false
	},

	schema_options: {
		strict: true,
		id_strategy: IdStrategies.bigserial,
		auto_index: true
	},

	model_options: {
		table_name: null,
		data_column: 'data'
	}
};

export default defaults;
