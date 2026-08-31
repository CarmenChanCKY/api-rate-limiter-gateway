import express, { type Request, type Response } from "express";
import { apiReference } from "@scalar/express-api-reference";
import swaggerJsdoc from "swagger-jsdoc";
import { config } from "./config/env.js";
import { swaggerOptions } from "./config/swagger.js";
import { getAPIKey } from "./helper/api-key.js";
import verifyAPIKeys from "./middleware/verify-api-key.js";

const app = express();

const filterHeaders = (
  headerList: Headers | [string, unknown][],
): Record<string, string> => {
  // they are hop-by-hop headers
  // meaningless to the target server
  // if forward these headers, some may cause error or conflicts
  const skipHeaders = [
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",

    "authorization"
  ];

  const headers: Record<string, string> = {};

  for (const [key, value] of headerList) {
    if (
      !skipHeaders.includes(key.toLocaleLowerCase()) &&
      // skip undefined or array values
      typeof value === "string"
    ) {
      headers[key] = value;
    }
  }

  return headers;
};

const bufferBody = (req: Request): Promise<Buffer<ArrayBuffer> | undefined> => {
  return new Promise((resolve) => {
    // GET/HEAD request should not contain request body
    // just return undefined
    if (["GET", "HEAD"].includes(req.method.toUpperCase())) {
      return resolve(undefined);
    }

    // handle the HTTP request stream
    // the request body is received in chunks
    const chunks: Buffer[] = [];

    // notify when chunk arrives
    req.on("data", (chunk) => {
      chunks.push(chunk);
    });

    // notify when all chunks arrived
    req.on("end", () => {
      // join all the chunk together to get the full request body
      resolve(Buffer.concat(chunks));
    });

    // error handling
    req.on("error", () => {
      resolve(undefined);
    });
  });
};

/**
 * @swagger
 * /get-api:
 *   get:
 *     tags: [Getting Started]
 *     summary: Get the API key
 *     description: Returns the current runtime API key. No authentication required.
 *     responses:
 *       200:
 *         description: The API key for authenticated requests
 */
app.get("/get-api", (_req: Request, res: Response) => {
  return res.status(200).send(getAPIKey());
});

const spec = swaggerJsdoc(swaggerOptions);

app.get("/api-docs.json", (_req: Request, res: Response) => {
  return res.json(spec);
});

app.get("/api-docs", apiReference({
  content: spec,
  layout: "classic",
  hideSearch: true,
  agent: { disabled: true },
  mcp: { disabled: true },
  authentication: {
    preferredSecurityScheme: "bearerAuth",
  },
}));

// match every route
app.all("/{*path}", verifyAPIKeys, async (_req: Request, res: Response) => {
  // originalUrl = /api/users?page=2, where full path =  http://localhost:3000/api/users?page=2
  const targetUrl: string = `${config.targetApiUrl}${_req.originalUrl}`;

  // 1. Buffer the incoming body (if any)
  const body = await bufferBody(_req);

  const response = await fetch(targetUrl, {
    method: _req.method,
    headers: filterHeaders(Object.entries(_req.headers)),
    body: body,
  });

  // read the response body as raw bytes
  const resBody = await response.arrayBuffer();

  // set status code
  res.status(response.status);

  // set respose header
  res.set(filterHeaders(response.headers));

  // send body to client
  res.send(Buffer.from(resBody));
});

export { app };
