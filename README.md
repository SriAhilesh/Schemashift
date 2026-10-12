# SchemaShift — Relational-to-NoSQL Schema Migration Engine

> **Course:** BCSE406L – NoSQL Databases (Review 3 Evaluation)  
> **Project Scope:** Automated Relational-to-MongoDB Document Schema Transformation & Sample Data Migration Pipeline.  
> **Target Database:** MongoDB Document Store (Column-family / Cassandra out of scope).

---

## 1. Project Overview

**SchemaShift** is an automated migration analysis engine designed to bridge the gap between normalized relational schemas (3NF) and optimized MongoDB document schemas. Traditional relational models require multi-table `JOIN` operations, introducing query latency in read-heavy applications. SchemaShift evaluates normalized `CREATE TABLE` definitions alongside representative SQL query workloads to propose denormalized document architectures with explicit trade-off reasoning (embedding vs. referencing).

In addition to schema generation, SchemaShift provides an end-to-end **Sample-Data Transformation Pipeline** that ingests JSON source records, validates foreign-key referential integrity, nests records according to the generated plan, and stores them in run-isolated target collections on MongoDB Atlas.

---

## 2. Architecture & Tech Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    SchemaShift Frontend                     │
│                  React 19 + Vite + Modern CSS               │
│    (Workload Editor, Collection Cards, Pipeline Runner)     │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / REST API (JSON)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                    SchemaShift Backend                      │
│                  Node.js 22 + Express 5                     │
├─────────────────────────────────────────────────────────────┤
│  1. SQL Schema Parser        ── Tokenizes DDL & Types       │
│  2. Relationship Analyzer    ── Detects 1:1, 1:N, N:M       │
│  3. Query Workload Analyzer  ── Extracts Access Patterns    │
│  4. Migration Decision Engine── Embed vs Reference Strategy │
│  5. Sample Data Transformer  ── Referential Integrity Check │
└──────────────────────────────┬──────────────────────────────┘
                               │ Mongoose 9 Driver
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     MongoDB Atlas Cloud                     │
│  • schemashift.migrations    (History & Proposal Store)     │
│  • schemashift.migrationruns (Pipeline Execution Logs)      │
│  • ss_data_<collection>_<id> (Transformed Target Documents) │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Supported SQL Bounded Subset

SchemaShift implements a targeted, deterministic SQL parser:

### Supported DDL Statements
- `CREATE TABLE [IF NOT EXISTS] tableName (...)`
- Parameterized types with commas: `DECIMAL(p,s)`, `NUMERIC(p,s)`, `VARCHAR(n)`
- Data types: `INT`, `BIGINT`, `SMALLINT`, `VARCHAR`, `CHAR`, `TEXT`, `DECIMAL`, `FLOAT`, `DOUBLE`, `BOOLEAN`, `DATE`, `DATETIME`, `TIMESTAMP`
- Single-column and composite `PRIMARY KEY (col1, col2)`
- Table-level and inline `FOREIGN KEY (col) REFERENCES OtherTable(other_col)`
- Column constraints: `NOT NULL`, `UNIQUE`, `AUTO_INCREMENT`
- SQL line (`--`) and block (`/* ... */`) comment stripping

### Supported Query Constructs
- Single-table queries: `SELECT * FROM Table WHERE col = val`
- Multi-table joins: `SELECT ... FROM TableA a JOIN TableB b ON a.id = b.a_id [JOIN TableC c ON ...]`
- Filter clauses: `WHERE col = val AND col2 = val2`
- Unsupported query warnings: Flags `UNION`, correlated subqueries, or DDL operations

---

## 4. The Three Baseline Review Scenarios

SchemaShift accurately models the three baseline Review 2 scenarios without domain-specific hardcoding:

| Scenario | Input Tables | Workload Query Pattern | Proposed Strategy | Target Collections |
|---|---|---|---|---|
| **1. Student, Course, Enrollment** | 3 (N:M Junction) | Queries traverse Student → Enrollment → Course together | **EMBED + REFERENCE** | `student` (embeds `enrollment` with `semester` & ref to `course`), `course` (independent) |
| **2. Customer, Orders** | 2 (1:N Parent/Child)| Queries frequently join Customer and Orders | **EMBED** | `customer` (embeds `orders` array; Orders is NOT duplicated) |
| **3. Department, Employee** | 2 (1:N Parent/Child)| Queries access Department and Employee independently | **REFERENCE** | `department`, `employee` (retains explicit `department_id` reference) |

---

## 5. Getting Started

### Prerequisites
- Node.js (v18.0.0 or higher, tested on v22.14.0)
- npm (v9.0.0 or higher)
- Active MongoDB Atlas cluster URI

### Backend Setup
1. Open terminal in `backend/`:
   ```bash
   cd backend
   npm install
   ```
2. Configure `.env` (refer to `.env.example`):
   ```ini
   PORT=5000
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/schemashift?retryWrites=true&w=majority
   ```
3. Run backend server:
   ```bash
   npm start
   # Or for development with auto-reload:
   npm run dev
   ```

### Frontend Setup
1. Open terminal in `frontend/`:
   ```bash
   cd frontend
   npm install
   ```
2. Configure environment (optional, defaults to `http://localhost:5000`):
   ```ini
   VITE_API_URL=http://localhost:5000
   ```
3. Start development server:
   ```bash
   npm run dev
   ```
4. Access the web interface at `http://localhost:5173`.

---

## 6. API Reference

| Method | Endpoint | Description | Status Codes |
|---|---|---|---|
| `GET` | `/api/health` | Service and MongoDB Atlas connection readiness | `200`, `503` |
| `POST` | `/api/migration/analyze` | Parse SQL, analyze queries, propose schema, save history | `201`, `400`, `500` |
| `GET` | `/api/migration/` | Retrieve chronological migration history | `200`, `500` |
| `GET` | `/api/migration/:id` | Retrieve single migration analysis record | `200`, `400`, `404`, `500` |
| `PUT` | `/api/migration/:id` | Re-analyze and update existing migration record | `200`, `400`, `404`, `500` |
| `DELETE` | `/api/migration/:id` | Delete migration record from history | `200`, `400`, `404`, `500` |
| `POST` | `/api/migration/transform` | Execute sample data transformation pipeline | `201`, `400`, `500` |
| `GET` | `/api/migration/runs/:runId` | Inspect transformed target documents in MongoDB | `200`, `404`, `500` |
| `DELETE` | `/api/migration/runs/:runId` | Clean up run target collections and logs | `200`, `404`, `500` |

---

## 7. Testing Suite

The backend includes a comprehensive automated test suite leveraging Node.js's native test runner (`node:test`):

```bash
cd backend

# Run all test suites (unit, regression, integration)
npm test

# Run unit and regression tests only (no database required)
npm run test:unit

# Run live MongoDB Atlas integration tests
npm run test:integration
```

**Test Coverage Summary:**
- 7 Test Suites, 36 Passing Tests, 0 Failures
- Unit coverage: Parser, Relationships, Queries, Migration Engine, Data Transformer
- Regression coverage: All 3 Review 2 examples
- Integration coverage: Complete CRUD API and live MongoDB write/read/delete cycles

---

## 8. Benchmark Evaluation

Execute automated benchmarks measuring parsing latency, transformation throughput, and MongoDB query index benefits:

```bash
cd backend
npm run benchmark
```

Raw results are written to `backend/benchmarks/results.json` and `backend/benchmarks/results.csv`.

**Summary Results (Node 22, MongoDB Atlas):**
- **Schema Analysis:** 3 tables in ~0.07 ms, 10 tables in ~0.18 ms, 25 tables in ~0.47 ms.
- **Data Transformation:** 100 records in ~3 ms, 1,000 records in ~99 ms, 5,000 records in ~2.2 s.
- **Index Optimization:** Reduced document scan from 1,250 (`COLLSCAN`) to 1 (`IXSCAN`).

---

## 9. Known Scope Boundaries & Limitations

1. **Database Scope:** Targets MongoDB document models exclusively. Cassandra column-family models are out of scope.
2. **SQL Scope:** Focuses on relational DDL (`CREATE TABLE`) and representative DML (`SELECT ... JOIN`). Complete SQL compilers, stored procedures, triggers, and dialects (T-SQL, PL/SQL) are not supported.
3. **Data Connectors:** Ingests structured JSON sample records. Live JDBC/ODBC connections to proprietary relational instances are omitted by design to avoid external database driver dependencies.
4. **Document Size Boundary:** MongoDB enforces a 16MB document size limit. Unbounded 1:N relations should adopt referencing rather than embedding.
