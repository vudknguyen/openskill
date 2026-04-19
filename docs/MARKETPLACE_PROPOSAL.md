# OpenSkill Marketplace - Proposal & Architecture

## Executive Summary

OpenSkill Marketplace extends the `osk` CLI into a full platform for discovering, distributing, and monetizing AI coding agent skills. Developers can publish skills, track usage analytics, and earn revenue through subscriptions. Teams and enterprises can manage skill access through seat-based licensing.

---

## 1. Product Vision

### Problem Statement
- Skill creators have no way to monetize their work
- Users struggle to discover quality skills
- No usage analytics or feedback loop for creators
- Enterprise teams lack centralized skill management

### Solution
A marketplace platform that:
1. **Empowers creators** with publishing, analytics, and monetization
2. **Serves users** with discovery, reviews, and seamless installation
3. **Supports enterprises** with seat management and SSO

---

## 2. User Personas & Flows

### 2.1 Skill Creator (Publisher)

```
Creator Journey:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Develop   │ -> │   Publish   │ -> │   Monitor   │ -> │   Earn      │
│   Skill     │    │   via CLI   │    │   Analytics │    │   Revenue   │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Key Actions:**
- `osk login` - Authenticate as publisher
- `osk publish` - Upload skill to marketplace
- `osk stats <skill>` - View usage stats from CLI
- Web dashboard - Full analytics, earnings, payouts

### 2.2 Individual Developer (Consumer)

```
Consumer Journey:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Discover  │ -> │   Install   │ -> │   Use       │ -> │   Rate      │
│   Skills    │    │   (Subscribe)│   │   Offline   │    │   Review    │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Key Actions:**
- `osk search` / `osk browse` - Discover skills
- `osk login` - Required for paid skills
- `osk install <skill>` - License check + download
- `osk subscribe` - Manage subscription

### 2.3 Enterprise Admin

```
Admin Journey:
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   SSO Setup │ -> │   Purchase  │ -> │   Assign    │ -> │   Monitor   │
│             │    │   Seats     │    │   Members   │    │   Usage     │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

**Key Actions:**
- Web dashboard - Team/seat management
- SSO/SAML configuration
- Bulk license assignment
- Usage reports per team member

---

## 3. System Architecture

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENTS                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│   │   osk CLI    │    │  Web App     │    │  Admin       │                  │
│   │   (Users &   │    │  (Catalog &  │    │  Dashboard   │                  │
│   │   Creators)  │    │  Discovery)  │    │  (Creators)  │                  │
│   └──────┬───────┘    └──────┬───────┘    └──────┬───────┘                  │
│          │                   │                   │                           │
└──────────┼───────────────────┼───────────────────┼───────────────────────────┘
           │                   │                   │
           ▼                   ▼                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY                                        │
│                    (Rate Limiting, Auth, Routing)                            │
└─────────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND SERVICES                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│   │    Auth      │    │   Catalog    │    │   Billing    │                  │
│   │   Service    │    │   Service    │    │   Service    │                  │
│   │              │    │              │    │              │                  │
│   │ - OAuth      │    │ - Skills     │    │ - Stripe     │                  │
│   │ - SSO/SAML   │    │ - Search     │    │ - Subscript. │                  │
│   │ - Sessions   │    │ - Categories │    │ - Invoices   │                  │
│   │ - Licenses   │    │ - Reviews    │    │ - Payouts    │                  │
│   └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│   │  Analytics   │    │   Storage    │    │    Team      │                  │
│   │   Service    │    │   Service    │    │   Service    │                  │
│   │              │    │              │    │              │                  │
│   │ - Installs   │    │ - Skill Files│    │ - Orgs       │                  │
│   │ - Usage      │    │ - Obfuscation│    │ - Seats      │                  │
│   │ - Errors     │    │ - Versions   │    │ - Roles      │                  │
│   │ - Reports    │    │ - CDN        │    │ - SSO Config │                  │
│   └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA LAYER                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│   │  PostgreSQL  │    │    Redis     │    │     S3       │                  │
│   │              │    │              │    │   (or R2)    │                  │
│   │ - Users      │    │ - Sessions   │    │              │                  │
│   │ - Skills     │    │ - Rate Limit │    │ - Skill Files│                  │
│   │ - Licenses   │    │ - Cache      │    │ - Assets     │                  │
│   │ - Analytics  │    │              │    │              │                  │
│   │ - Billing    │    │              │    │              │                  │
│   └──────────────┘    └──────────────┘    └──────────────┘                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Service Responsibilities

| Service | Responsibilities |
|---------|------------------|
| **Auth** | OAuth flows, SSO/SAML, JWT tokens, license validation |
| **Catalog** | Skill CRUD, search/indexing, categories, reviews/ratings |
| **Billing** | Stripe integration, subscriptions, seat licenses, payouts |
| **Analytics** | Event ingestion, aggregation, reporting, dashboards |
| **Storage** | Skill file hosting, obfuscation, versioning, CDN delivery |
| **Team** | Organizations, seat management, role-based access |

---

## 4. Data Models

### 4.1 Core Entities

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER                                     │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ email: String                                                    │
│ name: String                                                     │
│ auth_provider: Enum (github, google, saml)                       │
│ auth_provider_id: String                                         │
│ role: Enum (user, creator, admin)                                │
│ is_verified_publisher: Boolean (default false)                   │
│ stripe_customer_id: String?                                      │
│ organization_id: UUID? (FK)                                      │
│ created_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘
          │
          │ 1:N
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                         SKILL                                    │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ name: String (unique slug)                                       │
│ display_name: String                                             │
│ description: Text                                                │
│ author_id: UUID (FK -> User)                                     │
│ category: String                                                 │
│ tags: String[]                                                   │
│ pricing_type: Enum (free, subscription)                          │
│ price_monthly: Decimal?                                          │
│ price_yearly: Decimal?                                           │
│ revenue_share: Decimal (default 0.80 = 80% to creator)           │
│ status: Enum (draft, published, suspended)                       │
│ created_at: Timestamp                                            │
│ updated_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘
          │
          │ 1:N
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SKILL_VERSION                               │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ skill_id: UUID (FK)                                              │
│ version: String (semver)                                         │
│ file_url: String (S3/R2 path)                                    │
│ file_hash: String (SHA256)                                       │
│ changelog: Text                                                  │
│ is_latest: Boolean                                               │
│ created_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      SUBSCRIPTION                                │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ user_id: UUID (FK)                                               │
│ skill_id: UUID (FK)                                              │
│ stripe_subscription_id: String                                   │
│ status: Enum (active, canceled, past_due)                        │
│ current_period_start: Timestamp                                  │
│ current_period_end: Timestamp                                    │
│ created_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      ORGANIZATION                                │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ name: String                                                     │
│ slug: String (unique)                                            │
│ sso_provider: Enum (none, okta, azure_ad, google)?               │
│ sso_config: JSONB?                                               │
│ stripe_customer_id: String                                       │
│ created_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘
          │
          │ 1:N
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SEAT_LICENSE                                │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ organization_id: UUID (FK)                                       │
│ skill_id: UUID (FK)                                              │
│ total_seats: Integer                                             │
│ stripe_subscription_id: String                                   │
│ status: Enum (active, canceled)                                  │
│ created_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘
          │
          │ 1:N
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SEAT_ASSIGNMENT                             │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ seat_license_id: UUID (FK)                                       │
│ user_id: UUID (FK)                                               │
│ assigned_at: Timestamp                                           │
│ assigned_by: UUID (FK -> User)                                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      USAGE_EVENT                                 │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ skill_id: UUID (FK)                                              │
│ user_id: UUID (FK)                                               │
│ event_type: Enum (install, uninstall, invoke, error)             │
│ metadata: JSONB (agent, version, error_details, etc.)            │
│ created_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                        REVIEW                                    │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ skill_id: UUID (FK)                                              │
│ user_id: UUID (FK)                                               │
│ rating: Integer (1-5)                                            │
│ title: String                                                    │
│ body: Text                                                       │
│ created_at: Timestamp                                            │
│ updated_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       PAYOUT                                     │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ creator_id: UUID (FK -> User)                                    │
│ amount: Decimal                                                  │
│ currency: String (USD)                                           │
│ stripe_transfer_id: String                                       │
│ status: Enum (pending, completed, failed)                        │
│ period_start: Date                                               │
│ period_end: Date                                                 │
│ created_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                      REFERRAL                                    │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ referrer_id: UUID (FK -> User)                                   │
│ referred_id: UUID (FK -> User)                                   │
│ referral_code: String (unique)                                   │
│ subscription_id: UUID (FK -> Subscription)?                      │
│ status: Enum (pending, converted, expired)                       │
│ commission_rate: Decimal (default 0.05 = 5%)                     │
│ commission_amount: Decimal?                                      │
│ paid_out: Boolean                                                │
│ created_at: Timestamp                                            │
│ converted_at: Timestamp?                                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    REFERRAL_CODE                                 │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ user_id: UUID (FK -> User)                                       │
│ code: String (unique, e.g., "JOHN2024")                          │
│ commission_rate: Decimal (default 0.05 = 5%)                     │
│ uses: Integer (count)                                            │
│ active: Boolean                                                  │
│ created_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  PUBLISHER_VERIFICATION                          │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ user_id: UUID (FK -> User, unique)                               │
│ status: Enum (pending, verified, rejected)                       │
│ verified_at: Timestamp?                                          │
│ verified_by: UUID (FK -> User, admin)?                           │
│ documents_url: String? (identity verification)                   │
│ rejection_reason: String?                                        │
│ created_at: Timestamp                                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     SKILL_BADGE                                  │
├─────────────────────────────────────────────────────────────────┤
│ id: UUID                                                         │
│ skill_id: UUID (FK -> Skill)                                     │
│ badge_type: Enum (verified, featured, top_rated, staff_pick)     │
│ awarded_at: Timestamp                                            │
│ awarded_by: UUID (FK -> User, admin)?                            │
│ expires_at: Timestamp? (for featured/staff_pick)                 │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Entity Relationships

```
User ─────────────────┬──────────────────────────────────┐
  │                   │                                  │
  │ 1:N               │ 1:N                              │ N:1
  ▼                   ▼                                  ▼
Skill              Subscription                    Organization
  │                   │                                  │
  │ 1:N               │                                  │ 1:N
  ▼                   │                                  ▼
SkillVersion          │                            SeatLicense
  │                   │                                  │
  │                   │                                  │ 1:N
  │                   │                                  ▼
  │                   │                           SeatAssignment
  │                   │                                  │
  ▼                   ▼                                  ▼
  └─────────────> UsageEvent <───────────────────────────┘
                     ▲
                     │
                  Review
```

---

## 5. API Design

### 5.1 Authentication Endpoints

```
POST   /auth/oauth/github          # GitHub OAuth callback
POST   /auth/oauth/google          # Google OAuth callback
POST   /auth/saml/callback         # SAML SSO callback
POST   /auth/refresh               # Refresh JWT token
POST   /auth/logout                # Invalidate session
GET    /auth/me                    # Get current user
```

### 5.2 Catalog Endpoints

```
GET    /skills                     # List skills (paginated, filterable)
GET    /skills/:name               # Get skill details
GET    /skills/:name/versions      # List versions
GET    /skills/:name/reviews       # List reviews
POST   /skills/:name/reviews       # Create review
GET    /categories                 # List categories
GET    /search?q=<query>           # Full-text search
```

### 5.3 Publishing Endpoints (Creator)

```
POST   /publish                    # Upload new skill
PUT    /publish/:name              # Update skill metadata
POST   /publish/:name/versions     # Upload new version
DELETE /publish/:name              # Unpublish skill
GET    /my/skills                  # List creator's skills
GET    /my/skills/:name/stats      # Get skill analytics
```

### 5.4 License Endpoints

```
GET    /license/check/:skill       # Validate license for install
POST   /license/activate/:skill    # Activate license (record install)
POST   /license/deactivate/:skill  # Deactivate (uninstall)
```

### 5.5 Billing Endpoints

```
POST   /billing/subscribe/:skill   # Create subscription
DELETE /billing/subscribe/:skill   # Cancel subscription
GET    /billing/subscriptions      # List active subscriptions
POST   /billing/portal             # Stripe customer portal link
```

### 5.6 Team Endpoints (Enterprise)

```
GET    /orgs/:org                  # Get organization
GET    /orgs/:org/members          # List members
POST   /orgs/:org/seats/:skill     # Purchase seats
PUT    /orgs/:org/seats/:skill     # Modify seat count
POST   /orgs/:org/assign           # Assign seat to user
DELETE /orgs/:org/assign/:user     # Revoke seat
GET    /orgs/:org/usage            # Usage report
```

### 5.7 Analytics Endpoints

```
POST   /analytics/event            # Record usage event (from CLI)
GET    /analytics/skill/:name      # Creator analytics dashboard data
GET    /analytics/user             # User's usage history
```

### 5.8 Creator Dashboard Endpoints

```
GET    /dashboard/overview         # Summary stats
GET    /dashboard/earnings         # Revenue over time
GET    /dashboard/payouts          # Payout history
POST   /dashboard/payout-settings  # Configure Stripe Connect
```

### 5.9 Affiliate Endpoints

```
GET    /affiliate/code             # Get user's referral code
POST   /affiliate/code             # Create/regenerate referral code
GET    /affiliate/stats            # Referral stats (conversions, earnings)
GET    /affiliate/referrals        # List referred users
POST   /signup?ref=<code>          # Sign up with referral code
```

### 5.10 Verification Endpoints

```
# Publisher verification (user-facing)
POST   /verification/request       # Request publisher verification
GET    /verification/status        # Check verification status

# Admin endpoints
GET    /admin/verifications        # List pending verifications
PUT    /admin/verifications/:id    # Approve/reject verification
POST   /admin/skills/:id/badge     # Award badge to skill
DELETE /admin/skills/:id/badge/:type  # Remove badge from skill
GET    /admin/publishers           # List verified publishers
```

---

## 6. CLI Integration

### 6.1 New Commands

| Command | Description |
|---------|-------------|
| `osk login` | Authenticate with GitHub/Google OAuth |
| `osk logout` | Clear local credentials |
| `osk whoami` | Show current user |
| `osk publish` | Publish skill to marketplace |
| `osk publish --update` | Publish new version |
| `osk unpublish <skill>` | Remove from marketplace |
| `osk subscribe <skill>` | Subscribe to paid skill |
| `osk subscriptions` | List active subscriptions |
| `osk stats <skill>` | View usage stats (creator) |

### 6.2 Modified Commands

| Command | Changes |
|---------|---------|
| `osk install` | Add license check for paid skills |
| `osk update` | Check subscription status before updating |
| `osk search` | Search marketplace catalog |
| `osk browse` | Browse marketplace categories |

### 6.3 Authentication Flow (CLI)

```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│   CLI   │                    │  Server │                    │  OAuth  │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │  1. osk login                │                              │
     │ ─────────────────────────────>                              │
     │                              │                              │
     │  2. Return auth URL + code   │                              │
     │ <─────────────────────────────                              │
     │                              │                              │
     │  3. Open browser to auth URL │                              │
     │ ────────────────────────────────────────────────────────────>
     │                              │                              │
     │                              │  4. User authenticates       │
     │                              │ <─────────────────────────────
     │                              │                              │
     │  5. Poll for token           │                              │
     │ ─────────────────────────────>                              │
     │                              │                              │
     │  6. Return JWT + refresh     │                              │
     │ <─────────────────────────────                              │
     │                              │                              │
     │  7. Store in ~/.openskill/   │                              │
     │     credentials.json         │                              │
     │                              │                              │
```

### 6.4 License Validation Flow

```
┌─────────┐                    ┌─────────┐                    ┌─────────┐
│   CLI   │                    │  Server │                    │ Storage │
└────┬────┘                    └────┬────┘                    └────┬────┘
     │                              │                              │
     │  1. osk install <paid-skill> │                              │
     │ ─────────────────────────────>                              │
     │                              │                              │
     │  2. Check subscription       │                              │
     │ <─────────────────────────────                              │
     │                              │                              │
     │     [If no subscription]     │                              │
     │  3. Prompt: Subscribe? Y/N   │                              │
     │                              │                              │
     │     [If Y - open Stripe]     │                              │
     │  4. Create subscription      │                              │
     │ ─────────────────────────────>                              │
     │                              │                              │
     │  5. Subscription confirmed   │                              │
     │ <─────────────────────────────                              │
     │                              │                              │
     │  6. Request skill download   │                              │
     │ ─────────────────────────────>                              │
     │                              │                              │
     │                              │  7. Generate signed URL      │
     │                              │ ─────────────────────────────>
     │                              │                              │
     │  8. Return signed URL        │                              │
     │ <─────────────────────────────                              │
     │                              │                              │
     │  9. Download & install skill │                              │
     │ ────────────────────────────────────────────────────────────>
     │                              │                              │
     │  10. Record install event    │                              │
     │ ─────────────────────────────>                              │
     │                              │                              │
```

---

## 7. Skill Obfuscation Strategy

Since skills need to be readable by AI agents but protected from casual copying:

### 7.1 Approach: Structural Obfuscation

```
Original Skill:
---
name: api-helper
description: Helps build REST APIs
---
# API Helper Skill

When the user asks to create an API endpoint...
[detailed instructions]
```

```
Obfuscated Skill:
---
name: api-helper
description: Helps build REST APIs
license_key: sk_xxxx
signature: sha256:xxxx
---
# API Helper Skill

§encoded:base64§V2hlbiB0aGUgdXNlciBhc2tzIHRvIGNyZWF0ZSBhbiBBUEkgZW5kcG9pbnQuLi4=§/encoded§
```

### 7.2 How Agents Read It

- Skills include a "decoder" preamble that agents understand
- The base64/encoded sections are decoded at runtime
- Human-readable metadata (name, description) remains visible
- Core instructions are encoded but not encrypted

### 7.3 Limitations (Accepted Trade-offs)

- Determined users can decode (base64 is not encryption)
- Goal is to prevent casual copy-paste, not absolute protection
- Terms of service provide legal protection
- Focus on convenience and value, not DRM

---

## 8. Analytics Event Schema

### 8.1 Event Types

```typescript
type UsageEvent = {
  event_id: string;
  skill_id: string;
  skill_version: string;
  user_id: string;
  event_type: 'install' | 'uninstall' | 'invoke' | 'error';
  agent: 'claude' | 'codex' | 'cursor' | 'antigravity';
  timestamp: string; // ISO 8601
  metadata: {
    // For 'invoke'
    command?: string;
    duration_ms?: number;

    // For 'error'
    error_type?: string;
    error_message?: string;

    // Common
    os?: string;
    cli_version?: string;
  };
};
```

### 8.2 Privacy Considerations

- No code content is transmitted
- No file paths or project names
- User can opt-out of analytics (skill won't work without license check, but detailed usage is optional)
- Aggregated data only shown to creators

---

## 9. Tech Stack Recommendations

### 9.1 Backend

| Component | Technology | Rationale |
|-----------|------------|-----------|
| API | Node.js + Fastify | Fast, TypeScript, matches CLI |
| Database | PostgreSQL | Reliable, JSONB for flexibility |
| Cache | Redis | Sessions, rate limiting |
| Storage | Cloudflare R2 | S3-compatible, global CDN |
| Search | PostgreSQL FTS | MVP; Elasticsearch later |
| Queue | BullMQ (Redis) | Background jobs (payouts, emails) |

### 9.2 Frontend (Web)

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Framework | Next.js | SSR for SEO, React ecosystem |
| Styling | Tailwind CSS | Rapid development |
| State | React Query | Server state management |

### 9.3 Infrastructure

| Component | Technology | Rationale |
|-----------|------------|-----------|
| Hosting | Vercel (web) + Railway/Render (API) | Easy deployment |
| CDN | Cloudflare | Global, integrated with R2 |
| Monitoring | Sentry + Axiom | Errors + logs |
| CI/CD | GitHub Actions | Already using GitHub |

### 9.4 Third-Party Services

| Service | Purpose |
|---------|---------|
| Stripe | Payments, subscriptions, Connect payouts |
| Auth0 or WorkOS | SSO/SAML for enterprise |
| SendGrid/Resend | Transactional emails |
| Stripe Atlas | Business formation (if needed) |

---

## 10. MVP Scope

### 10.1 MVP Features (Phase 1)

**Must Have:**
- [ ] User authentication (GitHub OAuth)
- [ ] Skill publishing via CLI (`osk publish`)
- [ ] Skill catalog (web, basic search)
- [ ] Free skill installation (no changes needed)
- [ ] Paid skill subscription (individual)
- [ ] License validation on install
- [ ] Basic creator dashboard (earnings, installs)
- [ ] Stripe payments + payouts

**Won't Have (Phase 1):**
- Enterprise SSO/SAML
- Seat-based licensing
- Reviews/ratings
- Advanced analytics
- Categories/tags filtering

### 10.2 Phase 2 Features

- Google OAuth
- Reviews and ratings
- Skill categories and tags
- Advanced search filters
- Detailed analytics dashboard
- Email notifications

### 10.3 Phase 3 Features

- Enterprise SSO (SAML/OIDC)
- Seat-based licensing
- Team management dashboard
- Usage reports for admins
- Invoicing for enterprise
- API for integrations

---

## 11. Security Considerations

### 11.1 Authentication

- JWT tokens with short expiry (15 min)
- Refresh tokens stored securely (httpOnly cookies web, file CLI)
- Rate limiting on auth endpoints
- PKCE for OAuth flows

### 11.2 Skill Publishing

- Validate skill format before accepting
- Scan for malicious content (future: automated review)
- Publisher verification (email confirmed)
- Abuse reporting mechanism

### 11.3 Payment Security

- All payment handling via Stripe (PCI compliant)
- No card data stored
- Webhook signature verification
- Audit logs for all billing events

### 11.4 Data Protection

- Encrypt sensitive data at rest (credentials, SSO config)
- HTTPS everywhere
- Input validation on all endpoints
- SQL injection prevention (parameterized queries)

---

## 12. Monetization Model

### 12.1 Revenue Streams

1. **Platform Fee**: Percentage of each subscription
   - Default: 20% platform / 80% creator
   - Configurable per creator (for negotiations)

2. **Enterprise Plans**: Additional features for teams
   - SSO/SAML
   - Priority support
   - SLA guarantees

3. **Affiliate Program**: Referral rewards
   - Users earn commission for referring new subscribers
   - Tracked via referral codes/links
   - Payout included in monthly cycle

### 12.2 Subscription & Refund Policy

- **Prorated billing**: Users pay for the portion of the month they use
- **No free trials**: Skills are either free or paid (no trial period)
- **Cancellation**: Effective at end of billing period, prorated refund available
- **Chargebacks**: Handled via Stripe's dispute process

### 12.3 Creator Payouts

- Monthly payout cycle
- Minimum threshold: $25
- Via Stripe Connect
- Dashboard shows pending/completed payouts
- Affiliate commissions included

### 12.3 Pricing Examples

```
Individual Developer:
├── Free Skill: $0
├── Premium Skill: $5/month or $50/year
└── Multiple Skills: Subscribe to each individually

Enterprise (10 seats):
├── Skill A: $5/seat/month = $50/month
├── Skill B: $10/seat/month = $100/month
└── Volume discounts negotiable
```

---

## 13. Success Metrics

### 13.1 Platform Health

| Metric | Target (Year 1) |
|--------|-----------------|
| Registered users | 10,000 |
| Active creators | 100 |
| Published skills | 500 |
| Paid subscriptions | 1,000 |
| Monthly revenue | $10,000 |

### 13.2 Creator Success

| Metric | Target |
|--------|--------|
| Avg. earnings per creator | $100/month |
| Top creator earnings | $1,000/month |
| Creator retention (12 mo) | 60% |

### 13.3 User Satisfaction

| Metric | Target |
|--------|--------|
| Skill install success rate | 99% |
| Average skill rating | 4.0+ |
| Support ticket volume | < 50/month |

---

## 14. Decisions Made

| Question | Decision |
|----------|----------|
| Revenue share | 80% creator / 20% platform |
| Free trials | No - skills are either free or paid |
| Refund policy | Prorated subscriptions |
| Affiliate program | Yes - flat 5% commission (tiered support planned) |
| Skill verification | Yes - badge system for verified publishers/skills |
| Public API | Not for MVP - future consideration |
| Skill bundles | Future consideration |

## 15. Future Considerations

1. **Tiered affiliate rates**: Higher commission for top referrers
2. **Skill bundles**: Package multiple skills together
3. **Public API**: Third-party integrations
4. **Marketplace API**: Programmatic skill discovery

---

## 16. Next Steps

1. **Validate**: Share proposal with potential creators for feedback
2. **Prototype**: Build auth + publish flow as proof of concept
3. **Legal**: Terms of service, creator agreement, privacy policy
4. **Design**: UI mockups for web catalog and dashboard
5. **Develop**: MVP implementation

---

*Document Version: 1.0*
*Created: 2026-01-19*
