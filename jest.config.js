module.exports = {
	// ts-jest in ESM mode to support ESM-style imports in source
	preset: "ts-jest/presets/default-esm",
	// Use Node test environment
	testEnvironment: "node",
	// Where tests live
	roots: ["<rootDir>/src/__tests__"],
	// Transform TypeScript with ts-jest in ESM mode so our ESM-style imports work
	transform: {
		"^.+\\.(ts|tsx)$": [
			"ts-jest",
			{
				useESM: true,
				tsconfig: "tsconfig.json",
			},
		],
	},
	// Map only relative .js imports in our source to extensionless so Jest resolves .ts
	moduleNameMapper: {
		"^(\\.{1,2}/.*)\\.js$": "$1",
	},
	// Treat .ts files as ESM for Jest runtime
	extensionsToTreatAsEsm: [".ts", ".tsx"],
};
