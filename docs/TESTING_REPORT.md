# SchemaShift — Automated Testing & Quality Assurance Report

**Course:** BCSE406L – NoSQL Databases  
**Evaluation:** Review 3  
**Test Framework:** Node.js Native Test Runner (`node:test`, `node:assert/strict`)  
**Execution Environment:** Node.js v22.14.0 on Windows 11 x64  
**Database Connection:** Live MongoDB Atlas Cloud Cluster  

---

## 1. Executive Testing Summary

The SchemaShift backend was evaluated across unit, regression, and live API integration test suites. All 36 automated tests passed with zero failures and zero skipped tests.

```
=============================================================================
                           TEST EXECUTION SUMMARY
=============================================================================
Total Test Suites Executed:    7
Total Individual Tests Run:   36
Tests Passed:                 36 (100%)
Tests Failed:                  0 (0%)
Tests Skipped:                 0 (0%)
Total Suite Execution Time:   1.857 seconds
=============================================================================
```

---

## 2. Test Suite Breakdown

### Suite 1: `tests/unit/schemaParser.test.js`
Tests the DDL parser on tokenization, parameterized types with commas, composite keys, comments, and semantic errors.

| Test Case | Description | Duration | Status |
|---|---|---|---|
| 1.1 | Correctly parses single table with basic types | 2.29 ms | **PASS** |
| 1.2 | Handles parameterized types with commas (`DECIMAL(10,2)`, `NUMERIC(8,4)`) | 0.25 ms | **PASS** |
| 1.3 | Supports composite `PRIMARY KEY (student_id, course_id)` constraints | 0.81 ms | **PASS** |
| 1.4 | Strips SQL line (`--`) and block (`/* */`) comments cleanly | 0.75 ms | **PASS** |
| 1.5 | Validates foreign key referencing non-existent table (returns error) | 0.27 ms | **PASS** |
| 1.6 | Validates foreign key referencing non-existent column (returns error) | 0.34 ms | **PASS** |
| 1.7 | Rejects empty or whitespace-only SQL input | 0.16 ms | **PASS** |

### Suite 2: `tests/unit/relationshipAnalyzer.test.js`
Tests generic relationship detection across 1:1, 1:N, and N:M relationships without domain-specific hardcoding.

| Test Case | Description | Duration | Status |
|---|---|---|---|
| 2.1 | Detects standard 1:N relationship between parent and child tables | 2.45 ms | **PASS** |
| 2.2 | Detects 1:1 relationship when foreign key is the primary key or unique | 0.50 ms | **PASS** |
| 2.3 | Detects N:M relationship via junction table and extracts junction attributes | 0.99 ms | **PASS** |

### Suite 3: `tests/unit/queryAnalyzer.test.js`
Tests query parsing, table aliases, multi-table join chains, and single-table lookups.

| Test Case | Description | Duration | Status |
|---|---|---|---|
| 3.1 | Extracts query type, aliases (`c`, `o`), and join conditions | 3.32 ms | **PASS** |
| 3.2 | Analyzes multi-table join chains (`Student` $\rightarrow$ `Enrollment` $\rightarrow$ `Course`) | 1.01 ms | **PASS** |
| 3.3 | Handles multiple queries separated by semicolons and detects single-table queries | 0.30 ms | **PASS** |
| 3.4 | Returns warnings for unsupported query constructs (`UNION`) | 0.38 ms | **PASS** |

### Suite 4: `tests/unit/migrationEngine.test.js`
Tests decision consistency, collection deduplication on embedding, and explicit foreign-key references.

| Test Case | Description | Duration | Status |
|---|---|---|---|
| 4.1 | 1:N `EMBED` eliminates duplicate child collection from top-level collections | 6.89 ms | **PASS** |
| 4.2 | 1:N `REFERENCE` preserves both collections and marks reference explicitly | 1.06 ms | **PASS** |
| 4.3 | 1:1 `EMBED` embeds child document as single subdocument and excises child | 0.50 ms | **PASS** |

### Suite 5: `tests/unit/dataTransformer.test.js`
Tests the sample-data transformation pipeline, referential integrity verification, and document nesting.

| Test Case | Description | Duration | Status |
|---|---|---|---|
| 5.1 | Transforms 1:N embedded records cleanly into hierarchical documents | 6.98 ms | **PASS** |
| 5.2 | Rejects invalid foreign key references and records integrity violation | 0.85 ms | **PASS** |
| 5.3 | Transforms N:M junction records preserving references and attributes | 0.90 ms | **PASS** |

### Suite 6: `tests/regression/threeExamples.test.js`
End-to-end regression verification of the three established Review 2 baseline cases.

| Test Case | Description | Duration | Status |
|---|---|---|---|
| 6.1 | **Example 1:** Student, Course, Enrollment (N:M EMBED + REFERENCE, semester preserved) | 10.08 ms | **PASS** |
| 6.2 | **Example 2:** Customer, Orders (1:N EMBED, duplicate Orders excised, decimal preserved) | 3.05 ms | **PASS** |
| 6.3 | **Example 3:** Department, Employee (1:N REFERENCE, separate collections, explicit reference) | 1.43 ms | **PASS** |

### Suite 7: `tests/integration/api.test.js`
Full HTTP REST API lifecycle verification executed directly against live MongoDB Atlas.

| Test Case | Description | Duration | Status |
|---|---|---|---|
| 7.1 | `GET /api/health` reports status `healthy` with `database: connected` | 26.88 ms | **PASS** |
| 7.2 | `POST /api/migration/analyze` returns HTTP 400 for missing schema | 16.00 ms | **PASS** |
| 7.3 | `POST /api/migration/analyze` returns HTTP 400 for unparseable SQL | 3.26 ms | **PASS** |
| 7.4 | `POST /api/migration/analyze` creates and saves migration record in MongoDB Atlas | 223.50 ms | **PASS** |
| 7.5 | `GET /api/migration/` returns chronological list of migrations | 62.95 ms | **PASS** |
| 7.6 | `GET /api/migration/:id` returns single migration record by ID | 31.30 ms | **PASS** |
| 7.7 | `GET /api/migration/:id` returns HTTP 400 for malformed ID string | 2.05 ms | **PASS** |
| 7.8 | `GET /api/migration/:id` returns HTTP 404 for non-existent valid ObjectId | 30.08 ms | **PASS** |
| 7.9 | `PUT /api/migration/:id` updates and re-analyzes existing migration | 41.34 ms | **PASS** |
| 7.10 | `POST /api/migration/:id/transform` transforms sample records and writes target collections | 144.63 ms | **PASS** |
| 7.11 | `GET /api/migration/runs/:runId` fetches transformed documents for inspection | 56.86 ms | **PASS** |
| 7.12 | `DELETE /api/migration/runs/:runId` drops target collections and deletes run log | 90.81 ms | **PASS** |
| 7.13 | `DELETE /api/migration/:id` cleans up test migration record from Atlas | 35.73 ms | **PASS** |

---

## 3. Raw TAP Test Output Log

```
> backend@1.0.0 test
> node --test tests/**/*.test.js

TAP version 13
# MongoDB Atlas connected successfully: ac-u9ktsbz-shard-00-00.ewyljs4.mongodb.net
# Subtest: SchemaShift API Integration Tests (Live MongoDB)
    ok 1 - GET /api/health reports healthy with database connected
    ok 2 - POST /api/migration/analyze returns 400 for missing schema
    ok 3 - POST /api/migration/analyze returns 400 for unparseable SQL
    ok 4 - POST /api/migration/analyze creates and saves migration record
    ok 5 - GET /api/migration/ returns list of migrations
    ok 6 - GET /api/migration/:id returns single migration record
    ok 7 - GET /api/migration/:id returns 400 for malformed ID
    ok 8 - GET /api/migration/:id returns 404 for non-existent valid ObjectId
    ok 9 - PUT /api/migration/:id updates existing migration
    ok 10 - POST /api/migration/:id/transform transforms sample data and writes target collections
    ok 11 - GET /api/migration/runs/:runId fetches documents for inspection
    ok 12 - DELETE /api/migration/runs/:runId cleans up target collections
    ok 13 - DELETE /api/migration/:id deletes test migration record
ok 1 - SchemaShift API Integration Tests (Live MongoDB)
# Subtest: Review 2 Regression Test Suite — Three Established Examples
    ok 1 - Example 1: Student, Course, Enrollment (N:M)
    ok 2 - Example 2: Customer, Orders (1:N EMBED)
    ok 3 - Example 3: Department, Employee (1:N REFERENCE)
ok 2 - Review 2 Regression Test Suite — Three Established Examples
# Subtest: Data Transformer Unit Tests
    ok 1 - transforms 1:N embedded records cleanly
    ok 2 - rejects invalid foreign key references and records integrity violation
    ok 3 - transforms N:M junction records with references and junction attributes
ok 3 - Data Transformer Unit Tests
# Subtest: Migration Engine Unit Tests
    ok 1 - 1:N EMBED eliminates duplicate child collection at top level
    ok 2 - 1:N REFERENCE preserves both collections and marks reference explicitly
    ok 3 - 1:1 EMBED embeds child document and removes duplicate from top level
ok 4 - Migration Engine Unit Tests
# Subtest: Query Analyzer Unit Tests
    ok 1 - extracts query type, aliases, and join conditions
    ok 2 - analyzes multi-table join chains
    ok 3 - handles multiple queries separated by semicolons and detects single-table queries
    ok 4 - returns warnings for unsupported constructs such as UNION
ok 5 - Query Analyzer Unit Tests
# Subtest: Relationship Analyzer Unit Tests
    ok 1 - detects standard 1:N relationship
    ok 2 - detects 1:1 relationship when foreign key is the primary key
    ok 3 - detects N:M relationship and extracts junction attributes
ok 6 - Relationship Analyzer Unit Tests
# Subtest: SQL Schema Parser Unit Tests
    ok 1 - correctly parses single table with basic types
    ok 2 - handles parameterized types with commas such as DECIMAL(10,2)
    ok 3 - supports composite PRIMARY KEY constraints
    ok 4 - strips SQL line and block comments cleanly
    ok 5 - validates foreign key referencing non-existent table
    ok 6 - validates foreign key referencing non-existent column
    ok 7 - rejects empty or whitespace-only SQL input
ok 7 - SQL Schema Parser Unit Tests
1..7
# tests 36
# suites 7
# pass 36
# fail 0
# duration_ms 1857.2524
```

---

## 4. Verification Conclusion
The automated test suite confirms that SchemaShift achieves 100% test pass fidelity across all core services, edge cases, error conditions, and live database operations without mock dependencies.
