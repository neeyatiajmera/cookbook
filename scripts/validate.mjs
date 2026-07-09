// Validates every recipe & variant against schema/recipe.schema.json plus cross-checks.
// Usage: node scripts/validate.mjs
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import YAML from "yaml";

const root = process.cwd();
const schema = JSON.parse(readFileSync(join(root, "schema/recipe.schema.json"), "utf8"));
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

const errors = [];
const ids = new Set();
const recipesDir = join(root, "recipes");
const slugs = existsSync(recipesDir)
  ? readdirSync(recipesDir).filter((d) => statSync(join(recipesDir, d)).isDirectory())
  : [];

function check(file, { isVariant, parentSlug }) {
  let doc;
  try {
    doc = YAML.parse(readFileSync(file, "utf8"));
  } catch (e) {
    errors.push(`${file}: YAML parse error — ${e.message}`);
    return;
  }
  if (!validate(doc)) {
    for (const e of validate.errors) errors.push(`${file}: ${e.instancePath || "/"} ${e.message}`);
    return;
  }
  if (!isVariant) {
    if (doc.id !== parentSlug) errors.push(`${file}: id "${doc.id}" must match folder name "${parentSlug}"`);
    if (ids.has(doc.id)) errors.push(`${file}: duplicate id "${doc.id}"`);
    ids.add(doc.id);
    if (doc.variant_of) errors.push(`${file}: main recipe must not have variant_of`);
  } else {
    if (doc.variant_of !== parentSlug) errors.push(`${file}: variant_of must be "${parentSlug}"`);
  }
  if (doc.image) {
    const imgPath = join(recipesDir, parentSlug, doc.image);
    if (!existsSync(imgPath)) errors.push(`${file}: image "${doc.image}" not found`);
  }
}

for (const slug of slugs) {
  const main = join(recipesDir, slug, "recipe.yaml");
  if (!existsSync(main)) { errors.push(`recipes/${slug}: missing recipe.yaml`); continue; }
  check(main, { isVariant: false, parentSlug: slug });
  const vDir = join(recipesDir, slug, "variants");
  if (existsSync(vDir)) {
    for (const f of readdirSync(vDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))) {
      check(join(vDir, f), { isVariant: true, parentSlug: slug });
    }
  }
}

if (errors.length) {
  console.error(`❌ ${errors.length} problem(s):\n` + errors.map((e) => "  • " + e).join("\n"));
  process.exit(1);
}
console.log(`✅ ${slugs.length} recipe(s) valid.`);
