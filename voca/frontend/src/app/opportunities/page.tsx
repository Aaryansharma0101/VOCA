"use client";

/**
 * Stage 3: Act.
 *
 * Shows practice and learning opportunities for the essential gaps of the
 * current plan. Ranking (how many gaps each resource covers) is done by the
 * backend; filters here narrow the result without re-ranking it.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  Compass,
  ExternalLink,
  Hammer,
  Info,
} from "lucide-react";

import { StageGlow } from "@/components/decor";
import { useVoca } from "@/components/providers";
import {
  Card,
  CardContent,
  Chip,
  EmptyState,
  LinkButton,
  Skeleton,
  Tag,
  cn,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import { staggerStyle } from "@/lib/motion";
import type { ActResource, ActResponse, ResourceKind } from "@/lib/types";

const REGIONS = [
  { value: "", label: "Any region" },
  { value: "India", label: "India" },
  { value: "UK", label: "United Kingdom" },
  { value: "US", label: "United States" },
] as const;

const KIND_LABELS: Record<ResourceKind, string> = {
  course: "Course",
  training: "Training",
  apprenticeship: "Apprenticeship",
  project: "Project",
  volunteering: "Volunteering",
  community: "Community",
  internship: "Opening",
};

export default function OpportunitiesPage() {
  const { state, hydrated, toast } = useVoca();
  const [data, setData] = useState<ActResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [freeOnly, setFreeOnly] = useState(true);
  const [region, setRegion] = useState("");
  const [kind, setKind] = useState<ResourceKind | "all">("all");

  const plan = state.plan;
  const gaps = plan ? (plan.essential_gaps.length ? plan.essential_gaps : plan.optional_gaps) : [];
  const gapKey = gaps.map((gap) => gap.skill_id).join(",");
  const gapNames = useMemo(() => new Map(gaps.map((gap) => [gap.skill_id, gap.skill])), [gaps]);

  useEffect(() => {
    if (!gapKey) return;
    let cancelled = false;
    setPending(true);
    api
      .act(gapKey.split(","), { region: region || null, freeOnly })
      .then((response) => {
        if (!cancelled) setData(response);
      })
      .catch((error) => {
        if (!cancelled) {
          toast(error instanceof ApiError ? error.message : "Could not load opportunities.");
          setData(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [gapKey, region, freeOnly]);

  const availableKinds = useMemo(() => {
    if (!data) return [] as ResourceKind[];
    const kinds = new Set<ResourceKind>();
    for (const item of [...data.practice, ...data.learn]) kinds.add(item.kind);
    return Array.from(kinds).sort();
  }, [data]);

  const filter = (items: ActResource[]) =>
    kind === "all" ? items : items.filter((item) => item.kind === kind);

  if (hydrated && !plan) {
    return (
      <EmptyState
        icon={<Compass className="h-5 w-5" />}
        title="Build a plan first"
        action={
          <LinkButton href="/plan">
            Go to Plan
          </LinkButton>
        }
      >
        Opportunities are chosen to close the gaps in your plan, so there is nothing to
        show until you have one.
      </EmptyState>
    );
  }

  if (hydrated && plan && gaps.length === 0) {
    return (
      <EmptyState
        icon={<Compass className="h-5 w-5" />}
        title="Nothing left to close"
        action={<LinkButton href="/plan" variant="secondary">Back to plan</LinkButton>}
      >
        You already meet every requirement for {plan.target.title}. Apply, and use the
        skill graph to aim at the next role.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <header className="relative isolate flex flex-wrap items-end justify-between gap-3 pb-1">
        <StageGlow tone="green" />
        <div className="min-w-0">
          <Tag tone="green" className="font-mono-ui">
            Stage 3
          </Tag>
          <h1 className="page-title mt-3">Close the gaps, for free</h1>
          <p className="page-subtitle mt-1">
            {plan
              ? `Chosen for the ${gaps.length} essential gap${gaps.length === 1 ? "" : "s"} toward ${plan.target.title}. Each card names the skills it covers.`
              : "Loading your gaps…"}
          </p>
        </div>
        <LinkButton href="/plan" variant="secondary" size="sm">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to plan
        </LinkButton>
      </header>

      <Card className="sticky top-[60px] z-10">
        <CardContent className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label
                htmlFor="region"
                className="mb-1 block font-mono-ui text-[10px] text-[var(--text-3)]"
              >
                Region
              </label>
              <select
                id="region"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
                className="select h-9 w-auto min-w-[150px]"
              >
                {REGIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="inline-flex h-9 cursor-pointer items-center gap-2 text-[12px] text-[var(--text-2)]">
              <input
                type="checkbox"
                checked={freeOnly}
                onChange={(event) => setFreeOnly(event.target.checked)}
                className="h-4 w-4 accent-[var(--brand)]"
              />
              Free only
            </label>

            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono-ui text-[10px] text-[var(--text-3)]">Type:</span>
              <Chip active={kind === "all"} onClick={() => setKind("all")}>
                All
              </Chip>
              {availableKinds.map((option) => (
                <Chip key={option} active={kind === option} onClick={() => setKind(option)}>
                  {KIND_LABELS[option]}
                </Chip>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 rounded-[8px] border border-[var(--orange-line)] bg-[var(--orange-soft)] px-3 py-2 text-[11px] leading-relaxed text-[var(--orange-ink)] no-print">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        Links point at provider home pages or search pages and can change. Check a
        resource is still free and running before you commit time to it.
      </p>

      {pending && <ResourceSkeleton />}

      {!pending && data ? (
        <>
          <ResourceSection
            title="Practise in the real world"
            description="Projects, volunteering and openings that build the skill while you do something useful."
            icon={<Hammer className="h-4 w-4" />}
            resources={filter(data.practice)}
            gapNames={gapNames}
            totalGaps={gaps.length}
            empty="No real-world practice found for these gaps and filters."
          />
          <ResourceSection
            title="Learn and train"
            description="Structured courses and training you can start this week."
            icon={<BookOpen className="h-4 w-4" />}
            resources={filter(data.learn)}
            gapNames={gapNames}
            totalGaps={gaps.length}
            empty="No courses found for these gaps and filters."
          />

          {data.practice.length === 0 && data.learn.length === 0 ? (
            <EmptyState icon={<Compass className="h-5 w-5" />} title="No resources for these filters">
              Try clearing the type or region filter, or allowing paid resources.
            </EmptyState>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function ResourceSection({
  title,
  description,
  icon,
  resources,
  gapNames,
  totalGaps,
  empty,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  resources: ActResource[];
  gapNames: Map<string, string>;
  totalGaps: number;
  empty: string;
}) {
  const practice = title === "Practise in the real world";

  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-8 w-8 place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text-3)]">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold tracking-[-0.02em]">{title}</h2>
          <p className="text-[12px] text-[var(--text-3)]">{description}</p>
        </div>
      </div>

      {resources.length === 0 ? (
        <p className="rounded-[8px] border border-dashed border-[var(--border-strong)] px-4 py-6 text-center text-[13px] text-[var(--text-3)]">
          {empty}
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {resources.map((resource, index) => (
            <li key={resource.id} className="min-w-0">
              <Card
                className={cn(
                  "flex h-full flex-col border-t-2 p-4 list-stagger",
                  practice
                    ? "border-t-[var(--blue)]"
                    : "border-t-[var(--violet)]",
                )}
                style={staggerStyle(index)}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[13px] font-medium leading-snug text-[var(--text)]">
                    {resource.title}
                  </h3>
                  <Tag tone={resource.cost === "free" ? "green" : "yellow"}>
                    {resource.cost}
                  </Tag>
                </div>

                <p className="mt-1 font-mono-ui text-[10px] text-[var(--text-3)]">
                  {resource.provider}
                </p>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Tag tone="neutral">{KIND_LABELS[resource.kind]}</Tag>
                  <Tag tone="neutral">{resource.region}</Tag>
                  <span
                    className={cn(
                      "font-mono-ui text-[10px]",
                      resource.covers > 1
                        ? "text-[var(--green-ink)]"
                        : "text-[var(--text-3)]",
                    )}
                  >
                    covers {resource.covers} of your {totalGaps} gap{totalGaps === 1 ? "" : "s"}
                  </span>
                </div>

                {resource.description ? (
                  <p className="mt-2 line-clamp-3 text-[12px] leading-relaxed text-[var(--text-3)]">
                    {resource.description}
                  </p>
                ) : null}

                <div className="mt-2 flex flex-wrap gap-1">
                  {resource.covers_skills.map((skillId) => (
                    <Tag key={skillId} tone="neutral">
                      {gapNames.get(skillId) ?? skillId}
                    </Tag>
                  ))}
                </div>

                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-auto inline-flex items-center gap-1.5 pt-3 text-[13px] font-medium text-[var(--brand)] transition-colors duration-150 hover:text-[var(--brand-hover)]"
                >
                  Open
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResourceSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2" aria-busy="true">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-44 w-full rounded-[12px]" />
      ))}
    </div>
  );
}
