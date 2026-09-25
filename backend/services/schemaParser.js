function parseSQLSchema(sql) {

  const schema = {
    tables: []
  };

  // Find all CREATE TABLE statements
  const tableRegex = /CREATE\s+TABLE\s+(\w+)\s*\(([\s\S]*?)\)\s*;/gi;

  let tableMatch;

  while ((tableMatch = tableRegex.exec(sql)) !== null) {

    const tableName = tableMatch[1];
    const tableBody = tableMatch[2];

    const table = {
      name: tableName,
      columns: [],
      primaryKeys: [],
      foreignKeys: []
    };

    const lines = tableBody
      .split(",")
      .map(line => line.trim())
      .filter(line => line.length > 0);

    for (let line of lines) {

      // PRIMARY KEY (column)
      const tablePrimaryKeyMatch =
        line.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);

      if (tablePrimaryKeyMatch) {

        const keys = tablePrimaryKeyMatch[1]
          .split(",")
          .map(key => key.trim());

        table.primaryKeys.push(...keys);

        continue;
      }

      // FOREIGN KEY (column) REFERENCES table(column)
      const foreignKeyMatch =
        line.match(
          /FOREIGN\s+KEY\s*\((\w+)\)\s+REFERENCES\s+(\w+)\s*\((\w+)\)/i
        );

      if (foreignKeyMatch) {

        table.foreignKeys.push({
          column: foreignKeyMatch[1],
          referencesTable: foreignKeyMatch[2],
          referencesColumn: foreignKeyMatch[3]
        });

        continue;
      }

      // Ignore other table constraints
      if (/^(CONSTRAINT|UNIQUE|CHECK|INDEX)/i.test(line)) {
        continue;
      }

      // Column definition
      const columnMatch =
        line.match(/^(\w+)\s+([A-Za-z]+(?:\s*\([^)]*\))?)(.*)$/i);

      if (columnMatch) {

        const columnName = columnMatch[1];
        const dataType = columnMatch[2];

        const extra = columnMatch[3] || "";

        const isPrimaryKey =
          /PRIMARY\s+KEY/i.test(extra);

        const column = {
          name: columnName,
          type: dataType,
          primaryKey: isPrimaryKey
        };

        table.columns.push(column);

        if (isPrimaryKey) {
          table.primaryKeys.push(columnName);
        }
      }
    }

    schema.tables.push(table);
  }

  return schema;
}

module.exports = parseSQLSchema;