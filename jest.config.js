/** @type {import('ts-jest').JestConfigWithTsJest} **/

// Use a concrete timezone
process.env.TZ = "UTC";
// Eastern isn't the configured test account TZ so it works better than Pacific
// process.env.TZ = "US/Eastern";

module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+.tsx?$": ["ts-jest", {}],
  },
};