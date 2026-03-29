import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type {
  Hypothesis,
  Evidence,
  ConfidenceHistoryEntry,
  HypothesisWithCounts,
} from "./types.js";

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    const dataDir = join(homedir(), ".hypothesis-tracker");
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    const dbPath = join(dataDir, "data.db");
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    initSchema(db);
  }
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS hypotheses (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.5,
      status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'confirmed', 'rejected')),
      tags TEXT NOT NULL DEFAULT '[]',
      context TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      resolved_at TEXT,
      resolution TEXT CHECK(resolution IN ('confirmed', 'rejected', NULL)),
      final_evidence TEXT
    );

    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      hypothesis_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('supporting', 'contradicting', 'neutral')),
      description TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      source TEXT,
      confidence_before REAL NOT NULL,
      confidence_after REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (hypothesis_id) REFERENCES hypotheses(id)
    );

    CREATE TABLE IF NOT EXISTS confidence_history (
      id TEXT PRIMARY KEY,
      hypothesis_id TEXT NOT NULL,
      confidence REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (hypothesis_id) REFERENCES hypotheses(id)
    );

    CREATE INDEX IF NOT EXISTS idx_evidence_hypothesis ON evidence(hypothesis_id);
    CREATE INDEX IF NOT EXISTS idx_confidence_history_hypothesis ON confidence_history(hypothesis_id);
    CREATE INDEX IF NOT EXISTS idx_hypotheses_status ON hypotheses(status);
  `);
}

function generateId(): string {
  return `hyp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function generateEvidenceId(): string {
  return `ev_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function generateHistoryId(): string {
  return `ch_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

function now(): string {
  return new Date().toISOString();
}

export function createHypothesis(
  title: string,
  description: string,
  initialConfidence: number,
  tags?: string[],
  context?: string,
): Hypothesis {
  const database = getDb();
  const id = generateId();
  const timestamp = now();

  const stmt = database.prepare(`
    INSERT INTO hypotheses (id, title, description, confidence, status, tags, context, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    title,
    description,
    initialConfidence,
    JSON.stringify(tags ?? []),
    context ?? null,
    timestamp,
    timestamp,
  );

  // Record initial confidence in history
  const historyStmt = database.prepare(`
    INSERT INTO confidence_history (id, hypothesis_id, confidence, reason, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  historyStmt.run(
    generateHistoryId(),
    id,
    initialConfidence,
    "Initial confidence set at creation",
    timestamp,
  );

  return getHypothesis(id)!;
}

export function getHypothesis(id: string): Hypothesis | null {
  const database = getDb();
  const row = database
    .prepare("SELECT * FROM hypotheses WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;

  if (!row) return null;

  return {
    ...row,
    tags: JSON.parse(row.tags as string),
  } as Hypothesis;
}

export function addEvidence(
  hypothesisId: string,
  type: "supporting" | "contradicting" | "neutral",
  description: string,
  weight: number,
  source: string | null,
  confidenceBefore: number,
  confidenceAfter: number,
): Evidence {
  const database = getDb();
  const id = generateEvidenceId();
  const timestamp = now();

  const stmt = database.prepare(`
    INSERT INTO evidence (id, hypothesis_id, type, description, weight, source, confidence_before, confidence_after, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    hypothesisId,
    type,
    description,
    weight,
    source ?? null,
    confidenceBefore,
    confidenceAfter,
    timestamp,
  );

  // Update hypothesis confidence and updated_at
  database
    .prepare("UPDATE hypotheses SET confidence = ?, updated_at = ? WHERE id = ?")
    .run(confidenceAfter, timestamp, hypothesisId);

  // Record confidence change
  database
    .prepare(
      "INSERT INTO confidence_history (id, hypothesis_id, confidence, reason, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      generateHistoryId(),
      hypothesisId,
      confidenceAfter,
      `Evidence added: ${type} (weight: ${weight})`,
      timestamp,
    );

  return {
    id,
    hypothesis_id: hypothesisId,
    type,
    description,
    weight,
    source: source ?? null,
    confidence_before: confidenceBefore,
    confidence_after: confidenceAfter,
    created_at: timestamp,
  };
}

export function updateHypothesis(
  id: string,
  updates: {
    confidence?: number;
    description?: string;
    tags?: string[];
  },
): Hypothesis | null {
  const database = getDb();
  const existing = getHypothesis(id);
  if (!existing) return null;

  const timestamp = now();
  const sets: string[] = ["updated_at = ?"];
  const values: unknown[] = [timestamp];

  if (updates.confidence !== undefined) {
    sets.push("confidence = ?");
    values.push(updates.confidence);
  }
  if (updates.description !== undefined) {
    sets.push("description = ?");
    values.push(updates.description);
  }
  if (updates.tags !== undefined) {
    sets.push("tags = ?");
    values.push(JSON.stringify(updates.tags));
  }

  values.push(id);

  database
    .prepare(`UPDATE hypotheses SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);

  if (updates.confidence !== undefined && updates.confidence !== existing.confidence) {
    database
      .prepare(
        "INSERT INTO confidence_history (id, hypothesis_id, confidence, reason, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        generateHistoryId(),
        id,
        updates.confidence,
        "Manual confidence update",
        timestamp,
      );
  }

  return getHypothesis(id);
}

export function listHypotheses(
  status: "active" | "confirmed" | "rejected" | "all",
  sortBy: "confidence" | "created" | "updated",
  tags?: string[],
): HypothesisWithCounts[] {
  const database = getDb();

  let whereClause = "";
  const params: unknown[] = [];

  if (status !== "all") {
    whereClause = "WHERE h.status = ?";
    params.push(status);
  }

  const orderMap: Record<string, string> = {
    confidence: "h.confidence DESC",
    created: "h.created_at DESC",
    updated: "h.updated_at DESC",
  };

  const rows = database
    .prepare(
      `
    SELECT h.*,
      COUNT(e.id) as evidence_count,
      SUM(CASE WHEN e.type = 'supporting' THEN 1 ELSE 0 END) as supporting_count,
      SUM(CASE WHEN e.type = 'contradicting' THEN 1 ELSE 0 END) as contradicting_count
    FROM hypotheses h
    LEFT JOIN evidence e ON e.hypothesis_id = h.id
    ${whereClause}
    GROUP BY h.id
    ORDER BY ${orderMap[sortBy]}
  `,
    )
    .all(...params) as Array<Record<string, unknown>>;

  let results = rows.map((row) => ({
    ...row,
    tags: JSON.parse(row.tags as string),
    evidence_count: (row.evidence_count as number) ?? 0,
    supporting_count: (row.supporting_count as number) ?? 0,
    contradicting_count: (row.contradicting_count as number) ?? 0,
  })) as HypothesisWithCounts[];

  // Filter by tags if provided
  if (tags && tags.length > 0) {
    results = results.filter((h) =>
      tags.some((tag) => h.tags.includes(tag)),
    );
  }

  return results;
}

export function resolveHypothesis(
  id: string,
  resolution: "confirmed" | "rejected",
  finalEvidence: string,
  confidence?: number,
): Hypothesis | null {
  const database = getDb();
  const existing = getHypothesis(id);
  if (!existing) return null;

  const timestamp = now();
  const finalConfidence = confidence ?? (resolution === "confirmed" ? 0.99 : 0.01);

  database
    .prepare(
      `UPDATE hypotheses
       SET status = ?, resolution = ?, final_evidence = ?, confidence = ?,
           resolved_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .run(resolution, resolution, finalEvidence, finalConfidence, timestamp, timestamp, id);

  database
    .prepare(
      "INSERT INTO confidence_history (id, hypothesis_id, confidence, reason, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(
      generateHistoryId(),
      id,
      finalConfidence,
      `Hypothesis resolved: ${resolution}`,
      timestamp,
    );

  return getHypothesis(id);
}

export function getHypothesisHistory(
  id: string,
): { hypothesis: Hypothesis | null; events: Array<Record<string, unknown>> } {
  const database = getDb();
  const hypothesis = getHypothesis(id);
  if (!hypothesis) return { hypothesis: null, events: [] };

  const evidenceRows = database
    .prepare(
      "SELECT *, 'evidence_added' as event_type FROM evidence WHERE hypothesis_id = ? ORDER BY created_at",
    )
    .all(id) as Array<Record<string, unknown>>;

  const historyRows = database
    .prepare(
      "SELECT *, 'confidence_changed' as event_type FROM confidence_history WHERE hypothesis_id = ? ORDER BY created_at",
    )
    .all(id) as Array<Record<string, unknown>>;

  // Merge and sort chronologically
  const events = [...evidenceRows, ...historyRows].sort((a, b) =>
    (a.created_at as string).localeCompare(b.created_at as string),
  );

  return { hypothesis, events };
}
