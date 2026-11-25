"use client";

/**
 * Skill graph.
 *
 * Skills on the left, matched occupations on the right. Clicking an occupation
 * opens a panel with its description and a have/gap breakdown of its
 * requirements. Requirements come from the catalogue, so this page works
 * without running a plan (and without a second model call).
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, Clock, Network } from "lucide-react";

import { useVoca } from "@/components/providers";
import SkillGraph from "@/components/skill-graph";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  LinkButton,
  Skeleton,
  SkillDots,
  Tag,
  cn,
} from "@/components/ui";
import { api } from "@/lib/api";
import type { Occupation, Skill } from "@/lib/types";

export default function DashboardPage() {
  const router = useRouter();
  const { state, update, theme, hydrated } = useVoca();
  const [details, setDetails] = useState<Record<string, Occupation>>({});
  const [catalogue, setCatalogue] = useState<Record<string, Skill>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const matchedSkills = state.skills.filter((skill) => skill.matched);

  useEffect(() => {
    let cancelled = false;
    const ids = state.matches.map((match) => match.occupation_id);
    if (ids.length === 0) return;

    Promise.all(ids.map((id) => api.occupation(id)))
      .then((occupations) => {
        if (cancelled) return;
        setDetails(Object.fromEntries(occupations.map((item) => [item.id, item])));
        setSelectedId((current) => current ?? occupations[0]?.id ?? null);
      })
      .catch(() => {
        // The graph still renders; the panel shows what it can.
      });

    return () => {
      cancelled = true;
    };
  }, [state.matches]);

  useEffect(() => {
    let cancelled = false;
    api
      .skills()
      .then((skills) => {
        if (!cancelled) setCatalogue(Object.fromEntries(skills.map((skill) => [skill.id, skill])));
      })
      .catch(() => {
        // Skill names fall back to IDs.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const occupations = useMemo(
    () => state.matches.map((match) => details[match.occupation_id]).filter(Boolean),
    [state.matches, details],
  );

  const selected = selectedId ? details[selectedId] : null;
  const levelOf = (skillId: string) =>
    state.skills.find((skill) => skill.skill_id === skillId)?.level ?? 0;

  const panelLoading = state.matches.length > 0 && occupations.length === 0;

  if (hydrated && matchedSkills.length === 0) {
    return (
      <EmptyState
        icon={<Network className="h-5 w-5" />}
        title="No skills to graph yet"
        action={
          <LinkButton href="/understand">
            Analyse your story first
          </LinkButton>
        }
      >
        The graph draws your matched skills against the roles they open. Run the
        Understand stage and it fills itself in.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <span className="font-mono-ui text-[var(--text-3)]">
            {matchedSkills.length} skills, {state.matches.length} roles
          </span>
          <h1 className="page-title mt-1">Your skill graph</h1>
          <p className="page-subtitle mt-1">
            Click an occupation to see which of its requirements you already meet and which
            are gaps. Edge thickness is the requirement's importance.
          </p>
        </div>
        <LinkButton href="/understand" variant="secondary" size="sm">
          Edit skills
        </LinkButton>
      </header>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden p-0">
          {panelLoading ? (
            <div className="h-[520px] w-full p-4 sm:h-[600px]">
              <Skeleton className="h-full w-full rounded-[8px]" />
            </div>
          ) : (
            <SkillGraph
              skills={matchedSkills}
              occupations={occupations}
              selectedId={selectedId}
              onSelect={setSelectedId}
              isDark={theme === "dark"}
            />
          )}
        </Card>

        <Card className="h-fit overflow-hidden lg:sticky lg:top-[64px]">
          {panelLoading ? (
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          ) : selected ? (
            <div key={selected.id} className="animate-panel-in">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-[14px]">{selected.title}</CardTitle>
                  <Tag tone="neutral">{selected.industry}</Tag>
                </div>
                <p className="text-[12px] leading-relaxed text-[var(--text-3)]">
                  {selected.description}
                </p>
                <div className="flex flex-wrap gap-3 pt-1 font-mono-ui text-[10px] text-[var(--text-3)]">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {selected.typical_time_to_enter}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {selected.requires.length} requirements
                  </span>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                <h3 className="font-mono-ui text-[var(--text-3)]">
                  Requirements
                </h3>
                <ul className="space-y-1.5">
                  {selected.requires
                    .slice()
                    .sort((a, b) => b.importance - a.importance)
                    .map((requirement) => {
                      const have = levelOf(requirement.skill_id);
                      const met = have >= requirement.level;
                      const name = catalogue[requirement.skill_id]?.name ?? requirement.skill_id;
                      return (
                        <li
                          key={requirement.skill_id}
                          className={cn(
                            "border-l-2 px-2.5 py-2",
                            met
                              ? "border-l-[var(--blue)] bg-[var(--blue-soft)]/50"
                              : "border-l-[var(--red)] bg-[var(--red-soft)]/50",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-[12px] font-medium text-[var(--text)]">
                              {name}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 font-mono-ui text-[10px]",
                                met
                                  ? "text-[var(--blue-ink)]"
                                  : "text-[var(--red-ink)]",
                              )}
                            >
                              {have}/{requirement.level}
                            </span>
                          </div>
                          <div className="mt-1.5">
                            <SkillDots
                              level={have}
                              label={`${name}: you ${have}, needs ${requirement.level}`}
                            />
                          </div>
                        </li>
                      );
                    })}
                </ul>

                <Button
                  className="w-full"
                  onClick={() => {
                    update({ targetOccupationId: selected.id, plan: null });
                    router.push("/plan");
                  }}
                >
                  Plan this career
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </div>
          ) : (
            <CardContent className="p-4 text-[13px] text-[var(--text-3)]">
              Click a role in the graph to see its requirements.
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}
