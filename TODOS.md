# TODOS

## P1

### Set production serverUrl default
- **What:** Update DEFAULT_CONFIG.serverUrl in config.ts to production URL
- **Why:** Shipping blocker. Currently defaults to http://localhost:3000. Every new user's marketplace features silently fail without explicit config.
- **Effort:** S (5 min)
- **Blocked by:** Production server deployment

## P2

### S3 orphan cleanup job (server-side)
- **What:** Add a cron job or S3 lifecycle rule to delete unfinalized uploads after 24h
- **Why:** When push init succeeds but completePublish fails, uploaded S3 objects are orphaned. Prevents storage cost accumulation.
- **Effort:** S (CC: ~20 min)
- **Blocked by:** Nothing

### Download file size limit
- **What:** Check Content-Length or metadata.fileSize before downloading, reject if > 10MB
- **Why:** downloadFromPresignedUrl reads entire response into memory. A malicious presigned URL could OOM the CLI.
- **Effort:** S (CC: ~10 min)
- **Blocked by:** Nothing

## P3

### Update docs for 4 runtime dependencies
- **What:** Update CLAUDE.md and README to say 4 runtime deps (commander, gray-matter, @inquirer/prompts, tar) instead of 3
- **Why:** Accuracy. The tar package was added but docs still say "3 runtime dependencies."
- **Effort:** S (5 min)
- **Blocked by:** Nothing
