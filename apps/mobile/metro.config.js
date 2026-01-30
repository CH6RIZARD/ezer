const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Watch all files in the monorepo
config.watchFolders = [monorepoRoot];

// Let Metro know where to resolve packages (pnpm compatibility)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Resolve workspace packages explicitly
config.resolver.extraNodeModules = new Proxy(
  {
    '@ezer/shared': path.resolve(monorepoRoot, 'packages/shared'),
    '@ezer/ui': path.resolve(monorepoRoot, 'packages/ui'),
  },
  {
    get: (target, name) => {
      if (target.hasOwnProperty(name)) {
        return target[name];
      }
      // Fall back to node_modules
      return path.join(projectRoot, 'node_modules', name);
    },
  }
);

// Ensure symlinks are followed (important for pnpm)
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
