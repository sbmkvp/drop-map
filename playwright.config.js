const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./test/browser",
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: false,
  },
  webServer: {
    command: "python3 -m http.server 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
  },
});
