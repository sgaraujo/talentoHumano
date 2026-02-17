import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["lib/**", "node_modules/**"] },

  js.configs.recommended,

  // Config recomendada para TS con Flat Config
  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.{ts,js}"],
    rules: {
      // Si la quieres:
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
      "@typescript-eslint/no-explicit-any": "off",

      // Opcional: para no joder por cosas normales en Functions
      // "@typescript-eslint/no-unused-vars": "warn",
    },
  },
];
