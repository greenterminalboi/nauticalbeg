import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "../../src/components/Overview/EmptyState";
import { NotAvailableState } from "../../src/components/Overview/NotAvailableState";

describe("NotAvailableState", () => {
  it("renders a default message built from the subject (FR-014)", () => {
    render(<NotAvailableState subject="military data" />);
    expect(screen.getByText("This save's military data could not be read.")).toBeInTheDocument();
    expect(screen.getByText("Not available for this save")).toBeInTheDocument();
  });

  it("renders a custom message when provided", () => {
    render(<NotAvailableState subject="trade data" message="Trade parsing isn't supported yet." />);
    expect(screen.getByText("Trade parsing isn't supported yet.")).toBeInTheDocument();
  });

  it("uses distinct label text from EmptyState so the two states are never confused (FR-013 vs FR-014)", () => {
    const { unmount } = render(<EmptyState subject="provinces" />);
    const emptyLabel = screen.getByText("Nothing to show").textContent;
    unmount();
    render(<NotAvailableState subject="provinces" />);
    const notAvailableLabel = screen.getByText("Not available for this save").textContent;
    expect(emptyLabel).not.toBe(notAvailableLabel);
  });
});
