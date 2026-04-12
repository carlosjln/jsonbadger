export default {
	testEnvironment: 'node',
	transform: {},
	roots: ['<rootDir>/test'],
	moduleNameMapper: {
		'^#src/(.*)$': '<rootDir>/src/$1',
		'^#test/(.*)$': '<rootDir>/test/$1'
	},
	testPathIgnorePatterns: ['<rootDir>/releases/', '<rootDir>/test/.archive/'],
	coverageProvider: 'v8',
	coverageDirectory: 'test/coverage',
	coverageReporters: ['text-summary', 'lcov', 'json-summary']
};
