import express from "express";

const config = {
  port: parseInt(process.env.TARGET_API_PORT || "4000", 10),
};

const app = express();

// parse the request body with Content-Type: application/json
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ message: "Target API is running" });
});

app.get("/api/users", (_req, res) => {
  res.json({
    userId: 1,
    id: 1,
    title: "test userd",
    completed: false,
  });
});

app.get("/api/users/:id", (_req, res) => {
  res.json({ message: _req.params.id });
});

app.post("/api/users", (_req, res) => {
  res.json({ message: _req.body });
});

app.listen(config.port, () => {
  console.log(`Target API listening on http://localhost:${config.port}`);
});
