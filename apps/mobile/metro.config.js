const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
// Two levels up: apps/mobile → apps → monorepo root
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// ✅ Tell Metro to watch the entire monorepo
config.watchFolders = [monorepoRoot];

// ✅ Resolve packages from both the app's and the root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// ✅ Needed for Turborepo symlinks (packages/* are symlinked)
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
