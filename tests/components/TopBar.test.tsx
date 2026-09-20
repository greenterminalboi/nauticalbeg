import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TopBar } from "../../src/components/Overview/TopBar";

describe("TopBar", () => {
  it("shows all four app sections and the file picker, with no nation selector (decision 2026-09-18: nation picker is Encyclopedia-scoped, not global)", () => {
    render(
      <TopBar
        activeSection="encyclopedia"
        onSelectSection={vi.fn()}
        onFileSelected={vi.fn()}
        keepState={null}
        onKeepToggle={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/select an eu5 save file/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /nauticalbot/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^map$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /encyclopedia/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /settings/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: /viewing nation/i })).not.toBeInTheDocument();
    // Independent from the section nav and file picker — no keep/forget button yet.
    expect(screen.queryByRole("button", { name: /keep this save|forget this save/i })).not.toBeInTheDocument();
  });

  it("marks the active section and still shows the keep toggle regardless of which section is active", () => {
    render(
      <TopBar
        activeSection="map"
        onSelectSection={vi.fn()}
        onFileSelected={vi.fn()}
        keepState={{ kept: false, pending: false, error: null }}
        onKeepToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^map$/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /encyclopedia/i })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("button", { name: /keep this save/i })).toBeInTheDocument();
  });

  it("invokes onSelectSection when a section button is clicked", () => {
    const onSelectSection = vi.fn();
    render(
      <TopBar
        activeSection="encyclopedia"
        onSelectSection={onSelectSection}
        onFileSelected={vi.fn()}
        keepState={null}
        onKeepToggle={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /nauticalbot/i }));
    expect(onSelectSection).toHaveBeenCalledWith("nauticalbot");
  });
});
