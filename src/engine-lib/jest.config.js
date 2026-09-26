module.exports = {
  roots: ["<rootDir>/src"],
  testEnvironment: "node",
  collectCoverage: true,
  coverageDirectory: "coverage",
  testMatch: ["**/*.test.js", "**/*.test.ts"],
  transform: {
    "^.+\\.tsx?$": "ts-jest",
  },
};
