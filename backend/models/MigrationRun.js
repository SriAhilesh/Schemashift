const mongoose = require("mongoose");

const migrationRunSchema = new mongoose.Schema(
  {
    runId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    migrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Migration"
    },

    status: {
      type: String,
      enum: ["SUCCESS", "FAILED", "PARTIAL"],
      default: "SUCCESS"
    },

    sourceTableCounts: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    targetCollectionCounts: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    collectionsCreated: [
      {
        type: String
      }
    ],

    rejectedRecords: [
      {
        table: String,
        record: mongoose.Schema.Types.Mixed,
        reason: String
      }
    ],

    integrityChecks: {
      passed: Boolean,
      totalChecks: Number,
      violations: [
        {
          type: String
        }
      ]
    },

    summary: {
      totalSourceRecords: Number,
      totalTransformedDocuments: Number,
      totalRejectedRecords: Number,
      transformationTimeMs: Number
    }
  },
  {
    timestamps: true
  }
);

migrationRunSchema.index({ createdAt: -1 });

module.exports = mongoose.model("MigrationRun", migrationRunSchema);
