module.exports = {
  "testEnvironment": "node",
  "transform": {
      "^.+\\.tsx?$": "ts-jest"
  },
  "testRegex": "(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$",
  "moduleFileExtensions": [
      "ts",
      "tsx",
      "js",
      "jsx",
      "json",
      "node"
  ],
  "collectCoverage": true,
  "collectCoverageFrom": ["src/**/*.{ts,js}"]
}
