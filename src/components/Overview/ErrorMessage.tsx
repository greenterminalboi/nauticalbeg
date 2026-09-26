import type { ErrorKind } from "../../parser/protocol";
import "./ErrorMessage.css";

interface ErrorMessageProps {
  /** FR-009's three worker-reported kinds, plus 015's three save-format
   * kinds (unrecognized-format / damaged-save / binary-unavailable). `"unknown"` covers a failure
   * that isn't one of those (e.g. the save parsed fine but reading its
   * overview afterward failed) — not itself an FR-009 category, but
   * still needs a clear message rather than a crash or blank screen. */
  kind: ErrorKind | "unknown";
  message: string;
}

const TITLES: Record<ErrorKind, string> = {
  "not-a-save": "Not a Recognized Save File",
  "unsupported-version": "Unsupported Game Version",
  "parse-failed": "Save Could Not Be Read",
  // 015 — save format support
  "unrecognized-format": "Unrecognized Save Format",
  "damaged-save": "Save File Damaged or Incomplete",
  "binary-unavailable": "Ironman & Binary Saves Unavailable",
  // 016 — public hosting
  "engine-unavailable": "Couldn't Load the Database Engine",
  // 017 — shared games (SharedLinkMessage.tsx renders these with more help)
  "share-expired": "This Shared Game Has Expired",
  "share-deleted": "This Shared Game Was Taken Down",
  "share-not-found": "This Shared Game Wasn't Found",
  "share-unavailable": "Sharing Is Temporarily Unavailable",
  "share-incompatible": "Made With a Different Version of NauticalBeg",
  "share-corrupt": "This Shared Game Couldn't Be Read",
};

/**
 * Renders FR-009's three distinct failure kinds with a title + the
 * worker's specific message, so each looks and reads differently from
 * the others rather than being identical red text (spec.md User
 * Story 3's Independent Test).
 */
export function ErrorMessage({ kind, message }: ErrorMessageProps) {
  const title = kind === "unknown" ? "Something Went Wrong" : TITLES[kind];
  return (
    <div className="error-message" role="alert">
      <p className="error-message__seal">
        [ {kind === "unknown" ? "error" : kind.replace(/-/g, " ")} ]
      </p>
      <h2 className="error-message__title">{title}</h2>
      <p className="error-message__body">{message}</p>
    </div>
  );
}
