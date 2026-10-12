/**
 * SchemaShift - Migration Engine
 * Synthesizes parsed SQL schema, relationships, and query access patterns into
 * an optimized MongoDB document schema proposal with trade-off explanations.
 * 
 * Core strategies:
 * - EMBED: For 1:N or 1:1 relationships frequently accessed together in queries.
 * - REFERENCE: For entities queried independently or unbounded 1:N relationships.
 * - EMBED + REFERENCE: For N:M junction relationships co-accessed with the parent entity.
 */

function generateMongoSchema(schema, relationships, queryAnalysis) {
  const collections = [];
  const decisions = [];
  const warnings = [];

  const tables = (schema && schema.tables) ? schema.tables : [];
  const directRels = (relationships && relationships.directRelationships) ? relationships.directRelationships : [];
  const manyToManyRels = (relationships && relationships.manyToManyRelationships) ? relationships.manyToManyRelationships : [];
  const queries = Array.isArray(queryAnalysis) ? queryAnalysis : [];

  // Helper to find table definition
  function findTable(name) {
    if (!name) return null;
    return tables.find(t => t.name.toLowerCase() === name.toLowerCase());
  }

  // Helper to check if two tables are joined together in any query
  function areTablesJoined(tableA, tableB) {
    const aLower = tableA.toLowerCase();
    const bLower = tableB.toLowerCase();

    for (const q of queries) {
      const qTables = q.tables.map(t => t.toLowerCase());
      if (qTables.includes(aLower) && qTables.includes(bLower)) {
        return {
          joined: true,
          query: q.query
        };
      }
    }
    return { joined: false, query: null };
  }

  // Helper to check if a table is queried independently (in single-table query)
  function isQueriedIndependently(tableName) {
    const tLower = tableName.toLowerCase();
    return queries.some(q => q.tables.length === 1 && q.tables[0].toLowerCase() === tLower);
  }

  // Create a base MongoDB collection representation from a SQL table
  function createBaseCollection(table) {
    return {
      name: table.name.toLowerCase(),
      sqlTableName: table.name,
      fields: table.columns.map(col => {
        // Check if this column is a foreign key
        const fk = table.foreignKeys.find(f => f.column.toLowerCase() === col.name.toLowerCase());
        const fieldObj = {
          name: col.name,
          type: col.type,
          bsonType: col.bsonType || "string",
          primaryKey: !!col.primaryKey
        };
        if (fk) {
          fieldObj.isReference = true;
          fieldObj.references = fk.referencesTable;
          fieldObj.referencedColumn = fk.referencesColumn;
        }
        return fieldObj;
      }),
      embeddedDocuments: []
    };
  }

  // Track tables that are embedded into other collections (so they are not duplicated at the top level)
  const embeddedTableNames = new Set();
  const junctionTableNames = new Set();

  // =========================================================================
  // STEP 1: Handle N:M Relationships
  // =========================================================================
  for (const nm of manyToManyRels) {
    const tableA = findTable(nm.fromTable);
    const tableB = findTable(nm.toTable);
    const junctionTable = findTable(nm.junctionTable);

    if (!tableA || !tableB || !junctionTable) continue;

    junctionTableNames.add(junctionTable.name.toLowerCase());

    // Check if parent, junction, and related tables are queried together
    const aLower = tableA.name.toLowerCase();
    const bLower = tableB.name.toLowerCase();
    const jLower = junctionTable.name.toLowerCase();

    let coAccessedQuery = null;
    for (const q of queries) {
      const qTables = q.tables.map(t => t.toLowerCase());
      if (qTables.includes(aLower) && (qTables.includes(jLower) || qTables.includes(bLower))) {
        coAccessedQuery = q.query;
        break;
      }
    }

    if (coAccessedQuery) {
      // EMBED + REFERENCE strategy
      // Embed relationship attributes and reference into Table A collection
      let parentCol = collections.find(c => c.name === tableA.name.toLowerCase());
      if (!parentCol) {
        parentCol = createBaseCollection(tableA);
        collections.push(parentCol);
      }

      // Fields for embedded subdocument:
      // Reference to Table B + non-FK junction attributes (e.g., semester)
      const embeddedFields = [];

      // Find FK pointing to Table B
      const fkToB = junctionTable.foreignKeys.find(
        fk => fk.referencesTable.toLowerCase() === tableB.name.toLowerCase()
      );

      if (fkToB) {
        const refColInB = tableB.columns.find(
          c => c.name.toLowerCase() === fkToB.referencesColumn.toLowerCase()
        );
        embeddedFields.push({
          name: fkToB.column,
          type: "REFERENCE",
          bsonType: refColInB ? refColInB.bsonType : "string",
          references: tableB.name,
          referencedColumn: fkToB.referencesColumn,
          isReference: true
        });
      }

      // Add junction attributes (e.g. semester, grade)
      for (const attr of nm.junctionAttributes) {
        embeddedFields.push({
          name: attr.name,
          type: attr.type,
          bsonType: attr.bsonType || "string"
        });
      }

      parentCol.embeddedDocuments.push({
        name: junctionTable.name.toLowerCase(),
        fields: embeddedFields,
        cardinality: "array"
      });

      embeddedTableNames.add(junctionTable.name.toLowerCase());

      // Ensure Table B exists as its own top-level collection
      if (!collections.some(c => c.name === tableB.name.toLowerCase())) {
        collections.push(createBaseCollection(tableB));
      }

      decisions.push({
        relationship: `${tableA.name} ↔ ${tableB.name}`,
        type: "N:M",
        strategy: "EMBED + REFERENCE",
        embeddedIn: tableA.name,
        references: tableB.name,
        junctionTable: junctionTable.name,
        queryEvidence: coAccessedQuery,
        reason: `The N:M relationship is accessed together with '${tableA.name}' in query workloads. Relationship-specific attributes are embedded into '${tableA.name}' while referencing '${tableB.name}'.`,
        tradeOff: `Embedding relationship attributes eliminates joins when querying ${tableA.name}'s associations. Referencing ${tableB.name} avoids duplicating the full ${tableB.name} document across multiple entries.`,
        limitations: `If an individual ${tableA.name} entity participates in thousands of relations, embedded array size must be monitored against MongoDB's 16MB document boundary.`
      });
    } else {
      // Pure REFERENCE strategy: keep all 3 tables separate
      decisions.push({
        relationship: `${tableA.name} ↔ ${tableB.name}`,
        type: "N:M",
        strategy: "REFERENCE",
        queryEvidence: "No co-access query evidence found for junction traversal.",
        reason: `The tables are not accessed together in the provided queries. Normalizing as separate collections prevents unnecessary document bloat.`,
        tradeOff: `Eliminates document size growth and avoids update anomalies, but queries requiring joined data will necessitate multi-collection lookups or aggregation pipelines.`,
        limitations: `Requires $lookup or application-level joins for combined queries.`
      });
    }
  }

  // =========================================================================
  // STEP 2: Initialize Base Collections for non-junction tables
  // =========================================================================
  for (const table of tables) {
    const tLower = table.name.toLowerCase();
    if (junctionTableNames.has(tLower) || embeddedTableNames.has(tLower)) {
      continue;
    }
    if (!collections.some(c => c.name === tLower)) {
      collections.push(createBaseCollection(table));
    }
  }

  // =========================================================================
  // STEP 3: Handle 1:N Relationships
  // =========================================================================
  for (const rel of directRels) {
    if (rel.isJunctionLeg) continue; // Skip junction legs already handled in N:M
    if (rel.type !== "1:N") continue;

    const parentTable = findTable(rel.fromTable);
    const childTable = findTable(rel.toTable);

    if (!parentTable || !childTable) continue;

    const joinEvidence = areTablesJoined(parentTable.name, childTable.name);
    const childIndependent = isQueriedIndependently(childTable.name);

    // If joined in queries, decide EMBED
    // If queried independently without joins, decide REFERENCE
    const shouldEmbed = joinEvidence.joined && !childIndependent;

    if (shouldEmbed) {
      // EMBED STRATEGY
      const parentCol = collections.find(c => c.name === parentTable.name.toLowerCase());
      if (parentCol) {
        // Filter child fields: omit the redundant foreign key to the parent
        const childFields = childTable.columns
          .filter(c => c.name.toLowerCase() !== rel.foreignKey.toLowerCase())
          .map(c => ({
            name: c.name,
            type: c.type,
            bsonType: c.bsonType || "string",
            primaryKey: c.primaryKey
          }));

        parentCol.embeddedDocuments.push({
          name: childTable.name.toLowerCase(),
          fields: childFields,
          cardinality: "array"
        });

        // CRITICAL: Remove child table from top-level collections so it is NOT duplicated!
        const childIndex = collections.findIndex(c => c.name === childTable.name.toLowerCase());
        if (childIndex !== -1) {
          collections.splice(childIndex, 1);
        }
        embeddedTableNames.add(childTable.name.toLowerCase());

        decisions.push({
          relationship: `${parentTable.name} → ${childTable.name}`,
          type: "1:N",
          strategy: "EMBED",
          embeddedIn: parentTable.name,
          queryEvidence: joinEvidence.query || "Entities queried together via JOIN",
          reason: `Entities are frequently queried together. Embedding '${childTable.name}' inside '${parentTable.name}' enables single-read retrieval without relational joins.`,
          tradeOff: `Improves read performance and data locality. However, updates to child documents require writing to parent documents, and document size increases with array length.`,
          limitations: `Suitable when child collection cardinality is bounded. Large, unbounded child sets should use referencing to avoid MongoDB 16MB document limits.`
        });
      }
    } else {
      // REFERENCE STRATEGY
      // Ensure child collection explicitly marks the foreign key reference
      const childCol = collections.find(c => c.name === childTable.name.toLowerCase());
      if (childCol) {
        const fkField = childCol.fields.find(f => f.name.toLowerCase() === rel.foreignKey.toLowerCase());
        if (fkField) {
          fkField.isReference = true;
          fkField.references = parentTable.name;
          fkField.referencedColumn = rel.referencedColumn;
        }
      }

      decisions.push({
        relationship: `${parentTable.name} → ${childTable.name}`,
        type: "1:N",
        strategy: "REFERENCE",
        parentCollection: parentTable.name,
        childCollection: childTable.name,
        referenceField: rel.foreignKey,
        queryEvidence: joinEvidence.joined
          ? joinEvidence.query
          : `Entities are accessed independently in supplied queries without joins.`,
        reason: `The entities have independent access patterns or lifecycles. Maintaining separate collections avoids document bloat and allows independent updates.`,
        tradeOff: `Prevents unbounded document growth and duplication anomalies. Querying parent and child together requires an explicit $lookup aggregation stage.`,
        limitations: `Reading combined records incurs additional database round-trips or aggregation pipeline overhead.`
      });
    }
  }

  // =========================================================================
  // STEP 4: Handle 1:1 Relationships
  // =========================================================================
  for (const rel of directRels) {
    if (rel.isJunctionLeg) continue;
    if (rel.type !== "1:1") continue;

    const parentTable = findTable(rel.fromTable);
    const childTable = findTable(rel.toTable);

    if (!parentTable || !childTable) continue;

    const joinEvidence = areTablesJoined(parentTable.name, childTable.name);
    // 1:1 relationships are strong candidates for embedding unless explicitly accessed independently
    const shouldEmbed = !isQueriedIndependently(childTable.name);

    if (shouldEmbed) {
      const parentCol = collections.find(c => c.name === parentTable.name.toLowerCase());
      if (parentCol) {
        const childFields = childTable.columns
          .filter(c => c.name.toLowerCase() !== rel.foreignKey.toLowerCase())
          .map(c => ({
            name: c.name,
            type: c.type,
            bsonType: c.bsonType || "string",
            primaryKey: c.primaryKey
          }));

        parentCol.embeddedDocuments.push({
          name: childTable.name.toLowerCase(),
          fields: childFields,
          cardinality: "one"
        });

        // Remove child from top-level collections
        const childIndex = collections.findIndex(c => c.name === childTable.name.toLowerCase());
        if (childIndex !== -1) {
          collections.splice(childIndex, 1);
        }
        embeddedTableNames.add(childTable.name.toLowerCase());

        decisions.push({
          relationship: `${parentTable.name} → ${childTable.name}`,
          type: "1:1",
          strategy: "EMBED",
          embeddedIn: parentTable.name,
          queryEvidence: joinEvidence.query || "1:1 entity association",
          reason: `1:1 relationship with tight lifecycle cohesion. Embedding child as a subdocument consolidates entity reads into a single document lookup.`,
          tradeOff: `Eliminates joins and maintains atomicity for parent-child updates. Couples the two entities within the same document schema.`,
          limitations: `If the child entity is updated much more frequently than the parent, document lock contention may occur.`
        });
      }
    } else {
      // REFERENCE
      const childCol = collections.find(c => c.name === childTable.name.toLowerCase());
      if (childCol) {
        const fkField = childCol.fields.find(f => f.name.toLowerCase() === rel.foreignKey.toLowerCase());
        if (fkField) {
          fkField.isReference = true;
          fkField.references = parentTable.name;
        }
      }

      decisions.push({
        relationship: `${parentTable.name} → ${childTable.name}`,
        type: "1:1",
        strategy: "REFERENCE",
        parentCollection: parentTable.name,
        childCollection: childTable.name,
        referenceField: rel.foreignKey,
        queryEvidence: `Independent queries target '${childTable.name}' directly.`,
        reason: `The 1:1 entity is accessed separately in query workloads. Maintaining separate collections prevents loading unnecessary attributes.`,
        tradeOff: `Saves memory when reading parent alone, but requires $lookup when full entity details are requested.`,
        limitations: `Atomicity across both collections requires multi-document transactions if consistency is required.`
      });
    }
  }

  return {
    targetDatabase: "MongoDB",
    collections,
    decisions,
    warnings,
    summary: {
      totalCollections: collections.length,
      embeddedDocumentsCount: collections.reduce((acc, c) => acc + (c.embeddedDocuments ? c.embeddedDocuments.length : 0), 0),
      totalDecisions: decisions.length
    }
  };
}

module.exports = generateMongoSchema;