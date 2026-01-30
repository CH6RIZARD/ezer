#!/bin/bash
set -e

echo "=== EAS Build Pre-Install Hook ==="

# Navigate to the project directory
cd "$(dirname "$0")"

# Create a local packages directory
mkdir -p ./local-packages

# Copy workspace packages
echo "Copying @ezer/shared..."
cp -r ../../packages/shared ./local-packages/shared

echo "Copying @ezer/ui..."
cp -r ../../packages/ui ./local-packages/ui

# Update package.json to use local paths instead of workspace:*
echo "Updating package.json references..."

# Update mobile app's package.json
sed -i 's|"@ezer/shared": "workspace:\*"|"@ezer/shared": "file:./local-packages/shared"|g' package.json
sed -i 's|"@ezer/ui": "workspace:\*"|"@ezer/ui": "file:./local-packages/ui"|g' package.json

# Update ui package's dependency on shared (nested dependency)
echo "Updating nested workspace references in @ezer/ui..."
sed -i 's|"@ezer/shared": "workspace:\*"|"@ezer/shared": "file:../shared"|g' ./local-packages/ui/package.json

echo "=== Pre-Install Hook Complete ==="
