import { existsSync } from "node:fs";
import type { OAS3Options } from "swagger-jsdoc";

// Read the compiled file in the production Docker image (dist/), or the TS
// source in local dev (src/). Both carry the @swagger JSDoc comment blocks.
const gatewayApiFile = existsSync("./src/app.ts")
  ? "./src/app.ts"
  : "./dist/app.js";

export const swaggerOptions: OAS3Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Target API",
      version: "1.0.0",
      description: [
        "## Getting Started",
        "1. Get your API key from `GET /get-api`",
        "2. Enter the key in the **Authorization** section below",
        "3. Then test the endpoints",
      ].join("\n"),
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "API Key",
          description: "Enter the API key obtained from /get-api",
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Getting Started", description: "Obtain your API key" },
      { name: "Health" },
      { name: "Users" },
    ],
  },
  apis: ["./docker/target-api/server.js", gatewayApiFile],
};
