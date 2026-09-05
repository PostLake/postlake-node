// Import the BUILT package the way a consumer does.
//
// This exists because postlake@1.0.0 shipped broken: tsconfig uses
// moduleResolution "Bundler", which permits extensionless relative imports in
// source, but tsc emits them verbatim and Node's ESM loader rejects them. The
// unit tests run against src/ through vitest, which resolves like a bundler, so
// every check was green and the published tarball could not be imported at all.
//
// Testing the artefact, not the source, is the only thing that catches that.
//
// Both entry points are checked. The package ships ESM and CommonJS, and a
// build that satisfies one while breaking the other is exactly the kind of
// failure a single-path check waves through.
import { createRequire } from "node:module";
import { PostLake, PostLakeError, WEBHOOK_SIGNATURE_HEADER } from "./dist/index.js";

const fail = (m) => { console.error("SMOKE FAIL:", m); process.exit(1); };

const pl = new PostLake({ apiKey: "sk_test" });
for (const r of ["posts", "socialAccounts", "analytics", "media", "webhooks", "inbox", "discover"]) {
  if (typeof pl[r] !== "object") fail(`missing resource: ${r}`);
}
for (const m of ["create", "validate", "get", "list", "listAll", "update", "cancel", "analytics"]) {
  if (typeof pl.posts[m] !== "function") fail(`missing posts.${m}`);
}

// Reading and discovery. The published package once shipped importable-but-
// broken, so every group is checked method by method against the BUILT output
// rather than trusted because the source compiled.
for (const m of [
  "notifications", "markNotificationsSeen", "comments", "reply", "hideComment",
  "engage", "followers", "following", "conversations", "openConversation",
  "messages", "sendMessage",
]) {
  if (typeof pl.inbox[m] !== "function") fail(`missing inbox.${m}`);
}
for (const m of ["posts", "postsAll", "profile", "profilePosts", "places"]) {
  if (typeof pl.discover[m] !== "function") fail(`missing discover.${m}`);
}
if (typeof pl.me !== "function") fail("missing me()");
if (typeof PostLakeError !== "function") fail("PostLakeError not exported");
if (WEBHOOK_SIGNATURE_HEADER !== "postlake-signature") fail("webhook header wrong");


// ── the CommonJS entry point ───────────────────────────────────────────────
// `require("postlake")` used to fail with ERR_PACKAGE_PATH_NOT_EXPORTED, which
// names no cause and suggests nothing to try.
const require_ = createRequire(import.meta.url);
const cjs = require_("./dist/cjs/index.js");
if (typeof cjs.PostLake !== "function") fail("cjs: PostLake is not exported");
if (typeof cjs.PostLakeError !== "function") fail("cjs: PostLakeError is not exported");
if (!cjs.WEBHOOK_SIGNATURE_HEADER) fail("cjs: WEBHOOK_SIGNATURE_HEADER is not exported");
const cjsClient = new cjs.PostLake({ apiKey: "sk_test" });
for (const r of ["posts", "socialAccounts", "analytics", "media", "webhooks", "inbox", "discover"]) {
  if (typeof cjsClient[r] !== "object") fail(`cjs: missing resource ${r}`);
}
// The two builds must expose the SAME surface. Drift between them is worse than
// having only one, because it works in a test and fails in someone's app.
const surface = (c) => Object.keys(c).sort().join(",");
if (surface(cjsClient) !== surface(new PostLake({ apiKey: "sk_test" }))) {
  fail("cjs and esm expose different surfaces");
}

// dist/cjs must declare itself CommonJS, or Node reads it as ESM (the package
// root says "type": "module") and every require fails at load.
if (require_("./dist/cjs/package.json").type !== "commonjs") {
  fail("dist/cjs/package.json must say type: commonjs");
}

console.log("smoke ok: esm and cjs entry points both import and match");
