# SchemaShift — Database Export & Backup Guide

This document details procedures for exporting, inspecting, dumping, and restoring SchemaShift database artifacts from MongoDB Atlas, including migration history and sample transformed target collections.

---

## 1. Overview of Database Collections

The SchemaShift database (`schemashift`) stores two distinct types of data:
1. **Migration History & Metadata Collections:**
   - `schemashift.migrations`: Contains parsed schemas, relationships, query analysis, generated collections, and trade-off decisions.
   - `schemashift.migrationruns`: Contains execution telemetry, counts, and referential integrity audit logs.
2. **Run-Scoped Transformed Target Collections:**
   - `ss_data_<collection>_<runId>`: Contains denormalized, transformed documents created during pipeline runs.

---

## 2. Exporting Collections Using `mongoexport`

To export individual collections as formatted JSON or CSV files using MongoDB Database Tools:

### 2.1 Export Migration History
```bash
mongoexport \
  --uri="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/schemashift" \
  --collection="migrations" \
  --out="exports/migrations_export.json" \
  --jsonArray \
  --pretty
```

### 2.2 Export Transformation Run Audit Logs
```bash
mongoexport \
  --uri="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/schemashift" \
  --collection="migrationruns" \
  --out="exports/migrationruns_export.json" \
  --jsonArray \
  --pretty
```

### 2.3 Export Transformed Target Collections
To export a specific transformed collection (replace `<runId>` with the target run identifier):
```bash
mongoexport \
  --uri="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/schemashift" \
  --collection="ss_data_customer_<runId>" \
  --out="exports/transformed_customer_<runId>.json" \
  --jsonArray \
  --pretty
```

---

## 3. Full Database Backup Using `mongodump`

To create a binary BSON backup of the entire `schemashift` database:

```bash
mongodump \
  --uri="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/schemashift" \
  --out="exports/dump_backup" \
  --gzip
```

### Restoring from Backup with `mongorestore`
```bash
mongorestore \
  --uri="mongodb+srv://<username>:<password>@<cluster>.mongodb.net/schemashift" \
  --dir="exports/dump_backup/schemashift" \
  --gzip \
  --drop
```

---

## 4. Programmatic Data Export via Backend CLI

SchemaShift includes built-in commands to query and export records directly from Node.js without requiring external CLI tools installed:

```bash
cd backend

# Export latest migration record to console / file
node -e "
  require('dotenv').config();
  const mongoose = require('mongoose');
  const Migration = require('./models/Migration');
  mongoose.connect(process.env.MONGODB_URI).then(async () => {
    const records = await Migration.find().sort({ createdAt: -1 }).limit(1).lean();
    console.log(JSON.stringify(records, null, 2));
    process.exit(0);
  });
" > exports/latest_migration.json
```

---

## 5. Sample Sanitized Export Records

### 5.1 Sample Record: `schemashift.migrations` (Student-Course Example)
```json
{
  "_id": "67041f02c98a3e78b4d00001",
  "sourceDatabase": "Relational Database",
  "targetDatabase": "MongoDB",
  "sourceSchema": "CREATE TABLE Student (student_id INT PRIMARY KEY, name VARCHAR(100)); CREATE TABLE Course (course_id INT PRIMARY KEY, course_name VARCHAR(100)); CREATE TABLE Enrollment (student_id INT, course_id INT, semester VARCHAR(20), FOREIGN KEY (student_id) REFERENCES Student(student_id), FOREIGN KEY (course_id) REFERENCES Course(course_id));",
  "sampleQueries": "SELECT s.name, c.course_name FROM Student s JOIN Enrollment e ON s.student_id = e.student_id JOIN Course c ON e.course_id = c.course_id WHERE s.student_id = 101; SELECT * FROM Course WHERE course_id = 10;",
  "generatedSchema": [
    {
      "name": "student",
      "sqlTableName": "Student",
      "fields": [
        { "name": "student_id", "type": "INT", "bsonType": "int", "primaryKey": true },
        { "name": "name", "type": "VARCHAR(100)", "bsonType": "string", "primaryKey": false }
      ],
      "embeddedDocuments": [
        {
          "name": "enrollment",
          "cardinality": "array",
          "fields": [
            { "name": "course_id", "type": "REFERENCE", "bsonType": "int", "references": "Course", "isReference": true },
            { "name": "semester", "type": "VARCHAR(20)", "bsonType": "string" }
          ]
        }
      ]
    },
    {
      "name": "course",
      "sqlTableName": "Course",
      "fields": [
        { "name": "course_id", "type": "INT", "bsonType": "int", "primaryKey": true },
        { "name": "course_name", "type": "VARCHAR(100)", "bsonType": "string", "primaryKey": false }
      ],
      "embeddedDocuments": []
    }
  ],
  "migrationDecisions": [
    {
      "relationship": "Student ↔ Course",
      "type": "N:M",
      "strategy": "EMBED + REFERENCE",
      "embeddedIn": "Student",
      "references": "Course",
      "junctionTable": "Enrollment",
      "reason": "The N:M relationship is accessed together with 'Student' in query workloads. Relationship-specific attributes are embedded into 'Student' while referencing 'Course'.",
      "tradeOff": "Embedding relationship attributes eliminates joins when querying Student's associations. Referencing Course avoids duplicating the full Course document across multiple entries.",
      "limitations": "If an individual Student entity participates in thousands of relations, embedded array size must be monitored against MongoDB's 16MB document boundary."
    }
  ],
  "createdAt": "2026-10-12T11:06:23.000Z"
}
```

### 5.2 Sample Record: Transformed Target Document (`ss_data_customer_<runId>`)
```json
{
  "_id": { "$oid": "67041f02c98a3e78b4d00010" },
  "_migrationRunId": "run_customer_demo_01",
  "customer_id": 101,
  "name": "Diana Prince",
  "email": "diana@themyscira.io",
  "orders": [
    {
      "order_id": 5001,
      "order_date": "2024-03-01",
      "amount": 349.50
    },
    {
      "order_id": 5002,
      "order_date": "2024-03-15",
      "amount": 120.00
    }
  ]
}
```

### 5.3 Sample Record: Transformed Target Document (`ss_data_student_<runId>`)
```json
{
  "_id": { "$oid": "67041f02c98a3e78b4d00020" },
  "_migrationRunId": "run_student_demo_01",
  "student_id": 101,
  "name": "Alice Johnson",
  "enrollment": [
    {
      "course_id": 10,
      "semester": "Fall 2024"
    },
    {
      "course_id": 20,
      "semester": "Spring 2025"
    }
  ]
}
```
