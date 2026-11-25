import type { CSSProperties } from "react";

/**
 * Decorative layers only. Every layer is aria-hidden, pointer-events-none and
 * absolutely positioned, so it cannot intercept a click or add scroll height.
 */

export const heroTextStyle: CSSProperties = {
  backgroundImage: "linear-gradient(180deg, var(--text) 0%, var(--text-3) 135%)",
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
};

const STAGE_GLOW = {
  blue: "var(--blue-glow)",
  violet: "var(--violet-glow)",
  green: "var(--green-glow)",
} as const;

export function HeroDecor() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-260px] h-[560px] w-[560px] -ml-[280px]">
        <div
          className="hero-drift h-full w-full rounded-full"
          style={{
            background: "radial-gradient(circle, var(--brand-glow) 0%, transparent 68%)",
          }}
        />
      </div>
      <div
        className="hero-drift-slow absolute right-[-140px] top-[80px] h-[360px] w-[360px] rounded-full"
        style={{
          background: "radial-gradient(circle, var(--violet-glow) 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--grid-line) 1px, transparent 1px), linear-gradient(to bottom, var(--grid-line) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage: "radial-gradient(ellipse at center, black 18%, transparent 76%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 18%, transparent 76%)",
        }}
      />
    </div>
  );
}

export function StageGlow({ tone }: { tone: keyof typeof STAGE_GLOW }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute right-0 top-0 -z-10 h-80 w-80 overflow-hidden"
    >
      <div
        className="absolute right-0 top-0 h-80 w-80"
        style={{
          background: `radial-gradient(circle at top right, ${STAGE_GLOW[tone]} 0%, transparent 70%)`,
        }}
      />
    </div>
  );
}

export function SpotlightLayer({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-150 group-hover:opacity-100 ${className}`}
      style={{
        background:
          "radial-gradient(120px circle at var(--mx, 50%) var(--my, 50%), var(--brand-soft) 0%, transparent 72%)",
      }}
    />
  );
}

export function EmptyGrid() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: "radial-gradient(circle, var(--grid-dot) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
        maskImage: "radial-gradient(ellipse at center, black 8%, transparent 68%)",
        WebkitMaskImage: "radial-gradient(ellipse at center, black 8%, transparent 68%)",
      }}
    />
  );
}
