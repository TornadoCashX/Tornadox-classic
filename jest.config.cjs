// The 19 *.test.js files under src/ came along with the bulk port of the parent Nuxt project's
// services/ directory, but nothing could run them: the parent's own jest.config.js explicitly
// excludes <rootDir>/web-react/, and this project had no jest of its own. They are written
// against the jest API (jest.mock/jest.fn), so jest + babel-jest is what runs them unchanged -
// switching to vitest (the more idiomatic choice for a Vite app) would mean rewriting all 19.
//
// .babelrc alongside this file supplies the ESM -> CJS + TypeScript transform; Vite itself uses
// esbuild and needs no babel, so that config is scoped to `env.test` and never affects builds.
module.exports = {
  rootDir: '.',
  // Mirrors vite.config.ts's `@` -> src alias.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  },
  moduleFileExtensions: ['js', 'ts', 'json'],
  transform: {
    '^.+\\.(js|ts)$': 'babel-jest'
  },
  // services/walletConnect.js and localTxStore.ts touch window.localStorage.
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/jest.setup.cjs'],
  // Without this, jsdom makes jest pick the "browser" export condition, and ffjavascript
  // (via circomlibjs, via services/mimc.js + pedersen.js) resolves to an ESM-only bundle jest
  // cannot parse. Forcing the "node" condition selects its CommonJS build instead - this only
  // affects how tests resolve the package; Vite still bundles the browser build for the app.
  testEnvironmentOptions: {
    customExportConditions: ['node']
  },
  testPathIgnorePatterns: ['/node_modules/']
}
