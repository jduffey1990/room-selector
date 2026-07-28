module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  extends: [
    "eslint:recommended",
  ],
  rules: {
    "max-len": "off",  // ← Add this
    "quotes": "off",
    "indent": "off",
    "object-curly-spacing": "off",
  },
};
