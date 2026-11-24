// Metro untuk monorepo pnpm. `getDefaultConfig` sudah mendeteksi workspace (symlink, exports,
// nodeModulesPaths app + root), jadi yang diatur di sini hanya hal yang default-nya kurang tepat.
const path = require('node:path')
const { getDefaultConfig } = require('expo/metro-config')

const workspaceRoot = path.resolve(__dirname, '../..')
const config = getDefaultConfig(__dirname)

// Default Expo mengawasi SEMUA workspace, termasuk apps/web (.nuxt, .output) yang tidak pernah
// diimpor mobile. Batasi ke paket yang memang boleh dipakai mobile (ARCHITECTURE.md §3).
config.watchFolders = [
  path.join(workspaceRoot, 'node_modules'),
  path.join(workspaceRoot, 'packages/tokens'),
  path.join(workspaceRoot, 'packages/contracts'),
  path.join(workspaceRoot, 'packages/core'),
]

const baseTransformOptions = config.transformer.getTransformOptions
config.transformer = {
  ...config.transformer,
  // Modul dievaluasi saat pertama dipakai, bukan saat bundle dimuat - memangkas kerja startup.
  getTransformOptions: async (...args) => {
    const options = await baseTransformOptions(...args)
    return { ...options, transform: { ...options.transform, inlineRequires: true } }
  },
  // Minifier hanya jalan di build produksi: buang semua console.* (shared-security.md).
  minifierConfig: {
    ...config.transformer.minifierConfig,
    compress: { ...config.transformer.minifierConfig.compress, drop_console: true },
  },
}

module.exports = config
