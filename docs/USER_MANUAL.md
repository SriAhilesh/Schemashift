# SchemaShift — User Manual & Operations Guide

## 1. System Requirements & Prerequisites
Before launching SchemaShift, ensure your environment meets the following specifications:

| Component | Minimum Requirement | Recommended |
|---|---|---|
| **Operating System** | Windows 10/11, macOS 12+, or Ubuntu 20.04+ | Windows 11 / macOS Sonoma |
| **Node.js Runtime** | Node.js v18.0.0 | Node.js v22.14.0 or latest LTS |
| **Package Manager** | npm v9.0.0 | npm v10.0.0+ |
| **Database** | MongoDB v6.0+ | MongoDB Atlas Cloud Cluster (M0 Free Tier or higher) |
| **Web Browser** | Modern Chromium / Firefox / Safari | Google Chrome / Microsoft Edge |

---

## 2. Installation and Environment Setup

### 2.1 Backend Configuration
1. Open a terminal and navigate to the `backend/` directory:
   ```bash
   cd f:\SchemaShift\backend
   ```
2. Install Node.js dependencies:
   ```bash
   npm install
   ```
3. Configure your environment variables. Copy the `.env.example` template:
   ```bash
   cp .env.example .env
   ```
4. Edit `.env` with your MongoDB Atlas connection string:
   ```ini
   PORT=5000
   MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/schemashift?retryWrites=true&w=majority
   ```
   > **Important:** Never commit `.env` to Git. Keep credentials confidential.

5. Start the backend service:
   ```bash
   npm start
   ```
   *Expected Console Output:*
   ```
   MongoDB Atlas connected successfully: <cluster-host>
   SchemaShift server running on port 5000
   ```

### 2.2 Frontend Configuration
1. Open a second terminal window and navigate to `frontend/`:
   ```bash
   cd f:\SchemaShift\frontend
   ```
2. Install frontend dependencies:
   ```bash
   npm install
   ```
3. (Optional) Configure custom backend URL in `.env`:
   ```ini
   VITE_API_URL=http://localhost:5000
   ```
4. Start the Vite development server:
   ```bash
   npm run dev
   ```
5. Open your web browser and navigate to:
   ```
   http://localhost:5173
   ```

---

## 3. Step-by-Step Usage Guide

### Step 1: Loading Baseline Demonstration Examples
At the top of the interface, the **Demo Selector Bar** offers one-click loaders for the three baseline Review 2 scenarios:
- **1. Student ↔ Course (N:M):** Demonstrates junction-table embedding with references.
- **2. Customer → Orders (1:N Embed):** Demonstrates parent-child embedding driven by co-access queries.
- **3. Department → Employee (1:N Ref):** Demonstrates inter-collection referencing driven by independent queries.

Clicking any button instantly pre-populates:
1. The **Normalized SQL Schema** editor.
2. The **Representative Queries** editor.
3. The **Sample Data JSON** editor.

### Step 2: Entering Custom SQL Schema and Queries
If you wish to test custom schemas:
1. In the **Normalized SQL Schema** card, enter standard `CREATE TABLE` statements.
   * Example:
     ```sql
     CREATE TABLE Project (
         project_id INT PRIMARY KEY,
         name VARCHAR(100)
     );
     CREATE TABLE Task (
         task_id INT PRIMARY KEY,
         project_id INT,
         title VARCHAR(150),
         FOREIGN KEY (project_id) REFERENCES Project(project_id)
     );
     ```
2. In the **Representative Queries** card, enter representative queries reflecting application read patterns:
   * Example:
     ```sql
     SELECT p.name, t.title 
     FROM Project p 
     JOIN Task t ON p.project_id = t.project_id 
     WHERE p.project_id = 10;
     ```

### Step 3: Generating Schema Proposal
1. Click the primary button: **Analyze & Propose MongoDB Schema**.
2. SchemaShift will parse the DDL, analyze query co-access patterns, generate the BSON schema proposal, and save an analysis record in MongoDB Atlas.
3. Review the generated sections:
   * **Executive Summary:** Displays target database model (`MongoDB`), total collections count, decision count, and migration record ID.
   * **Document Collections Grid:** Displays each proposed collection, field definitions, BSON types, Primary Key indicators (🔑), Reference tags (→), and embedded subdocument groups (↳).
   * **Design Decisions & Trade-Off Analysis:** Details why each strategy was chosen, the exact query evidence that drove the decision, trade-offs between read latency and write bloat, and MongoDB 16MB document boundary warnings.
4. Click **Copy Schema JSON** to copy the complete proposal to your clipboard.

### Step 4: Executing the Sample Data Transformation Pipeline
1. Click the **Sample Data Pipeline** navigation tab.
2. Review the pre-populated JSON sample records or paste custom records. Records must be formatted as an object mapping table names to arrays of objects:
   ```json
   {
     "Customer": [
       { "customer_id": 101, "name": "Diana Prince" }
     ],
     "Orders": [
       { "order_id": 5001, "customer_id": 101, "amount": 349.50 }
     ]
   }
   ```
3. Click **Execute Data Transformation Pipeline**.
4. The pipeline will:
   * Verify all foreign-key references against parent primary keys.
   * Reject orphan records and report integrity violations.
   * Nest records into hierarchical BSON documents.
   * Persist transformed documents into isolated MongoDB collections: `ss_data_<collection>_<runId>`.
5. Review the execution summary:
   * **Integrity Status:** 100% Valid or Violations Detected.
   * **Performance Metrics:** Transformation duration (ms), total source rows, total target documents.
   * **Target Collections Created:** List of collections created on MongoDB Atlas.
   * **Document Inspector:** Live interactive preview of transformed BSON documents.

### Step 5: Managing Migration History
1. Click the **Migration History** tab.
2. The interface lists all historical migration proposals retrieved from `schemashift.migrations`.
3. Click **Load Into Workspace** to inspect and reload any historical proposal.
4. Click **Delete** to safely purge an obsolete record from the database.

---

## 4. Running Automated Tests and Benchmarks

### Executing the Test Suite
From the `backend/` directory:
```bash
# Run all 36 automated tests (unit, regression, integration)
npm test

# Run unit tests only (instant offline execution)
npm run test:unit

# Run live MongoDB integration tests
npm run test:integration
```

### Executing Performance Benchmarks
To measure schema analysis latency across 3, 10, and 25 tables, sample data throughput across 100, 1k, and 5k records, and index benefits:
```bash
cd backend
npm run benchmark
```
Output files:
- `backend/benchmarks/results.json` (Structured JSON)
- `backend/benchmarks/results.csv` (Spreadsheet CSV)

---

## 5. Troubleshooting and FAQ

**Q1: Backend displays `MongoDB connection failed: bad auth`**  
*Solution:* Check your `backend/.env` file. Ensure your MongoDB Atlas username and password are correct and that your IP address is whitelisted in MongoDB Atlas Network Access.

**Q2: Server returns `SQL schema parsing failed`**  
*Solution:* Verify that every table definition ends with a semicolon (`;`). Ensure that foreign keys reference tables defined within the same schema block.

**Q3: Can SchemaShift connect directly to a live PostgreSQL or MySQL database?**  
*Solution:* In Review 3, SchemaShift ingests SQL DDL text and JSON records to avoid platform-specific database driver dependencies. Direct JDBC/ODBC connectors are planned for future versions.
