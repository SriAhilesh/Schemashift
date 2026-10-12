# SchemaShift — REST API Specification

**Base URL:** `http://localhost:5000` (or configured `PORT`)  
**Content-Type:** `application/json`  
**Authentication:** None required (Internal Academic Scope)  

---

## 1. System Readiness & Health Check

### `GET /api/health`
Reports service uptime and MongoDB Atlas connection readiness.

- **Response `200 OK` (Healthy):**
  ```json
  {
    "status": "healthy",
    "uptimeSeconds": 142,
    "database": "connected",
    "timestamp": "2026-10-12T11:15:12.078Z"
  }
  ```
- **Response `503 Service Unavailable` (Database Disconnected):**
  ```json
  {
    "status": "unhealthy",
    "uptimeSeconds": 2,
    "database": "disconnected",
    "timestamp": "2026-10-12T11:14:51.224Z"
  }
  ```

---

## 2. Schema Analysis & Migration History Endpoints

### `POST /api/migration/analyze`
Parses relational DDL schema, analyzes query workloads, generates a MongoDB document proposal, and persists the record to `schemashift.migrations`.

- **Request Body:**
  ```json
  {
    "schema": "CREATE TABLE Customer (customer_id INT PRIMARY KEY, name VARCHAR(100)); CREATE TABLE Orders (order_id INT PRIMARY KEY, customer_id INT, amount DECIMAL(10,2), FOREIGN KEY (customer_id) REFERENCES Customer(customer_id));",
    "queries": "SELECT c.name, o.amount FROM Customer c JOIN Orders o ON c.customer_id = o.customer_id WHERE c.customer_id = 101;"
  }
  ```

- **Response `201 Created`:**
  ```json
  {
    "success": true,
    "migrationId": "67041f02c98a3e78b4d00101",
    "parsedSchema": {
      "tables": [
        {
          "name": "Customer",
          "columns": [
            { "name": "customer_id", "type": "INT", "bsonType": "int", "primaryKey": true },
            { "name": "name", "type": "VARCHAR(100)", "bsonType": "string", "primaryKey": false }
          ],
          "primaryKeys": ["customer_id"],
          "foreignKeys": []
        }
      ],
      "warnings": [],
      "errors": []
    },
    "relationships": {
      "directRelationships": [
        {
          "fromTable": "Customer",
          "toTable": "Orders",
          "foreignKey": "customer_id",
          "referencedColumn": "customer_id",
          "type": "1:N",
          "isJunctionLeg": false
        }
      ],
      "manyToManyRelationships": [],
      "warnings": []
    },
    "queryAnalysis": [
      {
        "query": "SELECT c.name, o.amount FROM Customer c JOIN Orders o ON c.customer_id = o.customer_id WHERE c.customer_id = 101;",
        "type": "SELECT",
        "tables": ["Customer", "Orders"],
        "tableAliases": { "c": "Customer", "o": "Orders" },
        "joinedPairs": [["Customer", "Orders"]],
        "isJoinQuery": true
      }
    ],
    "migrationResult": {
      "targetDatabase": "MongoDB",
      "collections": [
        {
          "name": "customer",
          "sqlTableName": "Customer",
          "fields": [
            { "name": "customer_id", "type": "INT", "bsonType": "int", "primaryKey": true },
            { "name": "name", "type": "VARCHAR(100)", "bsonType": "string", "primaryKey": false }
          ],
          "embeddedDocuments": [
            {
              "name": "orders",
              "fields": [
                { "name": "order_id", "type": "INT", "bsonType": "int", "primaryKey": true },
                { "name": "amount", "type": "DECIMAL(10,2)", "bsonType": "decimal", "primaryKey": false }
              ],
              "cardinality": "array"
            }
          ]
        }
      ],
      "decisions": [
        {
          "relationship": "Customer → Orders",
          "type": "1:N",
          "strategy": "EMBED",
          "embeddedIn": "Customer",
          "queryEvidence": "SELECT c.name, o.amount FROM Customer c JOIN Orders o ON c.customer_id = o.customer_id WHERE c.customer_id = 101;",
          "reason": "Entities are frequently queried together. Embedding 'Orders' inside 'Customer' enables single-read retrieval without relational joins.",
          "tradeOff": "Improves read performance and data locality. However, updates to child documents require writing to parent documents, and document size increases with array length.",
          "limitations": "Suitable when child collection cardinality is bounded. Large, unbounded child sets should use referencing to avoid MongoDB 16MB document limits."
        }
      ],
      "summary": {
        "totalCollections": 1,
        "embeddedDocumentsCount": 1,
        "totalDecisions": 1
      }
    }
  }
  ```

- **Response `400 Bad Request` (Missing inputs):**
  ```json
  {
    "success": false,
    "error": "SQL schema is required and must be a non-empty string."
  }
  ```

- **Response `400 Bad Request` (DDL syntax or validation error):**
  ```json
  {
    "success": false,
    "error": "SQL schema parsing failed.",
    "details": [
      "Foreign key error in table 'Orders': referenced table 'NonExistent' does not exist."
    ]
  }
  ```

---

### `GET /api/migration/`
Retrieves chronological migration history list from MongoDB Atlas.

- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "count": 5,
    "migrations": [
      {
        "_id": "67041f02c98a3e78b4d00101",
        "sourceDatabase": "Relational Database",
        "targetDatabase": "MongoDB",
        "sourceSchema": "CREATE TABLE Customer ...",
        "sampleQueries": "SELECT ...",
        "createdAt": "2026-10-12T11:06:23.000Z"
      }
    ]
  }
  ```

---

### `GET /api/migration/:id`
Retrieves a single migration analysis document by ID.

- **Response `200 OK`:** Returns full migration document object.
- **Response `400 Bad Request` (Malformed ID):**
  ```json
  {
    "success": false,
    "error": "Invalid migration ID format: 'malformed_id'."
  }
  ```
- **Response `404 Not Found` (Valid ObjectId not in database):**
  ```json
  {
    "success": false,
    "error": "Migration with ID '67041f02c98a3e78b4d00999' not found."
  }
  ```

---

### `PUT /api/migration/:id`
Re-analyzes and updates an existing migration record.

- **Request Body:** `{ "schema": "...", "queries": "..." }`
- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Migration updated successfully",
    "migrationId": "67041f02c98a3e78b4d00101",
    "migrationResult": { ... }
  }
  ```

---

### `DELETE /api/migration/:id`
Deletes an existing migration record.

- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Migration deleted successfully"
  }
  ```

---

## 3. Sample Data Transformation & Run Pipeline Endpoints

### `POST /api/migration/transform` (or `POST /api/migration/:id/transform`)
Transforms source JSON records, validates referential integrity, nests records, and persists documents to run-isolated target collections on MongoDB Atlas.

- **Request Body:**
  ```json
  {
    "migrationId": "67041f02c98a3e78b4d00101",
    "sampleData": {
      "Customer": [
        { "customer_id": 101, "name": "Alice Johnson", "email": "alice@example.com" }
      ],
      "Orders": [
        { "order_id": 5001, "customer_id": 101, "amount": 250.75 }
      ]
    }
  }
  ```

- **Response `201 Created`:**
  ```json
  {
    "success": true,
    "runId": "run_1760268000000_3a4f1c",
    "runRecordId": "67042a9bc98a3e78b4d00202",
    "summary": {
      "totalSourceRecords": 2,
      "totalTransformedDocuments": 1,
      "totalRejectedRecords": 0,
      "transformationTimeMs": 3
    },
    "sourceCounts": { "Customer": 1, "Orders": 1 },
    "targetCounts": { "customer": 1 },
    "collectionsCreated": [
      "ss_data_customer_run_1760268000000_3a4f1c"
    ],
    "integrityChecks": {
      "totalChecks": 1,
      "passed": true,
      "violations": []
    },
    "rejectedRecords": [],
    "sampleDocuments": {
      "customer": [
        {
          "_migrationRunId": "run_1760268000000_3a4f1c",
          "customer_id": 101,
          "name": "Alice Johnson",
          "email": "alice@example.com",
          "orders": [
            { "order_id": 5001, "amount": 250.75 }
          ]
        }
      ]
    }
  }
  ```

- **Integrity Violation Example Response (When orphan records exist):**
  ```json
  {
    "integrityChecks": {
      "totalChecks": 1,
      "passed": false,
      "violations": [
        "Integrity check failed: Orders.customer_id=999 references non-existent parent in Customer.customer_id."
      ]
    },
    "rejectedRecords": [
      {
        "table": "Orders",
        "record": { "order_id": 5002, "customer_id": 999, "amount": 99.0 },
        "reason": "Integrity check failed: Orders.customer_id=999 references non-existent parent in Customer.customer_id."
      }
    ]
  }
  ```

---

### `GET /api/migration/runs/:runId`
Retrieves execution telemetry and transformed documents for a given run from MongoDB Atlas.

- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "runRecord": {
      "runId": "run_1760268000000_3a4f1c",
      "status": "SUCCESS",
      "collectionsCreated": ["ss_data_customer_run_1760268000000_3a4f1c"],
      "summary": { ... }
    },
    "documents": {
      "ss_data_customer_run_1760268000000_3a4f1c": [ ... ]
    }
  }
  ```

---

### `DELETE /api/migration/runs/:runId`
Purges a specific transformation run and drops its isolated target collections from MongoDB Atlas.

- **Response `200 OK`:**
  ```json
  {
    "success": true,
    "message": "Run 'run_1760268000000_3a4f1c' and its target collections deleted successfully."
  }
  ```
