"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, BookOpen, Compass, GitBranch, Lock, Route } from "lucide-react";

import { HeroDecor } from "@/components/decor";
import { Card, CardTitle, LinkButton } from "@/components/ui";
import { staggerStyle } from "@/lib/motion";

const STEPS = [
  {
    step: "01",
    title: "Understand",
    icon: Compass,
    body: "Tell Voca what you have actually done, in your own words. It finds the skills in your story, rates them, and shows the roles they already open.",
    href: "/understand",
    cta: "Start with your story",
    tone: "blue",
  },
  {
    step: "02",
    title: "Plan",
    icon: Route,
    body: "Pick a target. See your readiness, the essential gaps versus the nice-to-haves, and the bridge roles you could take now on the way there.",
    href: "/plan",
    cta: "See a plan",
    tone: "violet",
  },
  {
    step: "03",
    title: "Act",
    icon: BadgeCheck,
    body: "Get a short list of free courses and real-world practice for the gaps that matter, each one linked to a specific skill.",
    href: "/opportunities",
    cta: "Find opportunities",
    tone: "green",
  },
] as const;

const FEATURES = [
  {
    icon: BadgeCheck,
    title: "Numbers you can check",
    body: "Readiness, gaps and bridge roles are computed by code from a skills graph. The model extracts and explains; it never invents a score.",
  },
  {
    icon: GitBranch,
    title: "Bridge roles, not leaps",
    body: "Every step is a job you could plausibly get now that moves you closer to the target, ranked by how much of it you already cover.",
  },
  {
    icon: BookOpen,
    title: "Free, real resources",
    body: "NPTEL, freeCodeCamp, Khan Academy, Google Career Certificates, Skill India and more; every entry names the skill gap it closes.",
  },
  {
    icon: Lock,
    title: "No account, no database needed",
    body: "Your profile lives in your browser. The whole app runs with only an LLM key; the graph and storage fall back to local files.",
  },
] as const;

const STATS = [
  { value: "86", label: "skills in the catalogue" },
  { value: "36", label: "occupations across 10 industries" },
  { value: "94", label: "learning and practice options" },
] as const;

const STAGE_EDGE = {
  blue: "border-t-[var(--blue)]",
  violet: "border-t-[var(--violet)]",
  green: "border-t-[var(--green)]",
} as const;

const STAGE_TEXT = {
  blue: "text-[var(--blue)]",
  violet: "text-[var(--violet)]",
  green: "text-[var(--green)]",
} as const;

export default function HomePage() {
  return (
    <div className="space-y-20 sm:space-y-28">
      <section className="relative isolate pt-4 sm:pt-10">
        <HeroDecor />

        <div className="relative">
          <h1 className="max-w-[860px] text-balance text-[clamp(2.75rem,5.4vw,5rem)] font-semibold leading-[0.98] tracking-[-0.04em]">
            You already have more skills than you think.
          </h1>

          <p className="mt-6 max-w-[700px] text-[15px] leading-7 text-[var(--text-2)] sm:text-base">
            Tell Voca what you have done. It finds the skills in it, shows which careers they fit, and lays out what is missing and where to learn it. Most of it is free.
          </p>

          <div className="mt-9 flex flex-col gap-2 sm:flex-row sm:items-center">
            <LinkButton
              href="/understand"
              size="lg"
              className="h-12 w-full rounded-full px-6 sm:w-auto"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
            <LinkButton
              href="/dashboard"
              variant="secondary"
              size="lg"
              className="h-12 w-full rounded-full px-6 sm:w-auto"
            >
              <GitBranch className="h-4 w-4" />
              Explore the skill graph
            </LinkButton>
          </div>

          <p className="mt-3.5 text-[12px] leading-relaxed text-[var(--text-3)]">
            No account needed. Your story is sent to the AI model only to pick out skills.
          </p>

          <div
            aria-label="Catalogue totals"
            className="mt-14 border-t border-[var(--border)] pt-8 sm:mt-16 sm:pt-10"
          >
            <dl className="grid gap-10 sm:grid-cols-3 sm:gap-6">
              {STATS.map((stat) => (
                <div key={stat.label} className="min-w-0">
                  <dd className="text-[56px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-[var(--text)] sm:text-[64px]">
                    {stat.value}
                  </dd>
                  <dt className="mt-3 max-w-[190px] font-mono-ui text-[10px] leading-[1.5] text-[var(--text-3)]">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-it-works">
        <div className="max-w-2xl">
          <p className="font-mono-ui text-[var(--text-3)]">How it works</p>
          <h2
            id="how-it-works"
            className="mt-2 text-[24px] font-semibold tracking-[-0.03em] sm:text-[28px]"
          >
            Three stages, no jargon
          </h2>
        </div>

        <ol className="mt-5 grid gap-3 md:grid-cols-3">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <li key={step.step} className="min-w-0">
                <Card
                  className={`h-full border-t-2 p-4 ${STAGE_EDGE[step.tone]} list-stagger`}
                  style={staggerStyle(index)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-mono-ui text-[10px] ${STAGE_TEXT[step.tone]}`}>
                      {step.step}
                    </span>
                    <Icon className="h-4 w-4 text-[var(--text-3)]" />
                  </div>
                  <CardTitle className="mt-3 text-[14px]">{step.title}</CardTitle>
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-3)]">
                    {step.body}
                  </p>
                  <Link
                    href={step.href}
                    className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-[var(--text)] transition-colors duration-150 hover:text-[var(--brand)]"
                  >
                    {step.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Card>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="why-voca">
        <div className="max-w-2xl">
          <p className="font-mono-ui text-[var(--text-3)]">Why it is different</p>
          <h2
            id="why-voca"
            className="mt-2 text-[24px] font-semibold tracking-[-0.03em] sm:text-[28px]"
          >
            Career advice, minus the guesswork
          </h2>
        </div>

        <div className="mt-5 grid gap-px overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--border)] sm:grid-cols-2">
          {FEATURES.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                className="rounded-none border-0 bg-[var(--panel)] p-4 shadow-none list-stagger"
                style={staggerStyle(index)}
              >
                <div className="flex gap-3">
                  <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-[7px] border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text-2)]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-semibold text-[var(--text)]">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-[13px] leading-relaxed text-[var(--text-3)]">
                      {feature.body}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <Card className="p-6 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-xl">
              <h2 className="text-[22px] font-semibold tracking-[-0.03em] sm:text-[26px]">
                Start with the job you have already done.
              </h2>
              <p className="mt-2 text-[13px] leading-relaxed text-[var(--text-3)]">
                Six years of teaching, a warehouse shift, a family business; it all counts. Write it down and see what it is worth.
              </p>
            </div>
            <LinkButton href="/understand" size="lg" className="shrink-0">
              Analyse my skills
              <ArrowRight className="h-4 w-4" />
            </LinkButton>
          </div>
        </Card>
      </section>
    </div>
  );
}
