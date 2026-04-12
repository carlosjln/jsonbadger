import {describe, expect, test} from '@jest/globals';

import defaults from '#src/constants/defaults.js';

describe('defaults', function () {
	test('defines identity defaults under schema options', function () {
		expect(defaults.schema_options.identity).toEqual({
			type: 'bigint',
			format: null,
			mode: 'fallback',
			generator: null
		});
	});
});
