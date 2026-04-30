import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
  ApplicationRecord,
  ApplicationsAtsBucketsResponse,
  RequisitionItemRankingResponse,
} from "@/lib/api/candidateApi";
import {
  collectBoardCandidateIds,
  isAiStillPending,
} from "@/lib/ta/ats-board-helpers";

const stubApp = (partial: { candidate_id: number; application_id: number }) =>
  ({
    ...partial,
    requisition_id: 1,
    requisition_item_id: 1,
    current_stage: "Sourced",
    created_at: null,
    updated_at: null,
    source: "direct",
    candidate: {
      candidate_id: partial.candidate_id,
      full_name: "Test",
      email: "t@test.com",
      phone: null,
      resume_path: null,
    },
    created_by: null,
    stage_history: [],
  }) as ApplicationRecord;

describe("ats-board-helpers", () => {
  it("collectBoardCandidateIds gathers all bucket candidate ids", () => {
    const buckets: ApplicationsAtsBucketsResponse = {
      requisition_item_id: 1,
      BEST: [stubApp({ candidate_id: 1, application_id: 10 })],
      VERY_GOOD: [stubApp({ candidate_id: 2, application_id: 11 })],
      GOOD: [],
      AVERAGE: [],
      NOT_SUITABLE: [],
      UNRANKED: [stubApp({ candidate_id: 3, application_id: 12 })],
      meta: {
        limit_per_bucket: 80,
        truncated: {},
        total: 3,
        ranking_version_id: 1,
      },
    };
    const ids = collectBoardCandidateIds(buckets);
    assert.deepEqual(Array.from(ids).sort((a, b) => a - b), [1, 2, 3]);
  });

  it("isAiStillPending is false when ranking is complete for all board ids", () => {
    const ids = new Set([1, 2]);
    const ranking: RequisitionItemRankingResponse = {
      ranking_engine: "ai_only",
      requisition_item_id: 1,
      req_id: 1,
      ranking_version: "v1",
      generated_at: new Date().toISOString(),
      total_candidates: 2,
      ranked_candidates: [
        {
          candidate_id: 1,
          requisition_item_id: 1,
          full_name: "A",
          email: "a@x.com",
          current_stage: "Sourced",
          score: { final_score: 80, ai_status: "OK" },
          explain: { reasons: [] },
        },
        {
          candidate_id: 2,
          requisition_item_id: 1,
          full_name: "B",
          email: "b@x.com",
          current_stage: "Sourced",
          score: { final_score: 70, ai_status: "OK" },
          explain: { reasons: [] },
        },
      ],
    };
    assert.equal(isAiStillPending(ids, ranking), false);
  });

  it("isAiStillPending is true when a board id is missing or not OK", () => {
    const ids = new Set([1, 2]);
    const ranking: RequisitionItemRankingResponse = {
      ranking_engine: "ai_only",
      requisition_item_id: 1,
      req_id: 1,
      ranking_version: "v1",
      generated_at: new Date().toISOString(),
      total_candidates: 1,
      ranked_candidates: [
        {
          candidate_id: 1,
          requisition_item_id: 1,
          full_name: "A",
          email: "a@x.com",
          current_stage: "Sourced",
          score: { final_score: 80, ai_status: "OK" },
          explain: { reasons: [] },
        },
      ],
    };
    assert.equal(isAiStillPending(ids, ranking), true);
  });
});
