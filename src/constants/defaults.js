import IDENTITY_MODE from '#src/constants/identity-mode.js';
import IDENTITY_TYPE from '#src/constants/identity-type.js';

// TODO: add `model_options.timestamps` as a real config flag and wire its behavior
// through model lifecycle defaults, docs, and update/insert timestamp handling.
const DEFAULT_SLUG = 'data';

const defaults = {
	connection_options: {
		max: 10,
		debug: false
	},

	schema_options: {
		identity: {
			type: IDENTITY_TYPE.bigint,
			format: null,
			mode: IDENTITY_MODE.fallback,
			generator: null
		},

		// Temporary internal convergence field for current id_strategy consumers.
		// Remove once T4-T17 finish the identity rollout.
		id_strategy: 'bigserial',
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
