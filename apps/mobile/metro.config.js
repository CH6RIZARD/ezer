const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Enable monorepo support
config.watchFolders = [monorepoRoot];

// Let Metro know where to resolve packages
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Resolve workspace packages
config.resolver.extraNodeModules = {
  '@ezer/shared': path.resolve(monorepoRoot, 'packages/shared'),
  '@ezer/ui': path.resolve(monorepoRoot, 'packages/ui'),
};

module.exports = config;
