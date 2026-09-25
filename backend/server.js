const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");

const migrationRoutes =
  require("./routes/migrationRoutes");

const app = express();

app.use(cors());

app.use(express.json());

connectDB();

app.get("/", (req, res) => {
  res.json({
    message: "SchemaShift backend is running!"
  });
});

// Migration API
app.use(
  "/api/migration",
  migrationRoutes
);

const PORT =
  process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(
    `SchemaShift server running on port ${PORT}`
  );
});