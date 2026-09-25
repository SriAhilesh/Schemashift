import { useState } from "react";
import "./App.css";

function App() {
  const [schema, setSchema] = useState("");
  const [queries, setQueries] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const analyzeMigration = async () => {
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch(
        "http://localhost:5000/api/migration/analyze",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            schema,
            queries
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || "Migration failed"
        );
      }

      setResult(data);

    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  };

  return (
    <div className="app">

      {/* HEADER */}

      <header className="header">
        <div>
          <h1>SchemaShift</h1>
          <p>
            Relational to NoSQL Schema Migration Tool
          </p>
        </div>
      </header>


      {/* INPUT SECTION */}

      <section className="input-section">

        <div className="input-card">

          <h2>Relational Schema</h2>

          <p className="input-description">
            Enter your SQL CREATE TABLE statements.
          </p>

          <textarea
            value={schema}
            onChange={(e) =>
              setSchema(e.target.value)
            }
            placeholder="CREATE TABLE Customer (...);"
          />

        </div>


        <div className="input-card">

          <h2>Sample Queries</h2>

          <p className="input-description">
            Enter representative SQL queries.
          </p>

          <textarea
            value={queries}
            onChange={(e) =>
              setQueries(e.target.value)
            }
            placeholder="SELECT ... FROM Customer JOIN Orders ..."
          />

        </div>

      </section>


      {/* ANALYZE BUTTON */}

      <div className="analyze-container">

        <button
          onClick={analyzeMigration}
          disabled={loading}
        >
          {loading
            ? "Analyzing..."
            : "Analyze Migration"}
        </button>

      </div>


      {/* ERROR */}

      {error && (
        <div className="error">
          {error}
        </div>
      )}


      {/* RESULT */}

      {result && result.migrationResult && (

        <section className="result-section">

          <div className="result-header">
            <h2>Migration Result</h2>

            <div className="target-badge">
              Target Database:
              <strong>
                {result.migrationResult.targetDatabase}
              </strong>
            </div>
          </div>


          {/* COLLECTIONS */}

          <div className="result-block">

            <h3>Generated Collections</h3>

            <div className="collections">

              {result.migrationResult.collections.map(
                (collection, index) => (

                  <div
                    className="collection-card"
                    key={index}
                  >

                    <div className="collection-title">
                      <span className="collection-icon">
                        ◈
                      </span>

                      {collection.name}
                    </div>


                    <div className="fields">

                      {collection.fields.map(
                        (field, fieldIndex) => (

                          <div
                            className="field-row"
                            key={fieldIndex}
                          >

                            <span className="field-name">
                              {field.name}
                            </span>

                            <span className="field-type">
                              {field.type}
                            </span>

                            {field.primaryKey && (
                              <span className="primary-key">
                                🔑 Primary Key
                              </span>
                            )}

                          </div>

                        )
                      )}

                    </div>


                    {/* EMBEDDED DOCUMENTS */}

                    {collection.embeddedDocuments &&
                      collection.embeddedDocuments.length > 0 && (

                        <div className="embedded-section">

                          <div className="embedded-title">
                            ↳ Embedded Documents
                          </div>


                          {collection.embeddedDocuments.map(
                            (embedded, embeddedIndex) => (

                              <div
                                className="embedded-card"
                                key={embeddedIndex}
                              >

                                <div className="embedded-name">
                                  {embedded.name}[]
                                </div>


                                {embedded.fields.map(
                                  (
                                    field,
                                    embeddedFieldIndex
                                  ) => (

                                    <div
                                      className="embedded-field"
                                      key={
                                        embeddedFieldIndex
                                      }
                                    >

                                      <span>
                                        {field.name}
                                      </span>

                                      <span className="field-type">
                                        {field.type}
                                      </span>

                                      {field.references && (
                                        <span className="reference-badge">
                                          → {field.references}
                                        </span>
                                      )}

                                    </div>

                                  )
                                )}

                              </div>

                            )
                          )}

                        </div>

                      )}

                  </div>

                )
              )}

            </div>

          </div>


          {/* MIGRATION DECISIONS */}

          <div className="result-block">

            <h3>Migration Decisions</h3>

            <div className="decisions">

              {result.migrationResult.decisions.map(
                (decision, index) => (

                  <div
                    className="decision-card"
                    key={index}
                  >

                    <div className="decision-relationship">
                      {decision.relationship}
                    </div>


                    <div className="strategy-row">

                      <span>
                        Strategy
                      </span>

                      <span
                        className={`strategy ${decision.strategy
                          .toLowerCase()
                          .replaceAll(
                            " ",
                            "-"
                          )}`}
                      >
                        {decision.strategy}
                      </span>

                    </div>


                    <div className="decision-detail">

                      <strong>
                        Why this strategy?
                      </strong>

                      <p>
                        {decision.reason}
                      </p>

                    </div>


                    <div className="decision-detail">

                      <strong>
                        Trade-off
                      </strong>

                      <p>
                        {decision.tradeOff}
                      </p>

                    </div>

                  </div>

                )
              )}

            </div>

          </div>

        </section>

      )}

    </div>
  );
}

export default App;