const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const parseSQLSchema = require("../../services/schemaParser");
const analyzeRelationships = require("../../services/relationshipAnalyzer");

describe("Relationship Analyzer Unit Tests", () => {
  test("detects standard 1:N relationship", () => {
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
    const schema = parseSQLSchema(sql);
    const rels = analyzeRelationships(schema);
    assert.equal(rels.directRelationships.length, 1);
    assert.equal(rels.directRelationships[0].type, "1:N");
    assert.equal(rels.directRelationships[0].fromTable, "Customer");
    assert.equal(rels.directRelationships[0].toTable, "Orders");
    assert.equal(rels.directRelationships[0].foreignKey, "customer_id");
  });

  test("detects 1:1 relationship when foreign key is the primary key", () => {
    const sql = `
      CREATE TABLE User (
        user_id INT PRIMARY KEY,
        username VARCHAR(50)
      );
      CREATE TABLE UserProfile (
        user_id INT PRIMARY KEY,
        bio TEXT,
        FOREIGN KEY (user_id) REFERENCES User(user_id)
      );
    `;
    const schema = parseSQLSchema(sql);
    const rels = analyzeRelationships(schema);
    assert.equal(rels.directRelationships.length, 1);
    assert.equal(rels.directRelationships[0].type, "1:1");
    assert.equal(rels.directRelationships[0].fromTable, "User");
    assert.equal(rels.directRelationships[0].toTable, "UserProfile");
  });

  test("detects N:M relationship and extracts junction attributes", () => {
    const sql = `
      CREATE TABLE Author (
        author_id INT PRIMARY KEY,
        name VARCHAR(100)
      );
      CREATE TABLE Book (
        book_id INT PRIMARY KEY,
        title VARCHAR(200)
      );
      CREATE TABLE BookAuthor (
        book_id INT,
        author_id INT,
        royalty_percentage DECIMAL(5,2),
        PRIMARY KEY (book_id, author_id),
        FOREIGN KEY (book_id) REFERENCES Book(book_id),
        FOREIGN KEY (author_id) REFERENCES Author(author_id)
      );
    `;
    const schema = parseSQLSchema(sql);
    const rels = analyzeRelationships(schema);
    assert.equal(rels.manyToManyRelationships.length, 1);
    const nm = rels.manyToManyRelationships[0];
    assert.equal(nm.junctionTable, "BookAuthor");
    assert.equal(nm.type, "N:M");
    assert.equal(nm.junctionAttributes.length, 1);
    assert.equal(nm.junctionAttributes[0].name, "royalty_percentage");
    assert.equal(nm.junctionAttributes[0].bsonType, "decimal");

    // Ensure the 2 direct relationships are flagged as junction legs
    const legs = rels.directRelationships.filter(r => r.isJunctionLeg);
    assert.equal(legs.length, 2);
  });
});
