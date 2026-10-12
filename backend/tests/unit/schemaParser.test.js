const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const parseSQLSchema = require("../../services/schemaParser");

describe("SQL Schema Parser Unit Tests", () => {
  test("correctly parses single table with basic types", () => {
    const sql = `
      CREATE TABLE Student (
        student_id INT PRIMARY KEY,
        name VARCHAR(100)
      );
    `;
    const res = parseSQLSchema(sql);
    assert.equal(res.tables.length, 1);
    assert.equal(res.tables[0].name, "Student");
    assert.equal(res.tables[0].primaryKeys.length, 1);
    assert.equal(res.tables[0].primaryKeys[0], "student_id");
    assert.equal(res.tables[0].columns.length, 2);
    assert.equal(res.tables[0].columns[0].bsonType, "int");
    assert.equal(res.tables[0].columns[1].bsonType, "string");
  });

  test("handles parameterized types with commas such as DECIMAL(10,2)", () => {
    const sql = `
      CREATE TABLE Orders (
        order_id INT PRIMARY KEY,
        amount DECIMAL(10,2),
        rate NUMERIC(8, 4)
      );
    `;
    const res = parseSQLSchema(sql);
    assert.equal(res.tables.length, 1);
    const cols = res.tables[0].columns;
    assert.equal(cols.length, 3);
    assert.equal(cols[1].name, "amount");
    assert.equal(cols[1].type, "DECIMAL(10,2)");
    assert.equal(cols[1].bsonType, "decimal");
    assert.equal(cols[2].name, "rate");
    assert.equal(cols[2].type, "NUMERIC(8, 4)");
    assert.equal(cols[2].bsonType, "decimal");
  });

  test("supports composite PRIMARY KEY constraints", () => {
    const sql = `
      CREATE TABLE Enrollment (
        student_id INT,
        course_id INT,
        semester VARCHAR(20),
        PRIMARY KEY (student_id, course_id)
      );
    `;
    const res = parseSQLSchema(sql);
    assert.equal(res.tables.length, 1);
    assert.deepEqual(res.tables[0].primaryKeys, ["student_id", "course_id"]);
    const sIdCol = res.tables[0].columns.find(c => c.name === "student_id");
    const cIdCol = res.tables[0].columns.find(c => c.name === "course_id");
    assert.equal(sIdCol.primaryKey, true);
    assert.equal(cIdCol.primaryKey, true);
  });

  test("strips SQL line and block comments cleanly", () => {
    const sql = `
      -- Customer table stores buyer info
      CREATE TABLE Customer (
        customer_id INT PRIMARY KEY, /* ID of the user */
        name VARCHAR(100) -- user full name
      );
    `;
    const res = parseSQLSchema(sql);
    assert.equal(res.tables.length, 1);
    assert.equal(res.tables[0].name, "Customer");
    assert.equal(res.tables[0].columns.length, 2);
  });

  test("validates foreign key referencing non-existent table", () => {
    const sql = `
      CREATE TABLE Employee (
        employee_id INT PRIMARY KEY,
        dept_id INT,
        FOREIGN KEY (dept_id) REFERENCES NonExistentDept(dept_id)
      );
    `;
    const res = parseSQLSchema(sql);
    assert.ok(res.errors.length > 0);
    assert.ok(res.errors[0].includes("NonExistentDept"));
  });

  test("validates foreign key referencing non-existent column", () => {
    const sql = `
      CREATE TABLE Department (
        department_id INT PRIMARY KEY
      );
      CREATE TABLE Employee (
        employee_id INT PRIMARY KEY,
        dept_id INT,
        FOREIGN KEY (dept_id) REFERENCES Department(missing_col)
      );
    `;
    const res = parseSQLSchema(sql);
    assert.ok(res.errors.length > 0);
    assert.ok(res.errors[0].includes("missing_col"));
  });

  test("rejects empty or whitespace-only SQL input", () => {
    const res = parseSQLSchema("   ");
    assert.ok(res.errors.length > 0);
    assert.equal(res.tables.length, 0);
  });
});
