import connect from '#src/connection/connect.js';
import ID_STRATEGY from '#src/constants/id-strategy.js';
import Schema from '#src/schema/schema.js';
import field_type from '#src/field-types/field-type-namespace.js';
import {boolean_convert_to_false, boolean_convert_to_true, uuidv7_type_reference} from '#src/field-types/builtins/index.js';

const jsonbadger = {
	ID_STRATEGY,
	connect,
	field_type,
	Schema,
	field_types: {
		UUIDv7: uuidv7_type_reference,
		boolean_convert_to_true,
		boolean_convert_to_false
	}
};

export {
	ID_STRATEGY,
	connect,
	field_type,
	Schema
};

export default jsonbadger;
