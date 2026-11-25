"use client";

/**
 * Interactive skill/occupation graph.
 *
 * Two columns by design: the user's skills on the left, the matched occupations
 * on the right, with an edge for every requirement the occupation has on a
 * skill the user has. Edge width and opacity encode the requirement's
 * importance, so an essential gap looks different from a nice-to-have.
 *
 * A preset layout is used instead of a force layout: the columns stay stable
 * between renders and the graph reads left-to-right.
 */

import cytoscape, { type Core, type ElementDefinition } from "cytoscape";
import { Maximize2, Minus, Plus } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button, cn } from "@/components/ui";
import type { Occupation, UnderstoodSkill } from "@/lib/types";

export type SkillGraphProps = {
  skills: UnderstoodSkill[];
  occupations: Occupation[];
  selectedId: string | null;
  onSelect: (occupationId: string) => void;
  isDark: boolean;
  className?: string;
};

const SKILL_NODE = "skill:";
const OCC_NODE = "occ:";

function buildElements(
  skills: UnderstoodSkill[],
  occupations: Occupation[],
): ElementDefinition[] {
  const skillIds = new Set(
    skills.filter((skill) => skill.skill_id).map((skill) => skill.skill_id as string),
  );

  const skillNodes: ElementDefinition[] = [];
  let row = 0;
  for (const skill of skills) {
    if (!skill.skill_id) continue;
    skillNodes.push({
      data: {
        id: `${SKILL_NODE}${skill.skill_id}`,
        label: skill.name,
        kind: "skill",
        level: skill.level,
      },
      position: { x: 0, y: row * 52 },
    });
    row += 1;
  }

  const occupationNodes: ElementDefinition[] = [];
  const edges: ElementDefinition[] = [];
  const spacing = Math.max(120, (row * 52) / Math.max(occupations.length, 1));

  occupations.forEach((occupation, index) => {
    occupationNodes.push({
      data: {
        id: `${OCC_NODE}${occupation.id}`,
        label: occupation.title,
        kind: "occupation",
      },
      position: { x: 440, y: index * spacing },
    });

    for (const requirement of occupation.requires) {
      if (!skillIds.has(requirement.skill_id)) continue;
      edges.push({
        data: {
          id: `${SKILL_NODE}${requirement.skill_id}->${OCC_NODE}${occupation.id}`,
          source: `${SKILL_NODE}${requirement.skill_id}`,
          target: `${OCC_NODE}${occupation.id}`,
          kind: requirement.importance >= 0.6 ? "essential" : "optional",
          weight: requirement.importance,
        },
      });
    }
  });

  return [...skillNodes, ...occupationNodes, ...edges];
}

export default function SkillGraph({
  skills,
  occupations,
  selectedId,
  onSelect,
  isDark,
  className,
}: SkillGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const elements = buildElements(skills, occupations);
    if (elements.length === 0) return;

    const nodeBg = isDark ? "#0F1011" : "#FAFAFB";
    const text = isDark ? "#F7F8F8" : "#1B1C1F";
    const ink = isDark ? "rgba(255,255,255,0.12)" : "rgba(15,17,20,0.12)";
    const inkStrong = isDark ? "rgba(255,255,255,0.35)" : "rgba(15,17,20,0.35)";
    const blue = isDark ? "#5EA2FF" : "#2F7BE0";
    const violet = isDark ? "#A48BFF" : "#7C5CE0";
    const brand = "#5E6AD2";
    const fontFamily =
      window.getComputedStyle(document.body).fontFamily || "Inter, ui-sans-serif, sans-serif";

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": nodeBg,
            label: "data(label)",
            color: text,
            "font-size": 11,
            "font-family": fontFamily,
            "font-weight": 500,
            "text-valign": "center",
            "text-halign": "right",
            "text-margin-x": 8,
            "text-wrap": "wrap",
            "text-max-width": "124px",
            width: 10,
            height: 10,
            "border-width": 2,
            "border-color": isDark ? "#08090A" : "#FFFFFF",
          },
        },
        {
          selector: "node[kind = 'skill']",
          style: {
            "background-color": blue,
            "border-color": isDark ? "#08090A" : "#FFFFFF",
          },
        },
        {
          selector: "node[kind = 'occupation']",
          style: {
            "background-color": nodeBg,
            "border-color": violet,
            "border-width": 1.5,
            shape: "round-rectangle",
            width: 150,
            height: 34,
            color: text,
            "font-size": 11,
            "font-weight": 500,
            "text-valign": "center",
            "text-halign": "center",
            "text-margin-x": 0,
            "text-max-width": "126px",
          },
        },
        {
          selector: "node[kind = 'occupation'][selected]",
          style: {
            "border-width": 2,
            "border-color": brand,
            "overlay-color": brand,
            "overlay-opacity": 0.12,
            "overlay-padding": 8,
          },
        },
        {
          selector: "node[kind = 'occupation'].hovered",
          style: {
            "border-color": brand,
          },
        },
        {
          selector: "edge",
          style: {
            width: "mapData(weight, 0, 1, 0.6, 2.6)",
            "line-color": ink,
            "curve-style": "bezier",
            "target-arrow-shape": "triangle",
            "target-arrow-color": ink,
            "arrow-scale": 0.5,
            opacity: 0.9,
          },
        },
        {
          selector: "edge[kind = 'essential']",
          style: {
            "line-color": inkStrong,
            "target-arrow-color": inkStrong,
            opacity: 0.9,
          },
        },
        {
          selector: "edge[kind = 'optional']",
          style: { "line-style": "dashed", opacity: 0.7 },
        },
      ],
      layout: { name: "preset", fit: true, padding: 48 },
      wheelSensitivity: 0.2,
      minZoom: 0.25,
      maxZoom: 2.5,
      boxSelectionEnabled: false,
    });

    cy.fit(undefined, 48);
    cy.on("tap", 'node[kind = "occupation"]', (event) => {
      const raw = String(event.target.id());
      onSelect(raw.startsWith(OCC_NODE) ? raw.slice(OCC_NODE.length) : raw);
    });
    cy.on("mouseover", 'node[kind = "occupation"]', (event) => {
      event.target.addClass("hovered");
      if (containerRef.current) containerRef.current.style.cursor = "pointer";
    });
    cy.on("mouseout", 'node[kind = "occupation"]', () => {
      if (containerRef.current) containerRef.current.style.cursor = "default";
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [skills, occupations, isDark]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().unselect();
    if (!selectedId) return;
    const node = cy.getElementById(`${OCC_NODE}${selectedId}`);
    if (node.nonempty()) node.select();
  }, [selectedId, skills, occupations]);

  const controls = [
    { label: "Zoom in", icon: Plus, action: () => cyRef.current?.zoom(cyRef.current.zoom() * 1.2) },
    { label: "Zoom out", icon: Minus, action: () => cyRef.current?.zoom(cyRef.current.zoom() / 1.2) },
    { label: "Fit to view", icon: Maximize2, action: () => cyRef.current?.fit(undefined, 48) },
  ];

  return (
    <div className={cn("relative overflow-hidden bg-[var(--bg)]", className)}>
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full text-[var(--grid-dot)]"
      >
        <defs>
          <pattern id="voca-graph-dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#voca-graph-dots)" />
      </svg>

      <div
        ref={containerRef}
        className="relative z-10 h-[520px] w-full sm:h-[600px]"
        role="img"
        aria-label="Graph of your skills connected to matched occupations"
      />

      <div className="absolute right-3 top-3 z-20 flex flex-col gap-0.5 rounded-[8px] border border-[var(--border-strong)] bg-[var(--elevated)] p-0.5 shadow-[var(--shadow-elevated)]">
        {controls.map((control) => {
          const Icon = control.icon;
          return (
            <Button
              key={control.label}
              variant="ghost"
              size="sm"
              className="h-7 w-7 px-0"
              onClick={control.action}
              aria-label={control.label}
              title={control.label}
            >
              <Icon className="h-3.5 w-3.5" />
            </Button>
          );
        })}
      </div>

      <div className="pointer-events-none absolute bottom-3 left-3 z-20 flex flex-wrap items-center gap-3 rounded-[8px] border border-[var(--border-strong)] bg-[var(--elevated)] px-2.5 py-1.5 font-mono-ui text-[9px] text-[var(--text-3)] shadow-[var(--shadow-elevated)]">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--blue)]" />
          your skill
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-[3px] border border-[var(--violet)]" />
          occupation
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 bg-[var(--text-3)]" />
          essential
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-px w-4 border-t border-dashed border-[var(--border-strong)]" />
          optional
        </span>
      </div>
    </div>
  );
}
