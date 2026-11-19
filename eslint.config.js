// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'forma/*', 'forma-backend/*', '.agents/*'],
  },
  {
    rules: {
      // These React Compiler rules flag React Native's idiomatic Animated API
      // (`useRef(new Animated.Value(0)).current` read during render) and timer
      // reads like Date.now(). The app doesn't enable the React Compiler, so
      // keep them visible as warnings instead of failing the build.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      // Apostrophes and quotes are plain text inside React Native <Text>.
      'react/no-unescaped-entities': 'off',
    },
  },
]);
