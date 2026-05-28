import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([{
    extends: [...nextCoreWebVitals, ...nextTypescript],
    rules: {
        // This app is not React-Compiler-ready yet. Keep the runtime hook rules
        // strict, but do not fail CI on compiler migration advice.
        "react-hooks/set-state-in-effect": "off",
        "react-hooks/use-memo": "off",
        "react-hooks/preserve-manual-memoization": "off",
        "react-hooks/immutability": "off",
        "react-hooks/refs": "off",
        "react-hooks/purity": "off",
    },
}, {
    files: ["scripts/**/*.js"],
    rules: {
        "@typescript-eslint/no-require-imports": "off",
    },
}]);
