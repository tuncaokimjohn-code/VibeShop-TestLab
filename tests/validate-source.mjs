import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const ts = require(process.env.VIBESHOP_TYPESCRIPT || "typescript");
const checks = [];
const pass = (name, detail) => checks.push({ name, status: "PASS", detail });
const relative = filename => path.relative(root, filename).split(path.sep).join("/");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected symbolic link: ${relative(filename)}`);
    return entry.isDirectory() ? files(filename) : [filename];
  }).sort();
}

try {
  const configFile = ts.readConfigFile(path.join(root, "tsconfig.json"), ts.sys.readFile);
  assert(!configFile.error, "Unable to read tsconfig.json");
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  assert.equal(config.errors.length, 0, "Invalid compiler options");
  if (process.env.VIBESHOP_REACT_TYPES) {
    const types = path.resolve(process.env.VIBESHOP_REACT_TYPES);
    config.options.paths = {
      react: [path.join(types, "index.d.ts")],
      "react/*": [path.join(types, "*")],
    };
  }
  const program = ts.createProgram(config.fileNames, config.options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) {
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: name => name,
      getNewLine: () => "\n",
    }));
  }
  pass("TypeScript and TSX syntax and strict type check", {
    compiler: ts.version, sourceFiles: config.fileNames.filter(name => /\.tsx?$/.test(name)).length,
  });

  const graph = {};
  const variantFiles = {};
  for (const variant of ["vulnerable", "safer"]) {
    const sourceFiles = files(path.join(root, variant, "src"));
    variantFiles[variant] = sourceFiles.map(name => path.relative(path.join(root, variant, "src"), name));
    for (const filename of sourceFiles) {
      const source = program.getSourceFile(filename);
      assert(source, `Missing compiler source: ${relative(filename)}`);
      const edges = [];
      for (const node of source.statements) {
        if ((!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) || !node.moduleSpecifier) continue;
        const specifier = node.moduleSpecifier.text;
        const resolved = ts.resolveModuleName(specifier, filename, config.options, ts.sys).resolvedModule;
        assert(resolved, `Unresolved import: ${relative(filename)} -> ${specifier}`);
        if (specifier.startsWith(".")) {
          assert(resolved.resolvedFileName.startsWith(root + path.sep), "Import leaves the fixture");
          edges.push(relative(resolved.resolvedFileName));
        } else {
          assert.equal(specifier, "react", "Unexpected external source import");
        }
      }
      graph[relative(filename)] = edges;
    }
    const reached = new Set();
    function visit(name) {
      if (reached.has(name)) return;
      reached.add(name);
      for (const edge of graph[name] || []) visit(edge);
    }
    visit(`${variant}/src/index.ts`);
    assert(sourceFiles.every(name => reached.has(relative(name))), `${variant} has an unreachable source module`);
    pass(`${variant} import resolution and architecture reachability`, {
      sourceModules: sourceFiles.length, reachableLocalFiles: reached.size,
    });
  }
  assert.deepEqual(variantFiles.vulnerable, variantFiles.safer);
  pass("Comparable source tree structure", { modulesPerVariant: variantFiles.safer.length });

  const data = Object.fromEntries(["products", "customers", "orders", "reviews"].map(name =>
    [name, JSON.parse(fs.readFileSync(path.join(root, "synthetic-data", `${name}.json`), "utf8"))]));
  for (const [name, rows] of Object.entries(data)) {
    assert(Array.isArray(rows) && rows.length > 0, `Missing ${name}`);
    assert.equal(new Set(rows.map(row => row.id)).size, rows.length, `Duplicate ${name} identifiers`);
    for (const row of rows) assert(/^[a-z]+-[0-9]{3,8}$/.test(row.id));
  }
  const productIds = new Set(data.products.map(row => row.id));
  const customerIds = new Set(data.customers.map(row => row.id));
  for (const product of data.products) {
    assert.equal(typeof product.name, "string");
    assert.equal(typeof product.description, "string");
    assert.equal(typeof product.active, "boolean");
    assert(Number.isSafeInteger(product.priceCents) && product.priceCents >= 0);
  }
  for (const customer of data.customers) {
    assert(customer.displayName.startsWith("Fixture "));
    assert(["customer", "administrator"].includes(customer.role));
  }
  for (const order of data.orders) {
    assert(customerIds.has(order.customerId));
    assert(["placed", "shipped"].includes(order.status));
    assert(order.lines.length > 0);
    for (const line of order.lines) {
      assert(productIds.has(line.productId));
      assert(Number.isSafeInteger(line.quantity) && line.quantity > 0);
      assert(Number.isSafeInteger(line.unitPriceCents) && line.unitPriceCents >= 0);
    }
  }
  for (const review of data.reviews) {
    assert(productIds.has(review.productId));
    assert(review.authorLabel.startsWith("Fixture "));
    assert.equal(typeof review.body, "string");
  }
  pass("Synthetic data shape and cross-file references", Object.fromEntries(
    Object.entries(data).map(([name, rows]) => [name, rows.length])));

  const manifest = JSON.parse(fs.readFileSync(path.join(root, "fixture-manifest.json"), "utf8"));
  for (const [filename, expected] of Object.entries(manifest.sourceFiles)) {
    assert(!path.isAbsolute(filename) && !filename.split("/").includes(".."));
    assert.equal(sha256(fs.readFileSync(path.join(root, filename))), expected, `Source changed: ${filename}`);
  }
  const actualSources = files(root).filter(name => /\.(ts|tsx|json)$/.test(name) &&
    /^(vulnerable\/src|safer\/src|synthetic-data)\//.test(relative(name))).map(relative);
  assert.deepEqual(Object.keys(manifest.sourceFiles).sort(), actualSources.sort());
  for (const variant of ["vulnerable", "safer"]) {
    const entries = Object.entries(manifest.sourceFiles).filter(([name]) =>
      name.startsWith(variant + "/src/") || name.startsWith("synthetic-data/"));
    const canonical = entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([name, hash]) => `${name}\0${hash}\n`).join("");
    assert.equal(sha256(canonical), manifest.variants[variant].snapshotSha256);
  }
  pass("Source inventory and versioned snapshot hashes", { files: actualSources.length, version: manifest.version });
  process.stdout.write(JSON.stringify({ status: "PASS", checks, importGraph: graph }, null, 2) + "\n");
} catch (error) {
  process.stderr.write(String(error.stack || error) + "\n");
  process.stdout.write(JSON.stringify({ status: "FAIL", checks }, null, 2) + "\n");
  process.exitCode = 1;
}
