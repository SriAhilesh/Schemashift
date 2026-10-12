# SchemaShift — Review 3 Presentation Slide Deck & Evaluation Guide

**Course:** BCSE406L – NoSQL Databases  
**Evaluation:** Review 3 (Final Evaluation)  
**Project:** SchemaShift — Relational-to-NoSQL Schema Migration Engine  
**Target NoSQL Store:** MongoDB Document Store  

---

## Slide 1: Title Slide
- **Title:** SchemaShift: Workload-Driven Relational-to-MongoDB Schema Migration Engine
- **Subtitle:** Automated Schema Transformation, Referential Integrity Verification, and Sample-Data Migration Pipeline
- **Course Code:** BCSE406L – NoSQL Databases
- **Student Details:** Sri Ahilesh
- **Review Stage:** Review 3 Final Evaluation
- **Speaker Notes:**
  > "Good morning/afternoon respected examiners. Today I am presenting SchemaShift, our automated relational-to-MongoDB migration tool developed for BCSE406L. For Review 3, we have stabilized the core engine, resolved parser and collection deduplication challenges, implemented an end-to-end sample data transformation pipeline, and executed extensive performance benchmarks against MongoDB Atlas."

---

## Slide 2: Problem Statement & Motivation
- **The Relational Reality:** 3NF relational schemas minimize storage redundancy but force compute-intensive multi-table `JOIN` operations, creating severe bottlenecks in high-throughput applications.
- **The Document Advantage:** MongoDB collocate related entities through hierarchical nesting (embedding) and inter-collection referencing, enabling single-seek read performance.
- **The Core Dilemma:** Naive denormalization causes document bloat (16MB BSON limit) and update anomalies; blind normalization retains slow `$lookup` joins.
- **Our Solution:** A deterministic engine that analyzes both SQL DDL and application query patterns to synthesize an optimal document model with formal trade-off reasoning.
- **Speaker Notes:**
  > "Why migrate to MongoDB? Because distributed joins in RDBMS cannot scale horizontally. But denormalizing blindly leads to 16MB document violations. SchemaShift looks at the actual queries run by the application to decide exactly when to embed and when to reference."

---

## Slide 3: Scope Clarification (Review 2 Baseline vs Review 3)
- **Target Database Scope:** Focused exclusively on MongoDB Document Store. Column-family (Cassandra) is out of scope to ensure depth and correctness in document modeling.
- **SQL Parsing Scope:** Deterministic subset of SQL DDL (`CREATE TABLE`, composite PKs, FKs, constraints) and DML (`SELECT`, `JOIN`, `WHERE`).
- **Sample Data Scope:** JSON tabular source records with complete foreign-key referential integrity validation.
- **Speaker Notes:**
  > "As established in Review 2, our target database is MongoDB. We do not make false claims regarding Cassandra column-family support. By focusing strictly on MongoDB document modeling, we achieved full pipeline correctness, referential integrity verification, and production-grade Cloud Atlas integration."

---

## Slide 4: Architectural Workflow
- **Visual Diagram:**
  ```
  [Normalized SQL DDL] + [Sample SQL Queries]
                    │
                    ▼
  [Stage 1: SQL Schema Parser (Parenthesis-Aware)]
                    │
                    ▼
  [Stage 2: Relationship Analyzer (1:1, 1:N, N:M)]
                    │
                    ▼
  [Stage 3: Query Access Analyzer (Co-Access vs Independent)]
                    │
                    ▼
  [Stage 4: Migration Decision Engine (EMBED vs REFERENCE)]
                    │
                    ▼
  [Stage 5: Sample Data Transformation Pipeline]
                    │
                    ▼
  [MongoDB Atlas Cloud: Target Collections (ss_data_<col>_<id>)]
  ```
- **Speaker Notes:**
  > "Here is our 5-stage architecture. Stages 1 through 4 parse DDL, classify relationships, analyze queries, and propose the BSON schema. Stage 5 takes sample records, checks referential integrity, nests records, and persists them into isolated collections on MongoDB Atlas."

---

## Slide 5: Key Technical Fixes for Review 3
1. **Parameterized Type Preservation:** Implemented a parenthesis-aware tokenizer that preserves `DECIMAL(10,2)` and `NUMERIC(8,4)` without premature comma splitting.
2. **Collection Deduplication:** When 1:N embedding is chosen, the embedded child collection is cleanly excised from the top level, eliminating duplicate collections.
3. **Explicit References:** When referencing is chosen, the child collection explicitly identifies its target collection and reference key.
4. **Sample Data Pipeline:** Added complete record transformation, orphan record rejection, and run-scoped collection isolation.
5. **Awaited Database Startup:** Server awaits MongoDB Atlas connection readiness before serving requests.
- **Speaker Notes:**
  > "During Review 2, our parser truncated decimals and our engine duplicated embedded child collections at the top level. For Review 3, both issues were completely resolved, and we added the data transformation pipeline that was previously missing."

---

## Slide 6: The Three Demonstration Cases
- **Case 1: Student ↔ Course (N:M Junction)**
  * *Workload:* Query joins Student, Enrollment, and Course.
  * *Strategy:* `EMBED + REFERENCE`. Student embeds `enrollment` array (with `semester` and reference to `course_id`). Course remains independent.
- **Case 2: Customer → Orders (1:N Embedded)**
  * *Workload:* Query joins Customer and Orders.
  * *Strategy:* `EMBED`. Orders nested as array inside Customer. Top-level Orders collection eliminated.
- **Case 3: Department → Employee (1:N Referenced)**
  * *Workload:* Independent lookups on Department and Employee.
  * *Strategy:* `REFERENCE`. Both collections retained; Employee explicitly references Department.
- **Speaker Notes:**
  > "We tested our engine against the three baseline cases from Review 2. Notice that the decisions are completely generic and driven by query evidence—Student embeds enrollment because the queries traverse the junction, whereas Department and Employee remain separate because they are queried independently."

---

## Slide 7: Sample Data Transformation & Integrity Pipeline
- **Input Format:** Standard JSON mapping `TableName` $\rightarrow$ array of row objects.
- **Referential Integrity Validation:**
  * Validates every foreign-key reference against parent primary keys before insertion.
  * Flags dangling foreign keys (e.g. `Orders.customer_id = 999`) as integrity violations and isolates them into rejected records logs.
- **Run Isolation:**
  * Collections named `ss_data_<table_name>_<runId>` ensure test runs never overwrite user data or migration history.
- **Speaker Notes:**
  > "In Stage 5, we ingest source JSON records. Our integrity checker verifies that every order has a valid customer and every enrollment has a valid student. If an invalid foreign key is found, it is rejected and recorded in telemetry without crashing the pipeline."

---

## Slide 8: Empirical Performance Evaluation
- **Benchmark 1: Schema Analysis Latency (15 trials, median)**
  * 3 Tables (11 cols): **0.067 ms**
  * 10 Tables (39 cols): **0.182 ms**
  * 25 Tables (99 cols): **0.468 ms**
- **Benchmark 2: Data Transformation & Insertion**
  * 100 Records: **2.98 ms** xform, **96.7 ms** Mongo insert (100% integrity pass)
  * 1,000 Records: **99.18 ms** xform, **547.4 ms** Mongo insert (100% integrity pass)
  * 5,000 Records: **2,202.98 ms** xform, **3,177.4 ms** Mongo insert (100% integrity pass)
- **Benchmark 3: MongoDB Query Optimization**
  * Unindexed scan (`COLLSCAN`): 1,250 documents examined
  * Indexed seek (`IXSCAN`): Exactly 1 document examined ($1,250\times$ I/O reduction)
- **Speaker Notes:**
  > "We executed real, reproducible benchmarks against live MongoDB Atlas. Our analysis completes in under 0.5 milliseconds even on 25 tables. Furthermore, our index evaluation proves that creating single-field indexes on target keys reduces documents examined from 1,250 down to 1."

---

## Slide 9: Automated Testing & Verification
- **Test Framework:** Node.js native test runner (`node:test`)
- **Suite Breakdown:**
  * `tests/unit/schemaParser.test.js`: 7 tests
  * `tests/unit/relationshipAnalyzer.test.js`: 3 tests
  * `tests/unit/queryAnalyzer.test.js`: 4 tests
  * `tests/unit/migrationEngine.test.js`: 3 tests
  * `tests/unit/dataTransformer.test.js`: 3 tests
  * `tests/regression/threeExamples.test.js`: 3 tests
  * `tests/integration/api.test.js`: 13 tests
- **Total:** 36 Tests, 7 Suites, **36 Passed, 0 Failed, 0 Skipped** (Duration: 1.85s)
- **Speaker Notes:**
  > "Every single component is guarded by automated regression and integration tests. Our live API integration suite tests the entire CRUD lifecycle and transformation pipeline against our Atlas cluster."

---

## Slide 10: Live Demonstration Walkthrough
1. **Demo Loader:** Click preset button to populate Student-Course-Enrollment.
2. **Schema Analysis:** Click "Analyze & Propose MongoDB Schema" to view structured collection cards, PK indicators, BSON type suggestions, and decision trade-offs.
3. **Data Pipeline:** Switch to Sample Data Pipeline tab, review sample records, click "Execute Data Transformation Pipeline".
4. **Document Inspector:** View live transformed documents persisted on MongoDB Atlas.
5. **History Management:** View saved migration history, re-analyze, or inspect records.
- **Speaker Notes:**
  > "Now, we will demonstrate the live system running on localhost:5173 connected to our backend on port 5000..."

---

## Slide 11: Summary & Future Scope
- **Review 3 Deliverables Completed:**
  * Fixed parser for parameterized types (`DECIMAL(10,2)`).
  * Resolved collection duplication on 1:N embedding.
  * Built complete sample data transformation and integrity pipeline.
  * Implemented automated benchmarks with raw CSV/JSON logs.
  * Verified 36 automated tests across 7 test suites.
  * Delivered comprehensive 20-30 page technical documentation.
- **Future Enhancements:**
  * Automated bucketing for time-series IoT data.
  * Direct relational connectors for live MySQL/PostgreSQL instances.
  * Automated Mongoose model code generator.
- **Thank you! Questions & Answers.**
