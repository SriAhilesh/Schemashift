/**
 * SchemaShift - Query Analyzer
 * Parses representative SQL queries into structured access patterns.
 * 
 * Extracts:
 * - Query type (SELECT, INSERT, UPDATE, DELETE)
 * - Tables referenced and their aliases (e.g., Student s, Orders AS o)
 * - Joined table pairs (JOIN ... ON ...)
 * - Filter predicates (WHERE clauses)
 * - Single-table vs co-accessed patterns
 * - Warnings for unsupported query constructs (UNION, subqueries)
 */

function stripComments(sql) {
  if (!sql) return "";
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/--.*$/gm, "");
}

function cleanIdentifier(id) {
  if (!id) return "";
  return id.trim().replace(/^[`'"]|[`'"]$/g, "");
}

function analyzeQueries(sqlQueries) {
  const queries = [];
  const warnings = [];

  if (!sqlQueries || typeof sqlQueries !== "string" || sqlQueries.trim().length === 0) {
    return [];
  }

  const cleanSql = stripComments(sqlQueries);

  // Split multiple queries by semicolon
  const rawQueryList = cleanSql
    .split(";")
    .map(q => q.trim())
    .filter(q => q.length > 0);

  for (const sql of rawQueryList) {
    const queryInfo = {
      query: sql,
      type: "UNKNOWN",
      tables: [],
      tableAliases: {},
      selectedColumns: [],
      filters: [],
      joins: [],
      joinedPairs: [],
      isJoinQuery: false,
      warnings: []
    };

    // 1. Detect query type
    if (/^\s*SELECT/i.test(sql)) {
      queryInfo.type = "SELECT";
    } else if (/^\s*INSERT/i.test(sql)) {
      queryInfo.type = "INSERT";
    } else if (/^\s*UPDATE/i.test(sql)) {
      queryInfo.type = "UPDATE";
    } else if (/^\s*DELETE/i.test(sql)) {
      queryInfo.type = "DELETE";
    } else {
      queryInfo.warnings.push("Unsupported or non-DML SQL query type.");
    }

    // 2. Detect unsupported constructs
    if (/\bUNION\b/i.test(sql)) {
      queryInfo.warnings.push("UNION operations are not modeled in document access patterns.");
    }
    if (/\(\s*SELECT\b/i.test(sql)) {
      queryInfo.warnings.push("Subqueries are currently parsed as outer-level references.");
    }

    // 3. Extract SELECT columns
    const selectMatch = sql.match(/SELECT\s+([\s\S]*?)\s+FROM/i);
    if (selectMatch) {
      queryInfo.selectedColumns = selectMatch[1]
        .split(",")
        .map(col => col.trim())
        .filter(Boolean);
    }

    // 4. Extract FROM table and alias
    // Pattern: FROM TableName [AS] [alias]
    const fromMatch = sql.match(/FROM\s+([`'"\w]+)(?:\s+(?:AS\s+)?([`'"\w]+))?(?=\s+JOIN|\s+WHERE|\s+GROUP|\s+ORDER|\s+LIMIT|$)/i);
    if (fromMatch) {
      const fromTable = cleanIdentifier(fromMatch[1]);
      const alias = fromMatch[2] ? cleanIdentifier(fromMatch[2]) : null;

      // Filter out SQL keywords inadvertently captured as alias
      const reserved = ["WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "CROSS", "NATURAL", "ON", "GROUP", "ORDER", "LIMIT"];
      const validAlias = alias && !reserved.includes(alias.toUpperCase()) ? alias : null;

      queryInfo.tables.push(fromTable);
      if (validAlias) {
        queryInfo.tableAliases[validAlias] = fromTable;
      }
    }

    // 5. Extract JOINs
    // Pattern: [INNER|LEFT|RIGHT|FULL] JOIN TableName [AS] [alias] ON condition
    const joinRegex = /(?:(INNER|LEFT|RIGHT|FULL|CROSS)\s+)?JOIN\s+([`'"\w]+)(?:\s+(?:AS\s+)?([`'"\w]+))?\s+ON\s+([\s\S]*?)(?=\s+(?:INNER|LEFT|RIGHT|FULL|CROSS\s+)?JOIN|\s+WHERE|\s+GROUP|\s+ORDER|\s+LIMIT|$)/gi;

    let joinMatch;
    while ((joinMatch = joinRegex.exec(sql)) !== null) {
      const joinType = (joinMatch[1] || "INNER").toUpperCase();
      const joinTable = cleanIdentifier(joinMatch[2]);
      const rawAlias = joinMatch[3] ? cleanIdentifier(joinMatch[3]) : null;
      const reserved = ["WHERE", "JOIN", "ON", "GROUP", "ORDER", "LIMIT"];
      const alias = rawAlias && !reserved.includes(rawAlias.toUpperCase()) ? rawAlias : null;
      const condition = joinMatch[4].trim();

      queryInfo.tables.push(joinTable);
      if (alias) {
        queryInfo.tableAliases[alias] = joinTable;
      }

      queryInfo.joins.push({
        type: joinType,
        table: joinTable,
        alias,
        condition
      });

      queryInfo.isJoinQuery = true;
    }

    // 6. Resolve joined pairs from condition or FROM + JOIN
    // In SQL joins: FROM T1 JOIN T2 -> T1 and T2 are co-accessed
    const distinctTables = [...new Set(queryInfo.tables)];
    queryInfo.tables = distinctTables;

    if (distinctTables.length > 1) {
      for (let i = 0; i < distinctTables.length; i++) {
        for (let j = i + 1; j < distinctTables.length; j++) {
          queryInfo.joinedPairs.push([distinctTables[i], distinctTables[j]]);
        }
      }
    }

    // 7. Extract WHERE conditions
    const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(?=\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i);
    if (whereMatch) {
      queryInfo.filters = whereMatch[1]
        .split(/\s+AND\s+/i)
        .map(f => f.trim())
        .filter(Boolean);
    }

    queries.push(queryInfo);
  }

  return queries;
}

module.exports = analyzeQueries;