"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  fetchApplicationsOrgRoster,
  type ApplicationRecord,
} from "@/lib/api/candidateApi";

type PersonRow = {
  personKey: number;
  displayName: string;
  email: string;
  applications: ApplicationRecord[];
};

function aggregateByPerson(apps: ApplicationRecord[]): PersonRow[] {
  const map = new Map<number, PersonRow>();
  for (const app of apps) {
    const personKey = app.candidate.person_id ?? app.candidate_id;
    const existing = map.get(personKey);
    if (existing) {
      existing.applications.push(app);
    } else {
      map.set(personKey, {
        personKey,
        displayName: app.candidate.full_name,
        email: app.candidate.email,
        applications: [app],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, {
      sensitivity: "base",
    }),
  );
}

export default function GlobalCandidatesRoster() {
  const [rows, setRows] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apps = await fetchApplicationsOrgRoster(500);
      setRows(aggregateByPerson(apps));
    } catch {
      setError("Unable to load applications.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subtitle = useMemo(
    () =>
      "Applications-first roster (recent 500). Open a requisition to add or move candidates.",
    [],
  );

  return (
    <div className="master-data-manager">
      <div className="data-manager-header">
        <h1>Candidates (Global)</h1>
        <p className="subtitle">{subtitle}</p>
      </div>

      {loading ? (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
          Loading…
        </p>
      ) : error ? (
        <p style={{ fontSize: "13px", color: "var(--error)" }}>{error}</p>
      ) : rows.length === 0 ? (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
          No applications in your organization yet.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr style={{ textAlign: "left", color: "var(--text-tertiary)" }}>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                  Name
                </th>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                  Email
                </th>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                  Applications
                </th>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                  Requisitions
                </th>
                <th style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const reqIds = Array.from(
                  new Set(r.applications.map((a) => a.requisition_id)),
                ).sort((a, b) => a - b);
                const stages = Array.from(
                  new Set(r.applications.map((a) => a.current_stage)),
                ).join(", ");
                return (
                  <tr
                    key={r.personKey}
                    style={{ backgroundColor: "var(--bg-primary)" }}
                  >
                    <td
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid var(--border-subtle)",
                        fontWeight: 600,
                      }}
                    >
                      {r.displayName}
                    </td>
                    <td
                      style={{
                        padding: "10px",
                        borderBottom: "1px solid var(--border-subtle)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {r.email}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                      {r.applications.length}
                      <div
                        style={{
                          fontSize: "11px",
                          color: "var(--text-tertiary)",
                          marginTop: "4px",
                        }}
                      >
                        Stages: {stages || "—"}
                      </div>
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                      {reqIds.map((id) => (
                        <Link
                          key={id}
                          href={`/ta/requisitions/${id}`}
                          style={{
                            display: "inline-block",
                            marginRight: "8px",
                            fontSize: "12px",
                            color: "var(--primary-accent)",
                          }}
                        >
                          REQ-{id}
                        </Link>
                      ))}
                    </td>
                    <td style={{ padding: "10px", borderBottom: "1px solid var(--border-subtle)" }}>
                      {reqIds[0] != null ? (
                        <Link
                          href={`/ta/requisitions/${reqIds[0]}`}
                          className="action-button"
                          style={{ fontSize: "11px", padding: "6px 12px" }}
                        >
                          Open requisition
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
