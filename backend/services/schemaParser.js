/**
 * SchemaShift - SQL Schema Parser
 * Parses supported SQL DDL (CREATE TABLE statements) into structured metadata.
 * 
 * Supports:
 * - Table names (with or without backticks/quotes)
 * - Parameterized types including commas, e.g. DECIMAL(10,2), NUMERIC(8,2), VARCHAR(255)
 * - Single-column and composite PRIMARY KEY constraints
 * - Table-level and inline FOREIGN KEY constraints with references
 * - Column constraints (NOT NULL, UNIQUE, AUTO_INCREMENT)
 * - Comment stripping (-- line comments, /* block comments * /)
 * - BSON type mapping suggestions
 * - Semantic validation (missing referenced tables/columns, duplicate definitions)
 */

// Mapping of common SQL data types to recommended MongoDB BSON types
const SQL_TO_BSON_MAP = {
  INT: "int",
  INTEGER: "int",
  TINYINT: "int",
  SMALLINT: "int",
  MEDIUMINT: "int",
  BIGINT: "long",
  DECIMAL: "decimal",
  NUMERIC: "decimal",
  FLOAT: "double",
  DOUBLE: "double",
  REAL: "double",
  VARCHAR: "string",
  CHAR: "string",
  TEXT: "string",
  TINYTEXT: "string",
  MEDIUMTEXT: "string",
  LONGTEXT: "string",
  BOOLEAN: "bool",
  BOOL: "bool",
  DATE: "date",
  DATETIME: "date",
  TIMESTAMP: "date",
  TIME: "string",
  JSON: "object",
  BLOB: "binData",
  BINARY: "binData",
  VARBINARY: "binData"
};

/**
 * Suggests an appropriate MongoDB BSON type for a given SQL type string.
 * @param {string} sqlType 
 * @returns {string}
 */
function suggestBsonType(sqlType) {
  if (!sqlType) return "string";
  const baseType = sqlType.trim().split(/[\s(]/)[0].toUpperCase();
  return SQL_TO_BSON_MAP[baseType] || "string";
}

/**
 * Strips comments from SQL text.
 * @param {string} sql 
 * @returns {string}
 */
function stripComments(sql) {
  if (!sql) return "";
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "") // Block comments
    .replace(/--.*$/gm, "");           // Line comments
}

/**
 * Splits table body by commas while respecting nested parentheses and quotes.
 * Ensures types like DECIMAL(10,2) or composite keys are not prematurely split.
 * @param {string} body 
 * @returns {string[]}
 */
function splitDefinitions(body) {
  const parts = [];
  let current = "";
  let parenDepth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;

  for (let i = 0; i < body.length; i++) {
    const char = body[i];

    if (char === "'" && !inDoubleQuote && !inBacktick) {
      inSingleQuote = !inSingleQuote;
      current += char;
    } else if (char === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
    } else if (char === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
      current += char;
    } else if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
      if (char === "(") {
        parenDepth++;
        current += char;
      } else if (char === ")") {
        parenDepth = Math.max(0, parenDepth - 1);
        current += char;
      } else if (char === "," && parenDepth === 0) {
        if (current.trim().length > 0) {
          parts.push(current.trim());
        }
        current = "";
      } else {
        current += char;
      }
    } else {
      current += char;
    }
  }

  if (current.trim().length > 0) {
    parts.push(current.trim());
  }

  return parts;
}

/**
 * Strips quotes or backticks from an identifier name.
 * @param {string} id 
 * @returns {string}
 */
function cleanIdentifier(id) {
  if (!id) return "";
  return id.trim().replace(/^[`'"]|[`'"]$/g, "");
}

/**
 * Parses SQL DDL string into structured schema representation.
 * @param {string} sql 
 * @returns {object} { tables: [], warnings: [], errors: [] }
 */
function parseSQLSchema(sql) {
  const warnings = [];
  const errors = [];
  const tables = [];

  if (!sql || typeof sql !== "string" || sql.trim().length === 0) {
    return {
      tables: [],
      warnings: ["No SQL input provided."],
      errors: ["SQL schema is empty."]
    };
  }

  const cleanSql = stripComments(sql);

  // Match CREATE TABLE [IF NOT EXISTS] tableName (body);
  const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`'"\w]+)\s*\(([\s\S]*?)\)\s*;/gi;

  let tableMatch;
  let matchCount = 0;

  while ((tableMatch = tableRegex.exec(cleanSql)) !== null) {
    matchCount++;
    const rawTableName = tableMatch[1];
    const tableName = cleanIdentifier(rawTableName);
    const tableBody = tableMatch[2];

    const table = {
      name: tableName,
      columns: [],
      primaryKeys: [],
      foreignKeys: []
    };

    const definitions = splitDefinitions(tableBody);

    for (const rawLine of definitions) {
      const line = rawLine.trim();
      if (!line) continue;

      // 1. Table-level PRIMARY KEY constraint: PRIMARY KEY (col1, col2)
      const pkMatch = line.match(/(?:CONSTRAINT\s+[`'"\w]+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      if (pkMatch) {
        const keys = pkMatch[1]
          .split(",")
          .map(k => cleanIdentifier(k))
          .filter(Boolean);
        table.primaryKeys.push(...keys);
        continue;
      }

      // 2. Table-level FOREIGN KEY constraint:
      // FOREIGN KEY (col) REFERENCES TargetTable(target_col)
      const fkMatch = line.match(
        /(?:CONSTRAINT\s+[`'"\w]+\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([`'"\w]+)\s*\(([^)]+)\)(?:\s+ON\s+DELETE\s+[A-Za-z\s]+)?(?:\s+ON\s+UPDATE\s+[A-Za-z\s]+)?/i
      );
      if (fkMatch) {
        const localCols = fkMatch[1].split(",").map(c => cleanIdentifier(c));
        const refTable = cleanIdentifier(fkMatch[2]);
        const refCols = fkMatch[3].split(",").map(c => cleanIdentifier(c));

        for (let i = 0; i < localCols.length; i++) {
          table.foreignKeys.push({
            column: localCols[i],
            referencesTable: refTable,
            referencesColumn: refCols[i] || refCols[0]
          });
        }
        continue;
      }

      // 3. Skip other table-level constraints (CHECK, UNIQUE key, INDEX)
      if (/^(?:CONSTRAINT\s+[`'"\w]+\s+)?(?:CHECK|KEY|INDEX)/i.test(line)) {
        continue;
      }

      // 4. Standalone table-level UNIQUE (col1, col2)
      const uniqueMatch = line.match(/(?:CONSTRAINT\s+[`'"\w]+\s+)?UNIQUE(?:\s+KEY|\s+INDEX)?\s*\(([^)]+)\)/i);
      if (uniqueMatch) {
        const uniqueCols = uniqueMatch[1].split(",").map(c => cleanIdentifier(c));
        for (const uCol of uniqueCols) {
          const found = table.columns.find(c => c.name.toLowerCase() === uCol.toLowerCase());
          if (found) found.unique = true;
        }
        continue;
      }

      // 5. Column definition:
      // name TYPE(params) [NOT NULL] [PRIMARY KEY] [UNIQUE] [REFERENCES ...]
      // Support types like DECIMAL(10,2), VARCHAR(100), INT, etc.
      const colMatch = line.match(/^([`'"\w]+)\s+([A-Za-z]+(?:\s*\([^)]*\))?)([\s\S]*)$/);
      if (colMatch) {
        const colName = cleanIdentifier(colMatch[1]);
        const dataType = colMatch[2].trim().toUpperCase();
        const rest = colMatch[3] || "";

        const isPrimaryKey = /PRIMARY\s+KEY/i.test(rest);
        const isUnique = /UNIQUE/i.test(rest);
        const isNotNull = /NOT\s+NULL/i.test(rest);

        // Check for inline REFERENCES: col INT REFERENCES OtherTable(other_col)
        const inlineFkMatch = rest.match(/REFERENCES\s+([`'"\w]+)\s*(?:\(([^)]+)\))?/i);
        if (inlineFkMatch) {
          const refTable = cleanIdentifier(inlineFkMatch[1]);
          const refCol = inlineFkMatch[2] ? cleanIdentifier(inlineFkMatch[2]) : colName;
          table.foreignKeys.push({
            column: colName,
            referencesTable: refTable,
            referencesColumn: refCol
          });
        }

        const column = {
          name: colName,
          type: dataType,
          bsonType: suggestBsonType(dataType),
          primaryKey: isPrimaryKey,
          unique: isUnique,
          notNull: isNotNull
        };

        table.columns.push(column);

        if (isPrimaryKey && !table.primaryKeys.includes(colName)) {
          table.primaryKeys.push(colName);
        }
      } else {
        warnings.push(`Unrecognized statement inside table '${tableName}': "${line}"`);
      }
    }

    // Deduplicate primary keys and synchronize column.primaryKey flags
    table.primaryKeys = [...new Set(table.primaryKeys)];
    for (const col of table.columns) {
      if (table.primaryKeys.some(pk => pk.toLowerCase() === col.name.toLowerCase())) {
        col.primaryKey = true;
      }
    }

    // Check for duplicate table
    const existingTable = tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
    if (existingTable) {
      warnings.push(`Duplicate table definition for '${tableName}'. Overwrite ignored.`);
    } else {
      tables.push(table);
    }
  }

  if (matchCount === 0) {
    errors.push("No valid CREATE TABLE statements could be parsed from the provided SQL.");
  }

  // Semantic validation: verify foreign keys reference valid tables and columns
  for (const table of tables) {
    if (table.primaryKeys.length === 0) {
      warnings.push(`Table '${table.name}' does not define an explicit PRIMARY KEY.`);
    }

    for (const fk of table.foreignKeys) {
      const referencedTable = tables.find(
        t => t.name.toLowerCase() === fk.referencesTable.toLowerCase()
      );

      if (!referencedTable) {
        errors.push(
          `Foreign key error in table '${table.name}': referenced table '${fk.referencesTable}' does not exist.`
        );
        continue;
      }

      const referencedColumn = referencedTable.columns.find(
        c => c.name.toLowerCase() === fk.referencesColumn.toLowerCase()
      );

      if (!referencedColumn) {
        errors.push(
          `Foreign key error in table '${table.name}': referenced column '${fk.referencesColumn}' does not exist in table '${referencedTable.name}'.`
        );
      }

      const localColumn = table.columns.find(
        c => c.name.toLowerCase() === fk.column.toLowerCase()
      );

      if (!localColumn) {
        errors.push(
          `Foreign key error in table '${table.name}': local column '${fk.column}' is not defined in '${table.name}'.`
        );
      }
    }
  }

  return {
    tables,
    warnings,
    errors
  };
}

module.exports = parseSQLSchema;