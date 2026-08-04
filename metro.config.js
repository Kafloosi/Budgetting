// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// expo-sqlite ships a WebAssembly build for web. Metro has to treat .wasm as an
// asset, and the worker needs SharedArrayBuffer, which browsers only hand out
// to cross-origin-isolated documents.
config.resolver.assetExts.push('wasm');

config.server.enhanceMiddleware = (middleware) => (request, response, next) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  return middleware(request, response, next);
};

module.exports = config;
