import { useState, useEffect } from "react";
import "./App.css";
import { DEMO_EXAMPLES } from "./demoData";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

function App() {
  const [schema, setSchema] = useState("");
  const [queries, setQueries] = useState("");
  const [sampleDataJson, setSampleDataJson] = useState("");
  const [result, setResult] = useState(null);
  const [currentMigrationId, setCurrentMigrationId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [activeTab, setActiveTab] = useState("analysis"); // analysis | transform | history
  const [copySuccess, setCopySuccess] = useState(false);
  const [systemHealth, setSystemHealth] = useState(null);

  // Transformation states
  const [transformLoading, setTransformLoading] = useState(false);
  const [transformResult, setTransformResult] = useState(null);
  const [transformError, setTransformError] = useState("");

  // History states
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Check backend health on mount
  useEffect(() => {
    fetchHealth();
    loadHistory();
  }, []);

  const fetchHealth = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/health`);
      const data = await res.json();
      setSystemHealth(data);
    } catch {
      setSystemHealth({ status: "disconnected", database: "unreachable" });
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/migration/`);
      const data = await res.json();
      if (data.success) {
        setHistoryList(data.migrations || []);
      }
    } catch (err) {
      console.error("Failed to load migration history:", err);
    }
    setHistoryLoading(false);
  };

  // Load a demo example
  const loadDemo = (example) => {
    setSchema(example.schema);
    setQueries(example.queries);
    setSampleDataJson(JSON.stringify(example.sampleData, null, 2));
    setError("");
    setWarnings([]);
    setResult(null);
    setTransformResult(null);
    setCurrentMigrationId(null);
  };

  // Analyze Migration
  const analyzeMigration = async () => {
    if (!schema.trim()) {
      setError("Please provide a SQL relational schema (CREATE TABLE statements).");
      return;
    }
    if (!queries.trim()) {
      setError("Please provide representative SQL queries for access-pattern analysis.");
      return;
    }

    setLoading(true);
    setError("");
    setWarnings([]);
    setResult(null);
    setTransformResult(null);

    try {
      const response = await fetch(`${API_BASE}/api/migration/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema, queries })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || (data.details ? data.details.join(", ") : "Migration analysis failed."));
      }

      setResult(data);
      setCurrentMigrationId(data.migrationId);
      if (data.parsedSchema && data.parsedSchema.warnings) {
        setWarnings(data.parsedSchema.warnings);
      }
      loadHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Execute Sample Data Transformation
  const executeTransformation = async () => {
    if (!sampleDataJson.trim()) {
      setTransformError("Please provide sample JSON records for the tables in the schema.");
      return;
    }

    let parsedData;
    try {
      parsedData = JSON.parse(sampleDataJson);
    } catch (err) {
      setTransformError("Invalid JSON syntax in sample data editor: " + err.message);
      return;
    }

    setTransformLoading(true);
    setTransformError("");
    setTransformResult(null);

    try {
      const payload = {
        sampleData: parsedData,
        schema,
        queries,
        migrationId: currentMigrationId
      };

      const response = await fetch(`${API_BASE}/api/migration/transform`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Data transformation failed.");
      }

      setTransformResult(data);
    } catch (err) {
      setTransformError(err.message);
    } finally {
      setTransformLoading(false);
    }
  };

  // Copy Schema to Clipboard
  const copySchemaJson = () => {
    if (!result || !result.migrationResult) return;
    navigator.clipboard.writeText(JSON.stringify(result.migrationResult, null, 2));
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Load a historic migration
  const loadHistoricRecord = (item) => {
    setSchema(item.sourceSchema);
    setQueries(item.sampleQueries);
    setCurrentMigrationId(item._id);
    setResult({
      migrationId: item._id,
      parsedSchema: item.parsedSchema,
      relationships: item.relationships,
      queryAnalysis: item.queryAnalysis,
      migrationResult: {
        targetDatabase: item.targetDatabase,
        collections: item.generatedSchema,
        decisions: item.migrationDecisions,
        summary: {
          totalCollections: item.generatedSchema ? item.generatedSchema.length : 0,
          totalDecisions: item.migrationDecisions ? item.migrationDecisions.length : 0
        }
      }
    });
    setActiveTab("analysis");
  };

  // Delete historic migration
  const deleteHistoricRecord = async (id, e) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this migration record?")) return;
    try {
      const res = await fetch(`${API_BASE}/api/migration/${id}`, { method: "DELETE" });
      if (res.ok) {
        if (currentMigrationId === id) {
          setResult(null);
          setCurrentMigrationId(null);
        }
        loadHistory();
      }
    } catch (err) {
      alert("Failed to delete record: " + err.message);
    }
  };

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <div className="header-brand">
          <div className="logo-badge">SS</div>
          <div>
            <h1>SchemaShift</h1>
            <p className="subtitle">Relational-to-NoSQL Document Migration Engine • Review 3</p>
          </div>
        </div>

        <div className="header-meta">
          <div className="status-pill">
            <span className={`status-dot ${systemHealth && systemHealth.database === "connected" ? "connected" : "disconnected"}`} />
            <span>MongoDB Atlas: {systemHealth ? systemHealth.database : "checking..."}</span>
          </div>
          <span className="badge-scope">MongoDB Target Only</span>
        </div>
      </header>

      {/* NAVIGATION TABS */}
      <nav className="tab-navigation">
        <button
          className={`tab-btn ${activeTab === "analysis" ? "active" : ""}`}
          onClick={() => setActiveTab("analysis")}
        >
          Schema Analysis & Proposal
        </button>
        <button
          className={`tab-btn ${activeTab === "transform" ? "active" : ""}`}
          onClick={() => setActiveTab("transform")}
        >
          Sample Data Pipeline
          {transformResult && <span className="tab-badge">Active Run</span>}
        </button>
        <button
          className={`tab-btn ${activeTab === "history" ? "active" : ""}`}
          onClick={() => { setActiveTab("history"); loadHistory(); }}
        >
          Migration History ({historyList.length})
        </button>
      </nav>

      {/* DEMO SELECTOR BAR */}
      <div className="demo-bar">
        <span className="demo-label">Load Review 2 Baselines:</span>
        <div className="demo-buttons">
          {DEMO_EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              className="demo-btn"
              onClick={() => loadDemo(ex)}
              title={ex.description}
            >
              {ex.title}
            </button>
          ))}
          <button
            className="demo-btn-clear"
            onClick={() => {
              setSchema("");
              setQueries("");
              setSampleDataJson("");
              setResult(null);
              setError("");
              setWarnings([]);
              setTransformResult(null);
              setCurrentMigrationId(null);
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* MAIN VIEWPORT */}
      <main className="main-content">
        {/* ============================================================== */}
        {/* TAB 1: SCHEMA ANALYSIS & PROPOSAL */}
        {/* ============================================================== */}
        {activeTab === "analysis" && (
          <div className="analysis-view">
            {/* INPUT WORKSPACE */}
            <section className="input-workspace">
              <div className="editor-card">
                <div className="editor-header">
                  <h3>Normalized SQL Schema</h3>
                  <span className="syntax-hint">CREATE TABLE DDL</span>
                </div>
                <textarea
                  className="code-editor"
                  value={schema}
                  onChange={(e) => setSchema(e.target.value)}
                  placeholder="CREATE TABLE Customer (&#10;    customer_id INT PRIMARY KEY,&#10;    name VARCHAR(100)&#10;);&#10;&#10;CREATE TABLE Orders (&#10;    order_id INT PRIMARY KEY,&#10;    customer_id INT,&#10;    amount DECIMAL(10,2),&#10;    FOREIGN KEY (customer_id) REFERENCES Customer(customer_id)&#10;);"
                  spellCheck="false"
                />
              </div>

              <div className="editor-card">
                <div className="editor-header">
                  <h3>Representative Queries</h3>
                  <span className="syntax-hint">Workload Access Patterns</span>
                </div>
                <textarea
                  className="code-editor"
                  value={queries}
                  onChange={(e) => setQueries(e.target.value)}
                  placeholder="SELECT c.name, o.amount&#10;FROM Customer c&#10;JOIN Orders o ON c.customer_id = o.customer_id&#10;WHERE c.customer_id = 101;"
                  spellCheck="false"
                />
              </div>
            </section>

            {/* ACTION CONTROLS */}
            <div className="action-row">
              <button
                className="btn-primary"
                onClick={analyzeMigration}
                disabled={loading}
              >
                {loading ? "Analyzing Workload & Schema..." : "Analyze & Propose MongoDB Schema"}
              </button>
            </div>

            {/* ERROR AND WARNING FEEDBACK */}
            {error && (
              <div className="alert-box error-alert">
                <strong>Analysis Failed:</strong> {error}
              </div>
            )}

            {warnings.length > 0 && (
              <div className="alert-box warning-alert">
                <strong>Schema Warnings:</strong>
                <ul>
                  {warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* RESULTS VIEW */}
            {result && result.migrationResult && (
              <section className="results-container">
                {/* SUMMARY STATS BAR */}
                <div className="summary-banner">
                  <div className="summary-item">
                    <span className="summary-label">Target Model</span>
                    <span className="summary-value target-highlight">{result.migrationResult.targetDatabase}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Collections</span>
                    <span className="summary-value">{result.migrationResult.collections.length}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Decisions</span>
                    <span className="summary-value">{result.migrationResult.decisions.length}</span>
                  </div>
                  <div className="summary-item">
                    <span className="summary-label">Migration ID</span>
                    <span className="summary-value code-snippet">{result.migrationId || "In Memory"}</span>
                  </div>
                  <div className="summary-actions">
                    <button className="btn-secondary" onClick={copySchemaJson}>
                      {copySuccess ? "Copied Schema JSON!" : "Copy Schema JSON"}
                    </button>
                    <button
                      className="btn-secondary accent-btn"
                      onClick={() => setActiveTab("transform")}
                    >
                      Proceed to Sample Data Pipeline →
                    </button>
                  </div>
                </div>

                {/* GENERATED COLLECTIONS GRID */}
                <div className="section-block">
                  <h3 className="section-title">MongoDB Document Collections</h3>
                  <div className="collections-grid">
                    {result.migrationResult.collections.map((col, cIdx) => (
                      <div className="collection-card" key={cIdx}>
                        <div className="card-top">
                          <span className="collection-icon">📦</span>
                          <h4>{col.name}</h4>
                          <span className="card-source-tag">from {col.sqlTableName || col.name}</span>
                        </div>

                        {/* Top-Level Fields */}
                        <div className="fields-table">
                          <div className="table-head">
                            <span>Field</span>
                            <span>SQL Type</span>
                            <span>BSON Type</span>
                            <span>Attributes</span>
                          </div>
                          {col.fields.map((f, fIdx) => (
                            <div className="table-row" key={fIdx}>
                              <span className="col-name">{f.name}</span>
                              <span className="col-sql">{f.type}</span>
                              <span className="col-bson">{f.bsonType}</span>
                              <span className="col-attr">
                                {f.primaryKey && <span className="tag-pk">🔑 PK</span>}
                                {f.isReference && (
                                  <span className="tag-ref" title={`References ${f.references}(${f.referencedColumn})`}>
                                    → {f.references}
                                  </span>
                                )}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Embedded Documents */}
                        {col.embeddedDocuments && col.embeddedDocuments.length > 0 && (
                          <div className="embedded-group">
                            <div className="embedded-group-title">
                              Embedded Documents ({col.embeddedDocuments.length})
                            </div>
                            {col.embeddedDocuments.map((emb, embIdx) => (
                              <div className="embedded-box" key={embIdx}>
                                <div className="embedded-box-header">
                                  <span className="emb-name">↳ {emb.name}[]</span>
                                  <span className="emb-cardinality">{emb.cardinality || "array"}</span>
                                </div>
                                <div className="embedded-fields-list">
                                  {emb.fields.map((ef, efIdx) => (
                                    <div className="embedded-field-item" key={efIdx}>
                                      <span className="ef-name">{ef.name}</span>
                                      <span className="ef-type">{ef.type}</span>
                                      <span className="ef-bson">{ef.bsonType}</span>
                                      {ef.isReference && (
                                        <span className="tag-ref">→ {ef.references}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* MIGRATION DECISIONS & TRADE-OFFS */}
                <div className="section-block">
                  <h3 className="section-title">Design Decisions & Trade-Off Analysis</h3>
                  <div className="decisions-list">
                    {result.migrationResult.decisions.map((dec, dIdx) => (
                      <div className="decision-panel" key={dIdx}>
                        <div className="decision-top">
                          <div className="decision-rel">{dec.relationship}</div>
                          <span className={`strategy-badge strategy-${dec.strategy.toLowerCase().replace(/[^a-z]/g, "-")}`}>
                            {dec.strategy}
                          </span>
                        </div>

                        <div className="decision-body">
                          <div className="decision-row">
                            <span className="decision-label">Rationale:</span>
                            <span className="decision-text">{dec.reason}</span>
                          </div>

                          {dec.queryEvidence && (
                            <div className="decision-row">
                              <span className="decision-label">Query Evidence:</span>
                              <pre className="query-evidence-box">{dec.queryEvidence}</pre>
                            </div>
                          )}

                          <div className="decision-row">
                            <span className="decision-label">Trade-Off:</span>
                            <span className="decision-text">{dec.tradeOff}</span>
                          </div>

                          {dec.limitations && (
                            <div className="decision-row limitation-row">
                              <span className="decision-label">Boundary / Limitations:</span>
                              <span className="decision-text">{dec.limitations}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 2: SAMPLE DATA TRANSFORMATION PIPELINE */}
        {/* ============================================================== */}
        {activeTab === "transform" && (
          <div className="transform-view">
            <div className="info-callout">
              <h4>JSON Sample-Data Transformation Pipeline</h4>
              <p>
                Validates relational integrity on source JSON records, applies document embedding and referencing
                according to the schema proposal, and writes transformed documents into safely segregated MongoDB
                target collections (<code>ss_data_&lt;collection&gt;_&lt;runId&gt;</code>).
              </p>
            </div>

            <div className="editor-card">
              <div className="editor-header">
                <h3>Source Sample Records (JSON format by table)</h3>
                <span className="syntax-hint">JSON Mapping table → array of objects</span>
              </div>
              <textarea
                className="code-editor json-editor"
                value={sampleDataJson}
                onChange={(e) => setSampleDataJson(e.target.value)}
                placeholder='{&#10;  "Customer": [&#10;    { "customer_id": 101, "name": "Alice" }&#10;  ],&#10;  "Orders": [&#10;    { "order_id": 5001, "customer_id": 101, "amount": 149.99 }&#10;  ]&#10;}'
                spellCheck="false"
              />
            </div>

            <div className="action-row">
              <button
                className="btn-primary"
                onClick={executeTransformation}
                disabled={transformLoading}
              >
                {transformLoading ? "Validating & Transforming..." : "Execute Data Transformation Pipeline"}
              </button>
            </div>

            {transformError && (
              <div className="alert-box error-alert">
                <strong>Transformation Failed:</strong> {transformError}
              </div>
            )}

            {transformResult && (
              <div className="transform-result-block">
                {/* STATUS BAR */}
                <div className={`transform-status-bar ${transformResult.integrityChecks.passed ? "passed" : "partial"}`}>
                  <div>
                    <h4>Pipeline Execution: {transformResult.integrityChecks.passed ? "COMPLETED SUCCESSFULLY" : "COMPLETED WITH INTEGRITY WARNINGS"}</h4>
                    <p className="run-id-text">Run ID: <code>{transformResult.runId}</code></p>
                  </div>
                  <div className="metric-badges">
                    <span className="metric-pill">Source: {transformResult.summary.totalSourceRecords} records</span>
                    <span className="metric-pill">Target: {transformResult.summary.totalTransformedDocuments} docs</span>
                    <span className="metric-pill">Time: {transformResult.summary.transformationTimeMs} ms</span>
                  </div>
                </div>

                {/* INTEGRITY CHECKS PANEL */}
                <div className="integrity-panel">
                  <h5>Referential Integrity Verification</h5>
                  <p>
                    Verified {transformResult.integrityChecks.totalChecks} foreign-key references.
                    Status: <strong>{transformResult.integrityChecks.passed ? "100% Valid" : "Violations Detected"}</strong>
                  </p>
                  {transformResult.integrityChecks.violations.length > 0 && (
                    <div className="violation-box">
                      <h6>Integrity Violations:</h6>
                      <ul>
                        {transformResult.integrityChecks.violations.map((v, vIdx) => (
                          <li key={vIdx}>{v}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {transformResult.rejectedRecords && transformResult.rejectedRecords.length > 0 && (
                    <div className="violation-box">
                      <h6>Rejected Records ({transformResult.rejectedRecords.length}):</h6>
                      <pre>{JSON.stringify(transformResult.rejectedRecords, null, 2)}</pre>
                    </div>
                  )}
                </div>

                {/* TARGET COLLECTIONS CREATED */}
                <div className="collections-created-panel">
                  <h5>MongoDB Atlas Target Collections Created</h5>
                  <div className="target-coll-pills">
                    {transformResult.collectionsCreated.map((tc, tcIdx) => (
                      <span key={tcIdx} className="coll-pill">📁 {tc}</span>
                    ))}
                  </div>
                </div>

                {/* DOCUMENT VIEWER */}
                <div className="doc-viewer-panel">
                  <div className="doc-viewer-header">
                    <h5>Transformed Documents Inspector</h5>
                    <button
                      className="btn-secondary"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(transformResult.sampleDocuments, null, 2));
                        alert("Transformed documents copied to clipboard!");
                      }}
                    >
                      Copy Transformed JSON
                    </button>
                  </div>
                  <pre className="json-display">
                    {JSON.stringify(transformResult.sampleDocuments, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* TAB 3: MIGRATION HISTORY */}
        {/* ============================================================== */}
        {activeTab === "history" && (
          <div className="history-view">
            <div className="history-header">
              <h3>Saved Migration Records ({historyList.length})</h3>
              <p>Stored in MongoDB Atlas collection: <code>schemashift.migrations</code></p>
            </div>

            {historyLoading && <div className="loading-spinner">Loading history from MongoDB Atlas...</div>}

            <div className="history-list">
              {historyList.map((item) => (
                <div className="history-card" key={item._id} onClick={() => loadHistoricRecord(item)}>
                  <div className="history-card-top">
                    <span className="history-id">ID: {item._id}</span>
                    <span className="history-date">{new Date(item.createdAt).toLocaleString()}</span>
                    <button
                      className="btn-delete"
                      onClick={(e) => deleteHistoricRecord(item._id, e)}
                    >
                      Delete
                    </button>
                  </div>
                  <div className="history-details">
                    <div>
                      <strong>Collections:</strong> {item.generatedSchema ? item.generatedSchema.map(c => c.name).join(", ") : "N/A"}
                    </div>
                    <div>
                      <strong>Decisions:</strong> {item.migrationDecisions ? item.migrationDecisions.map(d => `${d.relationship} (${d.strategy})`).join("; ") : "N/A"}
                    </div>
                  </div>
                  <div className="history-actions">
                    <button className="btn-secondary btn-sm">Load Into Workspace →</button>
                  </div>
                </div>
              ))}

              {historyList.length === 0 && !historyLoading && (
                <div className="empty-state">No migration history recorded yet.</div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
