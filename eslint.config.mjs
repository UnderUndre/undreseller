// Flat ESLint config (spec 001-reinit baseline fix): eslint-config-next@16
// ships native flat configs — routing them through FlatCompat (legacy eslintrc
// interpreter) crashes the config validator (circular-JSON), so we consume the
// subpath exports directly.
import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      // React Compiler lints (eslint-plugin-react-hooks v7, shipped via
      // eslint-config-next@16): template components carry pre-existing
      // violations (setState-in-effect, refs-during-render, manual memoization)
      // — baseline keeps them at warn; refactor debt tracked for 002+.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
    },
  },
  {
    // playwright-report/ carries minified trace-viewer bundles (gitignored but
    // generated locally by `pnpm test:e2e`) — linting them produced 200+ false
    // 'errors' from minified code (spec 004 T460 finding).
    ignores: ['.next/', 'src/payload-types.ts', 'src/payload-generated-schema.ts', 'playwright-report/'],
  },
]

export default eslintConfig
