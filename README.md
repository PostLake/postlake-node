# PostLake

**The social media API for AI agents.** One integration publishes, schedules and measures across X, LinkedIn, Instagram, TikTok, Facebook, Threads, Bluesky, YouTube and Pinterest.

Typed, tiny and dependency-free. Runs anywhere there is a global `fetch`: Node 20+, Cloudflare Workers, Deno, Bun, the browser.

```bash
npm install postlake
```

## Publish to several networks in one call

```ts
import { PostLake } from "postlake";

const pl = new PostLake({ apiKey: process.env.POSTLAKE_API_KEY });

const post = await pl.posts.create({
  text: "the new release is here",
  accounts: ["acc_2f1a", "acc_9b7c"],
});

console.log(post.state, post.targets);
```

One response shape covers every network. `post.targets` has a row per destination, each with its own state, permalink and error, so partial success is a thing you can read rather than a thing you have to infer.

## Built for agents, not just for scripts

This is the part that matters if something autonomous is holding the key.

**Retries cannot double-post.** Pass an idempotency key and a retried request returns the original result instead of publishing twice.

```ts
await pl.posts.create(
  { text: "hi", accounts: ["acc_1"] },
  { idempotencyKey: crypto.randomUUID() },
);
```

**Errors say how to fix themselves.** Every failure carries a machine-readable `code`, the `param` at fault, a plain `fix` and a `docs` link. An agent can act on that without a human reading a stack trace.

```ts
import { PostLakeError } from "postlake";

try {
  await pl.posts.create({ text: longCaption, accounts: ["acc_bluesky"] });
} catch (e) {
  if (e instanceof PostLakeError) {
    console.error(e.code);      // "text_too_long"
    console.error(e.fix);       // "Bluesky allows 300 characters. This is 412."
    console.error(e.docs);      // https://docs.postlake.dev/errors#text_too_long
    console.error(e.requestId); // quote this to support
    if (e.retryable) { /* back off and retry */ }
  }
}
```

**Bad posts are refused before they cost anything.** Every network's rules are checked up front, so a caption over the limit or an image outside the pixel bounds fails immediately rather than several minutes into an async publish.

```ts
const check = await pl.posts.validate({ text, accounts, media });
if (!check.ok) console.log(check.issues); // per-network, with the fix for each
```

**A person can stay in the loop.** Save the post instead of sending it, let someone read it, and publish it once they have. The draft costs nothing and reaches no network until it is published, and a publish where nothing lands leaves the draft intact rather than eating it.

```ts
const draft = await pl.posts.draft({ text: "Ship notes for Friday", accounts: ["acc_1"] });
// ...someone reviews it, in the dashboard or wherever you surface it...
await pl.posts.publish(draft.id);
```

**Async networks can sit in `processing`.** `get` reads what we already know. `refresh` asks the network now, so a YouTube upload can move to `published` without waiting for the background path.

```ts
const latest = await pl.posts.refresh(post.id);
```

## What you can call

`import { PostLake } from "postlake"` is the whole client. `PostLake` is the class. The package name is `postlake`.

| Resource | Methods |
|---|---|
| `pl.posts` | `create`, `draft`, `publish`, `validate`, `get`, `refresh`, `list`, `listAll`, `update`, `cancel`, `analytics` |
| `pl.socialAccounts` | `list`, `listAll`, `get`, `connect`, `targets`, `publishInfo`, `products`, `posts`, `tagged`, `allowance`, `events`, `createEvent`, `adAccounts`, `brandedPartners`, `subscribeWebhook`, `webhookSubscriptions`, `moveToProfile` |
| `pl.analytics` | `get` |
| `pl.media` | `upload`, `prepareBatch` |
| `pl.webhooks` | `create`, `list`, `delete`, `verify` |
| `pl.inbox` | `notifications`, `markNotificationsSeen`, `comments`, `reply`, `hideComment`, `deleteComment`, `engage`, `followers`, `following`, `conversations`, `openConversation`, `markConversationRead`, `messages`, `sendMessage` |
| `pl.discover` | `posts`, `postsAll`, `profile`, `profilePosts`, `creators`, `places` |
| `pl.platforms` | `list`, `get` |
| `pl.profiles` | `list`, `create`, `rename`, `delete` |
| `pl.credentials` | `list`, `set`, `delete` |
| `pl` | `me`, `updateMe`, `limits`, `connectLink`, `appLink`, `emailPreferences`, `updateEmailPreferences`, `audit`, `export` |

`list` returns one page; `listAll` is an async iterator over everything:

```ts
for await (const post of pl.posts.listAll()) {
  console.log(post.id, post.state);
}
```

### Ask the network, don't hard-code it

Limits move, and a network can have more than one door. `pl.platforms.get()`
answers both, live:

```ts
const ig = await pl.platforms.get("instagram");
ig.maxChars;        // 2200
ig.discovers?.posts; // can this connection search hashtags?

for (const way of ig.variants ?? []) {
  console.log(way.label, way.summary, way.requires);
}
```

What a connection can do depends on how it was made, not only on which network
it is. An Instagram account connected through Facebook can search hashtags and
read insights. The same account connected directly cannot. `variants` is where
that is written down, and it is the same field the connect screen is built from.

### Getting an account connected

Every network makes a person approve access on its own screen, and no API can do
that for them. So an agent mints a link and hands it over:

```ts
const { url } = await pl.connectLink({ profile: "my-brand" });
// Give `url` to whoever owns the accounts. It expires in 30 minutes.
```

## Look before you speak

Publishing is half of it. An agent that can only broadcast will happily post
something the room said an hour ago. So the same client reads the network.

```ts
// Is anyone already saying this?
const found = await pl.discover.posts({ q: "social media api", sort: "recent" });

// Who is this person, before we reply to them?
const them = await pl.discover.profile("someone", { account: "acc_1" });
```

## Read your own corner, and answer it

```ts
const inbox = await pl.inbox.notifications();
for (const n of inbox.items) {
  if (n.type === "mention") {
    await pl.inbox.reply(n.id, { account: n.account, text: "thanks for the tag" });
  }
}

// Moderation is the other half of replying.
await pl.inbox.hideComment("comment_id", { account: "acc_1" });
await pl.inbox.deleteComment("comment_id", { account: "acc_1" });
```

### Hidden replies

`hideComment` is the other half of replying. Reading is the other half of that:
every comment carries `hidden`, so an agent can tell what it has already dealt
with.

```ts
const page = await pl.inbox.comments("post_123", { nested: true });
for (const c of page.items) {
  if (c.hidden === null) continue;   // this network does not say. Not the same as false.
  if (!c.hidden && looksAbusive(c.text)) {
    await pl.inbox.hideComment(c.id, { account: "acc_1" });
  }
}
```

`nested: true` reads replies to replies as well. Networks that cannot go deeper
return the top level rather than refusing, so it is always safe to ask.

### Always read `problems`

Every cross-network read returns `problems` beside `items`. It names the
networks that could not be read, and it is the point of these calls rather than
decoration: without it, an empty `items` from a two-network read is
indistinguishable from a read where one network was never asked.

```ts
const page = await pl.inbox.notifications();
if (page.problems.length) {
  // Do NOT report "nothing new" here. Something went unread.
  console.warn(page.problems.map((p) => `${p.platform}: ${p.reason}`));
}
```

The same applies to `hideComment`: if it throws, the reply is **still visible**.
Treat the error as "still there", never as "probably fine".

### Direct messages

Facebook, Instagram, X, and Bluesky share the same conversation methods:

```ts
const conversations = await pl.inbox.conversations();
const thread = conversations.items[0];
const messages = await pl.inbox.messages(thread.id, { account: thread.account });

await pl.inbox.sendMessage(thread.id, {
  account: thread.account,
  text: "Thanks for getting in touch.",
});
await pl.inbox.markConversationRead(thread.id, { account: thread.account });
```

Always inspect `problems` before reporting that the inbox is empty. A message
may have an optional `content` object for an attachment, shared media, or an
unsupported provider payload even when `text` is empty.

Facebook and Instagram can produce `message.received` webhooks. Poll
`pl.inbox.conversations()` for X and Bluesky. Sending a DM on X costs 6
credits; sending on the other supported inbox networks does not spend credits.

## Cross-platform analytics in one shape

Impressions, reach, engagement, CTR, saves and follower growth, normalised across networks so they can actually be compared.

```ts
const stats = await pl.analytics.get({ period: "30d" });
console.log(stats.totals, stats.byPlatform);
```

## Scheduling

```ts
await pl.posts.create({
  text: "weekly recap",
  accounts: ["acc_2f1a"],
  scheduledAt: "2026-09-01T09:00:00Z", // ISO 8601, UTC
});
```

## The networks, and what each one will take

Every network keeps its own rules, and they are further apart than people expect.

| Network | Caption limit | A post needs | Images |
|---|---|---|---|
| X | 280 | nothing, text is fine | 4 |
| Bluesky | 300 | nothing, text is fine | 4 |
| Threads | 500 | nothing, text is fine | 20 |
| Pinterest | 500 | an image or video | 5 |
| Instagram | 2,200 | an image or video | 10 |
| TikTok | 2,200 | an image or video | 35 |
| LinkedIn | 3,000 | nothing, text is fine | 20 |
| YouTube | 5,000 | a video | none |
| Facebook | 63,206 | nothing, text is fine | 10 |

The live version of this table, including formats, weight caps and pixel bounds, is at [postlake.dev/tools](https://postlake.dev/tools/) and machine-readable at [postlake.dev/capabilities.json](https://postlake.dev/capabilities.json). The SDK validates against the same source.

## Configuration

```ts
new PostLake({
  apiKey: "sk_live_…",                 // create one in the dashboard under API Keys
  baseUrl: "https://api.postlake.dev", // override for tests
  fetch: customFetch,                  // inject a fetch implementation
});
```

## Prefer not to write code at all

PostLake runs a hosted MCP server, so Claude, Cursor, ChatGPT or any MCP-capable agent can post, schedule and read analytics directly. Point it at `https://api.postlake.dev/mcp` and approve once over OAuth. See [postlake.dev/mcp](https://postlake.dev/mcp).

For coding agents there are ready-made skills:

```bash
npx skills add postlake/postlake-mcp --all
```

## Try for free

[Get started](https://postlake.dev) and create an API key. No card required.

## Links

- Documentation: https://docs.postlake.dev
- Quickstart: https://docs.postlake.dev/quickstart
- Error reference: https://docs.postlake.dev/errors
- Free tools, no signup: https://postlake.dev/tools/
- For LLMs: https://postlake.dev/llms.txt

## License

MIT
