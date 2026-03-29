# Hypothesis Tracker MCP Server

An MCP server that gives AI agents a persistent scientific method for tracking hypotheses across sessions. Uses SQLite for persistence with Bayesian confidence updates.

## Installation

```bash
npm install
npm run build
```

## Usage

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "hypothesis-tracker": {
      "command": "node",
      "args": ["/path/to/hypothesis-tracker/dist/index.js"]
    }
  }
}
```

Data is stored at `~/.hypothesis-tracker/data.db`.

## Tools

### hypothesis_create

Create a new hypothesis with an initial confidence level.

**Parameters:**
- `title` (string, required) - Title of the hypothesis
- `description` (string, required) - Detailed description
- `initial_confidence` (number 0-1, required) - Starting confidence level
- `tags` (string[], optional) - Tags for categorization
- `context` (string, optional) - Why this hypothesis was formed

### hypothesis_add_evidence

Add evidence to a hypothesis. Automatically updates confidence using Bayesian logic.

**Parameters:**
- `hypothesis_id` (string, required) - ID of the hypothesis
- `type` ("supporting" | "contradicting" | "neutral", required) - Evidence type
- `description` (string, required) - Description of the evidence
- `weight` (number 0-1, default 0.5) - Strength of the evidence
- `source` (string, optional) - Source of the evidence

### hypothesis_update

Manually update hypothesis fields.

**Parameters:**
- `hypothesis_id` (string, required) - ID of the hypothesis
- `confidence` (number 0-1, optional) - New confidence level
- `description` (string, optional) - Updated description
- `tags` (string[], optional) - Updated tags

### hypothesis_list

List hypotheses with filtering and sorting.

**Parameters:**
- `status` ("active" | "confirmed" | "rejected" | "all", default "active")
- `sort_by` ("confidence" | "created" | "updated", default "confidence")
- `tags` (string[], optional) - Filter by tags

### hypothesis_resolve

Mark a hypothesis as confirmed or rejected.

**Parameters:**
- `hypothesis_id` (string, required) - ID of the hypothesis
- `resolution` ("confirmed" | "rejected", required) - Outcome
- `final_evidence` (string, required) - Final evidence for the resolution
- `confidence` (number 0-1, optional) - Final confidence override

### hypothesis_history

Get full audit trail for a hypothesis.

**Parameters:**
- `hypothesis_id` (string, required) - ID of the hypothesis

## Example Flow

```
1. Create hypothesis: "Redis caching will reduce API latency by 50%"
   -> hypothesis_create(title="Redis caching reduces latency by 50%", initial_confidence=0.6)

2. Add supporting evidence from benchmark
   -> hypothesis_add_evidence(id, type="supporting", description="Local benchmark shows 60% reduction", weight=0.7)

3. Add contradicting evidence from production
   -> hypothesis_add_evidence(id, type="contradicting", description="Production test shows only 20% with cold cache", weight=0.6)

4. Check confidence history
   -> hypothesis_history(id)

5. Resolve after full testing
   -> hypothesis_resolve(id, resolution="confirmed", final_evidence="After cache warmup, consistent 45-55% reduction observed")
```

## Bayesian Update Logic

- **Supporting evidence:** confidence increases proportional to weight and remaining room
- **Contradicting evidence:** confidence decreases proportional to weight and current confidence
- **Neutral evidence:** minimal adjustment toward 0.5
- Confidence is always clamped to [0.01, 0.99] to avoid certainty
