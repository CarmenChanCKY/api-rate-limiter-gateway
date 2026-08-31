import { app } from "./app.js";
import { config } from "./config/env.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";
import { getAPIKey } from "./helper/api-key.js";

async function main(): Promise<void> {
  await connectRedis();

  // generate api key
  getAPIKey();

  const server = app.listen(config.port, () => {
    console.log(`Gateway listening on http://localhost:${config.port}`);
  });

  const shutdown = async (): Promise<void> => {
    console.log("\nShutting down...");

    //  ensures it runs exactly once
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);

    // stop accepting new connection and calls the callback when done
    server.close(() => {
      disconnectRedis().then(() => process.exit(0));
    });

    // close the server immediately
    server.closeAllConnections();
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
