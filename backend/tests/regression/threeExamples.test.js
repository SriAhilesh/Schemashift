const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const parseSQLSchema = require("../../services/schemaParser");
const analyzeRelationships = require("../../services/relationshipAnalyzer");
const analyzeQueries = require("../../services/queryAnalyzer");
const generateMongoSchema = require("../../services/migrationEngine");
const { transformSampleData } = require("../../services/dataTransformer");

describe("Review 2 Regression Test Suite — Three Established Examples", () => {
  // =========================================================================
  // Example 1: Student, Course, Enrollment (N:M EMBED + REFERENCE)
  // =========================================================================
  test("Example 1: Student, Course, Enrollment (N:M)", () => {
    const sqlSchema = `
      CREATE TABLE Student (
        student_id INT PRIMARY KEY,
        name VARCHAR(100)
      );

      CREATE TABLE Course (
        course_id INT PRIMARY KEY,
        course_name VARCHAR(100)
      );

      CREATE TABLE Enrollment (
        student_id INT,
        course_id INT,
        semester VARCHAR(20),
        FOREIGN KEY (student_id) REFERENCES Student(student_id),
        FOREIGN KEY (course_id) REFERENCES Course(course_id)
      );
    `;

    const sqlQueries = `
      SELECT s.name, c.course_name
      FROM Student s
      JOIN Enrollment e ON s.student_id = e.student_id
      JOIN Course c ON e.course_id = c.course_id
      WHERE s.student_id = 101;

      SELECT *
      FROM Course
      WHERE course_id = 10;
    `;

    const schema = parseSQLSchema(sqlSchema);
    assert.equal(schema.tables.length, 3);

    const rels = analyzeRelationships(schema);
    assert.equal(rels.manyToManyRelationships.length, 1);
    assert.equal(rels.manyToManyRelationships[0].type, "N:M");

    const queryAnalysis = analyzeQueries(sqlQueries);
    assert.equal(queryAnalysis.length, 2);

    const migrationResult = generateMongoSchema(schema, rels, queryAnalysis);

    // Assert collections: Student and Course (Enrollment should NOT be a separate top-level collection)
    assert.equal(migrationResult.collections.length, 2);
    const studentCol = migrationResult.collections.find(c => c.name === "student");
    const courseCol = migrationResult.collections.find(c => c.name === "course");
    assert.ok(studentCol, "Student collection must exist");
    assert.ok(courseCol, "Course collection must exist");
    assert.equal(migrationResult.collections.some(c => c.name === "enrollment"), false, "Enrollment must not be a duplicate collection");

    // Assert Student embeds enrollment with course reference and semester attribute
    assert.equal(studentCol.embeddedDocuments.length, 1);
    const embEnrollment = studentCol.embeddedDocuments[0];
    assert.equal(embEnrollment.name, "enrollment");
    assert.ok(embEnrollment.fields.some(f => f.name === "course_id" && f.isReference));
    assert.ok(embEnrollment.fields.some(f => f.name === "semester"));

    // Assert decision
    assert.equal(migrationResult.decisions.length, 1);
    assert.equal(migrationResult.decisions[0].strategy, "EMBED + REFERENCE");
    assert.equal(migrationResult.decisions[0].embeddedIn, "Student");
    assert.equal(migrationResult.decisions[0].references, "Course");

    // Assert sample data transformation
    const sampleData = {
      Student: [{ student_id: 101, name: "Alice" }],
      Course: [{ course_id: 10, course_name: "NoSQL" }],
      Enrollment: [{ student_id: 101, course_id: 10, semester: "Fall 2024" }]
    };
    const xform = transformSampleData(schema, migrationResult, sampleData, "ex1_run");
    assert.equal(xform.integrityChecks.passed, true);
    assert.equal(xform.transformedCollections.student[0].enrollment[0].semester, "Fall 2024");
    assert.equal(xform.transformedCollections.student[0].enrollment[0].course_id, 10);
  });

  // =========================================================================
  // Example 2: Customer, Orders (1:N EMBED)
  // =========================================================================
  test("Example 2: Customer, Orders (1:N EMBED)", () => {
    const sqlSchema = `
      CREATE TABLE Customer (
        customer_id INT PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(100)
      );

      CREATE TABLE Orders (
        order_id INT PRIMARY KEY,
        customer_id INT,
        order_date DATE,
        amount DECIMAL(10,2),
        FOREIGN KEY (customer_id) REFERENCES Customer(customer_id)
      );
    `;

    const sqlQueries = `
      SELECT c.name, o.order_id, o.amount
      FROM Customer c
      JOIN Orders o ON c.customer_id = o.customer_id
      WHERE c.customer_id = 101;
    `;

    const schema = parseSQLSchema(sqlSchema);
    assert.equal(schema.tables.length, 2);
    // Verify DECIMAL(10,2) is preserved
    const ordersTable = schema.tables.find(t => t.name === "Orders");
    const amountCol = ordersTable.columns.find(c => c.name === "amount");
    assert.equal(amountCol.type, "DECIMAL(10,2)");
    assert.equal(amountCol.bsonType, "decimal");

    const rels = analyzeRelationships(schema);
    assert.equal(rels.directRelationships.length, 1);
    assert.equal(rels.directRelationships[0].type, "1:N");

    const queryAnalysis = analyzeQueries(sqlQueries);
    const migrationResult = generateMongoSchema(schema, rels, queryAnalysis);

    // Orders MUST NOT be retained as a separate collection
    assert.equal(migrationResult.collections.length, 1);
    assert.equal(migrationResult.collections[0].name, "customer");
    assert.equal(migrationResult.collections.some(c => c.name === "orders"), false);

    // Customer must have embedded orders
    assert.equal(migrationResult.collections[0].embeddedDocuments.length, 1);
    assert.equal(migrationResult.collections[0].embeddedDocuments[0].name, "orders");

    // Assert decision
    assert.equal(migrationResult.decisions[0].strategy, "EMBED");

    // Assert sample data transformation
    const sampleData = {
      Customer: [{ customer_id: 101, name: "Alice", email: "alice@example.com" }],
      Orders: [{ order_id: 5001, customer_id: 101, order_date: "2024-01-15", amount: 250.75 }]
    };
    const xform = transformSampleData(schema, migrationResult, sampleData, "ex2_run");
    assert.equal(xform.integrityChecks.passed, true);
    assert.equal(xform.transformedCollections.customer[0].orders.length, 1);
    assert.equal(xform.transformedCollections.customer[0].orders[0].amount, 250.75);
  });

  // =========================================================================
  // Example 3: Department, Employee (1:N REFERENCE)
  // =========================================================================
  test("Example 3: Department, Employee (1:N REFERENCE)", () => {
    const sqlSchema = `
      CREATE TABLE Department (
        department_id INT PRIMARY KEY,
        department_name VARCHAR(100)
      );

      CREATE TABLE Employee (
        employee_id INT PRIMARY KEY,
        department_id INT,
        employee_name VARCHAR(100),
        salary DECIMAL(10,2),
        FOREIGN KEY (department_id) REFERENCES Department(department_id)
      );
    `;

    const sqlQueries = `
      SELECT *
      FROM Department
      WHERE department_id = 10;

      SELECT employee_id, employee_name, salary
      FROM Employee
      WHERE employee_id = 501;
    `;

    const schema = parseSQLSchema(sqlSchema);
    const rels = analyzeRelationships(schema);
    const queryAnalysis = analyzeQueries(sqlQueries);
    const migrationResult = generateMongoSchema(schema, rels, queryAnalysis);

    // Both Department and Employee must remain separate collections
    assert.equal(migrationResult.collections.length, 2);
    const deptCol = migrationResult.collections.find(c => c.name === "department");
    const empCol = migrationResult.collections.find(c => c.name === "employee");
    assert.ok(deptCol);
    assert.ok(empCol);

    // Employee must explicitly indicate foreign key reference to Department
    const deptRef = empCol.fields.find(f => f.name === "department_id");
    assert.ok(deptRef);
    assert.equal(deptRef.isReference, true);
    assert.equal(deptRef.references, "Department");

    // Decision must be REFERENCE
    assert.equal(migrationResult.decisions[0].strategy, "REFERENCE");

    // Assert sample data transformation
    const sampleData = {
      Department: [{ department_id: 10, department_name: "Engineering" }],
      Employee: [{ employee_id: 501, department_id: 10, employee_name: "Carol", salary: 95000.00 }]
    };
    const xform = transformSampleData(schema, migrationResult, sampleData, "ex3_run");
    assert.equal(xform.integrityChecks.passed, true);
    assert.equal(xform.transformedCollections.department.length, 1);
    assert.equal(xform.transformedCollections.employee.length, 1);
    assert.equal(xform.transformedCollections.employee[0].department_id, 10);
  });
});
