"use client";

import { useMemo, useState } from "react";

import { uploadResume } from "@/lib/api/candidateApi";
import { apiClient } from "@/lib/api/client";

type IngestSource = "public_apply" | "linkedin" | "naukri";

export default function TaMockIngestPage() {
  const [source, setSource] = useState<IngestSource>("public_apply");
  /** Numeric value = `requisition_items.item_id` (or set PUBLIC_APPLY_DEFAULT_REQUISITION_ITEM_ID in env). */
  const [slug, setSlug] = useState("1");
  const [fullName, setFullName] = useState("Demo Candidate");
  const [email, setEmail] = useState("demo.candidate@example.com");
  const [phone, setPhone] = useState("9999999999");
  const [externalId, setExternalId] = useState(`mock-${Date.now()}`);
  const [resumeUrl, setResumeUrl] = useState("");
  const [metaNote, setMetaNote] = useState("Mock UI ingestion test");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [responseText, setResponseText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const endpoint = useMemo(() => {
    if (source === "public_apply") {
      return `/api/public/apply/${encodeURIComponent(slug || "mock-role")}`;
    }
    if (source === "linkedin") {
      return "/api/ingest/linkedin";
    }
    return "/api/ingest/naukri";
  }, [slug, source]);

  async function handleUploadResume() {
    if (!selectedFile) {
      setError("Choose a resume file first.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const uploaded = await uploadResume(selectedFile);
      setResumeUrl(uploaded.file_url);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to upload resume";
      setError(message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResponseText("");
    setSubmitting(true);
    try {
      const payload =
        source === "public_apply"
          ? {
              external_id: externalId,
              applicant: {
                full_name: fullName,
                email,
                phone,
                resume_url: resumeUrl || null,
              },
              metadata: {
                note: metaNote,
                test_mode: true,
              },
            }
          : {
              external_id: externalId,
              event_id: externalId,
              application_id: externalId,
              candidate_name: fullName,
              email,
              phone,
              resume_url: resumeUrl || null,
              metadata: {
                note: metaNote,
                test_mode: true,
              },
            };

      const response = await apiClient.post(endpoint.replace(/^\/api/, ""), payload);
      const body = response.data as unknown;
      setResponseText(
        JSON.stringify(
          {
            status: response.status,
            body,
          },
          null,
          2,
        ),
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : "Ingestion request failed";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ maxWidth: "920px", margin: "0 auto", padding: "24px" }}>
      <h1 style={{ marginBottom: "8px" }}>Mock Resume Ingestion</h1>
      <p style={{ marginTop: 0, color: "var(--text-secondary)" }}>
        Upload a resume, then trigger public/linkedin/naukri ingestion.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: "14px" }}>
        <label>
          Source
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as IngestSource)}
            style={{ display: "block", width: "100%", marginTop: "6px" }}
          >
            <option value="public_apply">public_apply</option>
            <option value="linkedin">linkedin</option>
            <option value="naukri">naukri</option>
          </select>
        </label>

        {source === "public_apply" && (
          <label>
            Job slug (requisition item id)
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="e.g. 42"
              style={{ display: "block", width: "100%", marginTop: "6px" }}
            />
            <span style={{ display: "block", fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
              Use the numeric id of a row in `requisition_items`, or `item-42`, or configure
              PUBLIC_APPLY_DEFAULT_REQUISITION_ITEM_ID.
            </span>
          </label>
        )}

        <label>
          External ID
          <input
            value={externalId}
            onChange={(e) => setExternalId(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: "6px" }}
          />
        </label>

        <label>
          Candidate Name
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: "6px" }}
          />
        </label>

        <label>
          Candidate Email
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: "6px" }}
          />
        </label>

        <label>
          Candidate Phone
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: "6px" }}
          />
        </label>

        <label>
          Resume File
          <input
            type="file"
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            style={{ display: "block", width: "100%", marginTop: "6px" }}
          />
        </label>
        <button
          type="button"
          className="action-button"
          onClick={handleUploadResume}
          disabled={uploading || !selectedFile}
          style={{ justifySelf: "start" }}
        >
          {uploading ? "Uploading..." : "Upload Resume"}
        </button>

        <label>
          Resume URL / Path (auto-filled after upload)
          <input
            value={resumeUrl}
            onChange={(e) => setResumeUrl(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: "6px" }}
          />
        </label>

        <label>
          Meta Note
          <input
            value={metaNote}
            onChange={(e) => setMetaNote(e.target.value)}
            style={{ display: "block", width: "100%", marginTop: "6px" }}
          />
        </label>

        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
          Endpoint: <code>{endpoint}</code>
        </div>

        <button type="submit" className="action-button primary" disabled={submitting}>
          {submitting ? "Submitting..." : "Submit Ingestion Event"}
        </button>
      </form>

      {error && (
        <div
          style={{
            marginTop: "16px",
            color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.35)",
            borderRadius: "8px",
            padding: "10px 12px",
            whiteSpace: "pre-wrap",
          }}
        >
          {error}
        </div>
      )}

      {responseText && (
        <pre
          style={{
            marginTop: "16px",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "8px",
            padding: "12px",
            overflowX: "auto",
          }}
        >
          {responseText}
        </pre>
      )}
    </div>
  );
}
