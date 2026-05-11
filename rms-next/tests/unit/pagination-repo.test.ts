import assert from "node:assert/strict";
import test from "node:test";

import { paginate, paginateConcurrent } from "@/lib/pagination/repo";

test("paginate skips the page query when total is 0", async () => {
  let pageCalls = 0;
  const r = await paginate({
    page: 5,
    limit: 25,
    count: async () => 0,
    fetchPage: async () => {
      pageCalls++;
      return [];
    },
  });
  assert.equal(pageCalls, 0);
  assert.equal(r.total, 0);
  assert.equal(r.totalPages, 0);
  assert.equal(r.page, 1);
  assert.equal(r.offset, 0);
  assert.deepEqual(r.items, []);
});

test("paginate clamps page above totalPages and uses corrected offset", async () => {
  let lastOffset = -1;
  const r = await paginate({
    page: 99,
    limit: 25,
    count: async () => 60,
    fetchPage: async ({ offset }) => {
      lastOffset = offset;
      return Array.from({ length: 10 }, (_, i) => ({ id: offset + i }));
    },
  });
  assert.equal(r.totalPages, 3);
  assert.equal(r.page, 3);
  assert.equal(lastOffset, 50);
  assert.equal(r.offset, 50);
});

test("paginate returns rows on the requested page", async () => {
  const r = await paginate({
    page: 2,
    limit: 25,
    count: async () => 187,
    fetchPage: async ({ limit, offset }) =>
      Array.from({ length: limit }, (_, i) => ({ id: offset + i + 1 })),
  });
  assert.equal(r.totalPages, 8);
  assert.equal(r.page, 2);
  assert.equal(r.items.length, 25);
  assert.equal(r.items[0]!.id, 26);
});

test("paginateConcurrent issues a single page query when speculative offset matches", async () => {
  let pageCalls = 0;
  const r = await paginateConcurrent({
    page: 2,
    limit: 25,
    count: async () => 60,
    fetchPage: async ({ limit, offset }) => {
      pageCalls++;
      assert.equal(offset, 25);
      return Array.from({ length: limit }, (_, i) => ({ id: offset + i + 1 }));
    },
  });
  assert.equal(pageCalls, 1);
  assert.equal(r.page, 2);
  assert.equal(r.totalPages, 3);
  assert.equal(r.items.length, 25);
});

test("paginateConcurrent re-queries when speculative offset is wrong", async () => {
  let pageCalls = 0;
  const r = await paginateConcurrent({
    page: 99,
    limit: 25,
    count: async () => 60,
    fetchPage: async ({ offset }) => {
      pageCalls++;
      return Array.from({ length: 10 }, (_, i) => ({ id: offset + i + 1 }));
    },
  });
  assert.equal(pageCalls, 2);
  assert.equal(r.page, 3);
  assert.equal(r.offset, 50);
});
