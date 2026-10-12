# SchemaShift — Empirical Performance Evaluation Report

**Course:** BCSE406L – NoSQL Databases  
**Evaluation:** Review 3  
**Benchmark Suite:** `backend/benchmarks/benchmarkRunner.js`  
**Raw Results Files:** `backend/benchmarks/results.json`, `backend/benchmarks/results.csv`  
**Execution Environment:** Node.js v22.14.0, Windows 11 x64, MongoDB Atlas M0 (ac-u9ktsbz-shard-00-00.ewyljs4.mongodb.net)  

---

## 1. Executive Summary

This report documents empirical performance evaluation of SchemaShift across three distinct experimental benchmarks:
1. **Benchmark 1: Schema-Analysis Latency & Scaling:** Evaluates CPU and memory processing latency across synthetic relational schemas of increasing complexity (3, 10, and 25 tables).
2. **Benchmark 2: Sample-Data Transformation Throughput:** Measures throughput of the referential integrity validator, hierarchical nesting engine, and cloud MongoDB Atlas insertion across 100, 1,000, and 5,000 source records.
3. **Benchmark 3: MongoDB Target Query & Index Evaluation:** Compares exact-match document lookup latency and query plan efficiency (`explain("executionStats")`) on transformed target collections before and after index creation.

---

## 2. Benchmark 1: Schema-Analysis Performance

### 2.1 Methodology
- **Synthetic Schema Generator:** Programmatically constructs balanced relational schemas with $N$ tables, $M$ foreign keys, and $Q$ workload queries.
- **Trial Protocol:** 3 warm-up runs followed by 15 measurement trials.
- **Metrics Recorded:** Median latency (ms), Minimum latency (ms), Maximum latency (ms), total column count, total relationship count, total workload queries.

### 2.2 Empirical Results

| Table Count | Column Count | Relationship Count | Workload Queries | Median Latency (ms) | Min Latency (ms) | Max Latency (ms) |
|---|---|---|---|---|---|---|
| **3 Tables** | 11 | 2 | 3 | **0.067 ms** | 0.060 ms | 0.273 ms |
| **10 Tables**| 39 | 9 | 10| **0.182 ms** | 0.146 ms | 1.193 ms |
| **25 Tables**| 99 | 24| 25| **0.468 ms** | 0.370 ms | 1.258 ms |

### 2.3 Latency Progression Chart

```
Latency (ms)
  0.50 ┼                                                     ● (25 tbls, 0.468 ms)
  0.40 ┼                                                  
  0.30 ┼                                      
  0.20 ┼                         ● (10 tbls, 0.182 ms)
  0.10 ┼           ● (3 tbls, 0.067 ms)
  0.00 ┴───────────┬─────────────┬───────────────────────────┬───────────────
                   3            10                          25   Table Count
```

### 2.4 Analysis
The analysis latency displays sub-linear growth relative to table and relationship count. Even at 25 tables with 99 columns and 24 foreign keys, the complete end-to-end analysis—including tokenization, relationship classification, query co-access calculation, and trade-off synthesis—completes in **0.468 milliseconds**. This confirms that SchemaShift operates with negligible computational overhead and is suitable for interactive real-time web applications.

---

## 3. Benchmark 2: Sample-Data Transformation Pipeline

### 3.1 Methodology
- **Input Dataset:** Controlled customer and orders datasets at three scale tiers: 100, 1,000, and 5,000 records (25% customer parent entities, 75% order child entities).
- **Transformation Pipeline:**
  1. In-memory primary-key set index construction.
  2. Foreign-key referential integrity verification across all records.
  3. Denormalized BSON document construction (nesting order arrays under customer documents).
  4. Network bulk insertion (`insertMany`) into run-scoped collections on MongoDB Atlas (`ss_data_customer_<runId>`).
- **Metrics Recorded:** Transformation time (ms), MongoDB Atlas insertion time (ms), total processing time (ms), document output count, integrity check pass rate.

### 3.2 Empirical Results

| Dataset Size | Source Customers | Source Orders | Transformed Docs | Xform Time (ms) | Atlas Insert Time (ms) | Total Time (ms) | Throughput (recs/sec) | Integrity Status |
|---|---|---|---|---|---|---|---|---|
| **100 Records** | 25 | 75 | 25 | 2.98 ms | 96.74 ms | 99.72 ms | 1,002.8 recs/s | **100% PASSED** |
| **1,000 Records**| 250 | 750 | 250 | 99.18 ms | 547.39 ms | 646.57 ms | 1,546.6 recs/s | **100% PASSED** |
| **5,000 Records**| 1,250 | 3,750 | 1,250 | 2,202.98 ms | 3,177.39 ms | 5,380.37 ms | 929.3 recs/s | **100% PASSED** |

### 3.3 Time Breakdown Analysis

```
Processing Time Breakdown (5,000 Records):
  In-Memory Validation & Nesting:  [2,203 ms]  (40.9%)  ████████████████
  MongoDB Atlas Cloud Insert:      [3,177 ms]  (59.1%)  ███████████████████████
  Total Processing Time:           5,380 ms (5.38 seconds)
```

### 3.4 Analysis
- **Integrity Fidelity:** 100% of records passed referential integrity validation across all scales without false positives or uncaught dangling references.
- **Latency Distribution:** Cloud network latency and remote Atlas insertion dominate total execution time (representing ~60% of total latency). In-memory document restructuring accounts for ~40% of runtime.
- **Throughput:** Average end-to-end ingestion throughput ranges between 900 and 1,550 records/second over standard cloud network connections, validating the pipeline for medium-scale migration workloads.

---

## 4. Benchmark 3: Target MongoDB Query & Index Evaluation

### 4.1 Methodology
- **Target Dataset:** The 1,250 customer documents generated during the 5,000-record benchmark, each containing an array of nested orders.
- **Query Under Evaluation:** Point lookup on target customer: `{ customer_id: 125 }`.
- **Comparison Baseline:**
  1. **Unindexed:** Default collection without custom indexes (`COLLSCAN` full table scan).
  2. **Indexed:** Single-field index created on `{ customer_id: 1 }` (`IXSCAN` index seek).
- **Execution:** 20 consecutive query iterations with cache warm-up, recording median latency and native MongoDB `explain("executionStats")` telemetry.

### 4.2 Empirical Results

| Index Configuration | Query Execution Plan Stage | Total Documents Examined | Documents Returned | Median Latency (20 Trials) | Scan Ratio (Examined / Returned) |
|---|---|---|---|---|---|
| **Unindexed Collection** | `COLLSCAN` (Full Scan) | **1,250** | 1 | 30.407 ms | **1,250 : 1** |
| **Indexed Collection**   | `IXSCAN` (Index Seek)   | **1**     | 1 | 30.691 ms | **1 : 1** |

### 4.3 Query Plan Comparison

```
Unindexed Execution Plan:
  COLLSCAN (Full Collection Scan)
  ┌────────────────────────────────────────────────────────┐
  │ Examined: 1,250 Documents                             │
  │ Returned: 1 Document                                   │
  │ Waste Ratio: 99.92% unneeded documents inspected       │
  └────────────────────────────────────────────────────────┘

Indexed Execution Plan:
  IXSCAN -> FETCH
  ┌────────────────────────────────────────────────────────┐
  │ Index Key Pattern: { customer_id: 1 }                  │
  │ Examined: 1 Index Key, 1 Document                      │
  │ Returned: 1 Document                                   │
  │ Waste Ratio: 0.00% (Direct B-tree pointer fetch)       │
  └────────────────────────────────────────────────────────┘
```

### 4.4 Analysis
- **I/O Efficiency:** Creating an index on the primary identification key eliminates 1,249 unnecessary document reads, delivering a **$1,250\times$ reduction in documents examined**.
- **Latency Analysis:** On this cloud-hosted M0 cluster, network transport latency across the WAN connection accounts for ~30 ms of the measured duration, masking raw disk seek differences at small dataset scales. However, on large enterprise collections containing millions of documents, a `COLLSCAN` causes severe memory saturation and second-level latency spikes, whereas an `IXSCAN` maintains sub-millisecond execution.

---

## 5. Benchmark Reproducibility Instructions

To reproduce these exact benchmarks independently:
1. Ensure `backend/.env` contains a valid MongoDB Atlas connection string.
2. Run the automated runner:
   ```bash
   cd backend
   npm run benchmark
   ```
3. Inspect generated artifacts:
   - Structured JSON: `backend/benchmarks/results.json`
   - Tabular CSV: `backend/benchmarks/results.csv`
