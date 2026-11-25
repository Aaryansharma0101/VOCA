"use client";

/**
 * Stage 2: Plan.
 *
 * Everything numeric on this page comes from POST /plan, which computes it from
 * the graph. The prose comes from the model, grounded in those numbers. This
 * page renders both and adds no interpretation of its own.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CircleCheck,
  Clock,
  Minus,
  Route,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { StageGlow } from "@/components/decor";
import { useVoca } from "@/components/providers";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LinkButton,
  NeedBar,
  ReadinessDisplay,
  Skeleton,
  Spinner,
  Tag,
  cn,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { staggerStyle } from "@/lib/motion";
import type { GapItem, OccupationSummary, PlanResponse, Trend } from "@/lib/types";

const TREND_ICON = {
  growing: TrendingUp,
  stable: Minus,
  fading: TrendingDown,
} as const;

const TREND_TONE = {
  growing: "green",
  stable: "neutral",
  fading: "orange",
} as const;

export default function PlanPage() {
  const router = useRouter();
  const { state, update, toast, hydrated } = useVoca();
  const [occupations, setOccupations] = useState<OccupationSummary[]>([]);
  const [target, setTarget] = useState<string>(state.targetOccupationId ?? "");
  const [pending, setPending] = useState(false);

  const matchedSkills = state.skills.filter((skill) => skill.skill_id);

  useEffect(() => {
    let cancelled = false;
    api
      .occupations()
      .then((items) => {
        if (!cancelled) setOccupations(items);
      })
      .catch(() => {
        // The picker falls back to whatever the user arrived with.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (state.targetOccupationId) setTarget(state.targetOccupationId);
  }, [state.targetOccupationId]);

  async function build(occupationId: string) {
    if (!occupationId) {
      toast("Choose a target role first.", "info");
      return;
    }
    if (matchedSkills.length === 0) {
      toast("Add at least one matched skill first.", "info");
      return;
    }

    setPending(true);
    try {
      const plan = await api.plan(
        matchedSkills.map((skill) => ({ skill_id: skill.skill_id as string, level: skill.level })),
        occupationId,
      );
      update({ plan, targetOccupationId: occupationId });
      setTarget(occupationId);
      toast(`Plan ready for ${plan.target.title}.`, "success");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Could not build the plan.");
    } finally {
      setPending(false);
    }
  }

  if (hydrated && matchedSkills.length === 0) {
    return (
      <EmptyState
        icon={<Route className="h-5 w-5" />}
        title="Build your profile first"
        action={
          <LinkButton href="/understand">
            Go to Understand
          </LinkButton>
        }
      >
        A plan needs skills to compare against a role. Tell Voca your story and it will
        fill this page in.
      </EmptyState>
    );
  }

  const plan = state.plan;

  return (
    <div className="space-y-5">
      <header className="relative isolate pb-1">
        <StageGlow tone="violet" />
        <Tag tone="violet" className="font-mono-ui">
          Stage 2
        </Tag>
        <h1 className="page-title mt-3">Choose where you are going</h1>
        <p className="page-subtitle mt-1">
          Gaps, bridge roles and readiness are computed from the catalogue. The summary is
          written from those numbers only.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1">
            <label
              htmlFor="target"
              className="mb-1.5 block text-[13px] font-medium text-[var(--text)]"
            >
              Target role
            </label>
            <select
              id="target"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
              className="select"
            >
              <option value="">Select an occupation…</option>
              {occupations.map((occupation) => (
                <option key={occupation.id} value={occupation.id}>
                  {occupation.title}, {occupation.industry}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={() => build(target)} disabled={pending || !target} className="sm:w-auto">
            {pending ? (
              <>
                <Spinner />
                Computing…
              </>
            ) : (
              <>
                <Route className="h-4 w-4" />
                {plan ? "Rebuild plan" : "Build my plan"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {pending ? <PlanSkeleton /> : null}

      {!pending && !plan ? (
        <EmptyState
          icon={<Route className="h-5 w-5" />}
          title="No plan yet"
        >
          Pick a target role above. You will get a readiness score, the essential gaps, the
          bridge roles you can reach now, and what to do first.
        </EmptyState>
      ) : null}

      {!pending && plan ? (
        <PlanBody
          plan={plan}
          onPlanRole={(occupationId) => build(occupationId)}
          onFindOpportunities={() => router.push("/opportunities")}
        />
      ) : null}
    </div>
  );
}

function PlanBody({
  plan,
  onPlanRole,
  onFindOpportunities,
}: {
  plan: PlanResponse;
  onPlanRole: (occupationId: string) => void;
  onFindOpportunities: () => void;
}) {
  return (
    <div className="space-y-4 animate-page-in">
      <Card className="print-block">
        <CardContent className="flex flex-col gap-5 p-4 sm:flex-row sm:items-start">
          <div className="flex shrink-0 justify-center sm:w-[120px]">
            <ReadinessDisplay value={plan.readiness_pct} size="lg" />
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
                  {plan.target.title}
                </h2>
                <Tag tone="neutral">{plan.target.industry}</Tag>
              </div>
              <p className="mt-1 flex items-center gap-1.5 font-mono-ui text-[10px] text-[var(--text-3)]">
                <Clock className="h-3 w-3" />
                {plan.timeline}
              </p>
            </div>

            <p className="text-[13px] leading-relaxed text-[var(--text)]">{plan.summary}</p>

            {plan.have.length ? (
              <div>
                <h3 className="mb-1.5 font-mono-ui text-[var(--text-3)]">
                  Already have
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {plan.have.map((item) => (
                    <Tag key={item.skill_id} tone="blue">
                      <CircleCheck className="h-2.5 w-2.5" />
                      {item.skill} {item.level}/{item.need}
                    </Tag>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <GapColumn
          title="Essential gaps"
          subtitle="At or above 60% importance for this role"
          gaps={plan.essential_gaps}
          tone="red"
        />
        <GapColumn
          title="Optional improvements"
          subtitle="Useful, but not what hiring managers screen on"
          gaps={plan.optional_gaps}
          tone="neutral"
        />
      </div>

      <Card className="print-block">
        <CardHeader>
          <CardTitle>Bridge roles</CardTitle>
          <p className="text-[12px] leading-relaxed text-[var(--text-3)]">
            Roles you could plausibly get now (at least 50% covered) that share
            requirements with the target, nearest first.
          </p>
        </CardHeader>
        <CardContent>
          {plan.bridge_roles.length === 0 ? (
            <p className="text-[13px] text-[var(--text-3)]">
              No bridge role clears 50% coverage with your current skills. Close an
              essential gap first, then rebuild the plan.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-3">
              {plan.bridge_roles.map((bridge, index) => (
                <li key={bridge.occupation_id} className="min-w-0">
                  <div
                    className="flex h-full flex-col overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--panel)] list-stagger"
                    style={staggerStyle(index)}
                  >
                    <div className="flex items-start justify-between gap-2 bg-[var(--violet-soft)] px-3 py-2">
                      <h3 className="text-[12px] font-medium leading-snug text-[var(--text)]">
                        {bridge.title}
                      </h3>
                      <Tag tone="violet">{bridge.reaches_pct}%</Tag>
                    </div>
                    <div className="flex flex-1 flex-col p-3">
                      <p className="font-mono-ui text-[10px] text-[var(--text-3)]">
                        {bridge.time}
                      </p>

                      {bridge.closes.length ? (
                        <>
                          <p className="mt-2 font-mono-ui text-[10px] text-[var(--text-3)]">
                            Closes:
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {bridge.closes.map((skill) => (
                              <Tag key={skill} tone="neutral">
                                {skill}
                              </Tag>
                            ))}
                          </div>
                        </>
                      ) : null}

                      <Button
                        variant="secondary"
                        size="sm"
                        className="mt-auto w-full"
                        onClick={() => onPlanRole(bridge.occupation_id)}
                      >
                        Plan this role instead
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card className="print-block">
        <CardHeader>
          <CardTitle>Skill outlook</CardTitle>
          <p className="text-[12px] leading-relaxed text-[var(--text-3)]">
            Estimate, not live data. These labels come from the seed catalogue and are
            hand-assigned; they are not a labour-market feed.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {plan.outlook.map((item, index) => {
              const Icon = TREND_ICON[item.trend as Trend];
              return (
                <li
                  key={item.skill}
                  className="grid gap-2 px-4 py-2.5 sm:grid-cols-[96px_minmax(0,1fr)] sm:items-start list-stagger"
                  style={staggerStyle(index)}
                >
                  <Tag
                    tone={TREND_TONE[item.trend as Trend]}
                    className="w-fit shrink-0"
                  >
                    <Icon className="h-3 w-3" />
                    {item.trend}
                  </Tag>
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-[var(--text)]">{item.skill}</p>
                    <p className="text-[11px] leading-relaxed text-[var(--text-3)]">
                      {item.note}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card className="print-block">
        <CardHeader>
          <CardTitle>What to do, in order</CardTitle>
        </CardHeader>
        <CardContent>
          {plan.steps.length === 0 ? (
            <p className="text-[13px] text-[var(--text-3)]">No steps were generated.</p>
          ) : (
            <ol className="relative space-y-3">
              {plan.steps.map((step, index) => (
                <li
                  key={`${index}-${step.slice(0, 12)}`}
                  className="relative flex gap-3 pb-3 before:absolute before:left-3 before:top-6 before:h-[calc(100%-16px)] before:w-px before:bg-[var(--border)] last:pb-0 last:before:hidden list-stagger"
                  style={staggerStyle(index)}
                >
                  <span className="relative z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--panel)] font-mono-ui text-[10px] font-medium text-[var(--text-2)]">
                    {index + 1}
                  </span>
                  <p className="pt-0.5 text-[13px] leading-relaxed text-[var(--text)]">
                    {step}
                  </p>
                </li>
              ))}
            </ol>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button onClick={onFindOpportunities}>
              Find opportunities
              <ArrowRight className="h-4 w-4" />
            </Button>
            <LinkButton href="/dashboard" variant="secondary">
              See the skill graph
            </LinkButton>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function GapColumn({
  title,
  subtitle,
  gaps,
  tone,
}: {
  title: string;
  subtitle: string;
  gaps: GapItem[];
  tone: "red" | "neutral";
}) {
  const accent = tone === "red" ? "red" : "orange";

  return (
    <Card
      className={cn(
        "print-block h-fit overflow-hidden",
        tone === "red" && "border-[var(--red-line)]",
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{title}</CardTitle>
          <Tag tone={accent}>{gaps.length}</Tag>
        </div>
        <p className="font-mono-ui text-[10px] text-[var(--text-3)]">{subtitle}</p>
      </CardHeader>
      <CardContent className="p-0">
        {gaps.length === 0 ? (
          <p className="mx-4 mb-4 rounded-[8px] border border-dashed border-[var(--green-line)] bg-[var(--green-soft)] px-3 py-4 text-[13px] text-[var(--green-ink)]">
            Nothing outstanding here.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
            {gaps.map((gap, index) => (
              <li
                key={gap.skill_id}
                className={cn(
                  "border-l-2 px-3 py-2.5 list-stagger",
                  accent === "red"
                    ? "border-l-[var(--red)]"
                    : "border-l-[var(--orange)]",
                )}
                style={staggerStyle(index)}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-medium text-[var(--text)]">
                    {gap.skill}
                  </span>
                  <span className="shrink-0 font-mono-ui text-[10px] text-[var(--text-3)]">
                    {gap.have} to {gap.need}
                  </span>
                </div>
                <NeedBar
                  have={gap.have}
                  need={gap.need}
                  tone={accent}
                  delay={index * 50}
                  className="mt-2"
                />
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="font-mono-ui text-[10px] text-[var(--text-4)]">
                    {Math.round(gap.importance * 100)}% importance
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PlanSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <Skeleton className="h-40 w-full rounded-[12px]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-[12px]" />
        <Skeleton className="h-56 w-full rounded-[12px]" />
      </div>
      <Skeleton className="h-40 w-full rounded-[12px]" />
    </div>
  );
}
