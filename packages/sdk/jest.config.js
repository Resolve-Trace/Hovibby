/** @type {import('jest').Config} */
export default {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  extensionsToTreatAsEsm: [".ts"],
  testMatch: ["**/src/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    // Use built dist packages — avoids rootDir issues with ts-jest
    "^@resolvetrace/protocol$": "<rootDir>/../../packages/protocol/dist/index.js",
    "^@resolvetrace/storage$": "<rootDir>/../../packages/storage/dist/index.js",
  },
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: {
          module: "ESNext",
          moduleResolution: "bundler",
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
      },
    ],
  },
};
