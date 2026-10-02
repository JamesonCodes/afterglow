import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchStylesheet } from "../src/stylesheets.ts";
test("stylesheet broker accepts CSS without credentials and rejects other content", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    assert.equal(options?.credentials, "omit");
    assert.ok(options?.signal instanceof AbortSignal);
    return new Response("body{color:red}", {
      headers: { "content-type": "text/css; charset=utf-8" },
    });
  });
  assert.equal(
    await fetchStylesheet("https://cdn.example/style.css"),
    "body{color:red}",
  );
  await assert.rejects(fetchStylesheet("file:///etc/passwd"), /Unsupported/);
  await assert.rejects(fetchStylesheet("data:text/css,body{}"), /Unsupported/);
  assert.equal(calls, 1);
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("private response", {
        headers: { "content-type": "application/json" },
      }),
  );
  await assert.rejects(
    fetchStylesheet("https://example.com/data"),
    /successful CSS/,
  );
});
test("stylesheet broker cancels oversized streamed bodies with no content-length", async (t) => {
  let canceled = false,
    reads = 0;
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            reads++;
            controller.enqueue(new Uint8Array(1_000_000));
          },
          cancel() {
            canceled = true;
          },
        }),
        { headers: { "content-type": "text/css" } },
      ),
  );
  await assert.rejects(
    fetchStylesheet("https://example.com/large.css"),
    /too large/,
  );
  assert.equal(canceled, true);
  assert.ok(
    reads <= 5,
    "Stops after the limit instead of buffering the whole response",
  );
});
test("stylesheet broker rejects declared oversized bodies and HTTP errors", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("", {
        headers: { "content-type": "text/css", "content-length": "3000001" },
      }),
  );
  await assert.rejects(
    fetchStylesheet("https://example.com/style.css"),
    /too large/,
  );
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response("", {
        status: 404,
        headers: { "content-type": "text/css" },
      }),
  );
  await assert.rejects(
    fetchStylesheet("https://example.com/style.css"),
    /successful CSS/,
  );
});
