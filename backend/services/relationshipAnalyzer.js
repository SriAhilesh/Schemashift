/**
 * SchemaShift - Relationship Analyzer
 * Analyzes parsed SQL schema to detect 1:1, 1:N, and N:M relationships.
 * 
 * Works generically across any domain model without hardcoded table names.
 */

function analyzeRelationships(schema) {
  const tables = (schema && schema.tables) ? schema.tables : [];
  const directRelationships = [];
  const manyToManyRelationships = [];
  const warnings = [];

  // Helper to find a table by case-insensitive name
  function findTable(name) {
    if (!name) return null;
    return tables.find(t => t.name.toLowerCase() === name.toLowerCase());
  }

  // Set of junction table names to distinguish them from standard 1:N children
  const junctionTableNames = new Set();

  // ----------------------------------------------------
  // STEP 1: Detect N:M relationships via Junction Tables
  // ----------------------------------------------------
  for (const table of tables) {
    if (table.foreignKeys.length < 2) continue;

    // Collect distinct referenced tables
    const referencedTableMap = new Map();
    for (const fk of table.foreignKeys) {
      const refNameLower = fk.referencesTable.toLowerCase();
      if (!referencedTableMap.has(refNameLower)) {
        referencedTableMap.set(refNameLower, fk);
      }
    }

    // A junction table connects exactly 2 distinct parent tables
    if (referencedTableMap.size === 2) {
      const referencedNames = Array.from(referencedTableMap.keys());
      const tableA = findTable(referencedNames[0]);
      const tableB = findTable(referencedNames[1]);

      if (tableA && tableB) {
        junctionTableNames.add(table.name.toLowerCase());

        // Extract non-FK columns as relationship attributes (e.g., semester, grade, enrolled_at)
        const fkColNames = new Set(table.foreignKeys.map(fk => fk.column.toLowerCase()));
        const junctionAttributes = table.columns
          .filter(c => !fkColNames.has(c.name.toLowerCase()))
          .map(c => ({
            name: c.name,
            type: c.type,
            bsonType: c.bsonType
          }));

        manyToManyRelationships.push({
          fromTable: tableA.name,
          toTable: tableB.name,
          junctionTable: table.name,
          foreignKeys: table.foreignKeys,
          junctionAttributes,
          type: "N:M"
        });
      }
    }
  }

  // ----------------------------------------------------
  // STEP 2: Detect 1:1 and 1:N Direct Relationships
  // ----------------------------------------------------
  for (const childTable of tables) {
    const isJunction = junctionTableNames.has(childTable.name.toLowerCase());

    for (const fk of childTable.foreignKeys) {
      const parentTable = findTable(fk.referencesTable);
      if (!parentTable) {
        warnings.push(
          `Cannot analyze relationship: Table '${childTable.name}' references non-existent table '${fk.referencesTable}'.`
        );
        continue;
      }

      // Check if FK in child is unique or is the sole PK -> 1:1
      const fkColumn = childTable.columns.find(
        c => c.name.toLowerCase() === fk.column.toLowerCase()
      );

      const isSolePk = childTable.primaryKeys.length === 1 &&
        childTable.primaryKeys[0].toLowerCase() === fk.column.toLowerCase();

      const isUnique = fkColumn && fkColumn.unique;

      let relationshipType = "1:N";
      if (!isJunction && (isSolePk || isUnique)) {
        relationshipType = "1:1";
      }

      directRelationships.push({
        fromTable: parentTable.name,
        toTable: childTable.name,
        foreignKey: fk.column,
        referencedColumn: fk.referencesColumn,
        type: relationshipType,
        isJunctionLeg: isJunction
      });
    }
  }

  return {
    directRelationships,
    manyToManyRelationships,
    warnings
  };
}

module.exports = analyzeRelationships;