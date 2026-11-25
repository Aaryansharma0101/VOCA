"use client";

/**
 * Hand-built UI primitives for the light-first Voca system.
 * No Radix, no shadcn dependencies. Plain components with CSS variables.
 */

import { clsx, type ClassValue } from "clsx";
import Link from "next/link";
import {
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { twMerge } from "tailwind-merge";

import { EmptyGrid, SpotlightLayer } from "@/components/decor";
import { useCountUp } from "@/lib/motion";
import { useSpotlight } from "@/lib/useSpotlight";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CONTROL_BASE =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[color,background-color,border-color,transform,opacity] duration-150 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.98] active:duration-[80ms] disabled:pointer-events-none disabled:opacity-50";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

const BUTTON_VARIANTS = {
  primary:
    "rounded-[8px] bg-[var(--brand)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] hover:bg-[var(--brand-hover)]",
  secondary:
    "rounded-[8px] border border-[var(--border-strong)] bg-[var(--panel)] text-[var(--text-2)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]",
  ghost:
    "rounded-[6px] text-[var(--text-3)] hover:bg-[var(--hover-fill)] hover:text-[var(--text)]",
  danger:
    "rounded-[8px] border border-[var(--red-line)] bg-[var(--red-soft)] text-[var(--red-ink)] hover:bg-[var(--red-soft)]",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 px-2.5 text-[12px]",
  md: "h-9 px-3.5 text-[13px]",
  lg: "h-10 px-4 text-[13px]",
} as const;

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        CONTROL_BASE,
        "min-h-[44px] sm:min-h-0",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function LinkButton({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        CONTROL_BASE,
        "min-h-[44px] sm:min-h-0",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

export function Card({
  className,
  onMouseMove,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const spotlight = useSpotlight<HTMLDivElement>();

  return (
    <div
      ref={spotlight.ref}
      onMouseMove={(event) => {
        spotlight.onMouseMove(event);
        onMouseMove?.(event);
      }}
      className={cn("card group", className)}
      {...props}
    >
      <SpotlightLayer className="no-print" />
      {children}
    </div>
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("space-y-1 p-4", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn("text-[13px] font-semibold tracking-[-0.01em] text-[var(--text)]", className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className={cn("text-[12px] leading-relaxed text-[var(--text-3)]", className)} {...props} />
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-0", className)} {...props} />;
}

export type TagTone =
  | "neutral"
  | "red"
  | "success"
  | "warn"
  | "blue"
  | "violet"
  | "orange"
  | "green"
  | "yellow"
  | "unmatched"
  | "outline";

const TAG_TONES: Record<TagTone, string> = {
  neutral: "border-[var(--border)] bg-transparent text-[var(--text-3)]",
  red: "border-[var(--red-line)] bg-[var(--red-soft)] text-[var(--red-ink)]",
  success: "border-[var(--green-line)] bg-[var(--green-soft)] text-[var(--green-ink)]",
  warn: "border-[var(--orange-line)] bg-[var(--orange-soft)] text-[var(--orange-ink)]",
  blue: "border-[var(--blue-line)] bg-[var(--blue-soft)] text-[var(--blue-ink)]",
  violet: "border-[var(--violet-line)] bg-[var(--violet-soft)] text-[var(--violet-ink)]",
  orange: "border-[var(--orange-line)] bg-[var(--orange-soft)] text-[var(--orange-ink)]",
  green: "border-[var(--green-line)] bg-[var(--green-soft)] text-[var(--green-ink)]",
  yellow: "border-[var(--yellow-line)] bg-[var(--yellow-soft)] text-[var(--yellow-ink)]",
  unmatched:
    "border-dashed border-[var(--border-strong)] bg-transparent text-[var(--text-3)]",
  outline: "border-[var(--border)] bg-transparent text-[var(--text-3)]",
};

export function Tag({
  tone = "neutral",
  className,
  children,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: TagTone }) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1 rounded-[6px] border px-1.5 text-[11px] font-medium uppercase leading-none tracking-[0.04em]",
        TAG_TONES[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-[8px]", className)} aria-hidden="true" />;
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
      aria-hidden="true"
    />
  );
}

export function SkillDots({
  level,
  className,
  label,
}: {
  level: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("flex items-center gap-1", className)}
      role="img"
      aria-label={label ?? `Level ${level} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((step) => (
        <span
          key={step}
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            step <= level ? "bg-[var(--blue)]" : "bg-[var(--border-strong)]",
          )}
        />
      ))}
    </div>
  );
}

/** A 14px ring with a gentle sweep and the numeric level beside it. */
export function SkillRing({
  level,
  className,
  showValue = true,
}: {
  level: number;
  className?: string;
  showValue?: boolean;
}) {
  const clamped = Math.max(0, Math.min(5, level));
  const [fill, setFill] = useState(0);
  const size = 14;
  const stroke = 1.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setFill(clamped);
      return;
    }
    const frame = window.requestAnimationFrame(() => setFill(clamped));
    return () => window.cancelAnimationFrame(frame);
  }, [clamped]);

  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-1.5", className)}
      role="img"
      aria-label={`Level ${clamped} out of 5`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border-strong)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--blue)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fill / 5)}
          style={{ transition: "stroke-dashoffset 400ms var(--ease-enter)" }}
        />
      </svg>
      {showValue ? (
        <span className="text-[11px] font-medium tabular-nums text-[var(--text-2)]">
          {clamped}
        </span>
      ) : null}
    </span>
  );
}

/** Four-pixel have/need bar with a quiet marker at the required level. */
export function NeedBar({
  have,
  need,
  tone = "red",
  delay = 0,
  className,
}: {
  have: number;
  need: number;
  tone?: "red" | "orange";
  delay?: number;
  className?: string;
}) {
  const fill = Math.max(0, Math.min(5, have)) / 5;
  const marker = Math.max(0, Math.min(5, need)) / 5;

  return (
    <div
      className={cn(
        "relative h-1 w-full rounded-[2px] bg-[var(--panel-2)]",
        className,
      )}
      aria-hidden="true"
    >
      <div
        className={cn(
          "h-full origin-left rounded-[2px] animate-bar-grow",
          tone === "red" ? "bg-[var(--red)]" : "bg-[var(--orange)]",
        )}
        style={
          {
            width: `${fill * 100}%`,
            "--bar-delay": `${delay}ms`,
          } as CSSProperties
        }
      />
      <span
        className="absolute -top-[2px] h-2 w-px -translate-x-1/2 bg-[var(--text-3)]"
        style={{ left: `${marker * 100}%` }}
      />
    </div>
  );
}

export function Chip({
  active,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-[22px] min-h-[44px] items-center rounded-[6px] border px-2 text-[11px] font-medium uppercase tracking-[0.04em] transition-colors duration-150 sm:min-h-0",
        active
          ? "border-[var(--brand-line)] bg-[var(--brand-soft)] text-[var(--text)]"
          : "border-[var(--border)] bg-transparent text-[var(--text-3)] hover:border-[var(--border-strong)] hover:bg-[var(--hover-fill)] hover:text-[var(--text)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card relative isolate flex flex-col items-center justify-center gap-3 overflow-hidden px-6 py-10 text-center">
      <EmptyGrid />
      <div className="relative z-10 flex flex-col items-center gap-3">
        {icon ? (
          <div className="grid h-10 w-10 place-items-center rounded-[10px] border border-[var(--border)] bg-[var(--panel-2)] text-[var(--text-3)]">
            {icon}
          </div>
        ) : null}
        <h2 className="text-[14px] font-semibold text-[var(--text)]">{title}</h2>
        {children ? (
          <div className="max-w-md text-[13px] leading-relaxed text-[var(--text-3)]">
            {children}
          </div>
        ) : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </div>
  );
}

export function ReadinessDisplay({
  value,
  size = "lg",
}: {
  value: number;
  size?: "sm" | "md" | "lg";
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const display = useCountUp(clamped, 700);
  const dimension = size === "sm" ? 44 : size === "md" ? 56 : 72;
  const stroke = size === "sm" ? 4 : size === "md" ? 5 : 6;
  const radius = (dimension - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color =
    clamped < 40 ? "var(--red)" : clamped <= 70 ? "var(--yellow)" : "var(--green)";
  const textSize =
    size === "sm" ? "text-[11px]" : size === "md" ? "text-[14px]" : "text-[17px]";

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="relative grid place-items-center"
        style={{ width: dimension, height: dimension }}
      >
        <svg
          width={dimension}
          height={dimension}
          viewBox={`0 0 ${dimension} ${dimension}`}
          className="-rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth={stroke}
          />
          <circle
            cx={dimension / 2}
            cy={dimension / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - display / 100)}
          />
        </svg>
        <span
          className={cn("absolute font-semibold tabular-nums tracking-[-0.03em]", textSize)}
          style={{ color }}
        >
          {display}%
        </span>
      </div>
      <span className="font-mono-ui text-[10px] text-[var(--text-3)]">
        of requirements met
      </span>
    </div>
  );
}

export function LoadingDots({ className }: { className?: string }) {
  return (
    <div className={cn("inline-flex gap-1", className)} aria-label="Loading">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:150ms]" />
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current [animation-delay:300ms]" />
    </div>
  );
}
