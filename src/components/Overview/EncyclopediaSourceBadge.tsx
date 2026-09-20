import type { EntrySource } from "../../../tools/encyclopedia-scraping/types";
import "./EncyclopediaSourceBadge.css";

interface EncyclopediaSourceBadgeProps {
  source: EntrySource;
}

/**
 * spec FR-010 / Constitution Principle VI: every entry's source (base
 * game or a named DLC) is labeled with text, not color alone, so it
 * reads correctly for a color-vision-deficient user too.
 */
export function EncyclopediaSourceBadge({ source }: EncyclopediaSourceBadgeProps) {
  const label = source.kind === "base" ? "Base Game" : source.dlcId;
  return (
    <span
      className={
        source.kind === "base"
          ? "encyclopedia-source-badge"
          : "encyclopedia-source-badge encyclopedia-source-badge--dlc"
      }
    >
      {label}
    </span>
  );
}
