import express, { type Request, type Response } from "express";
import { config } from "./config/env.js";

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

// match every route
app.all("/{*path}", async (_req: Request, res: Response) => {
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

// app.get("/health", (_req, res) => {
//   res.json({ status: "ok" });
// });

export { app };
