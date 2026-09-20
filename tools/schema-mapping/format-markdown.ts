// Renders a SaveInventory as a human-readable Markdown summary,
// generated from the JSON (never hand-maintained separately —
// research.md §4) so the two artifacts can't drift from each other.
import type { FieldInventoryEntry, SaveInventory } from "./types";

function formatEntry(entry: FieldInventoryEntry): string {
  const types = entry.observedTypes.join(" | ");
  const example =
    typeof entry.exampleValue === "string" ? JSON.stringify(entry.exampleValue) : String(entry.exampleValue);
  const childKeys = entry.childKeys ? ` — keys: ${entry.childKeys.join(", ")}` : "";
  return `- \`${entry.path}\`: **${types}**, ${entry.presence} (${entry.observedEntryCount} scanned), e.g. ${example}${childKeys}`;
}

export function formatSaveInventoryAsMarkdown(inventory: SaveInventory): string {
  const lines: string[] = [
    `# Save Inventory: ${inventory.sourceFile}`,
    "",
    `- Game version: ${inventory.gameVersion ?? "(unknown)"}`,
    `- Generated at: ${inventory.generatedAt}`,
    `- Sections: ${inventory.sections.length}`,
    "",
  ];

  for (const section of inventory.sections) {
    lines.push(`## \`${section.sectionKey}\``, "");
    if (!section.shapeConfirmed) {
      lines.push(
        "> **Shape not confirmed from this sample** — this section was present but had no entries to inspect in the scanned save. Re-run against a save where it's populated before trusting the field list below (currently empty).",
        "",
      );
    }
    lines.push(`Sample size: ${section.sampleSize}`, "");
    if (section.entries.length === 0) {
      lines.push("(no fields recorded)", "");
    } else {
      for (const entry of section.entries) {
        lines.push(formatEntry(entry));
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
