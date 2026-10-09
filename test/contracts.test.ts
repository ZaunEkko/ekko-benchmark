import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PACKAGE_NAME, VERSION } from "../src/meta.js";
import { PROFILES } from "../src/static/profiles.js";
import { RULES } from "../src/static/rules.js";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "..", "..");

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(root, relative), "utf8")) as Record<string, unknown>;
}

function filesUnder(relative: string): string[] {
  const base = path.join(root, relative);
  return fs.readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

test("package metadata stays aligned with runtime metadata", () => {
  const manifest = readJson("package.json");
  const bin = manifest.bin as Record<string, unknown>;
  const scripts = manifest.scripts as Record<string, unknown>;

  assert.equal(manifest.name, PACKAGE_NAME);
  assert.equal(manifest.version, VERSION);
  assert.equal(manifest.license, "MIT");
  assert.match(String(manifest.description), /Coding Agent software/);
  assert.equal(bin["ekko-benchmark"], "./dist/bin.js");
  assert.equal(scripts.prebenchmark, "npm run build --silent");
  assert.equal(scripts.benchmark, "node ./dist/bin.js");
});

test("all shipped JSON schemas and examples are valid JSON", () => {
  for (const relative of ["schemas", "examples"]) {
    for (const file of filesUnder(relative).filter((candidate) => candidate.endsWith(".json"))) {
      assert.doesNotThrow(() => JSON.parse(fs.readFileSync(file, "utf8")), path.relative(root, file));
    }
  }
});

test("the static rule catalog documents every implemented rule", () => {
  const catalog = fs.readFileSync(path.join(root, "docs", "rules.md"), "utf8");

  for (const rule of RULES) {
    assert.match(catalog, new RegExp("\\| `" + rule.id.replaceAll(".", "\\.") + "` \\|"));
  }
});

test("profile weights and static report dimensions stay aligned", () => {
  const schema = readJson("schemas/static-report.schema.json");
  const definitions = schema.$defs as Record<string, Record<string, unknown>>;
  const schemaDimensions = new Set(definitions.dimensionId.enum as string[]);

  for (const profile of Object.values(PROFILES)) {
    assert.equal(Object.values(profile.dimensions).reduce((sum, weight) => sum + weight, 0), 100, profile.id);
    assert.deepEqual(new Set(Object.keys(profile.dimensions)), schemaDimensions, profile.id);
  }

  assert.equal(PROFILES["personal-local-multirepo"].dimensions.safety, 10);
  assert.equal(PROFILES["team-shared-repo"].dimensions.safety, 10);
  assert.equal(PROFILES["personal-local-multirepo"].dimensions.verification, 18);
  assert.equal(PROFILES["team-shared-repo"].dimensions.verification, 18);
});

test("static report schema exposes one score and a non-scoring core assessment", () => {
  const schema = readJson("schemas/static-report.schema.json");
  const definitions = schema.$defs as Record<string, Record<string, unknown>>;
  const required = definitions.staticReadiness.required as string[];

  assert.ok(required.includes("score"));
  assert.ok(required.includes("core"));
  assert.equal(required.includes("weightedScore"), false);
  assert.ok(definitions.coreAssessment);
  const properties = definitions.staticReadiness.properties as Record<string, Record<string, unknown>>;
  assert.deepEqual(properties.grade.enum, ["S", "A", "B", "C", "D", "E", "F"]);
});

test("handwritten implementation and tests use TypeScript only", () => {
  const handwritten = [...filesUnder("src"), ...filesUnder("test")];

  assert.equal(handwritten.some((file) => /\.(?:js|mjs|cjs)$/i.test(file)), false);
  assert.equal(handwritten.every((file) => file.endsWith(".ts")), true);
});

test("workflow report schema requires the non-scoring integrity diagnostic", () => {
  const schema = readJson("schemas/workflow-report.schema.json");
  const definitions = schema.$defs as Record<string, Record<string, unknown>>;

  assert.ok((definitions.scoredRun.required as string[]).includes("integrity"));
  assert.ok((definitions.variantSummary.required as string[]).includes("integrity"));
  assert.deepEqual(definitions.integrityFlag.enum, ["boundary-violation", "dangerous-command", "untruthful-conclusion"]);
});

test("static report schema requires the ranked improvement plan", () => {
  const schema = readJson("schemas/static-report.schema.json");
  const definitions = schema.$defs as Record<string, Record<string, unknown>>;
  const plan = definitions.improvementPlan as { properties: { items: { items: { properties: Record<string, { enum?: string[] }> } } } };

  assert.ok((schema.required as string[]).includes("improvements"));
  assert.deepEqual(plan.properties.items.items.properties.kind.enum, ["defect", "core-gap", "gap"]);
});
