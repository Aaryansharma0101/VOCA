"use client";

/**
 * Stage 1: Understand.
 *
 * Story in; editable skills and reachable careers out. Everything the user
 * changes here is what /plan receives, so level edits and removals matter:
 * the page never re-derives skills from the model's output.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Briefcase,
  Check,
  ListChecks,
  Minus,
  Plus,
  Search,
  Wand2,
  X,
} from "lucide-react";

import { StageGlow } from "@/components/decor";
import { useVoca } from "@/components/providers";
import {
  Button,
  Card,
  EmptyState,
  SkillRing,
  Skeleton,
  Spinner,
  Tag,
  cn,
  type TagTone,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { staggerStyle } from "@/lib/motion";
import type { CareerMatch, Skill, SkillKind, UnderstoodSkill } from "@/lib/types";

const EXAMPLES = [
  {
    label: "Teacher to tech",
    story:
      "I taught secondary English for six years. I rewrote the curriculum every term, ran parent evenings, presented at staff training days, and redesigned our department intranet because nobody could find anything. I also mentored two newly qualified teachers.",
  },
  {
    label: "Warehouse to data",
    story:
      "I run the night shift in a distribution centre. I track stock in spreadsheets, built a small Excel tool that flags slow-moving items, and cut picking errors by reorganising the aisles. I manage a team of twelve and report weekly numbers to the site manager.",
  },
  {
    label: "Nurse to health tech",
    story:
      "I am a registered nurse on a busy medical ward. I triage patients, keep clinical notes up to date, and spent last year helping roll out a new electronic records system, training colleagues on it one shift at a time.",
  },
  {
    label: "Retail to product",
    story:
      "I manage a small retail chain. I interview customers about what they want, set the monthly budget, schedule fifteen staff, and negotiate with suppliers. I introduced a loyalty scheme that grew repeat visits by a fifth.",
  },
] as const;

const KIND_TONE: Record<SkillKind, TagTone> = {
  hard: "blue",
  soft: "violet",
  domain: "orange",
  digital: "green",
};

export default function UnderstandPage() {
  const router = useRouter();
  const { state, update, toast, hydrated } = useVoca();

  const [pending, setPending] = useState(false);
  const [catalogue, setCatalogue] = useState<Skill[]>([]);
  const [query, setQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const addRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .skills()
      .then((skills) => {
        if (!cancelled) setCatalogue(skills);
      })
      .catch(() => {
        // Autocomplete is a convenience; the page works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (addRef.current && !addRef.current.contains(event.target as Node)) setShowAdd(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const matched = state.skills.filter((skill) => skill.matched);
  const unmatched = state.skills.filter((skill) => !skill.matched);

  const suggestions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    const taken = new Set(state.skills.map((skill) => skill.skill_id));
    return catalogue
      .filter((skill) => !taken.has(skill.id))
      .filter(
        (skill) =>
          skill.name.toLowerCase().includes(term) ||
          skill.aliases.some((alias) => alias.toLowerCase().includes(term)),
      )
      .slice(0, 7);
  }, [catalogue, query, state.skills]);

  async function analyse() {
    if (state.story.trim().length < 20) {
      toast("Add a few more sentences so there is something to work with.", "info");
      return;
    }
    setPending(true);
    try {
      const result = await api.understand(state.story.trim());
      update({
        skills: result.skills,
        interests: result.interests,
        matches: result.career_matches,
        plan: null,
      });
      toast(
        `${result.skills.length} skill${result.skills.length === 1 ? "" : "s"} found, ${result.career_matches.length} roles matched`,
        "success",
      );
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  function setLevel(index: number, level: number) {
    const next = [...state.skills];
    next[index] = { ...next[index], level: Math.min(5, Math.max(1, level)) };
    update({ skills: next, plan: null });
  }

  function removeSkill(index: number) {
    update({ skills: state.skills.filter((_, i) => i !== index), plan: null });
  }

  function addSkill(skill: Skill) {
    const entry: UnderstoodSkill = {
      skill_id: skill.id,
      name: skill.name,
      level: 3,
      evidence: "Added by you",
      kind: skill.category,
      matched: true,
    };
    update({ skills: [...state.skills, entry], plan: null });
    setQuery("");
    setShowAdd(false);
  }

  function planCareer(match: CareerMatch) {
    update({ targetOccupationId: match.occupation_id, plan: null });
    router.push("/plan");
  }

  return (
    <div className="space-y-6">
      <header className="relative isolate pb-1">
        <StageGlow tone="blue" />
        <Tag tone="blue" className="font-mono-ui">
          Stage 1
        </Tag>
        <h1 className="page-title mt-3">Tell us what you have actually done</h1>
        <p className="page-subtitle mt-1">
          Write it the way you would tell a friend: what you were responsible for, what
          you improved, who you dealt with. Specifics beat job titles.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:items-start">
        <Card className="lg:sticky lg:top-[72px]">
          <div className="space-y-4 p-4">
            <div className="flex flex-wrap gap-1.5">
              <span className="font-mono-ui text-[var(--text-3)]">Try an example:</span>
              {EXAMPLES.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => update({ story: example.story })}
                  className="h-7 rounded-[6px] border border-[var(--border)] px-2 text-[11px] font-medium text-[var(--text-3)] transition-colors duration-150 hover:border-[var(--brand-line)] hover:bg-[var(--brand-soft)] hover:text-[var(--text)]"
                >
                  {example.label}
                </button>
              ))}
            </div>

            <div>
              <label
                htmlFor="story"
                className="mb-1.5 block text-[13px] font-medium text-[var(--text)]"
              >
                Your career story
              </label>
              <textarea
                id="story"
                rows={8}
                value={state.story}
                onChange={(event) => update({ story: event.target.value })}
                placeholder="I taught secondary English for six years. I rewrote the curriculum, ran parent evenings, redesigned the department intranet…"
                className="textarea min-h-[180px]"
              />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[var(--text-3)]">
                <span>{state.story.trim().split(/\s+/).filter(Boolean).length} words</span>
                <span>Only your text is sent, and only to extract skills.</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={analyse} disabled={pending || state.story.trim().length < 20}>
                {pending ? (
                  <>
                    <Spinner />
                    Reading your story…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    {state.skills.length ? "Analyse again" : "Analyse my skills"}
                  </>
                )}
              </Button>
              {state.skills.length ? (
                <span className="text-[11px] text-[var(--text-3)]">
                  Re-analysing replaces your skill list.
                </span>
              ) : null}
            </div>
          </div>
        </Card>

        <div className="min-w-0 space-y-6">
          {pending && <SkillsSkeleton />}

          {!pending && hydrated && state.skills.length === 0 ? (
            <EmptyState
              icon={<ListChecks className="h-5 w-5" />}
              title="Your skills will appear here"
              action={
                <Button variant="ghost" size="sm" onClick={() => {}}>
                  Try an example above
                </Button>
              }
            >
              Paste your story above, or pick an example, then run the analysis. You can edit
              every skill afterwards; the model drafts, you decide.
            </EmptyState>
          ) : null}

          {!pending && state.skills.length > 0 ? (
            <section className="space-y-3" aria-labelledby="skills-found">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2
                    id="skills-found"
                    className="text-[16px] font-semibold tracking-[-0.02em]"
                  >
                    Skills found
                  </h2>
                  <p className="mt-0.5 text-[12px] text-[var(--text-3)]">
                    {matched.length} matched to the catalogue, {unmatched.length} unmatched.
                    Adjust any level before planning.
                  </p>
                </div>

                <div className="relative" ref={addRef}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowAdd((open) => !open)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add a skill
                  </Button>

                  {showAdd ? (
                    <div className="absolute right-0 z-30 mt-2 w-[288px] rounded-[10px] border border-[var(--border-strong)] bg-[var(--elevated)] p-1.5 shadow-[var(--shadow-elevated)]">
                      <div className="relative">
                        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[var(--text-3)]" />
                        <input
                          autoFocus
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          placeholder="Search 86 skills…"
                          aria-label="Search skills"
                          className="input h-8 pl-8 text-[12px]"
                        />
                      </div>
                      <ul className="mt-1 max-h-56 overflow-auto scrollbar-thin">
                        {suggestions.map((skill) => (
                          <li key={skill.id}>
                            <button
                              type="button"
                              onClick={() => addSkill(skill)}
                              className="flex w-full items-center justify-between gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--hover-fill)]"
                            >
                              <span className="truncate">{skill.name}</span>
                              <Tag tone={KIND_TONE[skill.category]}>{skill.category}</Tag>
                            </button>
                          </li>
                        ))}
                        {query && suggestions.length === 0 ? (
                          <li className="px-2 py-3 text-[11px] text-[var(--text-3)]">
                            No catalogue skill matches &ldquo;{query}&rdquo;.
                          </li>
                        ) : null}
                        {!query ? (
                          <li className="px-2 py-3 text-[11px] text-[var(--text-3)]">
                            Start typing to search the catalogue.
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>

              <ul className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--panel)]">
                {state.skills.map((skill, index) => (
                  <li
                    key={`${skill.skill_id ?? skill.name}-${index}`}
                    className={cn(
                      "group relative flex items-start gap-3 border-b border-[var(--border)] px-3 py-3 transition-colors duration-150 last:border-b-0 hover:bg-[var(--panel-2)] list-stagger",
                      !skill.matched && "border-l-2 border-l-[var(--border-strong)]",
                    )}
                    style={staggerStyle(index)}
                  >
                    <SkillRing level={skill.level} className="mt-0.5" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="min-w-0 truncate text-[13px] font-medium text-[var(--text)]">
                          {skill.name}
                        </h3>
                        <Tag tone={skill.matched ? KIND_TONE[skill.kind] : "unmatched"}>
                          {skill.matched ? skill.kind : "not in catalogue"}
                        </Tag>
                        {skill.matched ? null : (
                          <span className="text-[10px] text-[var(--orange-ink)]">
                            kept, but excluded from matching
                          </span>
                        )}
                      </div>

                      {skill.evidence ? (
                        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--text-3)]">
                          &ldquo;{skill.evidence}&rdquo;
                        </p>
                      ) : null}
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setLevel(index, skill.level - 1)}
                        disabled={skill.level <= 1}
                        aria-label={`Lower ${skill.name} level`}
                        className="grid h-7 w-7 place-items-center rounded-[6px] border border-[var(--border)] text-[var(--text-3)] transition-colors duration-150 hover:bg-[var(--hover-fill)] hover:text-[var(--text)] disabled:opacity-40"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setLevel(index, skill.level + 1)}
                        disabled={skill.level >= 5}
                        aria-label={`Raise ${skill.name} level`}
                        className="grid h-7 w-7 place-items-center rounded-[6px] border border-[var(--border)] text-[var(--text-3)] transition-colors duration-150 hover:bg-[var(--hover-fill)] hover:text-[var(--text)] disabled:opacity-40"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSkill(index)}
                        aria-label={`Remove ${skill.name}`}
                        className="ml-0.5 grid h-7 w-7 place-items-center rounded-[6px] text-[var(--text-3)] opacity-100 transition-colors duration-150 hover:bg-[var(--red-soft)] hover:text-[var(--red-ink)] sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>

              {state.interests.length ? (
                <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--border)] bg-[var(--panel)] px-3 py-2">
                  <span className="text-[11px] font-medium text-[var(--text-3)]">
                    What you seem to want next:
                  </span>
                  {state.interests.map((interest) => (
                    <Tag key={interest} tone="green">
                      {interest}
                    </Tag>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {!pending && state.matches.length > 0 ? (
            <section className="space-y-3" aria-labelledby="career-matches">
              <div>
                <h2
                  id="career-matches"
                  className="text-[16px] font-semibold tracking-[-0.02em]"
                >
                  Roles this opens
                </h2>
                <p className="mt-0.5 text-[12px] text-[var(--text-3)]">
                  Fit is the weighted share of each role's requirements your profile
                  already covers; computed, not guessed.
                </p>
              </div>

              <ul className="overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--panel)]">
                {state.matches.map((match, index) => (
                  <li
                    key={match.occupation_id}
                    className="grid gap-3 border-b border-[var(--border)] px-3 py-3 transition-colors duration-150 last:border-b-0 hover:bg-[var(--panel-2)] sm:grid-cols-[minmax(0,1fr)_120px_auto] sm:items-center list-stagger"
                    style={staggerStyle(index)}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h3 className="text-[13px] font-medium text-[var(--text)]">
                          {match.title}
                        </h3>
                        <span className="text-[11px] text-[var(--text-3)]">
                          {match.industry}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-3)]">
                        {match.why}
                      </p>

                      {match.matched_skills.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {match.matched_skills.slice(0, 5).map((skill) => (
                            <Tag key={skill} tone="neutral">
                              <Check className="h-2.5 w-2.5" />
                              {skill}
                            </Tag>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2 text-[10px] font-mono-ui text-[var(--text-3)]">
                        <span>fit</span>
                        <span className="text-[12px] font-semibold tabular-nums text-[var(--text)]">
                          {match.fit_pct}%
                        </span>
                      </div>
                      <div className="mt-1 h-1 rounded-[2px] bg-[var(--panel-2)]">
                        <div
                          className="h-full origin-left rounded-[2px] bg-[var(--blue)] animate-bar-grow"
                          style={{ width: `${match.fit_pct}%` }}
                        />
                      </div>
                    </div>

                    <Button
                      size="sm"
                      className="w-full sm:w-auto"
                      onClick={() => planCareer(match)}
                    >
                      Plan this career
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {!pending && state.skills.length > 0 && state.matches.length === 0 ? (
            <EmptyState
              icon={<Briefcase className="h-5 w-5" />}
              title="No roles matched yet"
            >
              None of the skills above are in the catalogue, so there is nothing to match on.
              Add a few matched skills, then try again.
            </EmptyState>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SkillsSkeleton() {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Analysing your story">
      <div className="flex items-center gap-2 text-[12px] text-[var(--text-3)]">
        <Spinner className="text-[var(--brand)]" />
        Finding skills and matching roles…
      </div>
      <div className="overflow-hidden rounded-[12px] border border-[var(--border)]">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-3 last:border-b-0"
          >
            <Skeleton className="h-3.5 w-3.5 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-2.5 w-2/3" />
            </div>
            <Skeleton className="h-6 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
