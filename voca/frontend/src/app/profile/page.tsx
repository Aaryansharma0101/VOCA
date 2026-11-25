"use client";

/**
 * Profile: what this browser remembers, plus save/load and export.
 *
 * Saving posts to /profiles. Without Supabase configured the API stores the
 * record in local SQLite, so the short ID works on the same machine. With
 * Supabase configured the same ID works across devices.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Check,
  CloudDownload,
  Download,
  RotateCcw,
  Route,
  Save,
  User,
} from "lucide-react";

import { useVoca } from "@/components/providers";
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
  Spinner,
  Tag,
  cn,
} from "@/components/ui";
import { ApiError, api } from "@/lib/api";
import type { Skill } from "@/lib/types";

export default function ProfilePage() {
  const { state, update, resetAll, toast, hydrated } = useVoca();
  const [catalogue, setCatalogue] = useState<Record<string, Skill>>({});
  const [saving, setSaving] = useState(false);
  const [loadingId, setLoadingId] = useState(false);
  const [lookupId, setLookupId] = useState("");

  useEffect(() => {
    let cancelled = false;
    api
      .skills()
      .then((skills) => {
        if (!cancelled) setCatalogue(Object.fromEntries(skills.map((skill) => [skill.id, skill])));
      })
      .catch(() => {
        // Names fall back to IDs.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const matched = state.skills.filter((skill) => skill.skill_id);
  const unmatched = state.skills.filter((skill) => !skill.skill_id);

  async function save() {
    setSaving(true);
    try {
      const record = await api.saveProfile({
        skills: matched.map((skill) => ({ skill_id: skill.skill_id as string, level: skill.level })),
        target_occupation_id: state.targetOccupationId,
        story: state.story || null,
        plan: state.plan,
      });
      update({ savedProfileId: record.id });
      toast(`Saved as ${record.id} (${record.storage}).`, "success");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Could not save the profile.");
    } finally {
      setSaving(false);
    }
  }

  async function load() {
    const id = lookupId.trim() || state.savedProfileId || "";
    if (!id) {
      toast("Enter a profile ID to load.", "info");
      return;
    }
    setLoadingId(true);
    try {
      const record = await api.getProfile(id);
      update({
        skills: record.skills.map((item) => {
          const skill = catalogue[item.skill_id];
          return {
            skill_id: item.skill_id,
            name: skill?.name ?? item.skill_id,
            level: item.level,
            evidence: "Restored from a saved profile",
            kind: skill?.category ?? "hard",
            matched: true,
          };
        }),
        story: record.story ?? "",
        targetOccupationId: record.target_occupation_id,
        plan: record.plan,
        savedProfileId: record.id,
      });
      toast(`Loaded profile ${record.id}.`, "success");
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Could not load that profile.");
    } finally {
      setLoadingId(false);
    }
  }

  if (!hydrated) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full rounded-[12px]" />
      </div>
    );
  }

  if (matched.length === 0 && !state.plan) {
    return (
      <EmptyState
        icon={<User className="h-5 w-5" />}
        title="Nothing saved yet"
        action={
          <LinkButton href="/understand">
            Start with your story
          </LinkButton>
        }
      >
        Once you have a skills profile and a plan, they live here; in this browser, and
        on the backend if you save an ID.
      </EmptyState>
    );
  }

  const readiness = state.plan?.readiness_pct ?? 0;
  const readinessTone =
    readiness < 40 ? "red" : readiness <= 70 ? "yellow" : "green";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Tag tone="neutral" className="font-mono-ui">
            Profile
          </Tag>
          <h1 className="page-title mt-2">Your saved work</h1>
          <p className="mt-1 text-[12px] text-[var(--text-3)]">
            {matched.length} skills {state.plan ? `, plan for ${state.plan.target.title}` : ", no plan yet"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 no-print">
          <Button onClick={save} disabled={saving || matched.length === 0}>
            {saving ? <Spinner /> : <Save className="h-4 w-4" />}
            Save profile
          </Button>
          <Button variant="secondary" onClick={() => window.print()} disabled={!state.plan}>
            <Download className="h-4 w-4" />
            Print / PDF
          </Button>
        </div>
      </header>

      {state.savedProfileId ? (
        <p className="flex items-center gap-2 rounded-[8px] border border-[var(--green-line)] bg-[var(--green-soft)] px-3 py-2 text-[12px] text-[var(--green-ink)]">
          <Check className="h-3.5 w-3.5" />
          Saved profile ID: <code className="font-mono-ui">{state.savedProfileId}</code>; keep it
          to reload this profile.
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <Card className="overflow-hidden print-block">
            <CardHeader>
              <CardTitle>Skills</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
                {matched.map((skill) => (
                  <li
                    key={skill.skill_id as string}
                    className="flex items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <span className="min-w-0 truncate text-[13px] text-[var(--text)]">
                      {skill.name}
                    </span>
                    <SkillDots level={skill.level} />
                  </li>
                ))}
              </ul>
              {unmatched.length ? (
                <p className="px-4 py-3 text-[11px] leading-relaxed text-[var(--text-3)]">
                  {unmatched.length} unmatched skill{unmatched.length === 1 ? "" : "s"} kept
                  out of matching: {unmatched.map((skill) => skill.name).join(", ")}.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {state.plan ? (
            <Card className="overflow-hidden print-block">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Plan: {state.plan.target.title}</CardTitle>
                  <Tag tone={readinessTone}>{state.plan.readiness_pct}% ready</Tag>
                </div>
                <p className="font-mono-ui text-[10px] text-[var(--text-3)]">
                  {state.plan.timeline}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-[13px] leading-relaxed text-[var(--text)]">
                  {state.plan.summary}
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-1.5 font-mono-ui text-[10px] text-[var(--red-ink)]">
                      Essential gaps
                    </h3>
                    <ul className="divide-y divide-[var(--border)]">
                      {state.plan.essential_gaps.map((gap) => (
                        <li
                          key={gap.skill_id}
                          className="flex justify-between gap-2 py-1.5 text-[12px]"
                        >
                          <span className="min-w-0 truncate">{gap.skill}</span>
                          <span className="shrink-0 font-mono-ui text-[10px] text-[var(--text-3)]">
                            {gap.have} to {gap.need}
                          </span>
                        </li>
                      ))}
                      {state.plan.essential_gaps.length === 0 ? (
                        <li className="py-1.5 text-[12px] text-[var(--text-3)]">None.</li>
                      ) : null}
                    </ul>
                  </div>
                  <div>
                    <h3 className="mb-1.5 font-mono-ui text-[10px] text-[var(--orange-ink)]">
                      Optional
                    </h3>
                    <ul className="divide-y divide-[var(--border)]">
                      {state.plan.optional_gaps.map((gap) => (
                        <li
                          key={gap.skill_id}
                          className="flex justify-between gap-2 py-1.5 text-[12px]"
                        >
                          <span className="min-w-0 truncate">{gap.skill}</span>
                          <span className="shrink-0 font-mono-ui text-[10px] text-[var(--text-3)]">
                            {gap.have} to {gap.need}
                          </span>
                        </li>
                      ))}
                      {state.plan.optional_gaps.length === 0 ? (
                        <li className="py-1.5 text-[12px] text-[var(--text-3)]">None.</li>
                      ) : null}
                    </ul>
                  </div>
                </div>

                {state.plan.steps.length ? (
                  <div>
                    <h3 className="mb-1.5 font-mono-ui text-[10px] text-[var(--text-3)]">
                      Steps
                    </h3>
                    <ol className="list-decimal space-y-1 pl-4 text-[12px] leading-relaxed">
                      {state.plan.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                <p className="font-mono-ui text-[10px] text-[var(--text-3)]">
                  Outlook labels are estimates from the seed catalogue, not live data.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <p className="text-[13px] text-[var(--text-3)]">
                  No plan yet; pick a target role to complete your profile.
                </p>
                <LinkButton href="/plan" size="sm">
                  <Route className="h-3.5 w-3.5" />
                  Build a plan
                </LinkButton>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-3 no-print">
          <Card>
            <CardHeader>
              <CardTitle>Load a saved profile</CardTitle>
              <p className="font-mono-ui text-[10px] text-[var(--text-3)]">
                Paste an ID from a previous save. Without Supabase this works on this
                machine; with Supabase it works anywhere.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <input
                value={lookupId}
                onChange={(event) => setLookupId(event.target.value)}
                placeholder="e.g. 4f2a9c81be07"
                aria-label="Profile ID"
                className="input font-mono"
              />
              <Button variant="secondary" className="w-full" onClick={load} disabled={loadingId}>
                {loadingId ? <Spinner /> : <CloudDownload className="h-4 w-4" />}
                Load profile
              </Button>
            </CardContent>
          </Card>

          <Card className={cn("border-[var(--red-line)]")}>
            <CardHeader>
              <CardTitle className="text-[var(--red-ink)]">Start over</CardTitle>
              <p className="font-mono-ui text-[10px] text-[var(--text-3)]">
                Clears the profile, target and plan from this browser. Saved backend
                copies stay until you delete them.
              </p>
            </CardHeader>
            <CardContent>
              <Button variant="danger" className="w-full" onClick={resetAll}>
                <RotateCcw className="h-4 w-4" />
                Reset everything
              </Button>
            </CardContent>
          </Card>

          <p className="font-mono-ui text-[10px] leading-relaxed text-[var(--text-3)]">
            Printing uses your browser's PDF export. Choose "Save as PDF" as the
            destination for a shareable copy.{" "}
            <Link href="/plan" className="text-[var(--brand)] underline underline-offset-2">
              Review the plan
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
