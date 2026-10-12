const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const analyzeQueries = require("../../services/queryAnalyzer");

describe("Query Analyzer Unit Tests", () => {
  test("extracts query type, aliases, and join conditions", () => {
    const sql = `
      SELECT c.name, o.order_id
      FROM Customer c
      JOIN Orders o ON c.customer_id = o.customer_id
      WHERE c.customer_id = 101;
    `;
    const res = analyzeQueries(sql);
    assert.equal(res.length, 1);
    const q = res[0];
    assert.equal(q.type, "SELECT");
    assert.ok(q.tables.includes("Customer"));
    assert.ok(q.tables.includes("Orders"));
    assert.equal(q.tableAliases["c"], "Customer");
    assert.equal(q.tableAliases["o"], "Orders");
    assert.equal(q.joins.length, 1);
    assert.equal(q.joins[0].table, "Orders");
    assert.equal(q.isJoinQuery, true);
    assert.equal(q.filters.length, 1);
  });

  test("analyzes multi-table join chains", () => {
    const sql = `
      SELECT s.name, c.course_name
      FROM Student s
      JOIN Enrollment e ON s.student_id = e.student_id
      JOIN Course c ON e.course_id = c.course_id
      WHERE s.student_id = 101;
    `;
    const res = analyzeQueries(sql);
    assert.equal(res.length, 1);
    const q = res[0];
    assert.equal(q.tables.length, 3);
    assert.equal(q.joins.length, 2);
    assert.ok(q.joinedPairs.some(p => p.includes("Student") && p.includes("Enrollment")));
    assert.ok(q.joinedPairs.some(p => p.includes("Enrollment") && p.includes("Course")));
  });

  test("handles multiple queries separated by semicolons and detects single-table queries", () => {
    const sql = `
      SELECT * FROM Department WHERE department_id = 10;
      SELECT employee_id, salary FROM Employee WHERE employee_id = 501;
    `;
    const res = analyzeQueries(sql);
    assert.equal(res.length, 2);
    assert.equal(res[0].tables.length, 1);
    assert.equal(res[0].tables[0], "Department");
    assert.equal(res[0].isJoinQuery, false);
    assert.equal(res[1].tables.length, 1);
    assert.equal(res[1].tables[0], "Employee");
    assert.equal(res[1].isJoinQuery, false);
  });

  test("returns warnings for unsupported constructs such as UNION", () => {
    const sql = `
      SELECT name FROM Customer
      UNION
      SELECT name FROM Supplier;
    `;
    const res = analyzeQueries(sql);
    assert.equal(res.length, 1);
    assert.ok(res[0].warnings.some(w => w.includes("UNION")));
  });
});
