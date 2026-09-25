function generateMongoSchema(schema, relationships, queryAnalysis) {

  const collections = [];
  const decisions = [];
  const transformedJunctionTables = new Set();

  function findTable(tableName) {
    return schema.tables.find(
      table =>
        table.name.toLowerCase() ===
        tableName.toLowerCase()
    );
  }

  function createBaseCollection(table) {
    return {
      name: table.name.toLowerCase(),
      fields: table.columns.map(column => ({
        name: column.name,
        type: column.type,
        primaryKey: column.primaryKey
      }))
    };
  }

  function isTableUsedInQuery(tableName) {

    return queryAnalysis.some(query =>
      query.tables.some(
        table =>
          table.toLowerCase() ===
          tableName.toLowerCase()
      )
    );
  }

  // ==================================================
  // STEP 1: Handle N:M relationships FIRST
  // ==================================================

  for (const relationship of relationships.manyToManyRelationships) {

    const parentTable =
      findTable(relationship.fromTable);

    const relatedTable =
      findTable(relationship.toTable);

    const junctionTable =
      findTable(relationship.junctionTable);

    if (!parentTable || !relatedTable || !junctionTable) {
      continue;
    }

    let accessedTogether = false;

    for (const query of queryAnalysis) {

      const tablesInQuery =
        query.tables.map(
          table => table.toLowerCase()
        );

      const hasParent =
        tablesInQuery.includes(
          parentTable.name.toLowerCase()
        );

      const hasJunction =
        tablesInQuery.includes(
          junctionTable.name.toLowerCase()
        );

      const hasRelated =
        tablesInQuery.includes(
          relatedTable.name.toLowerCase()
        );

      if (hasParent && hasJunction && hasRelated) {
        accessedTogether = true;
        break;
      }
    }

    // ------------------------------------------------
    // EMBED + REFERENCE
    // ------------------------------------------------

    if (accessedTogether) {

      const parentCollection = {
        name: parentTable.name.toLowerCase(),
        fields: parentTable.columns.map(column => ({
          name: column.name,
          type: column.type,
          primaryKey: column.primaryKey
        }))
      };

      const relationshipFields = [];

      for (const foreignKey of junctionTable.foreignKeys) {

        // Find the FK pointing to the parent table.
        const pointsToParent =
          foreignKey.referencesTable.toLowerCase() ===
          parentTable.name.toLowerCase();

        if (pointsToParent) {
          continue;
        }

        // The other FK becomes a reference.
        relationshipFields.push({
          name: foreignKey.column,
          type: "REFERENCE",
          references: foreignKey.referencesTable
        });
      }

      // Add non-FK attributes such as semester.
      for (const column of junctionTable.columns) {

        const isForeignKey =
          junctionTable.foreignKeys.some(
            fk =>
              fk.column.toLowerCase() ===
              column.name.toLowerCase()
          );

        if (!isForeignKey) {

          relationshipFields.push({
            name: column.name,
            type: column.type
          });
        }
      }

      parentCollection.embeddedDocuments = [
        {
          name: junctionTable.name.toLowerCase(),
          fields: relationshipFields
        }
      ];

      collections.push(parentCollection);

      transformedJunctionTables.add(
        junctionTable.name.toLowerCase()
      );

      decisions.push({
        relationship:
          `${parentTable.name} ↔ ${relatedTable.name}`,

        strategy: "EMBED + REFERENCE",

        embeddedIn: parentTable.name,

        references: relatedTable.name,

        junctionTable: junctionTable.name,

        reason:
          "The many-to-many relationship is accessed together with the parent entity in the supplied queries.",

        tradeOff:
          "Embedding relationship attributes improves read locality, while referencing the related entity avoids duplicating the full related document."
      });

    } else {

      decisions.push({
        relationship:
          `${parentTable.name} ↔ ${relatedTable.name}`,

        strategy: "REFERENCE",

        reason:
          "The supplied queries do not strongly indicate that the relationship should be embedded.",

        tradeOff:
          "Referencing avoids duplication but may require additional lookups."
      });
    }
  }

  // ==================================================
  // STEP 2: Create remaining base collections
  // ==================================================

  for (const table of schema.tables) {

    const tableName =
      table.name.toLowerCase();

    // Do not recreate collections already transformed.
    if (
      transformedJunctionTables.has(tableName)
    ) {
      continue;
    }

    // Do not duplicate a collection.
    const alreadyExists =
      collections.some(
        collection =>
          collection.name === tableName
      );

    if (!alreadyExists) {
      collections.push(
        createBaseCollection(table)
      );
    }
  }

  // ==================================================
  // STEP 3: Handle normal 1:N relationships
  // ==================================================

  for (const relationship of relationships.directRelationships) {

    // Skip relationships whose child is a junction
    // table already transformed through N:M.
    const isJunctionRelationship =
      relationships.manyToManyRelationships.some(
        manyToMany =>
          manyToMany.junctionTable.toLowerCase() ===
          relationship.toTable.toLowerCase()
      );

    if (isJunctionRelationship) {
      continue;
    }

    if (relationship.type !== "1:N") {
      continue;
    }

    const parentTable =
      findTable(relationship.fromTable);

    const childTable =
      findTable(relationship.toTable);

    if (!parentTable || !childTable) {
      continue;
    }

    let accessedTogether = false;

    for (const query of queryAnalysis) {

      const tablesInQuery =
        query.tables.map(
          table => table.toLowerCase()
        );

      if (
        tablesInQuery.includes(
          parentTable.name.toLowerCase()
        ) &&
        tablesInQuery.includes(
          childTable.name.toLowerCase()
        )
      ) {
        accessedTogether = true;
        break;
      }
    }

    if (accessedTogether) {

      const parentCollection =
        collections.find(
          collection =>
            collection.name ===
            parentTable.name.toLowerCase()
        );

      if (parentCollection) {

        parentCollection.embeddedDocuments =
          parentCollection.embeddedDocuments || [];

        // Remove the child collection because it is
        // being transformed into an embedded document.
        const childCollectionIndex =
          collections.findIndex(
            collection =>
              collection.name ===
              childTable.name.toLowerCase()
          );

        if (childCollectionIndex !== -1) {
          collections.splice(
            childCollectionIndex,
            1
          );
        }

        const childFields =
          childTable.columns
            .filter(
              column =>
                column.name.toLowerCase() !==
                relationship.foreignKey.toLowerCase()
            )
            .map(column => ({
              name: column.name,
              type: column.type
            }));

        parentCollection.embeddedDocuments.push({
          name: childTable.name.toLowerCase(),
          fields: childFields
        });
      }

      decisions.push({
        relationship:
          `${parentTable.name} → ${childTable.name}`,

        strategy: "EMBED",

        reason:
          "The related entities are accessed together in the supplied queries.",

        tradeOff:
          "Embedding improves read locality but may increase document size."
      });

    } else {

      decisions.push({
        relationship:
          `${parentTable.name} → ${childTable.name}`,

        strategy: "REFERENCE",

        reason:
          "The related entities are not accessed together in the supplied queries.",

        tradeOff:
          "Referencing keeps documents smaller but may require additional lookups."
      });
    }
  }

  // ==================================================
  // STEP 4: Handle 1:1 relationships
  // ==================================================

  for (const relationship of relationships.directRelationships) {

    if (relationship.type !== "1:1") {
      continue;
    }

    decisions.push({
      relationship:
        `${relationship.fromTable} → ${relationship.toTable}`,

      strategy: "EMBED",

      reason:
        "A 1:1 relationship is a strong candidate for embedding when the entities are closely associated.",

      tradeOff:
        "Embedding simplifies access but couples the two entities within the same document."
    });
  }

  // ==================================================
  // FINAL RESULT
  // ==================================================

  return {
    targetDatabase: "MongoDB",
    collections,
    decisions
  };
}

module.exports = generateMongoSchema;