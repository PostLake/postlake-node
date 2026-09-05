// Public types for the PostLake SDK. These mirror the API's normalised response
// shapes (api/src/types.ts) so callers get full type-safety and autocomplete.

export type Platform =
  | "bluesky"
  | "threads"
  | "x"
  | "linkedin"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "pinterest";

export type PostState =
  | "draft" // saved, never sent, and costing nothing until you publish it
  | "queued" // accepted, not yet sent
  | "scheduled" // will publish at scheduledAt
  | "processing" // accepted by an async network (TikTok, Instagram); awaiting confirmation
  | "partial" // some targets published, some failed
  | "published" // all targets live
  | "failed"; // all targets failed
export type TargetState = "queued" | "scheduled" | "processing" | "published" | "failed";

export interface NormalisedError {
  type: string;
  message: string;
  platform?: Platform;
  retryable: boolean;
  /** `type` is the coarse category you route on and is deliberately small, so
   *  it cannot say WHICH input was wrong. These four turn a rejection into
   *  something an agent can act on rather than guess at:
   *    code   a stable, granular handle to branch on
   *    fix    the next action, in plain words
   *    docs   where the rule is written down
   *    param  the request field at fault
   *  All optional: an older API deployment simply omits them. */
  code?: string;
  fix?: string;
  docs?: string;
  param?: string;
}

/** One destination's verdict from `posts.validate`. */
export interface ValidateTargetResult {
  account: string;
  platform: Platform;
  ok: boolean;
  errors: string[];
  warnings: string[];
  /** The same code / fix / param a real publish would return, so a dry run
   *  teaches exactly what the live call teaches. */
  issues: { code: string; message: string; fix: string; param?: string; docs: string }[];
}

export interface ValidatePostResult {
  /** True only when every target validates. */
  ok: boolean;
  targets: ValidateTargetResult[];
}

export interface PinterestOptions {
  boardId?: string;
  /** Pins into a SECTION of the board. Section ids come back from
   *  `socialAccounts.targets()`, named "Board / Section". */
  boardSectionId?: string;
  link?: string;
  /** Shown in the Pinterest grid; the description is only visible once a pin
   *  is opened. Falls back to the post text when unset. */
  title?: string;
  altText?: string;
}
export interface TikTokOptions {
  mode?: "direct" | "inbox";
  /** Must be one of the creator's own options: read them from
   *  `socialAccounts.publishInfo()`. Note that TikTok refuses SELF_ONLY when
   *  `brandContent` is set, because branded content cannot be private. */
  privacyLevel?: string;
  /** Photo-post title, max 90 characters. */
  title?: string;
  allowComment?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  photoCoverIndex?: number;
  autoAddMusic?: boolean;
  /** Paid partnership. Cannot be combined with a private privacyLevel. */
  brandContent?: boolean;
  brandOrganic?: boolean;
  isAigc?: boolean;
}
export interface PlatformOptions {
  pinterest?: PinterestOptions;
  tiktok?: TikTokOptions;
}

export interface CreatePostInput {
  text: string;
  /** Connected social account ids (acc_…) to publish to. */
  accounts: string[];
  /** Media ids (med_…) from media.upload(). */
  media?: string[];
  /** ISO 8601 UTC. Omit to publish now. */
  scheduledAt?: string;
  /** IANA timezone (e.g. Europe/London). Interprets a naive scheduledAt as local time. */
  timezone?: string;
  /** Follow-on post bodies, published as a chain beneath `text`. */
  thread?: string[];
  /** Posted as a reply the moment the post goes live, where the network allows it. */
  firstComment?: string;
  platformOptions?: PlatformOptions;
  /** Save without sending. Prefer `posts.draft()`, which sets this for you. */
  draft?: boolean;
}

export interface PostTarget {
  account: string;
  platform: Platform;
  state: TargetState;
  remoteId: string | null;
  url: string | null;
  publishedAt: string | null;
  error: NormalisedError | null;
}

export interface Post {
  id: string;
  state: PostState;
  createdAt: string;
  scheduledAt: string | null;
  timezone?: string;
  scheduledAtLocal?: string;
  text: string;
  media: string[];
  thread?: string[];
  firstComment?: string;
  platformOptions?: PlatformOptions;
  warnings?: string[];
  targets: PostTarget[];
}

export interface ConnectedAccount {
  id: string;
  platform: Platform;
  handle: string;
  profileId: string | null;
  status: string;
  avatarUrl?: string | null;
  /** What this network needs before it will publish, in one sentence. Null
   *  when it accepts anything. Read it before composing: several networks
   *  refuse a text-only post. */
  requires?: string | null;
  /** Which door this account was connected through, where a network has more
   *  than one. Instagram is the case: `facebook` reaches creator search,
   *  branded content and messages; `instagram` cannot, however the permissions
   *  are set. Absent on networks with a single way in. */
  connectVariant?: string;
  /** What THIS account can search, as opposed to what the network supports.
   *  Check it before a discovery call rather than learning the answer from an
   *  error. */
  discovers?: {
    posts: boolean;
    profiles: boolean;
    profilePosts: boolean;
    places: boolean;
    creators: boolean;
  };
  /** Set when the network has already refused something for this account.
   *  `fix` is what a PERSON has to do about it, usually a one-off consent in
   *  the network's own dashboard that no API call can complete. */
  blocked?: { code: string; fix: string; docs: string; since?: string };
}

export interface MediaAsset {
  id: string;
  url: string;
  contentType: string;
  size: number;
  createdAt: string;
}

export interface Metrics {
  impressions: number;
  /** Times the content was WATCHED or opened, as opposed to displayed. A
   *  subset of impressions, not a synonym: a network that reports only one of
   *  the two leaves the other at 0 rather than filing a watch as a display. */
  views: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  followers: number;
  /** Metrics this network reports that have no cross-platform equivalent,
   *  keyed by the network's OWN metric name. Pinterest returns its video
   *  retention curve (VIDEO_START, VIDEO_10S_VIEW, QUARTILE_95_PERCENT_VIEW)
   *  plus PROFILE_VISIT and USER_FOLLOW; Facebook and YouTube return theirs.
   *  Keys are never normalised, so it is always clear which network a figure
   *  came from. Rates and averages are excluded: they cannot be summed across
   *  posts, and every one is derivable from the counts. Absent when the network
   *  reports nothing extra. */
  extras?: Record<string, number>;
}
export interface PlatformAnalytics extends Metrics {
  platform: Platform;
}
export interface AnalyticsResponse {
  period: string;
  totals: Metrics;
  byPlatform: PlatformAnalytics[];
}

export interface PostAnalytics {
  postId: string;
  byTarget: Array<{ account: string; platform: Platform; metrics: Metrics | null }>;
  totals: Metrics;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  /** Present only in the create response, once. */
  secret?: string;
  createdAt: string;
}

export interface Account {
  id: string;
  email: string;
  platforms: Platform[];
  timezone?: string;
}

/** A page of results from a cursor-paginated list. */
export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

// ── Reading and discovery ──────────────────────────────────────────────────
//
// Every cross-network read returns `problems` alongside the items. That field
// is the point of these calls, not decoration: without it an empty list from a
// two-network read cannot be told apart from a read where one network was never
// asked, and those two lead you to opposite decisions.

export interface ReadProblem {
  account: string;
  platform: Platform;
  /** Why this network could not be read, in words. */
  reason: string;
}

/** A page from a cross-network read. `cursor` is opaque: pass it back verbatim,
 *  null means the end, and never parse it — it encodes a position per network. */
export interface MultiPage<T> {
  items: T[];
  cursor: string | null;
  problems: ReadProblem[];
  /** Networks that WERE read, and how many each returned.
   *
   *  `problems` names what could not be asked; this names what could. Without
   *  it an empty `items` with an empty `problems` is ambiguous in exactly the
   *  wrong direction: it reads as "nothing exists" and can equally mean "no
   *  network was eligible to answer". Empty items with a filled `searched` is a
   *  trustworthy no. */
  searched?: { account: string; platform: Platform; found: number }[];
}

export interface SocialActor {
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  /** The network's own id, for follow/block/mute. */
  id: string | null;
}

export type NotificationType =
  | "like" | "reply" | "mention" | "follow" | "repost" | "quote" | "other";

export interface Notification {
  id: string;
  platform: Platform;
  account: string;
  /** Normalised kind. An unfamiliar kind arrives as "other", so a new one on
   *  some network cannot break a switch you already wrote. */
  type: NotificationType;
  /** The network's own word for it, unmapped. */
  platformType: string;
  actor: SocialActor;
  post: { uri: string; url: string | null; text: string | null } | null;
  text: string | null;
  createdAt: string;
  read: boolean;
}

export interface Comment {
  id: string;
  platform: Platform;
  /** The connection (acc_…) this comment was read through. Pass it back when
   *  you reply, hide, like or delete. */
  account?: string;
  author: SocialActor;
  text: string;
  createdAt: string;
  url: string | null;
  replyCount: number;
  likeCount: number;
  /** Whether this reply is currently hidden. null where the network does not
   *  say. Distinguishing "not hidden" from "we cannot tell" matters: an agent
   *  that treats null as false will try to hide the same reply forever. */
  hidden: boolean | null;
  replies: Comment[];
}

export interface Conversation {
  id: string;
  platform: Platform;
  account: string;
  participants: SocialActor[];
  lastMessage: { text: string; createdAt: string; fromMe: boolean; content?: MessageContent } | null;
  unreadCount: number;
}

export interface Message {
  id: string;
  text: string;
  createdAt: string;
  from: SocialActor;
  /** True when you sent it, so you never have to compare handles. */
  fromMe: boolean;
  /** A normalized attachment, shared post, or unsupported provider payload. */
  content?: MessageContent;
}

export interface MessageContent {
  kind: "attachment" | "shared_media" | "unsupported";
  label: string;
  url: string | null;
}

export type EngageAction =
  | "like" | "unlike"
  | "repost" | "unrepost"
  | "follow" | "unfollow"
  | "block" | "unblock"
  | "mute" | "unmute";

/** A post found by searching or browsing, rather than one you published.
 *  Deliberately not `Post`: far less is known about someone else's post. */
export interface DiscoveredPost {
  id: string;
  platform: Platform;
  author: SocialActor;
  text: string;
  createdAt: string;
  url: string | null;
  mediaType: "text" | "image" | "video" | "other";
  isReply: boolean;
  isQuote: boolean;  /** True when the network REFUSES to name the author, rather than us failing
   *  to read it. Instagram hashtag results are the case: Meta strips
   *  personally identifiable information from them and rejects the username
   *  field, so `author.handle` is necessarily empty. Treat an empty handle
   *  WITHOUT this flag as a bug; with it, as the network's rule. It also means
   *  hashtag search cannot be used to find someone to contact. */
  authorHidden?: boolean;
}

/** Someone else's public profile. `followerCount` is null where the network
 *  does not publish it, which is not the same as them having none. */
export interface PublicProfile {
  platform: Platform;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  verified: boolean;
  followerCount: number | null;
  /** How the account has done over the last 7 days, where the network reports
   *  it. Each figure is null when it was not published, never 0. Enough to
   *  judge whether someone is worth replying to without reading their history. */
  recent?: { likes: number | null; quotes: number | null; reposts: number | null; views: number | null };
  id: string | null;
}

/** A place that can be tagged on a post. Ids only mean anything to the network
 *  they came from, so the platform travels with them. */
export interface Place {
  id: string;
  platform: Platform;
  name: string;
  address: string | null;
  city: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PostSearch {
  q: string;
  mode?: "keyword" | "tag";
  sort?: "top" | "recent";
  mediaType?: "text" | "image" | "video";
  author?: string;
  since?: string;
  until?: string;
}

/** A named group of channels ("my-brand") you can post to by name. */
export interface Profile {
  id: string;
  username: string;
  name?: string | null;
  createdAt?: string;
}

/** One way a network can be connected. What a connection can do depends on HOW
 *  it was made, not only on which network it is: an Instagram account connected
 *  through Facebook can search and read insights, the same account connected
 *  directly cannot. Present only where a network offers more than one door. */
export interface ConnectVariant {
  id: string;
  label: string;
  requires?: string[];
  then?: string;
  summary?: string;
  only?: string[];
  note?: string;
}

/** What one network supports: limits, media rules, and every platformOptions
 *  field with its valid values. Read this rather than hard-coding a limit. */
export interface PlatformCapabilities {
  platform: Platform;
  displayName: string;
  maxChars: number;
  charsByPostType?: { video?: number; image?: number };
  title?: { maxChars: number; appliesTo?: string };
  media: {
    required: boolean;
    videoRequired?: boolean;
    maxImages: number;
    maxVideos: number;
    imageTypes: string[];
    videoTypes: string[];
    maxImageBytes?: number;
    maxVideoBytes?: number;
    maxVideoSeconds?: number;
  };
  postsPerDay?: number;
  asyncPublish?: boolean;
  firstComment?: boolean;
  deletePost?: boolean;
  thread?: boolean;
  replyToComment?: boolean;
  hideComments?: boolean;
  editProfile?: boolean;
  messages?: boolean;
  engages?: EngageAction[];
  reads?: { notifications?: boolean; comments?: boolean; followers?: boolean; following?: boolean };
  discovers?: { posts?: boolean; profiles?: boolean; profilePosts?: boolean; places?: boolean };
  variants?: ConnectVariant[];
  options: Array<{
    id: string;
    type: "string" | "boolean" | "enum" | "number";
    label: string;
    values?: string[];
    default?: unknown;
    appliesTo?: string;
    maxLength?: number;
    description?: string;
  }>;
  notes?: string[];
}

/** Your own app keys for a platform (BYOK / white-label). The secret is never
 *  returned; only the fact that one is stored. */
export interface Credential {
  platform: Platform;
  clientId: string;
  createdAt?: string;
}

/** Creator-level constraints read live from the network, e.g. which privacy
 *  levels a TikTok creator may choose right now. */
export interface PublishInfo {
  platform: Platform;
  username?: string;
  nickname?: string;
  avatarUrl?: string;
  privacyOptions?: string[];
  commentDisabled?: boolean;
  duetDisabled?: boolean;
  stitchDisabled?: boolean;
  maxVideoDurationSec?: number;
}

/** What this key may do right now: credits left, plan, and any agent guardrails.
 *  Read it before planning a batch rather than discovering a limit by refusal. */
export interface Limits {
  account: string;
  email?: string;
  name?: string;
  credits?: {
    total?: number;
    monthly?: number;
    pack?: number;
    monthlyAllowance?: number;
    plan?: string;
    blockedPlatforms?: string[];
  };
  [key: string]: unknown;
}

export interface EmailPreferences {
  digestFrequency: "off" | "weekly" | "daily";
  [key: string]: unknown;
}

export interface AuditEvent {
  id: string;
  event: string;
  createdAt: string;
  ip?: string | null;
  meta?: Record<string, unknown>;
}

/** A short-lived link you hand to a person: the connect page, or the dashboard. */
export interface SignedLink {
  url: string;
  expiresInSeconds: number;
}

/** One item from a connected account's shop catalogue. Only `approved`
 *  products can actually be tagged on a post. */
export interface ShopProduct {
  id: string;
  name: string;
  imageUrl: string | null;
  price: string | null;
  status: string | null;
}

/** Webhook event types. `message.received` currently fires for Facebook and
 *  Instagram, where Meta pushes new messages to PostLake. */
export type WebhookEventType =
  | "post.published"
  | "post.partial"
  | "post.failed"
  | "post.processing"
  | "account.connected"
  | "message.received"
  | "comment.received"
  | "mention.received";

/** The payload of a `message.received` event. `replyBy` is the moment the
 *  network stops accepting a reply, stated so nothing has to work it out. */
export interface MessageReceived {
  account: string;
  platform: Platform;
  handle: string;
  from: string | null;
  messageId: string | null;
  text: string;
  hasAttachments: boolean;
  content?: MessageContent;
  receivedAt: string;
  replyBy: string;
}

/** A creator surfaced by a network's creator marketplace. `sample` is true when
 *  the network returned simulated test data rather than a real person, which it
 *  does until the app has Advanced Access. */
export interface MarketplaceCreator {
  id: string;
  handle: string;
  displayName: string | null;
  avatarUrl: string | null;
  followers: number | null;
  bio: string | null;
  categories: string[];
  sample: boolean;
}

/** An ad account a channel has authorised. Only an `active` status can be spent
 *  against; Meta reports every other state as a code. */
export interface AdAccount {
  id: string;
  name: string;
  currency: string | null;
  status: string | null;
}

/** A branded content partner. `canPromote` is a separate grant from being
 *  allowed to tag: it lets the partner run the post as a paid ad. */
export interface BrandedContentPartner {
  id: string;
  handle: string;
  canPromote: boolean;
}

/** A postable destination inside one account: a Pinterest board or board
 *  section, a Facebook Page. */
export interface TargetOption {
  id: string;
  name: string;
  /** A link a person can open. Present only where the network publishes one we
   *  can trust; never constructed by guessing a slug. */
  url?: string;
  /** Who owns it, where one login reaches several owners. */
  owner?: string;
  /** The network's own word for who can see it, e.g. public, secret. Check it:
   *  a secret board accepts a post and shows it to nobody. */
  privacy?: string;
  description?: string;
  /** How much is already there, e.g. a board's pin count. */
  itemCount?: number;
  /** The destination this one sits inside, for networks with two levels. A
   *  Pinterest board section names its board. */
  parent?: string;
}
