import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LoadWarningNotice } from "../../src/components/Overview/LoadWarningNotice";

describe("LoadWarningNotice", () => {
  const warnings = [
    { kind: "unknown-tokens" as const, count: 3, message: "3 fields in this save weren't recognized; some data may be incomplete." },
  ];

  it("shows each warning's message as a non-blocking status, not an alert", () => {
    render(<LoadWarningNotice warnings={warnings} onDismiss={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("3 fields in this save weren't recognized");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("calls onDismiss when dismissed", () => {
    const onDismiss = vi.fn();
    render(<LoadWarningNotice warnings={warnings} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
