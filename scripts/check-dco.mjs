import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { readJson, repositoryRoot } from "./workspace.mjs";

const [base, head] = process.argv.slice(2);
if (base === undefined || head === undefined) {
  console.error("Usage: node scripts/check-dco.mjs <base-sha> <head-sha>");
  process.exit(2);
}

const supplemental = readJson(resolve(repositoryRoot, "config/supplemental-dco-attestations.json"));
assert.equal(supplemental.certificate, "DCO-1.1");
const attestations = new Map();
for (const entry of supplemental.attestations) {
  assert.match(entry.sha, /^[a-f0-9]{40}$/u);
  assert.equal(entry.certificate, "DCO-1.1");
  for (const key of ["authorName", "authorEmail", "subject", "statement", "signedOffBy"]) {
    assert.ok(typeof entry[key] === "string" && entry[key].length > 0);
  }
  assert.equal(entry.signedOffBy, `${entry.authorName} <${entry.authorEmail}>`);
  assert.ok(!attestations.has(entry.sha), "Supplemental DCO records must be unique.");
  attestations.set(entry.sha, entry);
}
let supplementalCount = 0;

const commits = execFileSync("git", ["rev-list", "--no-merges", `${base}..${head}`], {
  cwd: repositoryRoot,
  encoding: "utf8",
})
  .trim()
  .split("\n")
  .filter(Boolean);
const failures = [];

for (const commit of commits) {
  const [authorName, authorEmail, subject] = execFileSync(
    "git",
    ["show", "--no-patch", "--format=%an%n%ae%n%s", commit],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  )
    .trimEnd()
    .split(/\n/u, 3);
  const signoffs = execFileSync(
    "git",
    ["show", "--no-patch", "--format=%(trailers:key=Signed-off-by,valueonly)", commit],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  const authorSigned = signoffs
    .split("\n")
    .some((signoff) => signoff.toLowerCase().includes(`<${authorEmail.toLowerCase()}>`));

  const attestation = attestations.get(commit);
  if (attestation !== undefined) {
    assert.equal(attestation.authorName, authorName);
    assert.equal(attestation.authorEmail, authorEmail);
    assert.equal(attestation.subject, subject);
  }
  if (!authorSigned && attestation !== undefined) {
    supplementalCount += 1;
    console.log(`Author-supplied DCO attestation: ${commit} ${attestation.signedOffBy}`);
  } else if (!authorSigned) {
    failures.push(`${commit.slice(0, 12)} ${subject ?? ""}`.trim());
  }
}

console.log(`${supplementalCount} exact supplemental author attestations recognized.`);

if (failures.length > 0) {
  console.error(`Commits missing an author DCO sign-off:\n${failures.join("\n")}`);
  process.exitCode = 1;
} else {
  console.log(
    `${commits.length} commits contain author DCO sign-offs or exact supplemental attestations.`,
  );
}
