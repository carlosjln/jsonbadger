export default {
	testEnvironment: 'node',
	transform: {},
	moduleNameMapper: {
		'^#src/(.*)$': '<rootDir>/src/$1',
		'^#test/(.*)$': '<rootDir>/test/$1'
	},
	coverageProvider: 'v8',
	coverageDirectory: 'test/coverage',
	coverageReporters: ['text-summary', 'lcov', 'json-summary']
};
