import type { ErrorKind } from "../../parser/protocol";
import "./SharedLinkMessage.css";

type ShareKind = Extract<ErrorKind, `share-${string}`>;

const CONTENT: Record<ShareKind, { title: string; body: string }> = {
  "share-expired": { title: "This shared game has expired", body: "Shared links last 7 days." },
  "share-deleted": { title: "This shared game was taken down", body: "The person who shared it deleted the link." },
  "share-not-found": { title: "This shared game wasn't found", body: "Check the link was copied completely." },
  "share-unavailable": { title: "Sharing is temporarily unavailable", body: "Try again in a little while." },
  "share-incompatible": {
    title: "Made with a different version of NauticalBeg",
    body: "This link can't be opened by this version.",
  },
  "share-corrupt": { title: "This shared game couldn't be read", body: "The shared data is damaged." },
};

export function isShareErrorKind(kind: string): kind is ShareKind {
  return kind in CONTENT;
}

/** 017 FR-011: one plain, distinct message per way a link can fail (contracts/share-ui.md). */
export function SharedLinkMessage({ kind }: { kind: ShareKind }) {
  const { title, body } = CONTENT[kind];
  return (
    <div className="shared-link-message" role="alert">
      <h2 className="shared-link-message__title">{title}</h2>
      <p>{body}</p>
      <p>You can still load your own save with “Select an EU5 save file” above.</p>
    </div>
  );
}
