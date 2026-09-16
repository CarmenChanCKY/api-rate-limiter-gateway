import express from "express";

const config = {
  port: parseInt(process.env.TARGET_API_PORT || "4000", 10),
};

const app = express();

// parse the request body with Content-Type: application/json
app.use(express.json());

/**
 * @swagger
 * /:
 *   get:
 *     tags: [Health]
 *     summary: Check service status
 *     responses:
 *       200:
 *         description: Service is running
 */
app.get("/", (_req, res) => {
  res.json({ message: "Target API is running" });
});

/**
 * @swagger
 * /api/users:
 *   get:
 *     tags: [Users]
 *     summary: Get a sample user
 *     responses:
 *       200:
 *         description: A sample user object
 *       401:
 *         description: Missing or invalid API key
 *       429:
 *         description: Too many requests
 */
app.get("/api/users", (_req, res) => {
  res.json({
    userId: 1,
    id: 1,
    title: "test userd",
    completed: false,
  });
});

/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         example: "123"
 *         description: The user ID
 *     responses:
 *       200:
 *         description: User found
 */
app.get("/api/users/:id", (_req, res) => {
  res.json({ message: _req.params.id });
});

/**
 * @swagger
 * /api/users:
 *   post:
 *     tags: [Users]
 *     summary: Create a user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: Alice
 *               email:
 *                 type: string
 *                 format: email
 *                 example: alice@example.com
 *             required:
 *               - name
 *               - email
 *     responses:
 *       200:
 *         description: User created
 */
app.post("/api/users", (_req, res) => {
  res.json({ message: _req.body });
});

app.listen(config.port, () => {
  console.log(`Target API listening on http://localhost:${config.port}`);
});
