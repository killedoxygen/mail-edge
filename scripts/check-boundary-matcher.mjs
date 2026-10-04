import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { Linter } from "eslint";
import tseslint from "typescript-eslint";

import { mailEdgeEslintPlugin } from "../config/eslint-rules.mjs";
import config from "../eslint.config.mjs";
import { repositoryRoot } from "./workspace.mjs";

const require = createRequire(import.meta.url);
const boundaries = require("eslint-plugin-boundaries");
const boundaryRequire = createRequire(require.resolve("eslint-plugin-boundaries"));
const elementsRequire = createRequire(boundaryRequire.resolve("@boundaries/elements"));
const matcher = elementsRequire("micromatch");

// Fixed compatibility vectors exercise the consumed operations, not a second glob engine.
for (const [input, pattern, expected] of [
  ["packages/core/src/index.ts", "packages/core/**/*", true],
  ["packages/core/src/index.ts", ["apps/**/*", "packages/**/*"], true],
  ["packages/core/src/index.ts", "!packages/core/**", false],
  ["apps/service/main.ts", "!packages/core/**", true],
  ["packages/core/index.ts", "{apps,packages,test}/**/*.ts", true],
  ["file2.ts", "file{1..3}.ts", true],
  ["file4.ts", "file{1..3}.ts", false],
  ["module-a.ts", "module-{a..c}.ts", true],
  ["index.ts", "!(*.test).ts", true],
  ["index.test.ts", "!(*.test).ts", false],
  [".private.ts", "*.ts", false],
]) {
  assert.equal(matcher.isMatch(input, pattern), expected, `${input}: ${JSON.stringify(pattern)}`);
}
assert.equal(matcher.isMatch(".private.ts", "*.ts", { dot: true }), true);
assert.equal(matcher.isMatch("INDEX.TS", "*.ts", { nocase: true }), true);
assert.deepEqual(matcher.capture("packages/*/src/*.{ts,js}", "packages/core/src/index.ts"), [
  "core",
  "index",
  "ts",
]);
assert.equal(matcher.capture("packages/*/src/*.ts", "apps/service/index.ts"), undefined);
assert.deepEqual(
  matcher.capture("packages/*/src/*.ts", "packages\\core\\src\\index.ts", { windows: true }),
  ["core", "index"],
);
assert.equal(matcher.makeRe("file{1..3}.ts").test("file2.ts"), true);
assert.equal(matcher.makeRe("file{1..3}.ts").test("file4.ts"), false);
assert.throws(() => matcher.isMatch("file.ts", {}), TypeError);

const boundaryConfig = config.find((entry) => entry.settings?.["boundaries/elements"]);
assert.ok(boundaryConfig, "The repository must retain its boundary configuration.");
const verify = (
  source,
  filename,
  settings = boundaryConfig.settings,
  rules = {
    ...boundaries.configs.strict.rules,
    "boundaries/no-ignored-dependencies": "off",
    "boundaries/dependencies": boundaryConfig.rules["boundaries/dependencies"],
    "mail-edge/workspace-imports": "error",
  },
) =>
  new Linter({ configType: "flat", cwd: settings["boundaries/root-path"] }).verify(
    source,
    {
      files: ["**/*.ts"],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaVersion: 2024, sourceType: "module" },
      },
      plugins: { boundaries, "mail-edge": mailEdgeEslintPlugin },
      settings,
      rules,
    },
    { filename },
  );
const ids = (messages) => messages.map((message) => message.ruleId).sort();
const sourceFile = resolve(repositoryRoot, "packages/core/src/index.ts");
for (const source of [
  'import { MailEdgeError } from "@mail-edge/contracts";',
  'export { MailEdgeError } from "@mail-edge/contracts";',
  'import("@mail-edge/contracts");',
  'import type { Result } from "@mail-edge/contracts";',
])
  assert.deepEqual(verify(source, sourceFile), [], source);
for (const source of [
  'import { MailEdgeSdk } from "@mail-edge/sdk";',
  'export { MailEdgeSdk } from "@mail-edge/sdk";',
  'import("@mail-edge/sdk");',
])
  assert.deepEqual(ids(verify(source, sourceFile)), ["mail-edge/workspace-imports"], source);
assert.ok(
  verify('import "@mail-edge/contracts/private";', sourceFile).some(
    (message) => message.messageId === "privateImport",
  ),
);
assert.ok(
  verify('import "../../contracts/src/index.js";', sourceFile).some(
    (message) => message.messageId === "crossRelative",
  ),
);
assert.ok(
  verify('import "./missing.js";', sourceFile).some(
    (message) => message.ruleId === "boundaries/no-unknown-dependencies",
  ),
);
assert.ok(
  verify(
    "export const value = 1;",
    resolve(repositoryRoot, "packages/unclassified/src/index.ts"),
  ).some((message) => message.ruleId === "boundaries/no-unknown-files"),
);

// Real local imports exercise captured element authority and dynamic selectors.
const fixtureRoot = mkdtempSync(join(tmpdir(), "mail-edge-boundaries-"));
try {
  for (const path of [
    "features/billing/index.ts",
    "features/billing/private/helper.ts",
    "features/account/index.ts",
  ]) {
    const filename = join(fixtureRoot, path);
    mkdirSync(dirname(filename), { recursive: true });
    writeFileSync(filename, "export const value = 1;\n");
  }
  const settings = {
    "boundaries/root-path": fixtureRoot,
    "boundaries/dependency-nodes": ["import", "dynamic-import", "export"],
    "boundaries/elements": [
      {
        type: "private",
        pattern: "features/*/private/*",
        capture: ["feature", "module"],
        mode: "full",
      },
      { type: "feature", pattern: "features/*", capture: ["feature"], mode: "folder" },
    ],
    "import/resolver": { node: { extensions: [".ts"] } },
  };
  const rules = {
    ...boundaries.configs.strict.rules,
    "boundaries/no-private": "error",
    "boundaries/dependencies": [
      "error",
      {
        default: "disallow",
        policies: [
          {
            from: { element: { type: "feature" } },
            allow: {
              to: {
                element: {
                  type: ["feature", "private"],
                  captured: { feature: "{{from.element.captured.feature}}" },
                },
              },
            },
          },
        ],
      },
    ],
  };
  const billing = join(fixtureRoot, "features/billing/index.ts");
  const account = join(fixtureRoot, "features/account/index.ts");
  assert.deepEqual(verify('import "./private/helper.ts";', billing, settings, rules), []);
  assert.deepEqual(ids(verify('import "../account/index.ts";', billing, settings, rules)), [
    "boundaries/dependencies",
  ]);
  assert.deepEqual(
    ids(verify('import "../billing/private/helper.ts";', account, settings, rules)),
    ["boundaries/dependencies"],
  );
  // A relative child descriptor retains the parent relationship used by no-private.
  const privateSettings = {
    ...settings,
    "boundaries/elements": [
      { type: "private", pattern: "private" },
      { type: "feature", pattern: "features/*", capture: ["feature"] },
    ],
  };
  const privateRules = { ...rules, "boundaries/dependencies": ["error", { default: "allow" }] };
  assert.deepEqual(
    verify('import "./private/helper.ts";', billing, privateSettings, privateRules),
    [],
  );
  assert.deepEqual(
    ids(verify('import "../billing/private/helper.ts";', account, privateSettings, privateRules)),
    ["boundaries/no-private"],
  );
} finally {
  rmSync(fixtureRoot, { force: true, recursive: true });
}
console.log("Boundary matcher compatibility and allowed/rejected real-import checks passed.");
