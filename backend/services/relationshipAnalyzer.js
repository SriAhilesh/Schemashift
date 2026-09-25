function analyzeRelationships(schema) {

  const relationships = [];

  // -----------------------------------------
  // Step 1: Detect direct FK relationships
  // -----------------------------------------

  for (const table of schema.tables) {

    for (const foreignKey of table.foreignKeys) {

      const parentTable = schema.tables.find(
        t =>
          t.name.toLowerCase() ===
          foreignKey.referencesTable.toLowerCase()
      );

      if (!parentTable) {
        continue;
      }

      const foreignKeyColumn = table.columns.find(
        column =>
          column.name.toLowerCase() ===
          foreignKey.column.toLowerCase()
      );

      const parentPrimaryKey =
        parentTable.primaryKeys.some(
          key =>
            key.toLowerCase() ===
            foreignKey.referencesColumn.toLowerCase()
        );

      let relationshipType = "1:N";

      /*
       * If the FK column is also a PK,
       * treat the relationship as 1:1.
       */
      if (
        foreignKeyColumn &&
        foreignKeyColumn.primaryKey &&
        parentPrimaryKey
      ) {
        relationshipType = "1:1";
      }

      relationships.push({
        fromTable: parentTable.name,
        toTable: table.name,
        foreignKey: foreignKey.column,
        referencedColumn: foreignKey.referencesColumn,
        type: relationshipType
      });
    }
  }

  // -----------------------------------------
  // Step 2: Detect N:M relationships
  // -----------------------------------------

  const manyToManyRelationships = [];

  for (const table of schema.tables) {

    /*
     * A junction table usually has:
     * - 2 or more foreign keys
     * - foreign keys pointing to different tables
     */

    if (table.foreignKeys.length < 2) {
      continue;
    }

    const referencedTables = [
      ...new Set(
        table.foreignKeys.map(
          fk => fk.referencesTable.toLowerCase()
        )
      )
    ];

    if (referencedTables.length !== 2) {
      continue;
    }

    const tableA = schema.tables.find(
      t =>
        t.name.toLowerCase() === referencedTables[0]
    );

    const tableB = schema.tables.find(
      t =>
        t.name.toLowerCase() === referencedTables[1]
    );

    if (!tableA || !tableB) {
      continue;
    }

    manyToManyRelationships.push({
      fromTable: tableA.name,
      toTable: tableB.name,
      junctionTable: table.name,
      type: "N:M"
    });
  }

  return {
    directRelationships: relationships,
    manyToManyRelationships
  };
}

module.exports = analyzeRelationships;