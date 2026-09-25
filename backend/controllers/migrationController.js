const Migration = require("../models/Migration");

const parseSQLSchema =
  require("../services/schemaParser");

const analyzeRelationships =
  require("../services/relationshipAnalyzer");

const analyzeQueries =
  require("../services/queryAnalyzer");

const generateMongoSchema =
  require("../services/migrationEngine");


const analyzeMigration = async (req, res) => {

  try {

    const { schema, queries } = req.body;

    // --------------------------------------------
    // Validate input
    // --------------------------------------------

    if (!schema) {

      return res.status(400).json({
        success: false,
        error: "SQL schema is required."
      });
    }

    if (!queries) {

      return res.status(400).json({
        success: false,
        error: "SQL queries are required."
      });
    }


    // --------------------------------------------
    // Step 1: Parse SQL schema
    // --------------------------------------------

    const parsedSchema =
      parseSQLSchema(schema);


    // --------------------------------------------
    // Step 2: Analyze relationships
    // --------------------------------------------

    const relationships =
      analyzeRelationships(parsedSchema);


    // --------------------------------------------
    // Step 3: Analyze queries
    // --------------------------------------------

    const queryAnalysis =
      analyzeQueries(queries);


    // --------------------------------------------
    // Step 4: Generate MongoDB schema
    // --------------------------------------------

    const migrationResult =
      generateMongoSchema(
        parsedSchema,
        relationships,
        queryAnalysis
      );


    // --------------------------------------------
    // Step 5: Save migration in MongoDB
    // --------------------------------------------

    const migration =
      await Migration.create({

        sourceDatabase:
          "Relational Database",

        targetDatabase:
          migrationResult.targetDatabase,

        sourceSchema:
          schema,

        sampleQueries:
          queries,

        parsedSchema,

        relationships,

        queryAnalysis,

        generatedSchema:
          migrationResult.collections,

        migrationDecisions:
          migrationResult.decisions
      });


    // --------------------------------------------
    // Return result
    // --------------------------------------------

    res.status(201).json({

      success: true,

      migrationId:
        migration._id,

      parsedSchema,

      relationships,

      queryAnalysis,

      migrationResult

    });

  } catch (error) {

    console.error(
      "Migration analysis error:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "Failed to analyze migration.",

      details:
        error.message

    });
  }
};


// ====================================================
// GET ALL MIGRATIONS
// ====================================================

const getMigrations = async (req, res) => {

  try {

    const migrations =
      await Migration.find()
        .sort({ createdAt: -1 });

    res.json({

      success: true,

      count:
        migrations.length,

      migrations

    });

  } catch (error) {

    res.status(500).json({

      success: false,

      error:
        error.message

    });
  }
};


// ====================================================
// GET ONE MIGRATION
// ====================================================

const getMigration = async (req, res) => {

  try {

    const migration =
      await Migration.findById(
        req.params.id
      );

    if (!migration) {

      return res.status(404).json({

        success: false,

        error:
          "Migration not found"

      });
    }

    res.json({

      success: true,

      migration

    });

  } catch (error) {

    res.status(500).json({

      success: false,

      error:
        error.message

    });
  }
};


// ====================================================
// DELETE MIGRATION
// ====================================================

const deleteMigration = async (req, res) => {

  try {

    const migration =
      await Migration.findByIdAndDelete(
        req.params.id
      );

    if (!migration) {

      return res.status(404).json({

        success: false,

        error:
          "Migration not found"

      });
    }

    res.json({

      success: true,

      message:
        "Migration deleted successfully"

    });

  } catch (error) {

    res.status(500).json({

      success: false,

      error:
        error.message

    });
  }
};

// ====================================================
// UPDATE MIGRATION
// ====================================================

const updateMigration = async (req, res) => {

  try {

    const { schema, queries } = req.body;

    if (!schema || !queries) {

      return res.status(400).json({
        success: false,
        error: "Schema and queries are required."
      });
    }

    // Re-run the complete SchemaShift pipeline

    const parsedSchema =
      parseSQLSchema(schema);

    const relationships =
      analyzeRelationships(parsedSchema);

    const queryAnalysis =
      analyzeQueries(queries);

    const migrationResult =
      generateMongoSchema(
        parsedSchema,
        relationships,
        queryAnalysis
      );

    const migration =
      await Migration.findByIdAndUpdate(

        req.params.id,

        {
          sourceSchema: schema,
          sampleQueries: queries,

          parsedSchema,

          relationships,

          queryAnalysis,

          generatedSchema:
            migrationResult.collections,

          migrationDecisions:
            migrationResult.decisions
        },

        {
          new: true,
          runValidators: true
        }
      );

    if (!migration) {

      return res.status(404).json({
        success: false,
        error: "Migration not found"
      });
    }

    res.json({

      success: true,

      message:
        "Migration updated successfully",

      migrationId:
        migration._id,

      migrationResult

    });

  } catch (error) {

    console.error(
      "Migration update error:",
      error
    );

    res.status(500).json({

      success: false,

      error:
        "Failed to update migration.",

      details:
        error.message

    });
  }
};



module.exports = {

  analyzeMigration,

  getMigrations,

  getMigration,

  updateMigration,

  deleteMigration

};