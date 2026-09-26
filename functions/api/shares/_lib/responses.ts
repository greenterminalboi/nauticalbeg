// JSON error bodies for /api/shares (017, contracts/shares-api.md).

export type ShareErrorCode =
  | "too_large"
  | "bad_request"
  | "rate_limited"
  | "busy"
  | "unavailable"
  | "not_found"
  | "expired"
  | "deleted"
  | "forbidden";

const MESSAGES: Record<ShareErrorCode, string> = {
  too_large: "This game is too large to share.",
  bad_request: "The share request wasn't understood.",
  rate_limited: "Too many shares recently. Try again later.",
  busy: "Sharing is at capacity right now. Try again later.",
  unavailable: "Sharing is temporarily unavailable.",
  not_found: "This shared game wasn't found.",
  expired: "This shared game has expired.",
  deleted: "This shared game was taken down.",
  forbidden: "You can't delete this shared game.",
};

export function errorResponse(
  status: number,
  error: ShareErrorCode,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error, message: MESSAGES[error], ...extra }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });
}
