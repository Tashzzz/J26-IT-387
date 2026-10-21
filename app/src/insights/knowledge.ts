// C4 knowledge base (rules + sources) for the Insights research hub. The backend already serves it at
// GET /recommend/knowledge-base (backend/app/routers/recommend.py); api/c4.ts has no wrapper for it, so it
// is read here with the shared request() helper. Read-only: nothing here evaluates the rules.
import { request } from '../api/client';
import type { Category } from '../c4/types';

export type Condition = { fact: string; op: string; value?: unknown } | Group;
export type Group = { all?: Condition[]; any?: Condition[] };

export type KbRule = {
  id: string;
  category: Category;
  priority: number;
  when: Group;
  title: string;
  action: string;
  explanation: string;
  factors: string[];
  evidence: string[];
  exercises?: string[];
};

export type KnowledgeBase = {
  version: string;
  status: string;
  sources: Record<string, { citation: string; key_finding?: string; verified?: boolean }>;
  risk_tiers: Record<string, number | string>;
  limits: {
    age_groups: Record<string, { max_age: number; spell_cap: number; daily_limit: number }>;
    tier_multiplier: Record<string, number>;
    rest_window: Record<string, string>;
    max_bowling_days_per_week: Record<string, number>;
  };
  exercises: Record<string, { name: string; dose: string; targets: string }>;
  rules: KbRule[];
  referral_rules: { id: string; when: Group; reason: string }[];
};

export const fetchKnowledgeBase = () => request<KnowledgeBase>('/recommend/knowledge-base');

const OP: Record<string, string> = { eq: '=', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'is one of', contains: 'contains', exists: 'is recorded' };

/** Human-readable condition, e.g. "tier = High and acwr > 1.5". */
export function describe(c: Condition): string {
  if ('fact' in c) {
    const v = c.op === 'exists' ? '' : ` ${Array.isArray(c.value) ? c.value.join(', ') : String(c.value)}`;
    return `${c.fact.replace(/_/g, ' ')} ${OP[c.op] ?? c.op}${v}`;
  }
  const parts = (c.all ?? c.any ?? []).map((x) => ('fact' in x ? describe(x) : `(${describe(x)})`));
  return parts.join(c.all ? ' and ' : ' or ');
}

/** "Keep within {daily_limit} overs" -> "Keep within [daily limit] overs" (filled per bowler by the engine). */
export const template = (t: string) => t.replace(/\{(\w+)\}/g, (_, k: string) => `[${k.replace(/_/g, ' ')}]`);
