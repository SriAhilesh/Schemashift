const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();

const connectDB = require("./config/db");
const migrationRoutes = require("./routes/migrationRoutes");

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Root informational endpoint
app.get("/", (req, res) => {
  res.json({
    message: "SchemaShift backend is running!",
    version: "1.0.0",
    docs: "/api/health"
  });
});

// Readiness & Health Check Endpoint (safe, no credentials leaked)
app.get(["/health", "/api/health"], (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatusMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
  };

  const isHealthy = dbState === 1;

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? "healthy" : "unhealthy",
    uptimeSeconds: Math.floor(process.uptime()),
    database: dbStatusMap[dbState] || "unknown",
    timestamp: new Date().toISOString()
  });
});

// Migration API
app.use("/api/migration", migrationRoutes);

// Generic 404 handler for undefined API routes
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Global error handler (sanitizes error messages, avoids stack trace exposure)
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({
    success: false,
    error: "Internal server error."
  });
});

const PORT = process.env.PORT || 5000;

// Start server only after awaiting successful database connection
async function startServer() {
  try {
    await connectDB();
    const server = app.listen(PORT, () => {
      console.log(`SchemaShift server running on port ${PORT}`);
    });
    return server;
  } catch (error) {
    console.error("Failed to start server due to database connection error:", error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };