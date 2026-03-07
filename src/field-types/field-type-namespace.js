import {register, resolve} from '#src/field-types/registry.js';

const field_type = Object.freeze({
	register,
	resolve
});

export default field_type;
export {field_type};
