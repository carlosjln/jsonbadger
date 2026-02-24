import connect from '#src/connection/connect.js';
import disconnect from '#src/connection/disconnect.js';
import IdStrategies from '#src/constants/id-strategies.js';
import Schema from '#src/schema/schema.js';
import model from '#src/model/model-factory.js';
import {create_field_type, register_field_type, resolve_field_type} from '#src/field-types/registry.js';
import {boolean_convert_to_false, boolean_convert_to_true, uuidv7_type_reference} from '#src/field-types/builtins/index.js';

const jsonbadger = {
	connect,
	disconnect,
	model,
	create_field_type,
	register_field_type,
	resolve_field_type,
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
	model,
	create_field_type,
	register_field_type,
	resolve_field_type,
	Schema,
	IdStrategies
};

export default jsonbadger;
