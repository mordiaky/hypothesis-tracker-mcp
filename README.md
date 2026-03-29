# Hypothesis Tracker MCP

An MCP server that gives AI agents a persistent scientific method. Track hypotheses, accumulate evidence, and update confidence via Bayesian logic — across sessions.

Instead of agents forming implicit hypotheses in their context window and forgetting them, this server provides structured, persistent investigation with a full audit trail.

## Install

### npx (recommended)

No install needed — just add to your MCP client config:

```json
{
  "mcpServers": {
    "hypothesis-tracker": {
      "command": "npx",
      "args": ["-y", "hypothesis-tracker-mcp"]
    }
  }
}
```

### Global install

```bash
npm install -g hypothesis-tracker-mcp
```

Then add to your MCP config:

```json
{
  "mcpServers": {
    "hypothesis-tracker": {
      "command": "hypothesis-tracker-mcp"
    }
  }
}
```

### Claude Code

Add globally for all projects:

```bash
claude mcp add --scope global hypothesis-tracker -- npx -y hypothesis-tracker-mcp
```

Or add to `~/.claude/.mcp.json`:

```json
{
  "mcpServers": {
    "hypothesis-tracker": {
      "command": "npx",
      "args": ["-y", "hypothesis-tracker-mcp"]
    }
  }
}
```

## Data Storage

All data is stored locally in `~/.hypothesis-tracker/data.db` (SQLite with WAL mode). Nothing leaves your machine.

## Tools

### `hypothesis_create`

Create a new hypothesis with an initial confidence level.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `title` | string | yes | Title of the hypothesis |
| `description` | string | yes | Detailed description |
| `initial_confidence` | number (0-1) | yes | Starting confidence level |
| `tags` | string[] | no | Tags for categorization |
| `context` | string | no | Why this hypothesis was formed |

### `hypothesis_add_evidence`

Add evidence to a hypothesis. Automatically updates confidence using Bayesian logic.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hypothesis_id` | string | yes | ID of the hypothesis |
| `type` | `"supporting"` \| `"contradicting"` \| `"neutral"` | yes | Evidence type |
| `description` | string | yes | Description of the evidence |
| `weight` | number (0-1) | no | Strength of the evidence (default: 0.5) |
| `source` | string | no | Source of the evidence |

### `hypothesis_update`

Manually update hypothesis fields.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hypothesis_id` | string | yes | ID of the hypothesis |
| `confidence` | number (0-1) | no | New confidence level |
| `description` | string | no | Updated description |
| `tags` | string[] | no | Updated tags |

### `hypothesis_list`

List hypotheses with filtering and sorting.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `status` | `"active"` \| `"confirmed"` \| `"rejected"` \| `"all"` | no | Filter by status (default: `"active"`) |
| `sort_by` | `"confidence"` \| `"created"` \| `"updated"` | no | Sort field (default: `"confidence"`) |
| `tags` | string[] | no | Filter by tags (matches any) |

### `hypothesis_resolve`

Mark a hypothesis as confirmed or rejected.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hypothesis_id` | string | yes | ID of the hypothesis |
| `resolution` | `"confirmed"` \| `"rejected"` | yes | Outcome |
| `final_evidence` | string | yes | Final evidence for the resolution |
| `confidence` | number (0-1) | no | Final confidence override |

### `hypothesis_history`

Get full audit trail for a hypothesis — all evidence added, confidence changes, and resolution.

| Parameter | Type | Required | Description |
|---|---|---|---|
| `hypothesis_id` | string | yes | ID of the hypothesis |

## Example: Debugging a Performance Issue

```
1. App is slow — create competing hypotheses:

   hypothesis_create("Database queries are slow", ..., confidence=0.5)
   hypothesis_create("Memory leak in WebSocket handler", ..., confidence=0.4)
   hypothesis_create("Network latency to external API", ..., confidence=0.3)

2. Run profiler, add evidence:

   hypothesis_add_evidence(db_id, type="contradicting",
     description="Profiler shows DB queries all under 10ms", weight=0.8)
   → DB hypothesis drops from 0.5 to 0.26

   hypothesis_add_evidence(ws_id, type="supporting",
     description="Heap snapshot shows WS connections growing unbounded", weight=0.7)
   → WS hypothesis rises from 0.4 to 0.65

3. Next session — pick up where you left off:

   hypothesis_list() → shows WS leak at 65% confidence, DB at 26%

4. More evidence, then resolve:

   hypothesis_add_evidence(ws_id, type="supporting",
     description="Fixed WS cleanup, memory stabilized", weight=0.9)

   hypothesis_resolve(ws_id, resolution="confirmed",
     final_evidence="WS connection cleanup fix reduced memory growth to zero")
```

## How the Bayesian Updates Work

- **Supporting evidence** increases confidence proportional to weight and remaining room (can't exceed 0.99)
- **Contradicting evidence** decreases confidence proportional to weight and current confidence (can't go below 0.01)
- **Neutral evidence** nudges slightly toward 0.5
- Confidence is always clamped to `[0.01, 0.99]` — the system never reaches absolute certainty

The strength factor is 0.6, meaning a single piece of maximum-weight evidence moves confidence ~60% of the theoretical maximum. This prevents any single piece of evidence from being conclusive — you need to accumulate multiple pieces.

## Use Cases

- **Debugging** — track competing theories about what's broken
- **Architecture decisions** — weigh evidence for/against approaches
- **Root cause analysis** — systematic elimination with audit trail
- **Research** — track what you've investigated vs. what's still open
- **Code review** — hypothesize about potential issues, gather evidence

## License

MIT
