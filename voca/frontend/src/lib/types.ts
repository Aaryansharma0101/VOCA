/**
 * Typed mirror of `backend/app/models.py`.
 *
 * Field names match the wire format exactly. When a schema changes on the
 * backend, change it here in the same commit.
 */

export type SkillKind = "hard" | "soft" | "digital" | "domain";
export type Trend = "growing" | "stable" | "fading";
export type ResourceKind =
  | "course"
  | "training"
  | "apprenticeship"
  | "project"
  | "volunteering"
  | "community"
  | "internship";

export type Skill = {
  id: string;
  name: string;
  category: SkillKind;
  aliases: string[];
  trend: Trend;
  trend_note: string;
};

export type OccupationSummary = {
  id: string;
  title: string;
  industry: string;
};

export type Requirement = {
  skill_id: string;
  importance: number;
  level: number;
};

export type Occupation = {
  id: string;
  title: string;
  industry: string;
  description: string;
  typical_time_to_enter: string;
  requires: Requirement[];
};

export type Health = {
  status: "ok";
  llm_configured: boolean;
  neo4j: boolean;
  supabase: boolean;
};

export type UnderstoodSkill = {
  skill_id: string | null;
  name: string;
  level: number;
  evidence: string;
  kind: SkillKind;
  matched: boolean;
};

export type CareerMatch = {
  occupation_id: string;
  title: string;
  industry: string;
  fit_pct: number;
  matched_skills: string[];
  why: string;
};

export type UnderstandResponse = {
  skills: UnderstoodSkill[];
  interests: string[];
  career_matches: CareerMatch[];
};

export type ProfileSkill = { skill_id: string; level: number };

export type HaveItem = { skill: string; skill_id: string; level: number; need: number };
export type GapItem = {
  skill: string;
  skill_id: string;
  have: number;
  need: number;
  importance: number;
};

export type BridgeRole = {
  occupation_id: string;
  title: string;
  reaches_pct: number;
  closes: string[];
  time: string;
};

export type OutlookItem = { skill: string; trend: Trend; note: string };

export type TargetInfo = {
  occupation_id: string;
  title: string;
  industry: string;
  description: string;
};

export type PlanResponse = {
  target: TargetInfo;
  summary: string;
  have: HaveItem[];
  essential_gaps: GapItem[];
  optional_gaps: GapItem[];
  bridge_roles: BridgeRole[];
  outlook: OutlookItem[];
  steps: string[];
  timeline: string;
  readiness_pct: number;
};

export type ActResource = {
  id: string;
  title: string;
  provider: string;
  kind: ResourceKind;
  region: string;
  cost: "free" | "paid";
  url: string;
  description: string;
  covers: number;
  covers_skills: string[];
};

export type ActResponse = {
  practice: ActResource[];
  learn: ActResource[];
  gaps_considered: number;
};

export type ProfileRecord = {
  id: string;
  saved_at: string;
  skills: ProfileSkill[];
  target_occupation_id: string | null;
  story: string | null;
  plan: PlanResponse | null;
  storage: "supabase" | "sqlite";
};

/** Everything the app remembers between visits. Persisted to localStorage. */
export type VocaState = {
  story: string;
  skills: UnderstoodSkill[];
  interests: string[];
  matches: CareerMatch[];
  targetOccupationId: string | null;
  plan: PlanResponse | null;
  savedProfileId: string | null;
};

export const EMPTY_STATE: VocaState = {
  story: "",
  skills: [],
  interests: [],
  matches: [],
  targetOccupationId: null,
  plan: null,
  savedProfileId: null,
};
