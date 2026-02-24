import fs from 'node:fs';
import path from 'node:path';

import joi from 'joi';

let cached_config = null;

export default function local_env_config() {
	if(cached_config) {
		return cached_config;
	}

	const dotenv_data = read_dotenv_file(path.resolve(process.cwd(), '.env'));
	const merged_env = Object.assign({}, dotenv_data, process.env);

	const env_schema = joi.object({
		APP_POSTGRES_URI: joi.string().uri({scheme: ['postgres', 'postgresql']}).required(),
		APP_POSTGRES_SSL: joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
		APP_DEBUG: joi.boolean().truthy('true').truthy('1').falsy('false').falsy('0').default(false),
		APP_POOL_MAX: joi.number().integer().min(1).max(100).default(10)
	}).unknown(true);

	const validation_result = env_schema.validate(merged_env, {
		abortEarly: false,
		convert: true
	});

	if(validation_result.error) {
		throw validation_result.error;
	}

	const env_data = validation_result.value;
	const ssl_value = env_data.APP_POSTGRES_SSL ? {rejectUnauthorized: false} : false;

	cached_config = Object.freeze({
		postgres: Object.freeze({
			uri: env_data.APP_POSTGRES_URI,
			ssl: ssl_value,
			pool_max: env_data.APP_POOL_MAX
		}),
		jsonbadger: Object.freeze({
			debug: env_data.APP_DEBUG
		})
	});

	return cached_config;
}

function read_dotenv_file(file_path) {
	if(!fs.existsSync(file_path)) {
		return {};
	}

	const file_content = fs.readFileSync(file_path, 'utf8');
	const line_list = file_content.split(/\r?\n/);
	const parsed_env = {};
	let line_index = 0;

	while(line_index < line_list.length) {
		const raw_line = line_list[line_index];
		const line_value = raw_line.trim();

		if(!line_value || line_value.startsWith('#')) {
			line_index += 1;
			continue;
		}

		const separator_index = line_value.indexOf('=');

		if(separator_index <= 0) {
			line_index += 1;
			continue;
		}

		const key_value = line_value.slice(0, separator_index).trim();
		const value_value = line_value.slice(separator_index + 1).trim();

		parsed_env[key_value] = normalize_env_value(value_value);
		line_index += 1;
	}

	return parsed_env;
}

function normalize_env_value(raw_value) {
	if(
		(raw_value.startsWith('"') && raw_value.endsWith('"')) ||
		(raw_value.startsWith("'") && raw_value.endsWith("'"))
	) {
		return raw_value.slice(1, -1);
	}

	return raw_value;
}
