const mongoose = require("mongoose");
const crypto = require("crypto");
const Migration = require("../models/Migration");
const MigrationRun = require("../models/MigrationRun");
const parseSQLSchema = require("../services/schemaParser");
const analyzeRelationships = require("../services/relationshipAnalyzer");
const analyzeQueries = require("../services/queryAnalyzer");
const generateMongoSchema = require("../services/migrationEngine");
const { transformSampleData, persistTransformedData } = require("../services/dataTransformer");

// Helper to sanitize error messages so credentials/traces are never leaked to clients
function sanitizeErrorMessage(err) {
  if (!err) return "An unexpected error occurred.";
  let msg = err.message || String(err);
  // Redact connection strings or sensitive patterns if any
  msg = msg.replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URI]");
  return msg;
}

// ====================================================
// POST /api/migration/analyze
// ====================================================
const analyzeMigration = async (req, res) => {
  try {
    const { schema, queries } = req.body;

    if (!schema || typeof schema !== "string" || schema.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "SQL schema is required and must be a non-empty string."
      });
    }

    if (!queries || typeof queries !== "string" || queries.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "SQL queries are required and must be a non-empty string."
      });
    }

    // Step 1: Parse SQL schema
    const parsedSchema = parseSQLSchema(schema);
    if (parsedSchema.errors && parsedSchema.errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "SQL schema parsing failed.",
        details: parsedSchema.errors,
        warnings: parsedSchema.warnings
      });
    }

    // Step 2: Analyze relationships
    const relationships = analyzeRelationships(parsedSchema);

    // Step 3: Analyze queries
    const queryAnalysis = analyzeQueries(queries);

    // Step 4: Generate MongoDB schema proposal
    const migrationResult = generateMongoSchema(
      parsedSchema,
      relationships,
      queryAnalysis
    );

    // Step 5: Save migration record in MongoDB
    const migration = await Migration.create({
      sourceDatabase: "Relational Database",
      targetDatabase: migrationResult.targetDatabase,
      sourceSchema: schema,
      sampleQueries: queries,
      parsedSchema,
      relationships,
      queryAnalysis,
      generatedSchema: migrationResult.collections,
      migrationDecisions: migrationResult.decisions
    });

    return res.status(201).json({
      success: true,
      migrationId: migration._id,
      parsedSchema,
      relationships,
      queryAnalysis,
      migrationResult
    });

  } catch (error) {
    console.error("Migration analysis error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to analyze migration.",
      details: sanitizeErrorMessage(error)
    });
  }
};

// ====================================================
// GET /api/migration/
// ====================================================
const getMigrations = async (req, res) => {
  try {
    const migrations = await Migration.find()
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: migrations.length,
      migrations
    });
  } catch (error) {
    console.error("Get migrations error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch migrations.",
      details: sanitizeErrorMessage(error)
    });
  }
};

// ====================================================
// GET /api/migration/:id
// ====================================================
const getMigration = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: `Invalid migration ID format: '${id}'.`
      });
    }

    const migration = await Migration.findById(id);

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: `Migration with ID '${id}' not found.`
      });
    }

    return res.json({
      success: true,
      migration
    });
  } catch (error) {
    console.error("Get migration error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch migration.",
      details: sanitizeErrorMessage(error)
    });
  }
};

// ====================================================
// PUT /api/migration/:id
// ====================================================
const updateMigration = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: `Invalid migration ID format: '${id}'.`
      });
    }

    const { schema, queries } = req.body;

    if (!schema || typeof schema !== "string" || schema.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "SQL schema is required."
      });
    }

    if (!queries || typeof queries !== "string" || queries.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: "SQL queries are required."
      });
    }

    const parsedSchema = parseSQLSchema(schema);
    if (parsedSchema.errors && parsedSchema.errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "SQL schema parsing failed.",
        details: parsedSchema.errors,
        warnings: parsedSchema.warnings
      });
    }

    const relationships = analyzeRelationships(parsedSchema);
    const queryAnalysis = analyzeQueries(queries);
    const migrationResult = generateMongoSchema(
      parsedSchema,
      relationships,
      queryAnalysis
    );

    const migration = await Migration.findByIdAndUpdate(
      id,
      {
        sourceSchema: schema,
        sampleQueries: queries,
        parsedSchema,
        relationships,
        queryAnalysis,
        generatedSchema: migrationResult.collections,
        migrationDecisions: migrationResult.decisions
      },
      {
        returnDocument: "after",
        runValidators: true
      }
    );

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: `Migration with ID '${id}' not found.`
      });
    }

    return res.json({
      success: true,
      message: "Migration updated successfully",
      migrationId: migration._id,
      migrationResult
    });

  } catch (error) {
    console.error("Migration update error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to update migration.",
      details: sanitizeErrorMessage(error)
    });
  }
};

// ====================================================
// DELETE /api/migration/:id
// ====================================================
const deleteMigration = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        error: `Invalid migration ID format: '${id}'.`
      });
    }

    const migration = await Migration.findByIdAndDelete(id);

    if (!migration) {
      return res.status(404).json({
        success: false,
        error: `Migration with ID '${id}' not found.`
      });
    }

    return res.json({
      success: true,
      message: "Migration deleted successfully"
    });

  } catch (error) {
    console.error("Delete migration error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to delete migration.",
      details: sanitizeErrorMessage(error)
    });
  }
};

// ====================================================
// POST /api/migration/:id/transform (or /transform with migrationId/schema)
// ====================================================
const executeDataTransformation = async (req, res) => {
  try {
    const migrationId = req.params.id || req.body.migrationId;
    const { sampleData, schema, queries } = req.body;

    if (!sampleData || typeof sampleData !== "object") {
      return res.status(400).json({
        success: false,
        error: "Sample data is required as a JSON object mapping table names to record arrays."
      });
    }

    let migration = null;
    let parsedSchema = null;
    let migrationResult = null;

    if (migrationId) {
      if (!mongoose.isValidObjectId(migrationId)) {
        return res.status(400).json({
          success: false,
          error: `Invalid migration ID format: '${migrationId}'.`
        });
      }
      migration = await Migration.findById(migrationId);
      if (!migration) {
        return res.status(404).json({
          success: false,
          error: `Migration with ID '${migrationId}' not found.`
        });
      }
      parsedSchema = migration.parsedSchema;
      migrationResult = {
        targetDatabase: migration.targetDatabase,
        collections: migration.generatedSchema,
        decisions: migration.migrationDecisions
      };
    } else if (schema && queries) {
      parsedSchema = parseSQLSchema(schema);
      if (parsedSchema.errors && parsedSchema.errors.length > 0) {
        return res.status(400).json({
          success: false,
          error: "SQL schema parsing failed.",
          details: parsedSchema.errors
        });
      }
      const relationships = analyzeRelationships(parsedSchema);
      const queryAnalysis = analyzeQueries(queries);
      migrationResult = generateMongoSchema(parsedSchema, relationships, queryAnalysis);
    } else {
      return res.status(400).json({
        success: false,
        error: "Either a valid migrationId or schema and queries must be provided."
      });
    }

    // Generate unique run identifier
    const runId = "run_" + Date.now() + "_" + crypto.randomBytes(3).toString("hex");

    // Execute transformation
    const transformResult = transformSampleData(
      parsedSchema,
      migrationResult,
      sampleData,
      runId
    );

    // Persist transformed documents into isolated target collections
    const db = mongoose.connection.db;
    const persistResult = await persistTransformedData(
      db,
      transformResult.transformedCollections,
      runId
    );

    // Record the run in MigrationRun model
    const runRecord = await MigrationRun.create({
      runId,
      migrationId: migration ? migration._id : null,
      status: transformResult.integrityChecks.passed ? "SUCCESS" : "PARTIAL",
      sourceTableCounts: transformResult.sourceCounts,
      targetCollectionCounts: transformResult.targetCounts,
      collectionsCreated: persistResult.collectionsCreated,
      rejectedRecords: transformResult.rejectedRecords,
      integrityChecks: transformResult.integrityChecks,
      summary: transformResult.summary
    });

    return res.status(201).json({
      success: true,
      runId,
      runRecordId: runRecord._id,
      summary: transformResult.summary,
      sourceCounts: transformResult.sourceCounts,
      targetCounts: transformResult.targetCounts,
      collectionsCreated: persistResult.collectionsCreated,
      integrityChecks: transformResult.integrityChecks,
      rejectedRecords: transformResult.rejectedRecords,
      sampleDocuments: transformResult.transformedCollections
    });

  } catch (error) {
    console.error("Data transformation error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to transform sample data.",
      details: sanitizeErrorMessage(error)
    });
  }
};

// ====================================================
// GET /api/migration/runs/:runId
// Inspect transformed documents for a given run
// ====================================================
const getRunDetails = async (req, res) => {
  try {
    const { runId } = req.params;

    const runRecord = await MigrationRun.findOne({ runId });
    if (!runRecord) {
      return res.status(404).json({
        success: false,
        error: `Migration run '${runId}' not found.`
      });
    }

    const db = mongoose.connection.db;
    const collectionData = {};

    for (const collName of runRecord.collectionsCreated) {
      const docs = await db.collection(collName).find().limit(50).toArray();
      collectionData[collName] = docs;
    }

    return res.json({
      success: true,
      runRecord,
      documents: collectionData
    });
  } catch (error) {
    console.error("Get run error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch run details.",
      details: sanitizeErrorMessage(error)
    });
  }
};

// ====================================================
// DELETE /api/migration/runs/:runId
// Delete a specific run and its target collections
// ====================================================
const deleteRun = async (req, res) => {
  try {
    const { runId } = req.params;

    const runRecord = await MigrationRun.findOne({ runId });
    if (!runRecord) {
      return res.status(404).json({
        success: false,
        error: `Migration run '${runId}' not found.`
      });
    }

    const db = mongoose.connection.db;
    for (const collName of runRecord.collectionsCreated) {
      try {
        await db.collection(collName).drop();
      } catch (dropErr) {
        // Collection might not exist, ignore
      }
    }

    await MigrationRun.deleteOne({ runId });

    return res.json({
      success: true,
      message: `Run '${runId}' and its target collections deleted successfully.`
    });
  } catch (error) {
    console.error("Delete run error:", error.message);
    return res.status(500).json({
      success: false,
      error: "Failed to delete run.",
      details: sanitizeErrorMessage(error)
    });
  }
};

module.exports = {
  analyzeMigration,
  getMigrations,
  getMigration,
  updateMigration,
  deleteMigration,
  executeDataTransformation,
  getRunDetails,
  deleteRun
};