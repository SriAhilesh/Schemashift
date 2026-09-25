function analyzeQueries(sqlQueries) {

  const queries = [];

  // Split multiple SQL queries using semicolon
  const queryList = sqlQueries
    .split(";")
    .map(query => query.trim())
    .filter(query => query.length > 0);

  for (const sql of queryList) {

    const queryInfo = {
      query: sql,
      type: "UNKNOWN",
      tables: [],
      selectedColumns: [],
      filters: [],
      joins: []
    };

    // -----------------------------------------
    // Detect query type
    // -----------------------------------------

    if (/^\s*SELECT/i.test(sql)) {
      queryInfo.type = "SELECT";
    } else if (/^\s*INSERT/i.test(sql)) {
      queryInfo.type = "INSERT";
    } else if (/^\s*UPDATE/i.test(sql)) {
      queryInfo.type = "UPDATE";
    } else if (/^\s*DELETE/i.test(sql)) {
      queryInfo.type = "DELETE";
    }

    // -----------------------------------------
    // Extract SELECT columns
    // -----------------------------------------

    const selectMatch = sql.match(
      /SELECT\s+([\s\S]*?)\s+FROM/i
    );

    if (selectMatch) {

      queryInfo.selectedColumns =
        selectMatch[1]
          .split(",")
          .map(column => column.trim());
    }

    // -----------------------------------------
    // Extract FROM table
    // -----------------------------------------

    const fromMatch = sql.match(
      /FROM\s+([A-Za-z_][A-Za-z0-9_]*)/i
    );

    if (fromMatch) {

      queryInfo.tables.push(fromMatch[1]);
    }

    // -----------------------------------------
    // Extract JOIN tables
    // -----------------------------------------

    const joinRegex =
      /JOIN\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:AS\s+)?(\w+)?\s*ON\s+(.+?)(?=\s+JOIN|\s+WHERE|\s+GROUP|\s+ORDER|$)/gi;

    let joinMatch;

    while ((joinMatch = joinRegex.exec(sql)) !== null) {

      const tableName = joinMatch[1];
      const alias = joinMatch[2] || null;
      const condition = joinMatch[3].trim();

      queryInfo.tables.push(tableName);

      queryInfo.joins.push({
        table: tableName,
        alias: alias,
        condition: condition
      });
    }

    // -----------------------------------------
    // Extract WHERE conditions
    // -----------------------------------------

    const whereMatch = sql.match(
      /WHERE\s+([\s\S]*?)(?=\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|$)/i
    );

    if (whereMatch) {

      queryInfo.filters =
        whereMatch[1]
          .split(/\s+AND\s+/i)
          .map(condition => condition.trim());
    }

    // Remove duplicate table names
    queryInfo.tables = [
      ...new Set(queryInfo.tables)
    ];

    queries.push(queryInfo);
  }

  return queries;
}

module.exports = analyzeQueries;