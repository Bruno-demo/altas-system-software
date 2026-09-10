const path = require("path");
const { defineConfig } = require("prisma/config");

// Load the repository's local .env only if the deployment/runtime host did not
// already inject DATABASE_URL or JWT_SECRET. This preserves Render's environment
// values while still letting local development use the workspace backend/.env file.
require("dotenv").config({
  path: path.join(__dirname, ".env"),
  override: false,
});

module.exports = defineConfig({
  schema: "src/prisma/schema.prisma",
});
