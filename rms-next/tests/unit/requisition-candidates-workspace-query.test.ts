import test from "node:test";
import assert from "node:assert/strict";

import { HttpError } from "@/lib/http/http-error";
import { parseRequisitionCandidatesWorkspaceQuery } from "@/lib/validators/requisition-candidates-workspace";

test("parseRequisitionCandidatesWorkspaceQuery defaults page and page_size", () => {
  const q = parseRequisitionCandidatesWorkspaceQuery(
    new URL("http://localhost/api?requisition=1"),
  );
  assert.equal(q.page, 1);
  assert.equal(q.page_size, 20);
  assert.equal(q.interview_status, "any");
});

test("parseRequisitionCandidatesWorkspaceQuery caps page_size", () => {
  const q = parseRequisitionCandidatesWorkspaceQuery(
    new URL("http://localhost/api?page_size=999"),
  );
  assert.equal(q.page_size, 50);
});

test("parseRequisitionCandidatesWorkspaceQuery rejects invalid interview_status", () => {
  assert.throws(
    () =>
      parseRequisitionCandidatesWorkspaceQuery(
        new URL("http://localhost/api?interview_status=nope"),
      ),
    (e: unknown) => e instanceof HttpError && e.status === 422,
  );
});

test("parseRequisitionCandidatesWorkspaceQuery rejects invalid applied_from", () => {
  assert.throws(
    () =>
      parseRequisitionCandidatesWorkspaceQuery(
        new URL("http://localhost/api?applied_from=not-a-date"),
      ),
    (e: unknown) => e instanceof HttpError && e.status === 422,
  );
});
