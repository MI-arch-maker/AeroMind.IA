import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(path.resolve(import.meta.dirname, "../frontend/package.json"));
const ts = require("typescript");

const root = path.resolve(import.meta.dirname, "../frontend/client/src");
const catalogDirectory = path.resolve(import.meta.dirname, "../frontend/client/src/lib");
const sourceCatalogs = ["fr", "en"].map((locale) => JSON.parse(fs.readFileSync(path.join(catalogDirectory, `${locale}.json`), "utf8")));
const cataloguedText = new Set(sourceCatalogs.flatMap((catalog) => Object.keys(catalog).map((text) => text.replace(/\s+/g, " ").trim())));
const visibleAttributes = new Set(["aria-label", "aria-description", "title", "placeholder", "alt"]);
const visibleProperties = /^(label|title|description|message|caption|placeholder|emptyLabel|tooltip|helperText)$/i;
const ignoredAttributes = new Set(["className", "class", "id", "role", "type", "name", "href", "src", "value", "style", "key", "htmlFor", "aria-hidden"]);
const violations = [];

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(absolute) : /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [absolute] : [];
  });
}
function humanText(value) {
  return /\p{L}/u.test(value) && (value.trim().length > 2) && (/\s/.test(value.trim()) || /[.!?…:;]/.test(value));
}
function isCatalogued(value) {
  return cataloguedText.has(value.replace(/\s+/g, " ").trim());
}
function report(node, source, reason) {
  const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
  violations.push(`${path.relative(process.cwd(), source.fileName)}:${line + 1}: ${reason}: ${JSON.stringify(node.text ?? node.getText(source))}`);
}
function visit(node, source) {
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name) && node.name.text === "dangerouslySetInnerHTML") {
    report(node, source, "dangerouslySetInnerHTML is forbidden for translated or interpolated content");
  }
  if (ts.isJsxText(node) && humanText(node.text) && !isCatalogued(node.text)) report(node, source, "JSX text is missing from both locale dictionaries");
  if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
    const name = node.name.text;
    if (!ignoredAttributes.has(name) && (visibleAttributes.has(name) || visibleProperties.test(name))) {
      if (node.initializer && ts.isStringLiteral(node.initializer) && humanText(node.initializer.text) && !isCatalogued(node.initializer.text)) report(node.initializer, source, `visible JSX attribute ${name} is missing from both locale dictionaries`);
      if (node.initializer && ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        const expression = node.initializer.expression;
        if (ts.isStringLiteral(expression) && humanText(expression.text) && !isCatalogued(expression.text)) report(expression, source, `visible JSX attribute ${name} is missing from both locale dictionaries`);
      }
    }
  }
  if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && visibleProperties.test(node.name.text) && ts.isStringLiteral(node.initializer) && humanText(node.initializer.text) && !isCatalogued(node.initializer.text)) {
    report(node.initializer, source, `visible data property ${node.name.text} must use i18n`);
  }
  if (ts.isCallExpression(node)) {
    const callee = node.expression.getText(source);
    if (/^(toast(?:\.[\w]+)?|window\.confirm|window\.alert)$/.test(callee)) {
      for (const argument of node.arguments) if (ts.isStringLiteral(argument) && humanText(argument.text) && !isCatalogued(argument.text)) report(argument, source, `user notification ${callee} is missing from both locale dictionaries`);
    }
  }
  ts.forEachChild(node, (child) => visit(child, source));
}

for (const file of filesUnder(root)) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  visit(source, source);
}
if (violations.length) {
  console.error(`i18n hardcoded-text gate failed: ${violations.length} candidate(s). No legacy allowlist is applied.`);
  for (const violation of violations) console.error(`  ${violation}`);
  process.exit(1);
}
console.log("i18n hardcoded-text gate passed.");
