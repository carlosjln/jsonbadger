// `identity.mode` decides how a schema satisfies the declared identity config.
// `database` requires a native server path.
// `application` always uses the consumer-provided generator.
// `fallback` prefers the native server path and otherwise uses the generator.
const IDENTITY_MODE = Object.freeze({
	database: 'database',
	application: 'application',
	fallback: 'fallback'
});

export {
	IDENTITY_MODE
};

export default IDENTITY_MODE;
