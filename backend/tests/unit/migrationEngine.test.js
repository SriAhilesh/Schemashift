const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const parseSQLSchema = require("../../services/schemaParser");
const analyzeRelationships = require("../../services/relationshipAnalyzer");
const analyzeQueries = require("../../services/queryAnalyzer");
const generateMongoSchema = require("../../services/migrationEngine");

describe("Migration Engine Unit Tests", () => {
  test("1:N EMBED eliminates duplicate child collection at top level", () => {
    const sql = `
      CREATE TABLE Customer (
        customer_id INT PRIMARY KEY,
        name VARCHAR(100)
      );
      CREATE TABLE Orders (
        order_id INT PRIMARY KEY,
        customer_id INT,
        amount DECIMAL(10,2),
        FOREIGN KEY (customer_id) REFERENCES Customer(customer_id)
      );
    `;
    const queries = `
      SELECT c.name, o.order_id
      FROM Customer c
      JOIN Orders o ON c.customer_id = o.customer_id
      WHERE c.customer_id = 101;
    `;
    const s = parseSQLSchema(sql);
    const r = analyzeRelationships(s);
    const q = analyzeQueries(queries);
    const plan = generateMongoSchema(s, r, q);

    assert.equal(plan.collections.length, 1);
    assert.equal(plan.collections[0].name, "customer");
    assert.equal(plan.collections[0].embeddedDocuments.length, 1);
    assert.equal(plan.collections[0].embeddedDocuments[0].name, "orders");
    // Ensure orders is NOT retained as a duplicate top-level collection
    assert.equal(plan.collections.some(c => c.name === "orders"), false);

    // Verify decision metadata
    assert.equal(plan.decisions.length, 1);
    assert.equal(plan.decisions[0].strategy, "EMBED");
    assert.ok(plan.decisions[0].reason);
    assert.ok(plan.decisions[0].tradeOff);
    assert.ok(plan.decisions[0].limitations);
  });

  test("1:N REFERENCE preserves both collections and marks reference explicitly", () => {
    const sql = `
      CREATE TABLE Department (
        department_id INT PRIMARY KEY,
        dept_name VARCHAR(100)
      );
      CREATE TABLE Employee (
        employee_id INT PRIMARY KEY,
        department_id INT,
        emp_name VARCHAR(100),
        FOREIGN KEY (department_id) REFERENCES Department(department_id)
      );
    `;
    const queries = `
      SELECT * FROM Department WHERE department_id = 10;
      SELECT * FROM Employee WHERE employee_id = 501;
    `;
    const s = parseSQLSchema(sql);
    const r = analyzeRelationships(s);
    const q = analyzeQueries(queries);
    const plan = generateMongoSchema(s, r, q);

    assert.equal(plan.collections.length, 2);
    const empCol = plan.collections.find(c => c.name === "employee");
    assert.ok(empCol);
    const deptIdField = empCol.fields.find(f => f.name === "department_id");
    assert.ok(deptIdField);
    assert.equal(deptIdField.isReference, true);
    assert.equal(deptIdField.references, "Department");

    assert.equal(plan.decisions.length, 1);
    assert.equal(plan.decisions[0].strategy, "REFERENCE");
  });

  test("1:1 EMBED embeds child document and removes duplicate from top level", () => {
    const sql = `
      CREATE TABLE User (
        user_id INT PRIMARY KEY,
        email VARCHAR(100)
      );
      CREATE TABLE Profile (
        user_id INT PRIMARY KEY,
        bio TEXT,
        FOREIGN KEY (user_id) REFERENCES User(user_id)
      );
    `;
    const queries = `
      SELECT u.email, p.bio FROM User u JOIN Profile p ON u.user_id = p.user_id;
    `;
    const s = parseSQLSchema(sql);
    const r = analyzeRelationships(s);
    const q = analyzeQueries(queries);
    const plan = generateMongoSchema(s, r, q);

    assert.equal(plan.collections.length, 1);
    assert.equal(plan.collections[0].name, "user");
    assert.equal(plan.collections[0].embeddedDocuments.length, 1);
    assert.equal(plan.collections[0].embeddedDocuments[0].name, "profile");
    assert.equal(plan.collections[0].embeddedDocuments[0].cardinality, "one");
    assert.equal(plan.decisions[0].strategy, "EMBED");
  });
});
