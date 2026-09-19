import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../../src/components/Overview/EmptyState";

describe("EmptyState", () => {
  it("renders a default message built from the subject (FR-013)", () => {
    render(<EmptyState subject="provinces" />);
    expect(screen.getByText("This nation has no provinces.")).toBeInTheDocument();
    expect(screen.getByText("Nothing to show")).toBeInTheDocument();
  });

  it("renders a custom message when provided", () => {
    render(<EmptyState subject="loans" message="No outstanding loans." />);
    expect(screen.getByText("No outstanding loans.")).toBeInTheDocument();
  });
});
