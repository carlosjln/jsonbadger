import connect from '#src/connection/connect.js';
import defaults from '#src/constants/defaults.js';
import IDENTITY_FORMAT from '#src/constants/identity-format.js';
import IDENTITY_MODE from '#src/constants/identity-mode.js';
import IDENTITY_TYPE from '#src/constants/identity-type.js';
import Schema from '#src/schema/schema.js';
import field_type from '#src/field-types/field-type-namespace.js';
import {boolean_convert_to_false, boolean_convert_to_true, uuidv7_type_reference} from '#src/field-types/builtins/index.js';

const jsonbadger = {
	IDENTITY_TYPE,
	IDENTITY_FORMAT,
	IDENTITY_MODE,
	defaults,
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
	IDENTITY_TYPE,
	IDENTITY_FORMAT,
	IDENTITY_MODE,
	defaults,
	connect,
	field_type,
	Schema
};

export default jsonbadger;
