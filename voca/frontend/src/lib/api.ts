/**
 * The only module that knows the backend's address or wire formats.
 *
 * Errors become `ApiError` carrying the backend's `detail` string, so pages can
 * show the real reason (an unset LLM key, an unknown occupation) instead of
 * "[object Object]".
 */

import type {
  ActResponse,
  Health,
  Occupation,
  OccupationSummary,
  PlanResponse,
  ProfileRecord,
  ProfileSkill,
  Skill,
  UnderstandResponse,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError(
      0,
      `Could not reach the Voca API at ${API_BASE_URL}. Is the backend running?`,
    );
  }

  if (!response.ok) {
    let detail = `The API returned ${response.status}.`;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
      else if (detail) detail = `${detail} ${JSON.stringify(body.detail)}`;
    } catch {
      // Non-JSON error body: keep the status message.
    }
    throw new ApiError(response.status, detail);
  }

  return (await response.json()) as T;
}

export const api = {
  health: () => request<Health>("/health"),

  skills: () => request<Skill[]>("/skills"),

  occupations: () => request<OccupationSummary[]>("/occupations"),

  occupation: (id: string) => request<Occupation>(`/occupations/${encodeURIComponent(id)}`),

  understand: (story: string) =>
    request<UnderstandResponse>("/understand", {
      method: "POST",
      body: JSON.stringify({ story }),
    }),

  plan: (skills: ProfileSkill[], targetOccupationId: string) =>
    request<PlanResponse>("/plan", {
      method: "POST",
      body: JSON.stringify({ skills, target_occupation_id: targetOccupationId }),
    }),

  act: (skillIds: string[], options?: { region?: string | null; freeOnly?: boolean }) =>
    request<ActResponse>("/act", {
      method: "POST",
      body: JSON.stringify({
        skill_ids: skillIds,
        region: options?.region ?? null,
        free_only: options?.freeOnly ?? true,
      }),
    }),

  saveProfile: (payload: {
    skills: ProfileSkill[];
    target_occupation_id: string | null;
    story: string | null;
    plan: PlanResponse | null;
  }) =>
    request<ProfileRecord>("/profiles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  getProfile: (id: string) => request<ProfileRecord>(`/profiles/${encodeURIComponent(id)}`),
};
