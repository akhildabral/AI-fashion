// Metro, workspace-aware: the app imports `@zauq/shared` from packages/ and
// the hoisted node_modules live at the repo root.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules'), path.resolve(workspaceRoot, 'node_modules')]
// `@zauq/shared` resolves its subpaths through package.json "exports".
config.resolver.unstable_enablePackageExports = true

module.exports = config
