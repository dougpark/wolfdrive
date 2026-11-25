# Status Server
- Implemented: [setup and reporting examples](#running-the-implemented-version). Fixed-interval schedules are available; cron/timezones, notifications, and a persistent producer outbox remain follow-ups.
- Proposed design: see [Universal status-server design](#universal-status-server-design) below. It supersedes the simplified API and database sketch in the original discussion.
- the goal is to create a reliable status tracking system for scheduled jobs, ensuring that each job reports its lifecycle events (start, success, failure) to a central server, which can then be monitored via a dashboard.

## Database
- jobs: stores metadata about each scheduled job (id, name, expected interval, last run times, status)
- job_runs: stores individual run records for each job (start time, finish time, exit code, output)

## Admin UI
- manage jobs

## Status UI
- view job statuses and recent runs

## API Endpoints
- job status updates (start, complete, fail)

# Original Goal
I have a bun vue project running locally on my ubuntu linux box. It scans a few local folders and shows and plays documents and media files. I call it the Wolf project because of the cool logo. I want to add a local status screen where all my other services can send it log updates, for example my nightly rsync bash file that backs up the linux box to my nas. I want to be able to glance at a status screen and see that everything is working and on schedule as expected. What is a good design to add to the Wolf project? I could issue a curl command and hit a new Wolf api with status updates? Or is there a standard for such status and log updates thats not some large enterprise solution?


# Discussion
Hitting a custom Wolf API endpoint with curl is not just a good approach—it is the cleanest, lowest-friction pattern for a local Bun + Vue stack. In infrastructure design, this is known as the Heartbeat (or Dead Man’s Switch) pattern: instead of your dashboard actively polling services and guessing if a batch script ran, each script reports its own lifecycle (start, success, fail) when it executes.
There are lightweight open standards for log shipping—such as Syslog (RFC 5424) over UDP/Unix sockets or NDJSON (Newline Delimited JSON)—but building a tiny HTTP/JSON ingestion endpoint directly into your Bun backend gives you structured schedule tracking out of the box without parsing raw syslog streams.
1. Storage Layer (bun:sqlite)
Since you are already running Bun, use its built-in bun:sqlite module. It requires zero external dependencies, survives Ubuntu reboots, and easily handles thousands of log entries.
Two tables will cover everything you need:
CREATE TABLE jobs (
  id TEXT PRIMARY KEY,               -- e.g., 'nas-rsync-backup'
  name TEXT NOT NULL,                -- e.g., 'Nightly NAS Backup'
  expected_interval_sec INTEGER,     -- e.g., 86400 (24h) + grace period
  status TEXT DEFAULT 'pending',     -- 'ok', 'running', 'error', 'late'
  last_started_at INTEGER,
  last_finished_at INTEGER,
  last_duration_ms INTEGER
);

CREATE TABLE job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  exit_code INTEGER,
  output TEXT,                       -- stdout/stderr snippet
  FOREIGN KEY(job_id) REFERENCES jobs(id)
);

2. Wolf Backend API (Bun)
Expose a lightweight REST interface on your existing Bun server:
• POST /api/status/:jobId/start: Marks the job as running, records last_started_at, and resets any previous error state.
• POST /api/status/:jobId/complete: Accepts a JSON body { "exitCode": 0, "output": "..." }. Updates status to ok (if exitCode === 0) or error, calculates duration, and saves the log output to job_runs.
• GET /api/status: Returns all rows from jobs along with their latest 5 job_runs for the Vue dashboard.
Schedule Watchdog: Add a 60-second setInterval loop in Bun that compares Date.now() against last_finished_at + expected_interval_sec. If a nightly backup hasn't checked in on time, Bun flips its status to late automatically.
3. Bash & rsync Integration Pattern
To make your Ubuntu scripts reliable, wrap your curl calls using a Bash EXIT trap. This guarantees that if rsync crashes, loses connection to the NAS, or throws a permission error, Wolf still gets notified with the exact exit code and tail of the log.
#!/usr/bin/env bash
set -euo pipefail

WOLF_URL="http://localhost:3000/api/status/nas-rsync-backup"
LOG_FILE="/tmp/wolf_rsync.log"

# 1. Notify Wolf that the job started
curl -fsS -X POST "$WOLF_URL/start" > /dev/null || true

# 2. Trap script exit (success or failure) and report back
report_status() {
  EXIT_CODE=$?
  # Grab the last 50 lines of output and JSON-escape them using jq or python3
  TAIL_LOG=$(tail -n 50 "$LOG_FILE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')
  
  curl -fsS -X POST "$WOLF_URL/complete" \
    -H "Content-Type: application/json" \
    -d "{\"exitCode\": $EXIT_CODE, \"output\": $TAIL_LOG}" > /dev/null || true
}
trap report_status EXIT

# 3. Run your actual backup task
rsync -avh --delete /srv/media/ /mnt/nas/backup/ > "$LOG_FILE" 2>&1

(Note the || true on the curl commands—if the Wolf server itself is down for maintenance, your backup script will still run without failing.)
4. Vue Status Screen Design
Keep the UI optimized for a quick visual scan alongside your media/document views:
• Global Health Header: A single high-contrast banner at the top (All 4 Services Healthy in green, or 1 Service Late / Error in amber/red) so you know the state of your box in under a second.
• Service Grid / Table: One card or row per job showing: • Status Pill: Color-coded (OK, RUNNING with a subtle pulse, LATE, ERROR). • Relative Timestamps: "Last ran 6 hours ago" and "Next expected in 18 hours" (derived from expected_interval_sec). • Duration Trend: "Took 4m 12s"—useful for spotting when an rsync job suddenly takes 10x longer than usual or finishes suspiciously fast (e.g., if the NAS share unmounted).
• Log Drawer: Clicking any row opens a monospace terminal drawer displaying the captured output from job_runs so you never have to SSH into the box just to read /tmp logs.
• Live Updates: Have the Vue view poll GET /api/status every 10–15 seconds while the tab is active, or push state changes over a Server-Sent Events (GET /api/status/stream) connection from Bun.
Would you like to sketch out the exact Bun route handlers and bun:sqlite initialization code to drop straight into your project, or focus on the Vue component layout first?

---

# Universal status-server design

## Recommendation and scope

Add a Status section to WolfDrive using its existing Bun/Hono backend, Vue frontend, and Drizzle over Bun SQLite. No separate database, message broker, agent, or container is needed for the first version.

Use a small, versioned HTTP/JSON reporting contract. Any producer that can issue an HTTP request can participate: Bash scripts, cron, systemd timers, Docker jobs, backup tools, importers, and long-running services. This is a WolfDrive contract, not an industry-standard job-status protocol. Optional adapters can translate other formats later.

"Universal" means a stable envelope with optional progress, metrics, and arbitrary bounded JSON metadata. Do not require every producer to report an exit code, percentage, schedule, or even a start event.

WolfDrive observes jobs; it does not schedule, execute, cancel, or retry them. Job health does not establish that the backup contents or other outputs are correct: producers must perform their own verification before reporting success.

## Identity and monitoring modes

- **Job:** a registered logical task with a stable ID, such as `nas-backup`.
- **Run:** one execution, identified by a producer-generated UUID. Generate it before reporting so completion can still be correlated when the start request fails.
- **Event:** one immutable report, identified by a producer-generated UUID. Reuse that ID and the identical payload when retrying delivery.
- **Source:** informational host/service identity. Authorization comes from a scoped token, not the claimed source name.

Register jobs through the admin UI, not implicitly through event ingestion. This catches typos and prevents arbitrary clients from creating jobs.

| Monitoring mode | Examples | Expected reports |
| --- | --- | --- |
| Manual | One-off export, maintenance | Optional start, optional updates, terminal outcome |
| Scheduled | Nightly backup, hourly sync | Runs plus an expected start schedule |
| Heartbeat | Docker service, daemon, sensor check | Periodic heartbeat with explicit health; no run required |

A scheduled job may also send in-run heartbeats. Configure heartbeat expiry for active runs separately from service heartbeat monitoring.

## Keep outcomes and monitoring health separate

Store normalized run outcomes: `running`, `succeeded`, `failed`, `cancelled`, `skipped`. Keep producer-specific detail in `rawStatus` and metadata, rather than letting arbitrary strings drive dashboard logic.

Derive monitoring conditions separately:

- **Unknown:** nothing has reported yet.
- **Late:** an expected scheduled start was missed beyond its grace period.
- **Stale:** a required service or active-run heartbeat expired.
- **Overdue:** an active run exceeded its configured maximum runtime.
- **Reported unhealthy:** a service heartbeat explicitly reports a problem.
- **Paused:** monitoring is intentionally suspended; still accept and retain reports.

Return conditions as a list rather than overwriting the last run's outcome. The UI should be able to show "Running; last run failed" or "Last run succeeded; next run late." Starting a new run does not clear a previous failure.

For overlapping runs, show an active-run count and the most recently started completed run's outcome. An older run completing late must not overwrite a newer run's result.

## Event ingestion contract

`POST /api/status/v1/jobs/:jobId/events`

Authorization: `Authorization: Bearer <job-scoped-token>`.

Example progress event:

```json
{
  "eventId": "383885f7-c8bb-492e-832e-cf390d38f1b8",
  "runId": "6ff91b07-3583-414e-aeb7-0f17d6326459",
  "sequence": 2,
  "type": "progress",
  "occurredAt": "2026-11-21T17:40:00Z",
  "source": "ubuntu-server",
  "message": "Copying media to NAS",
  "progress": {
    "current": 420,
    "total": 1000,
    "unit": "files"
  },
  "metrics": {
    "bytesCopied": { "value": 123456789, "unit": "bytes" }
  },
  "metadata": {
    "tool": "rsync",
    "destination": "nas"
  }
}
```

| Type | Meaning |
| --- | --- |
| `started` | Begin a run |
| `progress` | Update optional progress, message, or metrics |
| `log` | Append a bounded log chunk with optional severity |
| `heartbeat` | Report liveness; optionally include `health: healthy \| degraded \| unhealthy` |
| `completed` | Finish a run with `outcome: succeeded \| failed \| cancelled \| skipped` |

Contract rules:

- Require `eventId` and `type`. Require `runId` for every event except a service-level heartbeat.
- `completed` requires an outcome; `exitCode` is optional evidence, not the universal definition of success. A producer can map tool-specific exit codes to a warning or failure and include `rawStatus`.
- All optional fields are validated when present. Progress values must be finite and nonnegative; if supplied, total must be positive and at least current. Omit total for indeterminate progress. Metric values must be finite.
- Store both optional producer `occurredAt` and mandatory server `receivedAt`. Use server receipt time for liveness deadlines. Validate timestamps and expose clock discrepancies; do not trust arbitrary producer timestamps to extend health.
- Require increasing nonnegative `sequence` for run events; service-level heartbeats do not use this run sequence. Serialize reporting within a run. Retrying an event reuses its sequence.
- Missing start is allowed: create a partial run from progress or completion, mark its start unknown, and leave duration unknown rather than inventing a start time.
- Once completed, a run never returns to running. Delayed earlier events may fill history and missing start information, but must not replace newer progress or terminal state.
- Enforce uniqueness on event IDs within a job and sequences within a run. An identical retry is a no-op. Reusing either identity with different content returns `409`; conflicting terminal outcomes also return `409`.
- Persist the event and update the run projection in one database transaction. Respond only after commit: `201` for a new event, `200` with `duplicate: true` for an identical retry.
- Return explicit errors: `400` invalid payload, `401/403` authentication/authorization failure, `404` unknown job, `409` conflict, `413` oversized payload, `429` rate limit, `503` temporary storage unavailability. Do not return success for dropped events.

Suggested initial limits: 64 KiB per request, 16 KiB per log chunk, and 16 KiB combined metadata/metrics. Bound JSON depth, field count, and string lengths. Apply per-token rate limits with a burst allowance; expose `Retry-After` on `429`.

## Schedule and timeout semantics

Configure each job with one of:

- No expected schedule, for manual jobs.
- A fixed interval anchored to an explicit initial due time, for simple periodic jobs.
- A cron expression plus an IANA timezone, for calendar jobs such as "02:00 America/Chicago."

Track expected **starts**, not `last_finished_at + interval`. Completion-based scheduling drifts and cannot distinguish a missing start from a slow run.

Persist the schedule anchor and monitoring activation time. Derive due occurrences, grace expiry, and missed-start conditions from stored run evidence, including after a WolfDrive restart. A later run does not erase a historical missed occurrence. Scheduled producers should include `scheduledFor` so retries and overlapping runs can be tied to the same occurrence; without it, assign at most one occurrence using an explicit documented matching window.

For cron, use a timezone-aware parser; do not implement cron parsing by hand. Document daylight-saving behavior and use the same evaluator for the preview and watchdog.

Maximum runtime and heartbeat expiry are independent, optional policies. An overdue or stale run remains unresolved until the producer reports completion; WolfDrive must not fabricate an exit code or declare the underlying process dead.

Recompute current conditions on reads and in a lightweight periodic sweep. A sweep is for persisted monitoring transitions/history and later notifications, not the sole source of truth. For service heartbeats, reject reports outside a configured freshness window or clearly label delayed replay so buffered old heartbeats cannot make a dead service look healthy.

## Persistence

Define all tables in `src/db/schema.ts`; use the singleton in `src/db/index.ts` and Drizzle query builders. Generate migrations with `bunx drizzle-kit generate`, and apply locally with `bun run db:migrate` during implementation.

Start with three tables:

| Table | Contents |
| --- | --- |
| `statusJobs` | Stable ID, display name, description, tags, monitoring mode, schedule/timezone/anchor, grace/runtime/heartbeat policies, pause state, hashed reporting token |
| `statusRuns` | Job ID + run UUID, source, scheduled occurrence, known start/finish times, outcome, exit code, latest sequence/progress/metrics/message |
| `statusEvents` | Job ID + event UUID, optional run UUID/sequence, type, producer/server timestamps, validated payload |

Add indexes for runs by job/start time, events by job/receipt time, and events by run/sequence. Enforce the identity constraints above in the database, not just application checks.

Keep events as bounded history and runs as efficient read projections. Proposed default: 30 days of event/log detail and 365 days of run summaries; retain active runs and current health evidence regardless of age. Publish the deduplication retention window: retries beyond retained event history must not recreate old executions or alter current health. Return an explicit expired-event error when the delivery-age limit is exceeded.

Document disk-budget controls and display ingestion/storage failures. This is not a replacement for unlimited centralized logs; producers retain full logs locally and send selected chunks or summaries.

## Read/admin APIs and dashboard

- `GET /api/status/v1/jobs`: paginated/filterable summaries, active runs, last outcome, condition list, last seen, next expected start, and server `evaluatedAt`.
- `GET /api/status/v1/jobs/:jobId/runs`: paginated run history.
- `GET /api/status/v1/jobs/:jobId/runs/:runId`: run detail and paginated events/logs.
- Admin-only create/update/pause/archive job operations and token rotation. Monitoring policies must not be writable with reporting tokens.

Start with polling every 10-15 seconds while the Status view is visible; add server-sent events only if needed. Derive deadlines on the server, not separately in the browser.

Dashboard:

- Summary: jobs needing attention, active runs, unknown jobs, and paused jobs. Unknown is not healthy.
- Job list: name, source/tags, current conditions, last outcome, last success, next expected start, duration, and optional progress.
- Sort attention items first; filter by host/tag/mode/condition.
- Detail panel: run timeline, messages, metrics with units, and plain-text logs.
- Display "WolfDrive unreachable" and the last refresh time when polling fails; never leave stale green results looking current.

Use existing UI primitives under `src/components/ui`, Vue Composition API, and the existing design tokens. Show text/icons as well as color; do not introduce new palette values. Locate existing card/modal equivalents before implementing the detail panel.

## Producer integration and reliability

Provide one small Bash helper/wrapper first, then a short HTTP contract for other languages. The helper generates run/event UUIDs, increments sequence, JSON-encodes payloads using `jq`, and reports start/completion using an `EXIT` trap installed before work begins.

Example completion request for an already registered job:

```bash
curl --fail-with-body --silent --show-error \
  --connect-timeout 2 --max-time 5 \
  -X POST "${WOLF_URL}/api/status/v1/jobs/nas-backup/events" \
  -H "Authorization: Bearer ${WOLF_STATUS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @completion.json
```

The wrapper, not hand-built shell string interpolation, creates `completion.json` with `eventId`, `runId`, `sequence`, `type: completed`, `outcome`, and optional log summary.

Reporting must not prevent the underlying backup/task from running or change its exit code. Preserve the task's exit status, bound curl timeouts, and write reporting failures explicitly to stderr or journald. Do not silently swallow failures with `|| true`.

Use per-run temporary logs, not a shared `/tmp` filename. Preserve full logs locally; send only bounded/redacted excerpts. An `EXIT` trap cannot report a power loss or `SIGKILL`; missing schedules, runtime limits, and heartbeat expiry cover that uncertainty.

Retry transient network errors and `429/5xx` with bounded backoff and unchanged event IDs. Do not retry malformed requests or authorization errors indefinitely. A persistent, size-limited outbox can be a later feature; replay needs explicit delivery-age/freshness rules and must not silently drop queued failures.

## Local deployment and access

Keep the reporting endpoint LAN-only with firewall rules and no public port forwarding. Use HTTPS when tokens cross the network; a trusted LAN is not a substitute for protecting bearer credentials. Store tokens in protected environment files, never source control or logs. Admin, general read, and reporting tokens must not appear in query strings; the limited kiosk dashboard token is the explicit exception described below.

The existing backend's hardcoded default user context is not authentication. Before enabling job management or exposing status history beyond a trusted localhost deployment, add explicit admin/read authorization and separate it from job-scoped write-only reporting tokens.

Render logs as text, never HTML. Do not fetch producer-supplied URLs or execute uploaded commands. Strip secrets at the producer and restrict log visibility.

Keep monitoring transitions suppressed during an explicit maintenance window without erasing history. Display WolfDrive ingestion health itself: database write failures, rejected events, and last successful refresh. WolfDrive cannot reliably alert about its own host being powered off; that needs an independent observer if required.

## Implementation order and acceptance criteria

1. Event validation, three-table schema/migration, scoped token ingestion, transactions, and focused API tests.
2. Read APIs and dashboard with polling, error states, unknown/paused states, and run/log detail.
3. Bash helper plus fixed-interval monitoring, active-run expiry, and retention.
4. Cron/timezone support when needed; then optional notifications, adapters, or persistent delivery.

Verify before calling the first version complete:

- Bash backup, manual completion-only task, and service heartbeat all appear without job-specific backend logic.
- A successful outcome with optional warning metadata does not require exit code zero.
- Identical retry creates no duplicate run/event; conflicting identity returns `409`.
- Delayed start cannot reopen a completed run; overlapping runs remain distinct.
- Missing start leaves duration unknown; a new running job does not hide the last failure.
- Missed schedule, stale heartbeat, and overdue runtime are separate conditions and survive restart.
- Unknown and paused jobs are not counted as healthy; dashboard disconnection is visible.
- Oversized/invalid payloads and unauthorized cross-job writes fail explicitly.
- Reporting failure does not change the underlying job's exit code.
- Retention preserves active/current monitoring evidence and enforces the documented retry window.

## Running the implemented version

### Server setup

1. Apply migrations with `bun run db:migrate`.
2. Generate a random credential locally, for example `bun -e 'console.log(crypto.randomUUID() + crypto.randomUUID())'`. Put it in your protected, untracked `.env` as `STATUS_ADMIN_TOKEN`. It must be at least 32 characters. Optionally set a separate `STATUS_READ_TOKEN` (also at least 32 characters).
3. Build with `bun run build`, then start with `bun run start` (or restart your Docker deployment). Docker Compose forwards both variables from the host environment / `.env`; empty admin configuration disables dashboard/admin access.
4. Open **Homelab Status** in the sidebar (`/status`). Enter the admin token to register jobs, or the read token to view them. The browser remembers the token in this site's `localStorage` across navigation, reloads, and browser restarts, and automatically reconnects. **Lock** removes the saved token. Only use this on trusted browsers; scripts running on the same origin can access local storage. If browser storage is blocked, a visible warning explains that the token cannot be remembered.
5. Register a job with a stable ID. Save its reporting token immediately; it is shown once and only its SHA-256 hash is stored.

No production credentials are generated or written by migrations. The feature protects its own routes; it does not retrofit authentication to unrelated WolfDrive routes.

Keep the server on localhost or a firewalled LAN, use HTTPS when credentials cross the network, and do not expose this interface publicly.

### Job configuration

- **Manual:** no deadlines. Unknown until the first report.
- **Scheduled:** choose the first expected start using the local date-and-time picker; its timezone is your browser's timezone, displayed beneath the field. For a nightly backup, select tomorrow at 2:00 AM and use an interval of `86400`. The API still uses positive `intervalSeconds`, millisecond Unix `anchorAt`, and `graceSeconds` (default 300). Existing anchors display in local time and remain unchanged when saving unrelated edits. Invalid/nonexistent daylight-saving times are rejected; a newly selected repeated local hour uses its earlier occurrence. Intervals are elapsed time, not timezone-aware calendar scheduling, so a 24-hour interval does not stay at the same local hour through daylight-saving changes. Manual runs do not reset the schedule.
- **Heartbeat:** positive `heartbeatSeconds`; service reports must include a fresh `occurredAt`. An explicit `health: healthy` is required to establish healthy service status.
- Optional `maxRuntimeSeconds` and active-run `heartbeatSeconds` track unresolved executions.
- Maximum runtime is a warning, not automatic failure: overdue runs remain active until a producer reports completion or an administrator marks them failed. Leave it blank for jobs that legitimately run indefinitely.
- Pause/archive suppress attention conditions while keeping reports and history. Resuming uses the original schedule: missed occurrences during a pause can become visible again. Change the anchor/schedule to start a new monitoring epoch if maintenance should establish a fresh baseline.

Without `scheduledFor`, a start matches the interval slot containing its producer timestamp (or server receipt time when absent): `[due, due + interval)`. With `scheduledFor`, it matches that exact due occurrence. Multiple runs/retries for the same occurrence satisfy it only once. Completion-only runs retain an unknown start/duration and do not satisfy an expected start.

Historical missed starts remain visible until the schedule changes; a later successful run does not erase them. Schedule edits preserve run history but reset the current epoch's missed-start accounting.

### Bash jobs

The wrapper requires Bash, `curl`, and `jq` on the producer's Linux host. It is not necessary to install Bun on producers.

```bash
export WOLF_URL="http://127.0.0.1:3005"
# Load WOLF_STATUS_TOKEN from a protected environment file.
bash scripts/wolf-status-run.sh nas-backup /path/to/your-existing-backup.sh
```

For a separate host, copy `scripts/wolf-status-run.sh` there and use your HTTPS/LAN WolfDrive URL. In cron/systemd, use absolute paths and explicitly load the protected environment.

The wrapper preserves the command's exit code, reports start/completion, and retries delivery up to three times for network errors or `429/5xx`. Each attempt has a two-second connection timeout and five-second total timeout; retry delays are one and two seconds. Rejected reporting does not stop the task and is printed to stderr.

Full output is captured to a private per-run log under `~/.local/state/wolfdrive-status` (or `WOLF_STATUS_LOG_DIR`), then printed after the command completes. Rotate these producer-side logs using your normal log-management tooling; the server cannot rotate remote files.

Log shipping is **off by default** to avoid accidentally sending secrets. Set `WOLF_STATUS_SEND_LOGS=1` only for safe task output; this sends the last 8 KiB as a log event. Set `WOLF_STATUS_SCHEDULED_FOR` to the intended due ISO timestamp when retrying a particular scheduled occurrence.

The wrapper maps zero exit code to success and nonzero to failure. Tools with special success/warning exit codes should perform that mapping in their existing script or report directly through the API. Automatic in-run heartbeats/progress are not emitted by this minimal wrapper; do not configure an active-run heartbeat deadline unless your task actually sends heartbeats.

### Direct HTTP reporting

Every event has a UUID `eventId`; every run has a UUID `runId` and a nonnegative increasing `sequence`. Producers can omit start and report just a completion. Custom information belongs in `metadata`; arbitrary outcomes must be normalized, with the original value in `rawStatus`.

```json
{
  "eventId": "383885f7-c8bb-492e-832e-cf390d38f1b8",
  "runId": "6ff91b07-3583-414e-aeb7-0f17d6326459",
  "sequence": 0,
  "type": "completed",
  "outcome": "succeeded",
  "message": "Import verified",
  "metadata": { "records": 42, "warnings": [] }
}
```

Save the payload as `event.json` and send:

```bash
curl --fail-with-body --silent --show-error --connect-timeout 2 --max-time 5 \
  -X POST "${WOLF_URL}/api/status/v1/jobs/import/events" \
  -H "Authorization: Bearer ${WOLF_STATUS_TOKEN}" \
  -H "Content-Type: application/json" --data-binary @event.json
```

For service monitoring, send `{"eventId":"<new UUID>","type":"heartbeat","occurredAt":"<current ISO timestamp>","health":"healthy"}` without a run ID. Optional messages, source, metrics, and metadata appear in the service detail panel.

Accepted new events return `201`; identical retries return `200` with `duplicate: true`. Only one terminal event is allowed per run: retry that same event rather than sending a second completion. Delayed lower-sequence events are stored without regressing progress or reopening completion.

New timestamped events and explicit scheduled start occurrences older than 24 hours return `410`; timestamps more than five minutes ahead return `400`. Service heartbeat freshness is the smaller of five minutes and its expiry interval. Run heartbeats older than their expiry interval return `410`. Non-heartbeat events may omit timestamps, but then their actual delivery age cannot be determined.

### APIs, retention, and limits

All endpoints are under `/api/status/v1`. Event ingestion accepts only the job's reporting token. Reads accept admin/read tokens; management accepts only the admin token.

- `GET /jobs?search=&mode=&condition=&archived=false&limit=50&offset=0`
- `POST /jobs/:jobId`: register with job configuration; returns reporting token.
- `PUT /jobs/:jobId`: replace job configuration.
- `PATCH /jobs/:jobId`: boolean `paused` / `archived` fields.
- `POST /jobs/:jobId/token`: rotate reporting token, immediately invalidating the old one.
- `POST /jobs/:jobId/events`: report lifecycle/progress/log/heartbeat.
- `GET /jobs/:jobId/runs?limit=20&offset=0`
- `GET /jobs/:jobId/runs/:runId?limit=50&offset=0`: run plus event page.
- `POST /jobs/:jobId/runs/:runId/fail`: admin-only manual failure with `{ "reason": "Interrupted during restart" }`.

### Closing interrupted runs

If a task stops without reporting completion (for example a reboot, forced termination, or interrupted script), its run remains active. A later execution gets a different run ID and does not close the old record.

In **Homelab Status**, each active run now shows its start time and run ID with a **Mark failed** button. The same action is available in run history and the run timeline. Confirm that the underlying task has stopped, supply a reason, and choose **Confirm failed**. Only that run is closed; other active/completed runs and the original start/history remain unchanged.

The server records an audited completion event with `outcome: failed`, `rawStatus: manually_failed`, and the administrator's reason. Its finish time means when the record was resolved, not when the unknown underlying interruption happened. No process is killed and no exit code is invented. Producer liveness/last-seen time is not refreshed by this action. A run already completed returns `409` rather than having its outcome overwritten; later producer completion reports for a manually closed run also return `409`.

For long-running tasks, leave maximum runtime blank or choose a generously sized per-job warning threshold. There is no automatic timeout-to-failure in this version; this avoids declaring healthy long work failed. Existing `overdue`/`stale` warnings help identify runs to inspect and resolve manually.

Pagination accepts limits 1-100. Reporting has a 120-request burst with two requests/second refill per job, a 64 KiB request maximum, 16 KiB log maximum, and 16 KiB combined metrics/metadata maximum. JSON nesting/field counts and string sizes are bounded.

A sweep runs every minute and on dashboard reads. Payload/log details expire after 30 days, except the latest service heartbeat. Completed summaries expire after 365 days, except the latest completed run and last successful run; active runs remain. Historical schedule matches survive summary pruning.

**Deduplication trade-off:** compact event identity/hash/sequence tombstones remain indefinitely, even after payloads and runs expire. This makes retries safe even when timestamps were omitted. An identical old event remains a no-op; a new event for a pruned run returns `410`. This is not a hard total-disk bound: monitor SQLite size, control producer event frequency, and back up the database. Tombstone deletion / configurable disk budgets require a stricter producer timestamp contract and are not implemented yet.

The dashboard polls every 15 seconds while visible. Run timelines have explicit refresh controls. Polling failures visibly mark displayed data stale. Ingestion rejection/storage counters are since server start, not persisted lifetime totals.

Run focused verification with `bun test src/services/statusServer.test.ts` and build with `bun run build`.

### Deferred features

Cron/IANA timezone schedules, notifications, SSE, persistent producer outboxes, configurable retention/disk budgets, and persisted monitoring-transition history are not part of this version. Current conditions are recomputed from durable job/run evidence after restart; the periodic sweep handles retention, not fabricated process outcomes.

## Raspberry Pi / kiosk dashboard

Open `/dashboard?token=YOUR_DASHBOARD_TOKEN` for a full-width, full-height display without the sidebar, login form, or keyboard controls. It opens in dark mode, including the initial page paint, without changing WolfDrive's saved theme preference; leaving the dashboard restores that preference. The first horizontal card lists job status, one line per job; additional cards can be added below it later.

### Setup

1. Generate a short random read credential locally:
   ```bash
   bun -e 'import { randomBytes } from "node:crypto"; console.log(randomBytes(9).toString("base64url"))'
   ```
2. Save it as `STATUS_DASHBOARD_TOKEN` in your protected `.env` or server environment. The minimum length is 12 characters. It must differ from `STATUS_ADMIN_TOKEN` and `STATUS_READ_TOKEN`. Docker Compose forwards it into the container; restart/redeploy after changing it.
3. In **Homelab Status**, edit each desired job and add `dashboard` to its comma-separated tags. Only exact tags match, ignoring case and surrounding whitespace; names/descriptions containing the word do not qualify. Archived jobs are excluded.
4. Configure the Raspberry Pi's kiosk browser to open, for example:
   ```text
   https://YOUR_WOLFDRIVE_HOST/dashboard?token=YOUR_DASHBOARD_TOKEN
   ```
   Tap the small fullscreen icon in the dashboard header to enter or exit browser fullscreen. Its icon updates when fullscreen changes, including Escape. Fullscreen requires a click/tap and browser support; denied or unsupported requests display an error. Chromium's kiosk mode remains an alternative for an always-on display without browser chrome. The page itself fills the viewport and scrolls vertically if the job list grows.

The dashboard refreshes automatically every 30 seconds while visible, immediately on opening, and when a hidden tab becomes visible. Rows show a green check for jobs on track, a red X for jobs needing attention (including unknown status), and a neutral pause icon for paused jobs. Each row includes the display name and a concise last-run time/result, with running or monitoring conditions appended. Service heartbeat jobs show the last-seen time and reported health.

When a refresh fails, a prominent warning marks cached data stale; cached rows no longer show green OK icons. The last successful update remains visible, and later successful refreshes recover automatically.

### Limited URL access

The URL credential grants **only** `GET /api/status/v1/dashboard`, which returns minimal summaries for dashboard-tagged jobs. It cannot manage jobs, submit events, read logs, or list untagged jobs. The browser sends it in an Authorization header when fetching summaries; it is not placed in API query strings or loaded from the saved Status admin token. Dashboard page/API responses disable caching and referrer forwarding in production.

This URL is a bearer credential and may remain in browser history, kiosk configuration, screenshots, or reverse-proxy access logs. Keep it on a trusted firewalled LAN, prefer HTTPS, and configure any proxy to avoid logging token query strings. Rotate access by changing `STATUS_DASHBOARD_TOKEN` and updating the kiosk URL. Never use an admin/reporting token in the dashboard URL.

Verify with `bun test src/services/statusServer.test.ts src/composables/useDashboard.test.ts` and `bun run build`.