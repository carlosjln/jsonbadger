import IdStrategies from '#src/constants/id-strategies.js';

// TODO: add `model_options.timestamps` as a real config flag and wire its behavior
// through model lifecycle defaults, docs, and update/insert timestamp handling.
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
		data_column: 'data',
		/*
		timestamps: true,
		*/
	}
};

export default defaults;
