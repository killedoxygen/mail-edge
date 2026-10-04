import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { collectBoundedJson } from "../src/request-body.js";

describe("bounded JSON request cancellation", () => {
  it.each([false, true])(
    "closes a stalled stream when cancelled (initially aborted=%s)",
    async (initiallyAborted) => {
      const body = new Readable({
        read() {
          // The peer has stopped sending bytes without closing the connection.
        },
      });
      const controller = new AbortController();
      if (initiallyAborted) controller.abort();
      const result = collectBoundedJson(body, null, 1024, controller.signal);
      if (!initiallyAborted) controller.abort();
      try {
        expect(await result).toMatchObject({ ok: false, error: { code: "HOST_UNAVAILABLE" } });
        expect(body.destroyed).toBe(true);
      } finally {
        body.destroy();
      }
    },
    500,
  );
});
