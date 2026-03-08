import connect from '#src/connection/connect.js';
import disconnect from '#src/connection/disconnect.js';
import IdStrategies from '#src/constants/id-strategies.js';
import Schema from '#src/schema/schema.js';
import field_type from '#src/field-types/field-type-namespace.js';
import {boolean_convert_to_false, boolean_convert_to_true, uuidv7_type_reference} from '#src/field-types/builtins/index.js';

const jsonbadger = {
	connect,
	disconnect,
	field_type,
	Schema,
	IdStrategies,
	field_types: {
		UUIDv7: uuidv7_type_reference,
		boolean_convert_to_true,
		boolean_convert_to_false
	}
};

export {
	connect,
	disconnect,
	field_type,
	Schema,
	IdStrategies
};

export default jsonbadger;
