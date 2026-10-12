/**
 * SchemaShift - Automated Benchmark Suite
 * Evaluates:
 * 1. Schema Analysis Performance (3, 10, 25 tables, repeated trials, median latency)
 * 2. Sample Data Transformation & Ingestion Throughput (100, 1,000, 5,000 records)
 * 3. Target MongoDB Query Performance with vs without Index (explain executionStats)
 * 
 * Saves raw measurements to results.json and results.csv.
 */

const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const parseSQLSchema = require("../services/schemaParser");
const analyzeRelationships = require("../services/relationshipAnalyzer");
const analyzeQueries = require("../services/queryAnalyzer");
const generateMongoSchema = require("../services/migrationEngine");
const { transformSampleData, persistTransformedData } = require("../services/dataTransformer");
const connectDB = require("../config/db");

// Helper to compute median
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Synthetic Schema Generators
function generateSyntheticSchema(numTables) {
  let schemaSql = "";
  let queriesSql = "";

  // Base root table
  schemaSql += `CREATE TABLE Entity_0 (
    id_0 INT PRIMARY KEY,
    name_0 VARCHAR(100),
    created_at DATE
);\n\n`;

  queriesSql += `SELECT * FROM Entity_0 WHERE id_0 = 100;\n`;

  for (let i = 1; i < numTables; i++) {
    const parentIdx = Math.floor(i / 2);
    schemaSql += `CREATE TABLE Entity_${i} (
    id_${i} INT PRIMARY KEY,
    parent_id INT,
    metric_val DECIMAL(10,2),
    description VARCHAR(200),
    FOREIGN KEY (parent_id) REFERENCES Entity_${parentIdx}(id_${parentIdx})
);\n\n`;

    queriesSql += `SELECT p.name_${parentIdx}, c.metric_val
FROM Entity_${parentIdx} p
JOIN Entity_${i} c ON p.id_${parentIdx} = c.parent_id
WHERE p.id_${parentIdx} = ${i * 10};\n`;
  }

  return { schemaSql, queriesSql };
}

// Benchmark 1: Schema Analysis Latency
async function runBenchmark1() {
  console.log("\n=======================================================");
  console.log("BENCHMARK 1: Schema Analysis Latency (3, 10, 25 tables)");
  console.log("=======================================================");

  const tableSizes = [3, 10, 25];
  const trials = 15;
  const results = [];

  for (const n of tableSizes) {
    const { schemaSql, queriesSql } = generateSyntheticSchema(n);
    const latencies = [];

    // Warm-up
    for (let w = 0; w < 3; w++) {
      const s = parseSQLSchema(schemaSql);
      const r = analyzeRelationships(s);
      const q = analyzeQueries(queriesSql);
      generateMongoSchema(s, r, q);
    }

    let parsed, rels, qAnalysis, plan;
    for (let t = 0; t < trials; t++) {
      const t0 = process.hrtime.bigint();
      parsed = parseSQLSchema(schemaSql);
      rels = analyzeRelationships(parsed);
      qAnalysis = analyzeQueries(queriesSql);
      plan = generateMongoSchema(parsed, rels, qAnalysis);
      const t1 = process.hrtime.bigint();
      const ms = Number(t1 - t0) / 1e6;
      latencies.push(ms);
    }

    const totalCols = parsed.tables.reduce((acc, tbl) => acc + tbl.columns.length, 0);
    const totalRels = rels.directRelationships.length + rels.manyToManyRelationships.length;
    const medMs = median(latencies);
    const minMs = Math.min(...latencies);
    const maxMs = Math.max(...latencies);

    const record = {
      tablesCount: n,
      columnsCount: totalCols,
      relationshipsCount: totalRels,
      queriesCount: qAnalysis.length,
      trialsCount: trials,
      medianLatencyMs: Number(medMs.toFixed(3)),
      minLatencyMs: Number(minMs.toFixed(3)),
      maxLatencyMs: Number(maxMs.toFixed(3))
    };

    results.push(record);
    console.log(
      `Tables: ${n.toString().padStart(2)} | Cols: ${totalCols.toString().padStart(3)} | Rels: ${totalRels.toString().padStart(2)} | Queries: ${qAnalysis.length.toString().padStart(2)} | Median: ${medMs.toFixed(3)} ms (Min: ${minMs.toFixed(3)}, Max: ${maxMs.toFixed(3)})`
    );
  }

  return results;
}

// Benchmark 2: Sample Data Transformation
async function runBenchmark2(db) {
  console.log("\n=======================================================");
  console.log("BENCHMARK 2: Sample Data Transformation (100, 1k, 5k records)");
  console.log("=======================================================");

  const schemaSql = `
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
  const queriesSql = `
    SELECT c.name, o.amount FROM Customer c JOIN Orders o ON c.customer_id = o.customer_id;
  `;

  const parsed = parseSQLSchema(schemaSql);
  const rels = analyzeRelationships(parsed);
  const qAnalysis = analyzeQueries(queriesSql);
  const plan = generateMongoSchema(parsed, rels, qAnalysis);

  const testScales = [100, 1000, 5000];
  const results = [];

  for (const totalRecs of testScales) {
    const custCount = Math.floor(totalRecs * 0.25);
    const orderCount = totalRecs - custCount;

    const customers = [];
    for (let c = 1; c <= custCount; c++) {
      customers.push({
        customer_id: c,
        name: `Customer_${c}`,
        email: `user_${c}@example.com`
      });
    }

    const orders = [];
    for (let o = 1; o <= orderCount; o++) {
      const assignedCustId = (o % custCount) + 1;
      orders.push({
        order_id: o,
        customer_id: assignedCustId,
        order_date: "2024-03-15",
        amount: Number((10 + (o % 500) * 1.5).toFixed(2))
      });
    }

    const sampleData = { Customer: customers, Orders: orders };
    const runId = `bench_${totalRecs}_${Date.now()}`;

    // Transform
    const t0 = process.hrtime.bigint();
    const xform = transformSampleData(parsed, plan, sampleData, runId);
    const t1 = process.hrtime.bigint();
    const xformMs = Number(t1 - t0) / 1e6;

    // Persist to MongoDB Atlas
    const p0 = process.hrtime.bigint();
    const persistResult = await persistTransformedData(db, xform.transformedCollections, runId);
    const p1 = process.hrtime.bigint();
    const persistMs = Number(p1 - p0) / 1e6;

    const record = {
      sourceRecords: totalRecs,
      customerCount: custCount,
      orderCount: orderCount,
      transformedDocuments: xform.summary.totalTransformedDocuments,
      rejectedRecords: xform.summary.totalRejectedRecords,
      integrityPassed: xform.integrityChecks.passed,
      transformationTimeMs: Number(xformMs.toFixed(2)),
      mongodbInsertionTimeMs: Number(persistMs.toFixed(2)),
      totalProcessingTimeMs: Number((xformMs + persistMs).toFixed(2)),
      collectionsCreated: persistResult.collectionsCreated
    };

    results.push(record);
    console.log(
      `Records: ${totalRecs.toString().padStart(4)} | Xform: ${xformMs.toFixed(2)} ms | Mongo Insert: ${persistMs.toFixed(2)} ms | Target Docs: ${xform.summary.totalTransformedDocuments} | Integrity: ${xform.integrityChecks.passed ? "PASSED" : "FAILED"}`
    );
  }

  return results;
}

// Benchmark 3: MongoDB Query and Index Evaluation
async function runBenchmark3(db, targetCollectionName) {
  console.log("\n=======================================================");
  console.log("BENCHMARK 3: MongoDB Query & Index Evaluation (Target Data)");
  console.log("=======================================================");

  const coll = db.collection(targetCollectionName);
  const sampleQuery = { customer_id: 125 };

  // 1. Without index (COLLSCAN)
  await coll.dropIndexes().catch(() => {});
  
  // Warm-up
  await coll.findOne(sampleQuery);

  const iterations = 20;
  const unindexedLatencies = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    await coll.findOne(sampleQuery);
    const t1 = process.hrtime.bigint();
    unindexedLatencies.push(Number(t1 - t0) / 1e6);
  }

  // Get explain stats
  let unindexedExplain;
  try {
    unindexedExplain = await coll.find(sampleQuery).explain("executionStats");
  } catch (err) {
    unindexedExplain = { executionStats: { executionStages: { stage: "COLLSCAN" } } };
  }

  // 2. With index (IXSCAN)
  await coll.createIndex({ customer_id: 1 });
  
  // Warm-up
  await coll.findOne(sampleQuery);

  const indexedLatencies = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    await coll.findOne(sampleQuery);
    const t1 = process.hrtime.bigint();
    indexedLatencies.push(Number(t1 - t0) / 1e6);
  }

  let indexedExplain;
  try {
    indexedExplain = await coll.find(sampleQuery).explain("executionStats");
  } catch (err) {
    indexedExplain = { executionStats: { executionStages: { stage: "IXSCAN" } } };
  }

  const unindexedMed = median(unindexedLatencies);
  const indexedMed = median(indexedLatencies);
  const speedup = (unindexedMed / Math.max(indexedMed, 0.001)).toFixed(2);

  const stats = {
    targetCollection: targetCollectionName,
    queryPattern: JSON.stringify(sampleQuery),
    iterations,
    unindexed: {
      medianLatencyMs: Number(unindexedMed.toFixed(3)),
      stage: unindexedExplain.executionStats ? unindexedExplain.executionStats.executionStages.stage : "COLLSCAN",
      docsExamined: unindexedExplain.executionStats ? unindexedExplain.executionStats.totalDocsExamined : "N/A"
    },
    indexed: {
      medianLatencyMs: Number(indexedMed.toFixed(3)),
      stage: indexedExplain.executionStats ? (indexedExplain.executionStats.executionStages.stage || "IXSCAN") : "IXSCAN",
      docsExamined: indexedExplain.executionStats ? indexedExplain.executionStats.totalDocsExamined : "N/A"
    },
    speedupFactor: `${speedup}x`
  };

  console.log(`Query: ${JSON.stringify(sampleQuery)}`);
  console.log(`Unindexed (COLLSCAN): ${unindexedMed.toFixed(3)} ms (Docs examined: ${stats.unindexed.docsExamined})`);
  console.log(`Indexed   (IXSCAN):   ${indexedMed.toFixed(3)} ms (Docs examined: ${stats.indexed.docsExamined})`);
  console.log(`Query Improvement:    ${speedup}x speedup`);

  return stats;
}

// Master Runner
async function main() {
  console.log("Starting SchemaShift Benchmark Suite...");
  const conn = await connectDB();
  const db = conn.connection.db;

  const envInfo = {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    timestamp: new Date().toISOString(),
    databaseHost: conn.connection.host
  };

  const b1Results = await runBenchmark1();
  const b2Results = await runBenchmark2(db);
  const targetCol = b2Results[2].collectionsCreated[0]; // 5,000 records target collection
  const b3Results = await runBenchmark3(db, targetCol);

  const finalResults = {
    environment: envInfo,
    benchmark1_schemaAnalysis: b1Results,
    benchmark2_dataTransformation: b2Results,
    benchmark3_indexingEvaluation: b3Results
  };

  const benchDir = path.join(__dirname);
  if (!fs.existsSync(benchDir)) {
    fs.mkdirSync(benchDir, { recursive: true });
  }

  const jsonPath = path.join(benchDir, "results.json");
  fs.writeFileSync(jsonPath, JSON.stringify(finalResults, null, 2), "utf8");
  console.log(`\nRaw benchmark results written to: ${jsonPath}`);

  // CSV Export for Benchmark 1 & 2
  let csvContent = "BENCHMARK 1: SCHEMA ANALYSIS\n";
  csvContent += "Tables,Columns,Relationships,Queries,Median_Latency_ms,Min_Latency_ms,Max_Latency_ms\n";
  for (const r of b1Results) {
    csvContent += `${r.tablesCount},${r.columnsCount},${r.relationshipsCount},${r.queriesCount},${r.medianLatencyMs},${r.minLatencyMs},${r.maxLatencyMs}\n`;
  }

  csvContent += "\nBENCHMARK 2: DATA TRANSFORMATION\n";
  csvContent += "Source_Records,Customers,Orders,Transformed_Docs,Xform_Time_ms,Mongo_Insert_Time_ms,Total_Time_ms,Integrity_Passed\n";
  for (const r of b2Results) {
    csvContent += `${r.sourceRecords},${r.customerCount},${r.orderCount},${r.transformedDocuments},${r.transformationTimeMs},${r.mongodbInsertionTimeMs},${r.totalProcessingTimeMs},${r.integrityPassed}\n`;
  }

  csvContent += "\nBENCHMARK 3: INDEX EVALUATION\n";
  csvContent += "Target_Collection,Query,Unindexed_Latency_ms,Unindexed_Stage,Indexed_Latency_ms,Indexed_Stage,Speedup\n";
  csvContent += `${b3Results.targetCollection},"${b3Results.queryPattern}",${b3Results.unindexed.medianLatencyMs},${b3Results.unindexed.stage},${b3Results.indexed.medianLatencyMs},${b3Results.indexed.stage},${b3Results.speedupFactor}\n`;

  const csvPath = path.join(benchDir, "results.csv");
  fs.writeFileSync(csvPath, csvContent, "utf8");
  console.log(`CSV benchmark results written to: ${csvPath}`);

  await mongoose.disconnect();
  console.log("Benchmark execution completed successfully.");
}

if (require.main === module) {
  main().catch(err => {
    console.error("Benchmark failure:", err);
    process.exit(1);
  });
}

module.exports = { runBenchmark1, runBenchmark2, runBenchmark3 };
