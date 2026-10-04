# Boundary matcher adapter

This private development package preserves the three Micromatch 4.0.8 operations used by
`eslint-plugin-boundaries` 7.2.0 and `@boundaries/elements` 3.1.1: `isMatch`, `makeRe` and
`capture`. It uses the same pinned Picomatch 2.3.2 engine and preserves options, arrays, negation,
captures (including unmatched captures and Windows paths), extglobs and the brace/range matching
behavior of those operations. It performs no brace expansion or AST walking and has no dependency on
Braces. It is not a general Micromatch replacement.

The pnpm overrides target only those exact consumer versions. A new consumer/version needs source
review and behavioral verification before using this adapter. The boundary plugin, strict rules,
policies and resolver remain unchanged. See the immutable source identity in `provenance.json` and
the original MIT notice in `LICENSE`.

Run `pnpm lint:rules` for observable real-import and matcher compatibility checks, and
`pnpm lint:boundaries` for the complementary repository dependency graph checks.
