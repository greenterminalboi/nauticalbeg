import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorMessage } from "../../src/components/Overview/ErrorMessage";

describe("ErrorMessage", () => {
  it.each([
    ["not-a-save", "Not a Recognized Save File"],
    ["unsupported-version", "Unsupported Game Version"],
    ["parse-failed", "Save Could Not Be Read"],
  ] as const)(
    "renders a distinct title for %s, not identical text across kinds (FR-009/US3)",
    (kind, expectedTitle) => {
      render(<ErrorMessage kind={kind} message="Specific detail text" />);
      expect(screen.getByRole("heading", { name: expectedTitle })).toBeInTheDocument();
      expect(screen.getByText("Specific detail text")).toBeInTheDocument();
    },
  );

  it("falls back to a generic title for a failure outside the three FR-009 kinds", () => {
    render(<ErrorMessage kind="unknown" message="Loaded the save but failed to read its overview." />);
    expect(screen.getByRole("heading", { name: "Something Went Wrong" })).toBeInTheDocument();
  });

  it("the three FR-009 kinds each render a different title", () => {
    const kinds = ["not-a-save", "unsupported-version", "parse-failed"] as const;
    const titles = kinds.map((kind) => {
      const { unmount } = render(<ErrorMessage kind={kind} message="x" />);
      const title = screen.getByRole("heading").textContent;
      unmount();
      return title;
    });
    expect(new Set(titles).size).toBe(kinds.length);
  });
});
