const parseSQLSchema = require("./services/schemaParser");
const analyzeRelationships = require("./services/relationshipAnalyzer");
const analyzeQueries = require("./services/queryAnalyzer");
const generateMongoSchema =
  require("./services/migrationEngine");

const sqlSchema = `
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
    FOREIGN KEY (student_id) REFERENCES Student(student_id),
    FOREIGN KEY (course_id) REFERENCES Course(course_id)
);
`;

const sqlQueries = `
SELECT s.name, c.course_name
FROM Student s
JOIN Enrollment e
    ON s.student_id = e.student_id
JOIN Course c
    ON e.course_id = c.course_id
WHERE s.student_id = 101;

SELECT *
FROM Course
WHERE course_id = 10;
`;


// ============================================
// STEP 1 — Parse Schema
// ============================================

const schema = parseSQLSchema(sqlSchema);

console.log("========== PARSED SCHEMA ==========");

console.log(JSON.stringify(schema, null, 2));


// ============================================
// STEP 2 — Analyze Relationships
// ============================================

const relationships = analyzeRelationships(schema);

console.log("\n========== RELATIONSHIPS ==========");

console.log(JSON.stringify(relationships, null, 2));


// ============================================
// STEP 3 — Analyze Queries
// ============================================

const queryAnalysis = analyzeQueries(sqlQueries);

console.log("\n========== QUERY ANALYSIS ==========");

console.log(JSON.stringify(queryAnalysis, null, 2));


// ============================================
// STEP 4 — Generate MongoDB Schema
// ============================================

const migrationResult =
  generateMongoSchema(
    schema,
    relationships,
    queryAnalysis
  );

console.log("\n========== MIGRATION RESULT ==========");

console.log(
  JSON.stringify(
    migrationResult,
    null,
    2
  )
);