const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
require("dotenv").config();

const { app } = require("../../server");
const connectDB = require("../../config/db");

let server;
let baseUrl;

describe("SchemaShift API Integration Tests (Live MongoDB)", () => {
  before(async () => {
    await connectDB();
    // Bind to arbitrary open port
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    await mongoose.disconnect();
  });

  // 1. Health check
  test("GET /api/health reports healthy with database connected", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, "healthy");
    assert.equal(data.database, "connected");
  });

  // 2. Input validation: 400 on empty schema/queries
  test("POST /api/migration/analyze returns 400 for missing schema", async () => {
    const res = await fetch(`${baseUrl}/api/migration/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ queries: "SELECT * FROM t;" })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.error.includes("SQL schema is required"));
  });

  // 3. Input validation: 400 on syntax error
  test("POST /api/migration/analyze returns 400 for unparseable SQL", async () => {
    const res = await fetch(`${baseUrl}/api/migration/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ schema: "INVALID JUNK NOT SQL", queries: "SELECT 1;" })
    });
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.ok(data.error.includes("parsing failed"));
  });

  // 4. Create and save migration (POST /analyze)
  let createdMigrationId;
  test("POST /api/migration/analyze creates and saves migration record", async () => {
    const payload = {
      schema: `
        CREATE TABLE Customer (customer_id INT PRIMARY KEY, name VARCHAR(100));
        CREATE TABLE Orders (order_id INT PRIMARY KEY, customer_id INT, amount DECIMAL(10,2), FOREIGN KEY (customer_id) REFERENCES Customer(customer_id));
      `,
      queries: `
        SELECT c.name, o.amount FROM Customer c JOIN Orders o ON c.customer_id = o.customer_id;
      `
    };

    const res = await fetch(`${baseUrl}/api/migration/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.migrationId);
    createdMigrationId = data.migrationId;
    assert.equal(data.migrationResult.targetDatabase, "MongoDB");
  });

  // 5. Get all migrations (GET /)
  test("GET /api/migration/ returns list of migrations", async () => {
    const res = await fetch(`${baseUrl}/api/migration/`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.count >= 1);
    assert.ok(Array.isArray(data.migrations));
  });

  // 6. Get single migration (GET /:id)
  test("GET /api/migration/:id returns single migration record", async () => {
    const res = await fetch(`${baseUrl}/api/migration/${createdMigrationId}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.migration._id, createdMigrationId);
  });

  // 7. Error cases for GET /:id (400 for malformed, 404 for missing)
  test("GET /api/migration/:id returns 400 for malformed ID", async () => {
    const res = await fetch(`${baseUrl}/api/migration/malformed-id-123`);
    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  test("GET /api/migration/:id returns 404 for non-existent valid ObjectId", async () => {
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const res = await fetch(`${baseUrl}/api/migration/${nonExistentId}`);
    assert.equal(res.status, 404);
    const data = await res.json();
    assert.equal(data.success, false);
  });

  // 8. Update migration (PUT /:id)
  test("PUT /api/migration/:id updates existing migration", async () => {
    const updatePayload = {
      schema: `
        CREATE TABLE Customer (customer_id INT PRIMARY KEY, name VARCHAR(100), email VARCHAR(100));
        CREATE TABLE Orders (order_id INT PRIMARY KEY, customer_id INT, amount DECIMAL(10,2), FOREIGN KEY (customer_id) REFERENCES Customer(customer_id));
      `,
      queries: `
        SELECT c.email, o.amount FROM Customer c JOIN Orders o ON c.customer_id = o.customer_id;
      `
    };

    const res = await fetch(`${baseUrl}/api/migration/${createdMigrationId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload)
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });

  // 9. Execute data transformation (POST /:id/transform)
  let testRunId;
  test("POST /api/migration/:id/transform transforms sample data and writes target collections", async () => {
    const transformPayload = {
      sampleData: {
        Customer: [{ customer_id: 101, name: "Alice", email: "alice@test.com" }],
        Orders: [{ order_id: 1, customer_id: 101, amount: 88.5 }]
      }
    };

    const res = await fetch(`${baseUrl}/api/migration/${createdMigrationId}/transform`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transformPayload)
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.runId);
    testRunId = data.runId;
    assert.equal(data.integrityChecks.passed, true);
    assert.equal(data.summary.totalTransformedDocuments, 1);
  });

  // 10. Inspect target data run (GET /api/migration/runs/:runId)
  test("GET /api/migration/runs/:runId fetches documents for inspection", async () => {
    const res = await fetch(`${baseUrl}/api/migration/runs/${testRunId}`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.runRecord);
    assert.ok(data.documents);
  });

  // 11. Clean up test run (DELETE /api/migration/runs/:runId)
  test("DELETE /api/migration/runs/:runId cleans up target collections", async () => {
    const res = await fetch(`${baseUrl}/api/migration/runs/${testRunId}`, {
      method: "DELETE"
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });

  // 12. Delete test migration (DELETE /:id)
  test("DELETE /api/migration/:id deletes test migration record", async () => {
    const res = await fetch(`${baseUrl}/api/migration/${createdMigrationId}`, {
      method: "DELETE"
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
  });
});
