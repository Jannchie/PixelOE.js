import jannchie from '@jannchie/eslint-config'

export default jannchie({
  unocss: true,
  rules: {
    'no-console': 'off',
    'no-alert': 'off',
    'unicorn/no-process-exit': 'off',
    'node/prefer-global/process': 'off',
    'unicorn/no-useless-switch-case': 'off',
    'unicorn/consistent-function-scoping': 'off',
    'unicorn/import-style': 'off',
    'unicorn/prefer-module': 'off',
    'vars-on-top': 'off',
    '@stylistic/array-element-newline': 'off',
    '@stylistic/comma-spacing': 'off',
    '@stylistic/max-statements-per-line': 'off',
    'style/array-element-newline': 'off',
    'style/comma-spacing': 'off',
    'style/max-statements-per-line': 'off',
    'unicorn/no-new-array': 'off',
    'prefer-const': 'warn',
    'unicorn/prefer-add-event-listener': 'off',
  },
})
