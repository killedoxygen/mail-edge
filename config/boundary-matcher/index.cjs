// Derived from micromatch 4.0.8 isMatch, makeRe and capture. See LICENSE and provenance.json.
const picomatch = require("picomatch");
const utils = require("picomatch/lib/utils");

const isMatch = (input, patterns, options) => picomatch(patterns, options)(input);
const makeRe = (...args) => picomatch.makeRe(...args);
const capture = (glob, input, options) => {
  const regex = picomatch.makeRe(String(glob), { ...options, capture: true });
  const match = regex.exec(utils.isWindows(options) ? utils.toPosixSlashes(input) : input);
  return match?.slice(1).map((value) => (value === undefined ? "" : value));
};

module.exports = Object.freeze({ isMatch, makeRe, capture });
