/**
 * SchemaShift - Sample Data Transformation Pipeline
 * Transforms tabular JSON source records into denormalized MongoDB documents
 * based on the generated migration schema plan and verifies referential integrity.
 */

const crypto = require("crypto");

/**
 * Validates and transforms source JSON records into MongoDB target documents.
 * 
 * @param {object} parsedSchema Parsed SQL schema object
 * @param {object} migrationResult Generated MongoDB schema plan
 * @param {object} sampleData Map of tableName -> array of records
 * @param {string} runId Unique identifier for this migration execution
 * @returns {object} { transformedCollections, sourceCounts, targetCounts, rejectedRecords, integrityChecks }
 */
function transformSampleData(parsedSchema, migrationResult, sampleData, runId) {
  const startTime = Date.now();
  const tables = parsedSchema.tables || [];
  const collectionsPlan = migrationResult.collections || [];
  const decisions = migrationResult.decisions || [];

  const sourceCounts = {};
  const targetCounts = {};
  const rejectedRecords = [];
  const integrityViolations = [];
  let totalChecks = 0;

  // Case-insensitive lookup map for input sample records
  const normalizedSampleData = {};
  for (const [key, records] of Object.entries(sampleData || {})) {
    if (Array.isArray(records)) {
      normalizedSampleData[key.toLowerCase()] = records;
      sourceCounts[key] = records.length;
    }
  }

  // Helper to find table records
  function getRecordsForTable(tableName) {
    if (!tableName) return [];
    return normalizedSampleData[tableName.toLowerCase()] || [];
  }

  // Helper to find table schema
  function findTableSchema(tableName) {
    if (!tableName) return null;
    return tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
  }

  // -------------------------------------------------------------------------
  // STEP 1: Referential Integrity Validation on Source Records
  // -------------------------------------------------------------------------
  // Track valid record sets by primary key for foreign key verification
  const validPkSets = {}; // tableLower -> Set of serialized PKs

  for (const table of tables) {
    const tLower = table.name.toLowerCase();
    const records = getRecordsForTable(table.name);
    validPkSets[tLower] = new Set();

    for (const record of records) {
      if (table.primaryKeys && table.primaryKeys.length > 0) {
        // Serialized PK value
        const pkVal = table.primaryKeys
          .map(pk => {
            const val = getFieldVal(record, pk);
            return val !== undefined ? String(val) : "";
          })
          .join("::");
        if (pkVal) validPkSets[tLower].add(pkVal);
      }
    }
  }

  // Helper to case-insensitively retrieve field value from record
  function getFieldVal(record, fieldName) {
    if (!record || typeof record !== "object") return undefined;
    const fLower = fieldName.toLowerCase();
    for (const [k, v] of Object.entries(record)) {
      if (k.toLowerCase() === fLower) return v;
    }
    return undefined;
  }

  // Verify foreign key integrity on all records
  const validRecordsMap = {}; // tableLower -> Array of valid records

  for (const table of tables) {
    const tLower = table.name.toLowerCase();
    const records = getRecordsForTable(table.name);
    validRecordsMap[tLower] = [];

    for (const record of records) {
      let isRejected = false;

      // Check foreign keys
      for (const fk of table.foreignKeys) {
        totalChecks++;
        const parentTable = findTableSchema(fk.referencesTable);
        if (!parentTable) continue;

        const pLower = parentTable.name.toLowerCase();
        const fkVal = getFieldVal(record, fk.column);

        if (fkVal === undefined || fkVal === null) {
          // Nullable FK, allowed if not primary key
          continue;
        }

        const parentPkSet = validPkSets[pLower];
        const valStr = String(fkVal);

        if (!parentPkSet || !parentPkSet.has(valStr)) {
          isRejected = true;
          const violation = `Integrity check failed: ${table.name}.${fk.column}=${fkVal} references non-existent parent in ${parentTable.name}.${fk.referencesColumn}.`;
          integrityViolations.push(violation);
          rejectedRecords.push({
            table: table.name,
            record,
            reason: violation
          });
          break;
        }
      }

      if (!isRejected) {
        validRecordsMap[tLower].push(record);
      }
    }
  }

  // -------------------------------------------------------------------------
  // STEP 2: Document Construction according to Migration Plan
  // -------------------------------------------------------------------------
  const transformedCollections = {}; // collectionName -> Array of documents

  for (const colPlan of collectionsPlan) {
    const colName = colPlan.name;
    const baseTableName = colPlan.sqlTableName || colName;
    const baseRecords = validRecordsMap[baseTableName.toLowerCase()] || [];

    const documents = [];

    for (const baseRecord of baseRecords) {
      // Build top-level fields
      const doc = {
        _migrationRunId: runId
      };

      for (const field of colPlan.fields) {
        const val = getFieldVal(baseRecord, field.name);
        if (val !== undefined) {
          doc[field.name] = val;
        }
      }

      // Process embedded subdocuments
      if (colPlan.embeddedDocuments && colPlan.embeddedDocuments.length > 0) {
        for (const embPlan of colPlan.embeddedDocuments) {
          const embChildName = embPlan.name;
          const embTableSchema = findTableSchema(embChildName);

          // Find decision for this embedding to determine relationship type
          const decision = decisions.find(d =>
            d.embeddedIn && d.embeddedIn.toLowerCase() === baseTableName.toLowerCase() &&
            ((d.junctionTable && d.junctionTable.toLowerCase() === embChildName.toLowerCase()) ||
             (d.relationship && d.relationship.toLowerCase().includes(embChildName.toLowerCase())))
          );

          if (decision && decision.type === "N:M") {
            // N:M Junction Embedding
            // e.g. Student embedding enrollment with course reference
            const junctionRecords = validRecordsMap[embChildName.toLowerCase()] || [];
            const parentTableSchema = findTableSchema(baseTableName);

            // Find FK in junction table pointing to parent
            const fkToParent = embTableSchema.foreignKeys.find(
              fk => fk.referencesTable.toLowerCase() === baseTableName.toLowerCase()
            );

            const embeddedList = [];
            for (const jRec of junctionRecords) {
              const jFkVal = fkToParent ? getFieldVal(jRec, fkToParent.column) : undefined;
              const parentPkCol = parentTableSchema.primaryKeys[0];
              const pPkVal = parentPkCol ? getFieldVal(baseRecord, parentPkCol) : undefined;

              if (jFkVal !== undefined && pPkVal !== undefined && String(jFkVal) === String(pPkVal)) {
                // Construct embedded item matching embPlan.fields
                const embItem = {};
                for (const ef of embPlan.fields) {
                  const eval_ = getFieldVal(jRec, ef.name);
                  if (eval_ !== undefined) {
                    embItem[ef.name] = eval_;
                  }
                }
                embeddedList.push(embItem);
              }
            }

            doc[embChildName] = embeddedList;

          } else if (embPlan.cardinality === "array" || (decision && decision.type === "1:N")) {
            // 1:N Embedding
            // e.g. Customer embedding orders
            const childRecords = validRecordsMap[embChildName.toLowerCase()] || [];
            const parentTableSchema = findTableSchema(baseTableName);

            // Find FK in child table pointing to parent
            const fkToParent = embTableSchema ? embTableSchema.foreignKeys.find(
              fk => fk.referencesTable.toLowerCase() === baseTableName.toLowerCase()
            ) : null;

            const embeddedList = [];
            for (const cRec of childRecords) {
              const cFkVal = fkToParent ? getFieldVal(cRec, fkToParent.column) : undefined;
              const parentPkCol = parentTableSchema.primaryKeys[0];
              const pPkVal = parentPkCol ? getFieldVal(baseRecord, parentPkCol) : undefined;

              if (cFkVal !== undefined && pPkVal !== undefined && String(cFkVal) === String(pPkVal)) {
                const embItem = {};
                for (const ef of embPlan.fields) {
                  const eval_ = getFieldVal(cRec, ef.name);
                  if (eval_ !== undefined) {
                    embItem[ef.name] = eval_;
                  }
                }
                embeddedList.push(embItem);
              }
            }

            doc[embChildName] = embeddedList;

          } else if (embPlan.cardinality === "one" || (decision && decision.type === "1:1")) {
            // 1:1 Embedding
            const childRecords = validRecordsMap[embChildName.toLowerCase()] || [];
            const parentTableSchema = findTableSchema(baseTableName);

            const fkToParent = embTableSchema ? embTableSchema.foreignKeys.find(
              fk => fk.referencesTable.toLowerCase() === baseTableName.toLowerCase()
            ) : null;

            let matchedSubdoc = null;
            for (const cRec of childRecords) {
              const cFkVal = fkToParent ? getFieldVal(cRec, fkToParent.column) : undefined;
              const parentPkCol = parentTableSchema.primaryKeys[0];
              const pPkVal = parentPkCol ? getFieldVal(baseRecord, parentPkCol) : undefined;

              if (cFkVal !== undefined && pPkVal !== undefined && String(cFkVal) === String(pPkVal)) {
                matchedSubdoc = {};
                for (const ef of embPlan.fields) {
                  const eval_ = getFieldVal(cRec, ef.name);
                  if (eval_ !== undefined) {
                    matchedSubdoc[ef.name] = eval_;
                  }
                }
                break;
              }
            }

            doc[embChildName] = matchedSubdoc;
          }
        }
      }

      documents.push(doc);
    }

    transformedCollections[colName] = documents;
    targetCounts[colName] = documents.length;
  }

  const durationMs = Date.now() - startTime;

  return {
    runId,
    transformedCollections,
    sourceCounts,
    targetCounts,
    rejectedRecords,
    integrityChecks: {
      totalChecks,
      passed: integrityViolations.length === 0,
      violations: integrityViolations
    },
    summary: {
      totalSourceRecords: Object.values(sourceCounts).reduce((a, b) => a + b, 0),
      totalTransformedDocuments: Object.values(targetCounts).reduce((a, b) => a + b, 0),
      totalRejectedRecords: rejectedRecords.length,
      transformationTimeMs: durationMs
    }
  };
}

/**
 * Persists transformed documents into isolated, run-scoped MongoDB target collections.
 * 
 * Target collections use the format: ss_data_${collectionName}_${sanitizedRunId}
 * 
 * @param {import('mongoose').mongo.Db} db Native MongoDB database handle
 * @param {object} transformedCollections Map of collectionName -> Array of documents
 * @param {string} runId
 * @returns {Promise<{ collectionsCreated: string[], insertCounts: object }>}
 */
async function persistTransformedData(db, transformedCollections, runId) {
  const sanitizedRunId = String(runId).replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24);
  const collectionsCreated = [];
  const insertCounts = {};

  for (const [colName, docs] of Object.entries(transformedCollections)) {
    const targetCollName = `ss_data_${colName.toLowerCase()}_${sanitizedRunId}`;
    collectionsCreated.push(targetCollName);

    const coll = db.collection(targetCollName);

    // Ensure clean state for this specific run
    await coll.deleteMany({ _migrationRunId: runId });

    if (docs.length > 0) {
      const result = await coll.insertMany(docs, { ordered: false });
      insertCounts[targetCollName] = result.insertedCount;
    } else {
      insertCounts[targetCollName] = 0;
    }
  }

  return {
    collectionsCreated,
    insertCounts
  };
}

module.exports = {
  transformSampleData,
  persistTransformedData
};
