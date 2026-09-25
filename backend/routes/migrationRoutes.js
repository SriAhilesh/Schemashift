const express = require("express");

const {
  analyzeMigration,
  getMigrations,
  getMigration,
  updateMigration,
  deleteMigration
} = require("../controllers/migrationController");

const router = express.Router();


// Analyze + save migration
router.post(
  "/analyze",
  analyzeMigration
);


// Get all migrations
router.get(
  "/",
  getMigrations
);


// Get one migration
router.get(
  "/:id",
  getMigration
);


// Update migration
router.put(
  "/:id",
  updateMigration
);


// Delete migration
router.delete(
  "/:id",
  deleteMigration
);


module.exports = router;