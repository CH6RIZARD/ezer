const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

// Check if we're in EAS Build (local-packages exists) or local dev
const isEASBuild = fs.existsSync(path.join(projectRoot, 'local-packages'));

const config = getDefaultConfig(projectRoot);

if (isEASBuild) {
  // EAS Build: packages are copied to local-packages/
  console.log('[Metro] Running in EAS Build mode');

  config.resolver.nodeModulesPaths = [
    path.resolve(projectRoot, 'node_modules'),
  ];

  config.resolver.extraNodeModules = {
    '@ezer/shared': path.resolve(projectRoot, 'local-packages/shared'),
    '@ezer/ui': path.resolve(projectRoot, 'local-packages/ui'),
  };
} else {
  // Local development: use monorepo structure
  console.log('[Metro] Running in local development mode');

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
}

module.exports = config;
