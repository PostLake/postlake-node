// PostLake — the official TypeScript SDK.
//
//   import { PostLake } from "postlake";
//   const pl = new PostLake({ apiKey: "sk_live_…" });
//   await pl.posts.create({ text: "hello", accounts: ["acc_1"] });
//
// Thin, typed wrapper over the REST API: it handles auth, JSON, the error
// envelope, idempotency keys and cursor pagination so callers don't. Runs
// anywhere with a global fetch (Node 18+, Cloudflare Workers, the browser).

import type {
  Account,
  AdAccount,
  BrandedContentPartner,
  AnalyticsResponse,
  AuditEvent,
  Comment,
  ConnectedAccount,
  TargetOption,
  Conversation,
  Credential,
  CreatePostInput,
  DiscoveredPost,
  EmailPreferences,
  EngageAction,
  Limits,
  MarketplaceCreator,
  MediaAsset,
  Message,
  MultiPage,
  NormalisedError,
  Notification,
  Page,
  Place,
  Platform,
  PlatformCapabilities,
  Post,
  PostAnalytics,
  PostSearch,
  Profile,
  PublicProfile,
  PublishInfo,
  ReadProblem,
  ShopProduct,
  SignedLink,
  SocialActor,
  ValidatePostResult,
  WebhookEndpoint,
} from "./types.js";

export * from "./types.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PostLakeOptions {
  /** Your secret API key (sk_live_…). Create one in the dashboard → API Keys. */
  apiKey: string;
  /** Override the API base URL (e.g. for self-host or tests). */
  baseUrl?: string;
  /** Inject a fetch implementation (defaults to the global fetch). */
  fetch?: FetchLike;
}

/** Thrown for any non-2xx response, carrying the normalised error + requestId. */
export class PostLakeError extends Error {
  readonly type: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly platform?: Platform;
  readonly requestId?: string;
  /** A stable, granular handle to branch on, e.g. "text_too_long". */
  readonly code?: string;
  /** The next action, in plain words, safe to show a person. */
  readonly fix?: string;
  /** Where the rule is written down, so it is learned once. */
  readonly docs?: string;
  /** The request field at fault, so a form can mark the right input. */
  readonly param?: string;
  constructor(err: NormalisedError, status: number, requestId?: string) {
    super(err.message);
    this.name = "PostLakeError";
    this.type = err.type;
    this.status = status;
    this.retryable = err.retryable;
    this.platform = err.platform;
    this.requestId = requestId;
    this.code = err.code;
    this.fix = err.fix;
    this.docs = err.docs;
    this.param = err.param;
  }
}

const DEFAULT_BASE = "https://api.postlake.dev";

interface RequestOpts {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Raw body + content-type (media upload); skips JSON encoding. */
  raw?: { bytes: ArrayBuffer | Uint8Array; contentType: string };
  idempotencyKey?: string;
}

export class PostLake {
  readonly posts: Posts;
  readonly socialAccounts: SocialAccounts;
  readonly analytics: Analytics;
  readonly media: Media;
  readonly webhooks: Webhooks;
  /** Reading your own corner of each network: notifications, comments, DMs,
   *  followers, and acting on what you find. */
  readonly inbox: Inbox;
  /** Reading the PUBLIC network: search, look someone up, find a place. This is
   *  what lets an agent look before it speaks rather than only broadcasting. */
  readonly discover: Discover;
  /** What each network supports right now: limits, media rules, valid options,
   *  and where a network has more than one way in, the ways. Read this instead
   *  of hard-coding a limit that the network will change without telling you. */
  readonly platforms: Platforms;
  /** Named groups of channels you can post to by name. */
  readonly profiles: Profiles;
  /** Your own platform app keys (BYOK / white-label). */
  readonly credentials: Credentials;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: PostLakeOptions) {
    if (!opts?.apiKey) throw new Error("PostLake: apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const f = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!f) throw new Error("PostLake: no fetch available, pass `fetch` in options");
    this.fetchImpl = f;

    this.posts = new Posts(this);
    this.socialAccounts = new SocialAccounts(this);
    this.analytics = new Analytics(this);
    this.media = new Media(this);
    this.webhooks = new Webhooks(this);
    this.inbox = new Inbox(this);
    this.discover = new Discover(this);
    this.platforms = new Platforms(this);
    this.profiles = new Profiles(this);
    this.credentials = new Credentials(this);
  }

  /** The authenticated account (id, email, supported platforms, optional timezone). */
  me(): Promise<Account> {
    return this.request<Account>("GET", "/v1/me");
  }
  /** Set or clear the account default timezone. */
  updateMe(patch: { timezone?: string | null }): Promise<Account> {
    return this.request<Account>("PATCH", "/v1/me", { body: patch });
  }

  /** What this key may do right now: credits left, the plan's allowance, and
   *  any agent guardrails. Read it before planning a batch rather than finding
   *  the limit by being refused halfway through one. */
  limits(): Promise<Limits> {
    return this.request<Limits>("GET", "/v1/me/limits");
  }

  /** Mint a short-lived link to the hosted connect page and hand it to whoever
   *  owns the accounts. Every network makes a PERSON approve access on its own
   *  screen, so this is how an agent gets a channel connected without ever
   *  handling someone's credentials. */
  connectLink(input: { profile?: string } = {}): Promise<SignedLink> {
    return this.request<SignedLink>("POST", "/v1/connect-link", { body: input });
  }

  /** Mint a longer-lived link to the full dashboard. */
  appLink(): Promise<SignedLink> {
    return this.request<SignedLink>("POST", "/v1/app-link");
  }

  /** Read the account's email preferences, or change the digest frequency. */
  emailPreferences(): Promise<EmailPreferences> {
    return this.request<EmailPreferences>("GET", "/v1/email-preferences");
  }
  updateEmailPreferences(patch: { digestFrequency: "off" | "weekly" | "daily" }): Promise<EmailPreferences> {
    return this.request<EmailPreferences>("PATCH", "/v1/email-preferences", { body: patch });
  }

  /** The security log: sign-ins, key creation, connections, deletions. */
  audit(): Promise<AuditEvent[]> {
    return this.request<{ events: AuditEvent[] }>("GET", "/v1/audit").then((r) => r.events);
  }

  /** Everything this account holds, in one JSON document. */
  export(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", "/v1/account/export");
  }

  /** @internal */
  async request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = { authorization: `Bearer ${this.apiKey}` };
    if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;

    let body: BodyInit | undefined;
    if (opts.raw) {
      headers["content-type"] = opts.raw.contentType;
      body = opts.raw.bytes as BodyInit;
    } else if (opts.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    const res = await this.fetchImpl(url.toString(), { method, headers, body });
    const requestId = res.headers.get("x-request-id") ?? undefined;

    if (!res.ok) {
      let err: NormalisedError = { type: "internal", message: res.statusText || "Request failed", retryable: false };
      try {
        const j = (await res.json()) as { error?: NormalisedError };
        if (j?.error) err = j.error;
      } catch {
        /* non-JSON error body */
      }
      throw new PostLakeError(err, res.status, requestId);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}

class Posts {
  constructor(private readonly c: PostLake) {}

  /** Publish now (or schedule with `scheduledAt`). Pass `idempotencyKey` for safe retries. */
  create(input: CreatePostInput, opts: { idempotencyKey?: string } = {}): Promise<Post> {
    return this.c.request<Post>("POST", "/v1/posts", { body: input, idempotencyKey: opts.idempotencyKey });
  }

  /** Save without sending. The post comes back in state `draft`: nothing is
   *  charged, no network is contacted, and it may be incomplete. This is the
   *  approve-before-publish shape, so it is what you want when a person should
   *  see the post before the world does. Publish it later with `publish()`. */
  draft(input: CreatePostInput): Promise<Post> {
    return this.c.request<Post>("POST", "/v1/posts", { body: { ...input, draft: true } });
  }

  /** Send a saved draft: now, or at `scheduledAt`. The draft's own text, media,
   *  overrides and destinations are used, so none of it is resent.
   *
   *  Omitting `scheduledAt` keeps whatever time the draft was carrying; pass
   *  `null` to clear it and publish immediately.
   *
   *  The draft is consumed only if something actually published. If nothing did,
   *  it is left exactly where it was, so a failed attempt never costs you the
   *  work. If some networks took it and others did not, the draft IS consumed:
   *  publishing again would double-post where it worked. */
  publish(
    id: string,
    options: {
      scheduledAt?: string | null;
      timezone?: string;
      accounts?: string[];
      profile?: string;
      platforms?: Platform[];
    } = {},
  ): Promise<Post> {
    return this.c.request<Post>("POST", `/v1/posts/${encodeURIComponent(id)}/publish`, { body: options });
  }
  get(id: string): Promise<Post> {
    return this.c.request<Post>("GET", `/v1/posts/${encodeURIComponent(id)}`);
  }

  /** Ask an async network for this post's state now.
   *
   *  After YouTube (and anything else that accepts a post as `processing`)
   *  this promotes a confirmed post to `published` immediately, instead of
   *  waiting for the background recovery path. Failures and credit refunds
   *  still settle there. */
  refresh(id: string): Promise<Post> {
    return this.c.request<Post>("POST", `/v1/posts/${encodeURIComponent(id)}/refresh`);
  }

  /** Dry run. Runs exactly the checks a real publish runs (account resolution,
   *  media resolution, every network's capability rules) without touching any
   *  platform and without spending a credit. Cheap to call before `create`. */
  validate(input: CreatePostInput): Promise<ValidatePostResult> {
    return this.c.request<ValidatePostResult>("POST", "/v1/posts/validate", { body: input });
  }
  /** One page of posts, most recent first. */
  async list(params: { limit?: number; cursor?: string; state?: string; account?: string; profile?: string } = {}): Promise<Page<Post>> {
    const r = await this.c.request<{ posts: Post[]; nextCursor: string | null }>("GET", "/v1/posts", { query: params });
    return { data: r.posts, nextCursor: r.nextCursor };
  }
  /** Auto-paginating async iterator over every post. */
  async *listAll(params: { limit?: number; state?: string; account?: string; profile?: string } = {}): AsyncGenerator<Post> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ ...params, cursor });
      for (const p of page.data) yield p;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }
  /** Edit a post that has not gone out: a scheduled one, or a draft.
   *
   *  A scheduled post keeps its destinations and must stay in the future. A
   *  draft is laxer in every direction, because being unfinished is what a
   *  draft is for: `accounts`, `thread` and `firstComment` are editable too,
   *  and nothing is checked until it publishes. */
  update(
    id: string,
    patch: Partial<Pick<CreatePostInput, "text" | "media" | "scheduledAt" | "timezone" | "platformOptions">> & {
      textOverrides?: Partial<Record<Platform, string>>;
      mediaAlt?: string[];
      mediaOverrides?: Partial<Record<Platform, string[]>>;
      mediaAltOverrides?: Partial<Record<Platform, string[]>>;
      /** Drafts only. Replaces the draft's destinations. */
      accounts?: string[];
      /** Drafts only. An empty array removes the thread. */
      thread?: string[];
      /** Drafts only. An empty string removes the first comment. */
      firstComment?: string;
      /** Drafts only. */
      firstCommentOverrides?: Partial<Record<Platform, string>>;
    },
  ): Promise<Post> {
    return this.c.request<Post>("PATCH", `/v1/posts/${encodeURIComponent(id)}`, { body: patch });
  }
  /** Cancel a scheduled post, or discard a draft. Both are free. */
  cancel(id: string): Promise<{ id: string; cancelled?: boolean; deleted?: boolean }> {
    return this.c.request("DELETE", `/v1/posts/${encodeURIComponent(id)}`);
  }
  /** Per-post normalised analytics (per-target + totals). */
  analytics(id: string): Promise<PostAnalytics> {
    return this.c.request<PostAnalytics>("GET", `/v1/posts/${encodeURIComponent(id)}/analytics`);
  }
}

class SocialAccounts {
  constructor(private readonly c: PostLake) {}

  async list(params: { limit?: number; cursor?: string } = {}): Promise<Page<ConnectedAccount>> {
    const r = await this.c.request<{ accounts: ConnectedAccount[]; nextCursor: string | null }>(
      "GET",
      "/v1/social-accounts",
      { query: params },
    );
    return { data: r.accounts, nextCursor: r.nextCursor };
  }
  async *listAll(): AsyncGenerator<ConnectedAccount> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ cursor });
      for (const a of page.data) yield a;
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
  }
  connect(input: { platform: Platform; profile?: string } & Record<string, unknown>): Promise<ConnectedAccount> {
    return this.c.request<ConnectedAccount>("POST", "/v1/social-accounts/connect", { body: input });
  }
  /** Live creator-level constraints, e.g. which privacy levels a TikTok creator
   *  may choose right now. These change on the network's side, so read them
   *  before offering someone a choice rather than caching one. */
  publishInfo(id: string): Promise<PublishInfo> {
    return this.c.request<PublishInfo>("GET", `/v1/social-accounts/${encodeURIComponent(id)}/publish-info`);
  }

  /** The shoppable products on this channel, so you can find the ids that the
   *  `productIds` post option takes. A network without a shop answers with an
   *  empty list rather than an error: you asked what could be tagged, and
   *  "nothing" is a true answer. */
  products(id: string, params: { q?: string; cursor?: string; limit?: number } = {}): Promise<{ items: ShopProduct[]; cursor: string | null }> {
    return this.c.request("GET", `/v1/social-accounts/${encodeURIComponent(id)}/products`, { query: params });
  }

  /** This channel's OWN posts, read from the network rather than from our
   *  records. `pl.posts.list()` returns what PostLake published; this returns
   *  everything on the account, including posts made in the network's own app
   *  before it was ever connected. */
  posts(id: string, params: { cursor?: string; limit?: number } = {}): Promise<{ items: DiscoveredPost[]; cursor: string | null; platform: Platform }> {
    return this.c.request("GET", `/v1/social-accounts/${encodeURIComponent(id)}/posts`, { query: params });
  }

  /** Posts somebody ELSE published that tagged this channel. Different from a
   *  mention, which names you in text, and from your own posts. */
  tagged(id: string, params: { cursor?: string; limit?: number } = {}): Promise<{ items: DiscoveredPost[]; cursor: string | null; platform: Platform }> {
    return this.c.request("GET", `/v1/social-accounts/${encodeURIComponent(id)}/tagged`, { query: params });
  }

  /** How many posts this channel has left in the network's own window. Read it
   *  before planning a batch: the alternative is finding the ceiling by being
   *  refused partway through one, with some posts live and some not. */
  allowance(id: string): Promise<{ used: number; limit: number; remaining: number; windowHours: number; platform: Platform }> {
    return this.c.request("GET", `/v1/social-accounts/${encodeURIComponent(id)}/allowance`);
  }

  /** Scheduled events on this channel (a launch, a drop, a live). The id goes
   *  in the `upcomingEventId` post option, which puts a reminder button on the
   *  post. Events are created in the network's own app, not through the API. */
  events(id: string): Promise<{ items: Array<{ id: string; title: string; startsAt: string | null; endsAt: string | null }>; cursor: string | null }> {
    return this.c.request("GET", `/v1/social-accounts/${encodeURIComponent(id)}/events`);
  }

  /** Create a scheduled event. Instagram calls this a reminder, and its app only
   *  offers one while composing a post. The API can create one outright, so an
   *  agent can make the event AND attach it rather than needing a person to
   *  prepare one first. The returned id goes in the `upcomingEventId` option. */
  createEvent(id: string, input: { title: string; startsAt: string; endsAt?: string }): Promise<{ id: string; title: string; startsAt: string | null; endsAt: string | null }> {
    return this.c.request("POST", `/v1/social-accounts/${encodeURIComponent(id)}/events`, { body: input });
  }

  /** Ad accounts this channel has authorised. Only an `active` one can be spent
   *  against. Most channels have authorised none, which is an empty list. */
  adAccounts(id: string): Promise<{ business: { id: string; name: string | null; verified: boolean | null } | null; adAccounts: AdAccount[] }> {
    return this.c.request("GET", `/v1/social-accounts/${encodeURIComponent(id)}/ad-accounts`);
  }

  /** Branded content partners. `canPromote` is a SEPARATE grant that lets the
   *  partner run the post as a paid ad; permission to tag does not imply it. */
  brandedPartners(id: string): Promise<BrandedContentPartner[]> {
    return this.c.request<{ partners: BrandedContentPartner[] }>("GET", `/v1/social-accounts/${encodeURIComponent(id)}/branded-partners`).then((r) => r.partners);
  }

  /** Subscribe this channel to Page webhooks. Facebook needs this per Page:
   *  subscribing the app is not enough, and nothing is delivered without it. */
  subscribeWebhook(id: string, fields?: string[]): Promise<{ subscribed: boolean; fields: string[] }> {
    return this.c.request("POST", `/v1/social-accounts/${encodeURIComponent(id)}/webhook`, {
      body: fields?.length ? { fields } : {},
    });
  }

  /** Which events this channel currently receives. */
  webhookSubscriptions(id: string): Promise<{ fields: string[] }> {
    return this.c.request("GET", `/v1/social-accounts/${encodeURIComponent(id)}/webhook`);
  }

  /** Move a connected channel to another profile. */
  moveToProfile(id: string, profile: string): Promise<{ account: string; profile: string }> {
    return this.c.request("PATCH", `/v1/social-accounts/${encodeURIComponent(id)}/profile`, { body: { profile } });
  }

  /** Postable destinations inside one account: Pinterest boards and their
   *  sections, Facebook Pages. This is also how a board id from a post record
   *  becomes a name again, since a post stores the id it published to.
   *
   *  `privacy` is worth reading before you post: a secret board accepts a pin
   *  and shows it to nobody. */
  async targets(id: string): Promise<TargetOption[]> {
    const r = await this.c.request<{ targets: TargetOption[] }>(
      "GET",
      `/v1/social-accounts/${encodeURIComponent(id)}/targets`,
    );
    return r.targets;
  }

  /** One connected account, including what it can SEARCH.
   *
   *  Call it before a discovery request: `discovers` answers per ACCOUNT, and
   *  a `blocked` object means the network has already refused, with the step a
   *  person has to take. That is cheaper than making the call and reading the
   *  error, and it is the only way to know which door an Instagram came
   *  through. */
  get(id: string): Promise<ConnectedAccount> {
    return this.c.request<ConnectedAccount>("GET", `/v1/social-accounts/${encodeURIComponent(id)}`);
  }
}

class Analytics {
  constructor(private readonly c: PostLake) {}
  /** Cross-platform analytics for a period (e.g. "7d", "30d", "90d"). */
  get(params: { period?: string } = {}): Promise<AnalyticsResponse> {
    return this.c.request<AnalyticsResponse>("GET", "/v1/analytics", { query: params });
  }
}

class Media {
  constructor(private readonly c: PostLake) {}
  /** Upload bytes; returns a med_… asset to reference when creating a post. */
  upload(bytes: ArrayBuffer | Uint8Array, contentType: string): Promise<MediaAsset> {
    return this.c.request<MediaAsset>("POST", "/v1/media", { raw: { bytes, contentType } });
  }
  /** Prepare signed PUT targets for several local files (a carousel) in one call. */
  prepareBatch(items: { contentType: string; sizeBytes?: number }[]): Promise<{
    items: Array<{
      id: string;
      uploadUrl: string;
      method: "PUT";
      headers: { authorization: string; "content-type": string };
      expiresInSeconds: number;
    }>;
  }> {
    return this.c.request("POST", "/v1/media/batch", { body: { items } });
  }
}

/** The header every PostLake webhook delivery is signed with. */
export const WEBHOOK_SIGNATURE_HEADER = "postlake-signature";

// HMAC-SHA256 to lowercase hex, via Web Crypto. NOTE: globalThis.crypto only
// became available unflagged in Node 19, so this needs Node 20+ (18 is EOL as
// of April 2025). Workers, Deno, Bun and browsers all have it natively. CI
// runs the matrix that proves this rather than trusting the claim.
async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Constant-time compare so verification can't leak the signature via timing.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify a PostLake webhook delivery before trusting it. Recomputes the
 * HMAC-SHA256 over `${timestamp}.${rawBody}` with your endpoint `secret` and
 * compares to the `postlake-signature` header in constant time. Pass
 * `toleranceSec` to also reject replays whose timestamp is too old.
 *
 * IMPORTANT: `rawBody` must be the EXACT bytes received — verify before parsing
 * JSON, and never re-serialize (whitespace changes break the signature).
 *
 *   import { verifyWebhookSignature } from "postlake";
 *   const ok = await verifyWebhookSignature(secret, rawBody, req.headers["postlake-signature"], { toleranceSec: 300 });
 *   if (!ok) return res.status(400).end();
 */
export async function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  signatureHeader: string | null | undefined,
  opts: { toleranceSec?: number; nowMs?: number } = {},
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(signatureHeader.split(",").map((kv) => kv.split("=") as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (opts.toleranceSec !== undefined) {
    const now = Math.floor((opts.nowMs ?? Date.now()) / 1000);
    if (!Number.isFinite(Number(t)) || Math.abs(now - Number(t)) > opts.toleranceSec) return false;
  }
  const expected = await hmacSha256Hex(secret, `${t}.${rawBody}`);
  return timingSafeEqualHex(expected, v1);
}

class Webhooks {
  constructor(private readonly c: PostLake) {}
  /** Register an endpoint. The signing `secret` is returned ONCE, here. */
  create(input: { url: string; events?: string[] }): Promise<WebhookEndpoint> {
    return this.c.request<WebhookEndpoint>("POST", "/v1/webhooks", { body: input });
  }
  list(): Promise<WebhookEndpoint[]> {
    return this.c.request<WebhookEndpoint[]>("GET", "/v1/webhooks");
  }
  delete(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.c.request("DELETE", `/v1/webhooks/${encodeURIComponent(id)}`);
  }
  /**
   * Verify a delivery's `postlake-signature` against the endpoint `secret`.
   * Pass the RAW request body. Convenience wrapper over {@link verifyWebhookSignature}.
   */
  verify(secret: string, rawBody: string, signatureHeader: string | null | undefined, opts?: { toleranceSec?: number }): Promise<boolean> {
    return verifyWebhookSignature(secret, rawBody, signatureHeader, opts);
  }
}


/** Your own corner of each network.
 *
 *  Every list here returns `problems` next to the items. Read it: an empty
 *  `items` with a non-empty `problems` means a network could not be reached,
 *  not that nothing happened, and treating those the same is how an agent ends
 *  up reporting a quiet day during an outage.
 */
class Platforms {
  constructor(private readonly c: PostLake) {}

  /** Every network's capabilities in one call. */
  list(): Promise<PlatformCapabilities[]> {
    return this.c.request<{ platforms: PlatformCapabilities[] }>("GET", "/v1/platforms").then((r) => r.platforms);
  }

  /** One network's capabilities. `variants` tells you where a network has more
   *  than one way in, and what each way unlocks. */
  get(platform: Platform): Promise<PlatformCapabilities> {
    return this.c.request<PlatformCapabilities>("GET", `/v1/platforms/${encodeURIComponent(platform)}`);
  }
}

class Profiles {
  constructor(private readonly c: PostLake) {}

  list(): Promise<Profile[]> {
    return this.c.request<{ profiles: Profile[] }>("GET", "/v1/profiles").then((r) => r.profiles);
  }

  create(input: { name: string }): Promise<Profile> {
    return this.c.request<Profile>("POST", "/v1/profiles", { body: input });
  }

  /** Rename a profile. The username derived from the name changes with it, so
   *  the answer says what the old one was: anything posting by the old name
   *  needs updating. */
  rename(id: string, name: string): Promise<{ profile: Profile; previousUsername?: string; usernameChanged?: boolean }> {
    return this.c.request("PATCH", `/v1/profiles/${encodeURIComponent(id)}`, { body: { name } });
  }

  /** Delete a profile. The channels connected to it go too, and the answer
   *  names them rather than leaving you to find out. */
  delete(id: string): Promise<{ deleted: boolean; disconnected?: string[] }> {
    return this.c.request("DELETE", `/v1/profiles/${encodeURIComponent(id)}`);
  }
}

class Credentials {
  constructor(private readonly c: PostLake) {}

  /** Which platforms have your own app keys stored. The secret is never
   *  returned, only the fact that one is there. */
  list(): Promise<Credential[]> {
    return this.c.request<{ credentials: Credential[] }>("GET", "/v1/credentials").then((r) => r.credentials);
  }

  set(input: { platform: Platform; clientId: string; clientSecret: string }): Promise<Credential> {
    return this.c.request<{ credential: Credential }>("POST", "/v1/credentials", { body: input }).then((r) => r.credential);
  }

  /** Remove your keys for one platform and fall back to PostLake's managed app. */
  delete(platform: Platform): Promise<void> {
    return this.c.request<void>("DELETE", `/v1/credentials/${encodeURIComponent(platform)}`);
  }
}

class Inbox {
  constructor(private readonly c: PostLake) {}

  /** Likes, replies, mentions and follows, merged across every network that has
   *  a notifications feed. Pass `account` to read just one. */
  notifications(params: { account?: string; cursor?: string; limit?: number } = {}): Promise<MultiPage<Notification>> {
    return this.c.request<MultiPage<Notification>>("GET", "/v1/notifications", { query: params });
  }

  /** Mark everything up to now as seen, on the networks that track that. */
  markNotificationsSeen(params: { account?: string } = {}): Promise<{ marked: Platform[]; problems: ReadProblem[] }> {
    return this.c.request("POST", "/v1/notifications/seen", { query: params });
  }

  /** Replies on a post you published, across every network it went to. Takes
   *  the PostLake post id (post_…), not a network id. */
  comments(postId: string, params: { cursor?: string; limit?: number; nested?: boolean } = {}): Promise<MultiPage<Comment>> {
    const { nested, ...rest } = params;
    return this.c.request<MultiPage<Comment>>("GET", `/v1/posts/${encodeURIComponent(postId)}/comments`, {
      // The whole thread rather than only the top level, where the network can
      // go deeper. Sent only when asked, so the default stays the network's.
      query: { ...rest, ...(nested ? { nested: "true" } : {}) },
    });
  }

  /** Reply to someone else's comment, by that comment's id. */
  reply(commentId: string, input: { account: string; text: string }): Promise<{ account: string; platform: Platform; id?: string; ok: true }> {
    return this.c.request("POST", `/v1/comments/${encodeURIComponent(commentId)}/replies`, { body: input });
  }

  /** Hide a reply on your own post, or unhide one you hid.
   *
   *  The other half of moderating a comment section: without it the only answer
   *  to an abusive reply is to reply to it. A rejected call means the reply is
   *  STILL VISIBLE, so treat an error as "still there". */
  hideComment(commentId: string, input: { account: string; hidden?: boolean }): Promise<{ account: string; platform: Platform; hidden: boolean; ok: true }> {
    return this.c.request("POST", `/v1/comments/${encodeURIComponent(commentId)}/hide`, {
      body: { account: input.account, hidden: input.hidden ?? true },
    });
  }

  /** Delete a comment on one of your own posts.
   *
   *  The irreversible half of moderating a comment section. Facebook cannot
   *  hide a Page's own comment, so this is how you take one of yours down. */
  deleteComment(commentId: string, input: { account: string }): Promise<{ account: string; platform: Platform; ok: true }> {
    return this.c.request("DELETE", `/v1/comments/${encodeURIComponent(commentId)}`, { body: input });
  }

  /** Like, repost, follow, block or mute. One vocabulary for every network. */
  engage(input: { account: string; action: EngageAction; target: string }): Promise<{ account: string; platform: Platform; ok: true }> {
    return this.c.request("POST", "/v1/engagements", { body: input });
  }

  /** Who follows a connected account. */
  followers(accountId: string, params: { cursor?: string; limit?: number } = {}): Promise<MultiPage<SocialActor>> {
    return this.c.request<MultiPage<SocialActor>>("GET", `/v1/social-accounts/${encodeURIComponent(accountId)}/followers`, { query: params });
  }

  /** Who a connected account follows. */
  following(accountId: string, params: { cursor?: string; limit?: number } = {}): Promise<MultiPage<SocialActor>> {
    return this.c.request<MultiPage<SocialActor>>("GET", `/v1/social-accounts/${encodeURIComponent(accountId)}/following`, { query: params });
  }

  /** Direct message threads. */
  conversations(params: { account?: string; cursor?: string; limit?: number } = {}): Promise<MultiPage<Conversation>> {
    return this.c.request<MultiPage<Conversation>>("GET", "/v1/conversations", { query: params });
  }

  /** Open (or find) a thread with someone, so a first message does not need a
   *  conversation id that does not exist yet. */
  openConversation(input: { account: string; handle: string }): Promise<Conversation> {
    return this.c.request<Conversation>("POST", "/v1/conversations", { body: input });
  }

  /** Mark a conversation read, where the network tracks that. */
  markConversationRead(conversationId: string, input: { account: string }): Promise<{ ok: true }> {
    return this.c.request("POST", `/v1/conversations/${encodeURIComponent(conversationId)}/read`, { body: input });
  }

  messages(conversationId: string, params: { account: string; cursor?: string; limit?: number }): Promise<MultiPage<Message>> {
    return this.c.request<MultiPage<Message>>("GET", `/v1/conversations/${encodeURIComponent(conversationId)}/messages`, { query: params });
  }

  /** Send a message into a conversation.
   *
   *  Sending on X costs 6 credits. Sending on Facebook, Instagram, and
   *  Bluesky does not spend credits.
   *
   *  `humanAgent` asserts that a PERSON wrote this reply. Meta only allows a
   *  reply within 24 hours of someone's last message; the Human Agent tag
   *  extends that to 7 days, and Meta grants it strictly for replies a human
   *  composed. Never set it on an automated reply: the penalty lands on the
   *  connected account, not on the caller. */
  sendMessage(conversationId: string, input: { account: string; text: string; humanAgent?: boolean }): Promise<Message> {
    return this.c.request<Message>("POST", `/v1/conversations/${encodeURIComponent(conversationId)}/messages`, { body: input });
  }
}

/** The public network, rather than your own corner of it. */
class Discover {
  constructor(private readonly c: PostLake) {}

  /** Search public posts by keyword or topic tag, across every connected
   *  network that can search. Networks that cannot are named in `problems`
   *  rather than quietly omitted, which matters here more than anywhere: an
   *  agent that reads "no results" as "nobody has said this" will go and say it. */
  posts(query: PostSearch, params: { account?: string; cursor?: string; limit?: number } = {}): Promise<MultiPage<DiscoveredPost>> {
    return this.c.request<MultiPage<DiscoveredPost>>("GET", "/v1/discover/posts", {
      query: { ...query, ...params },
    });
  }

  /** Auto-paginating iterator over a search. */
  async *postsAll(query: PostSearch, params: { account?: string; limit?: number } = {}): AsyncGenerator<DiscoveredPost> {
    let cursor: string | undefined;
    do {
      const page = await this.posts(query, { ...params, cursor });
      for (const p of page.items) yield p;
      cursor = page.cursor ?? undefined;
    } while (cursor);
  }

  /** Look someone up. Needs an account, because the same handle on two networks
   *  is usually two different people and merging them would invent one. */
  profile(handle: string, params: { account: string }): Promise<PublicProfile> {
    return this.c.request<PublicProfile>("GET", `/v1/discover/profiles/${encodeURIComponent(handle)}`, { query: params });
  }

  /** Someone else's public posts, on one network. */
  profilePosts(handle: string, params: { account: string; cursor?: string; limit?: number }): Promise<MultiPage<DiscoveredPost>> {
    return this.c.request<MultiPage<DiscoveredPost>>("GET", `/v1/discover/profiles/${encodeURIComponent(handle)}/posts`, { query: params });
  }

  /** Search a network's creator marketplace for people to work with.
   *
   *  Until the app has Advanced Access from the network, results are SIMULATED
   *  creators and each carries `sample: true`. Check it: acting on a sample
   *  means pitching a partnership to somebody who does not exist. */
  creators(params: { account: string; q?: string; countries?: string; interests?: string; limit?: number; cursor?: string }): Promise<{ items: MarketplaceCreator[]; cursor: string | null; platform: Platform }> {
    return this.c.request("GET", "/v1/discover/creators", { query: params });
  }

  /** Find a place to tag on a post. Pass a name, or a latitude and longitude
   *  together. The id goes in that network's `locationId` post option. */
  places(params: { account: string; q?: string; latitude?: number; longitude?: number }): Promise<{ items: Place[]; platform: Platform }> {
    return this.c.request("GET", "/v1/discover/places", { query: params });
  }
}
