// Vite config that leaves your code alone and only copies the used node_modules packages into web/dist
// Usage:
//   npm run copy:modules
// This scans ./js/**/*.js for imports that contain "/node_modules/..." (e.g., "/ovum/node_modules/lodash-es/get.js")
// and copies the referenced package directory from ./node_modules/<pkg> to ./web/dist/node_modules/<pkg>.
//
// Notes:
// - Scoped packages like @scope/name are supported.
// - We intentionally set build.outDir to a temporary folder so Vite doesn't write bundles; the plugin handles the copying.
// - If your import paths are like "/ovum/node_modules/...", keep in mind we preserve the "node_modules" segment under web/dist,
//   so a server/alias can map "/ovum/node_modules" -> "/ovum/web/dist/node_modules" for distribution.

import { promises as fsp } from 'fs';
import fs from 'fs';
import path from 'path';

/** Recursively walk a directory and return file paths */
async function walk(dir) {
  /** @type {string[]} */
  const result = [];
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    if (!cur) continue;
    let entries;
    try {
      entries = await fsp.readdir(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) result.push(p);
    }
  }
  return result;
}

/** Extract import specifiers from JS content */
function findImportSpecifiers(code) {
  const specs = new Set();
  const re = /(?:(?:import|export)\s+(?:[^'";]*?from\s+)?)['"]([^'"\n]+)['"]|import\(\s*['"]([^'"\n]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(code))) {
    const s = m[1] || m[2];
    if (s) specs.add(s);
  }
  return [...specs];
}

/** Normalize spec to a node_modules path, if present */
function toNodeModulesPath(spec) {
  // Examples we support:
  //   /ovum/node_modules/lodash-es/get.js
  //   /node_modules/lodash-es/get.js
  // Return the substring starting at 'node_modules/...'
  const idx = spec.indexOf('/node_modules/');
  if (idx === -1) return null;
  return spec.slice(idx + 1); // drop the leading slash so it starts with node_modules/
}

/** Derive package name from node_modules path. Handles scoped packages. */
function packageNameFromNodeModulesPath(nmPath) {
  // nmPath starts with: node_modules/<pkg>/...
  const parts = nmPath.split('/');
  if (parts.length < 2 || parts[0] !== 'node_modules') return null;
  if (parts[1].startsWith('@')) {
    // scoped package: node_modules/@scope/name/...
    if (parts.length >= 3) return parts[1] + '/' + parts[2];
    return null;
  } else {
    return parts[1];
  }
}

/** Copy directory recursively using fs.cp if available, otherwise a fallback */
async function copyDir(src, dest) {
  if (typeof fs.cp === 'function') {
    await fs.promises.mkdir(dest, { recursive: true });
    await fs.promises.cp(src, dest, { recursive: true, force: true });
    return;
  }
  // Fallback: simple recursive copy
  await fs.promises.mkdir(dest, { recursive: true });
  const entries = await fsp.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fs.promises.copyFile(s, d);
  }
}

// Externalize any relative import that resolves outside the project root (served by ComfyUI at runtime)
function externalizeOutsideRootPlugin() {
  /** @type {string} */
  let projectRoot = process.cwd();
  const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
  return {
    name: 'ovum-externalize-outside-root',
    apply: 'build',
    configResolved(config) {
      // Vite's resolved root
      projectRoot = path.resolve(config.root || projectRoot);
    },
    resolveId(id, importer) {
      if (!importer) return null;
      // Always externalize absolute ComfyUI-served paths like /scripts/... 
      if (id.startsWith('/scripts/')) {
        return { id, external: true };
      }
      // Handle only relative imports next
      if (!(id.startsWith('./') || id.startsWith('../'))) return null;
      const abs = path.resolve(path.dirname(importer), id);
      if (!norm(abs).startsWith(norm(projectRoot))) {
        // Mark as external so Vite/Rollup doesn't try to resolve it.
        return { id, external: true };
      }
      return null;
    }
  };
}

/** Vite plugin */
function copyUsedNodeModulesPlugin() {
  return {
    name: 'ovum-copy-used-node-modules',
    apply: 'build',
    async buildStart() {
      const root = process.cwd();
      const jsRoot = path.join(root, 'js');
      const outRoot = path.join(root, 'web', 'dist');
      const nodeModulesRoot = path.join(root, 'node_modules');

      // Find all JS files under ./js
      const files = (await walk(jsRoot)).filter(p => p.endsWith('.js'));

      /** @type {Set<string>} */
      const pkgs = new Set();

      for (const file of files) {
        let code = '';
        try { code = await fsp.readFile(file, 'utf8'); } catch { continue; }
        const specs = findImportSpecifiers(code);
        for (const s of specs) {
          const nm = toNodeModulesPath(s);
          if (!nm) continue;
          const pkg = packageNameFromNodeModulesPath(nm);
          if (pkg) pkgs.add(pkg);
        }
      }

      if (pkgs.size === 0) {
        this.warn('[ovum] No /node_modules/ imports found in ./js');
        return;
      }

      // Copy each package directory into web/dist/node_modules/<pkg>
      for (const pkg of pkgs) {
        const srcDir = path.join(nodeModulesRoot, pkg);
        const destDir = path.join(outRoot, 'node_modules', pkg);
        try {
          const stat = await fsp.stat(srcDir);
          if (!stat.isDirectory()) {
            this.warn(`[ovum] Skipping ${pkg}: not a directory at ${srcDir}`);
            continue;
          }
          await copyDir(srcDir, destDir);
          this.info(`[ovum] Copied ${pkg} -> ${path.relative(root, destDir)}`);
        } catch (e) {
          this.warn(`[ovum] Failed to copy ${pkg}: ${e?.message || e}`);
        }
      }
    },
  };
}

/** @type {import('vite').UserConfig} */
const config = {
  // Make sure vite doesn’t delete or interfere with your existing output.
  build: {
    outDir: 'js/.vite-tmp',
    emptyOutDir: false,
    rollupOptions: {
      // Provide a minimal dummy input so Vite runs; it won’t be used for output you care about.
      // You can point this at any small JS file in your repo.
      input: 'js/05/assert-ovum.js',
      output: {
        // Avoid clutter; single file name for the dummy chunk.
        entryFileNames: 'noop.js',
        assetFileNames: 'assets/[name][extname]'
      },
      external: (id, importer) => {
        if (!importer) return false;
        // Externalize absolute ComfyUI-served paths like /scripts/...
        if (typeof id === 'string' && id.startsWith('/scripts/')) return true;
        if (!(id.startsWith('./') || id.startsWith('../'))) return false;
        const norm = (p) => p.replace(/\\+/g, '/').toLowerCase();
        const abs = path.resolve(path.dirname(importer), id);
        const root = path.resolve(process.cwd());
        return !norm(abs).startsWith(norm(root));
      }
    }
  },
  plugins: [externalizeOutsideRootPlugin(), copyUsedNodeModulesPlugin()],
};

export default config;
