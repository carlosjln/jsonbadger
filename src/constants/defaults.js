import ID_STRATEGY from '#src/constants/id-strategy.js';

// TODO: add `model_options.timestamps` as a real config flag and wire its behavior
// through model lifecycle defaults, docs, and update/insert timestamp handling.
const DEFAULT_SLUG = 'data';

const defaults = {
	connection_options: {
		max: 10,
		debug: false
	},

	schema_options: {
		strict: true,
		id_strategy: ID_STRATEGY.bigserial,
		auto_index: true,

		default_slug: DEFAULT_SLUG,
		slugs: [],
		/*
		timestamps: true,
		*/
	},

	model_options: {
		table_name: null,

		// TODO: we'll deal with data_column later
		data_column: DEFAULT_SLUG,

	}
};

export default defaults;
