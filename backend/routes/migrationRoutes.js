const express = require("express");

const {
  analyzeMigration,
  getMigrations,
  getMigration,
  updateMigration,
  deleteMigration,
  executeDataTransformation,
  getRunDetails,
  deleteRun
} = require("../controllers/migrationController");

const router = express.Router();

// Analyze + save migration proposal
router.post("/analyze", analyzeMigration);

// Data transformation pipelines (POST /transform or POST /:id/transform)
router.post("/transform", executeDataTransformation);
router.post("/:id/transform", executeDataTransformation);

// Inspection and deletion of transformed data runs
router.get("/runs/:runId", getRunDetails);
router.delete("/runs/:runId", deleteRun);

// Get all migrations
router.get("/", getMigrations);

// Get one migration
router.get("/:id", getMigration);

// Update migration
router.put("/:id", updateMigration);

// Delete migration
router.delete("/:id", deleteMigration);

module.exports = router;