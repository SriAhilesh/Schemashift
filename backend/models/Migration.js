const mongoose = require("mongoose");

const migrationSchema = new mongoose.Schema(
  {
    sourceDatabase: {
      type: String,
      default: "Relational Database"
    },

    targetDatabase: {
      type: String,
      default: "MongoDB"
    },

    sourceSchema: {
      type: String,
      required: true
    },

    sampleQueries: {
      type: String,
      required: true
    },

    parsedSchema: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },

    relationships: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },

    queryAnalysis: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },

    generatedSchema: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },

    migrationDecisions: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    }
  },
  {
    timestamps: true
  }
);

// Index to optimize chronological retrieval of migration history
migrationSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Migration", migrationSchema);