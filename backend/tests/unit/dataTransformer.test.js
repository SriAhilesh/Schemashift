const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const parseSQLSchema = require("../../services/schemaParser");
const analyzeRelationships = require("../../services/relationshipAnalyzer");
const analyzeQueries = require("../../services/queryAnalyzer");
const generateMongoSchema = require("../../services/migrationEngine");
const { transformSampleData } = require("../../services/dataTransformer");

describe("Data Transformer Unit Tests", () => {
  test("transforms 1:N embedded records cleanly", () => {
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
      SELECT c.name, o.order_id FROM Customer c JOIN Orders o ON c.customer_id = o.customer_id;
    `;
    const s = parseSQLSchema(sql);
    const r = analyzeRelationships(s);
    const q = analyzeQueries(queries);
    const plan = generateMongoSchema(s, r, q);

    const sampleData = {
      Customer: [
        { customer_id: 101, name: "Alice" }
      ],
      Orders: [
        { order_id: 1, customer_id: 101, amount: 25.5 },
        { order_id: 2, customer_id: 101, amount: 75.0 }
      ]
    };

    const res = transformSampleData(s, plan, sampleData, "test_run_1");
    assert.equal(res.summary.totalSourceRecords, 3);
    assert.equal(res.summary.totalTransformedDocuments, 1);
    assert.equal(res.summary.totalRejectedRecords, 0);
    assert.equal(res.integrityChecks.passed, true);

    const custDoc = res.transformedCollections.customer[0];
    assert.equal(custDoc.customer_id, 101);
    assert.equal(custDoc.name, "Alice");
    assert.equal(custDoc.orders.length, 2);
    assert.equal(custDoc.orders[0].order_id, 1);
    assert.equal(custDoc.orders[0].amount, 25.5);
  });

  test("rejects invalid foreign key references and records integrity violation", () => {
    const sql = `
      CREATE TABLE Customer (
        customer_id INT PRIMARY KEY,
        name VARCHAR(100)
      );
      CREATE TABLE Orders (
        order_id INT PRIMARY KEY,
        customer_id INT,
        FOREIGN KEY (customer_id) REFERENCES Customer(customer_id)
      );
    `;
    const queries = `
      SELECT c.name, o.order_id FROM Customer c JOIN Orders o ON c.customer_id = o.customer_id;
    `;
    const s = parseSQLSchema(sql);
    const r = analyzeRelationships(s);
    const q = analyzeQueries(queries);
    const plan = generateMongoSchema(s, r, q);

    const sampleData = {
      Customer: [
        { customer_id: 101, name: "Alice" }
      ],
      Orders: [
        { order_id: 1, customer_id: 101 },
        { order_id: 2, customer_id: 999 } // Orphan record
      ]
    };

    const res = transformSampleData(s, plan, sampleData, "test_run_orphan");
    assert.equal(res.summary.totalRejectedRecords, 1);
    assert.equal(res.integrityChecks.passed, false);
    assert.equal(res.rejectedRecords[0].table, "Orders");
    assert.ok(res.rejectedRecords[0].reason.includes("references non-existent parent"));
  });

  test("transforms N:M junction records with references and junction attributes", () => {
    const sql = `
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
        PRIMARY KEY (student_id, course_id),
        FOREIGN KEY (student_id) REFERENCES Student(student_id),
        FOREIGN KEY (course_id) REFERENCES Course(course_id)
      );
    `;
    const queries = `
      SELECT s.name, c.course_name FROM Student s JOIN Enrollment e ON s.student_id = e.student_id JOIN Course c ON e.course_id = c.course_id;
    `;
    const s = parseSQLSchema(sql);
    const r = analyzeRelationships(s);
    const q = analyzeQueries(queries);
    const plan = generateMongoSchema(s, r, q);

    const sampleData = {
      Student: [{ student_id: 101, name: "Alice" }],
      Course: [{ course_id: 10, course_name: "NoSQL" }],
      Enrollment: [{ student_id: 101, course_id: 10, semester: "Fall 2024" }]
    };

    const res = transformSampleData(s, plan, sampleData, "test_run_nm");
    assert.equal(res.integrityChecks.passed, true);
    const studentDoc = res.transformedCollections.student[0];
    assert.equal(studentDoc.enrollment.length, 1);
    assert.equal(studentDoc.enrollment[0].course_id, 10);
    assert.equal(studentDoc.enrollment[0].semester, "Fall 2024");
    const courseDoc = res.transformedCollections.course[0];
    assert.equal(courseDoc.course_id, 10);
    assert.equal(courseDoc.course_name, "NoSQL");
  });
});
