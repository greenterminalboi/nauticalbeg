import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeepSaveToggle } from "../../src/components/Overview/KeepSaveToggle";

describe("KeepSaveToggle", () => {
  it("shows a keep action when not kept", () => {
    render(<KeepSaveToggle kept={false} pending={false} error={null} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "Keep This Save" })).toBeInTheDocument();
    // The "[ kept ]" marker stays mounted (visibility hidden, not removed)
    // so its width is always reserved and toggling "kept" never reflows
    // the surrounding top bar — see KeepSaveToggle.tsx's doc comment.
    expect(screen.getByText("[ kept ]")).toHaveAttribute("aria-hidden", "true");
  });

  it("shows a forget action and the kept marker when kept", () => {
    render(<KeepSaveToggle kept={true} pending={false} error={null} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "Forget This Save" })).toBeInTheDocument();
    expect(screen.getByText("[ kept ]")).not.toHaveAttribute("aria-hidden");
  });

  it("disables the button and shows pending text while pending", () => {
    render(<KeepSaveToggle kept={false} pending={true} error={null} onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Keeping…" });
    expect(button).toBeDisabled();
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(<KeepSaveToggle kept={false} pending={false} error={null} onToggle={onToggle} />);
    screen.getByRole("button").click();
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows an error message when one is present (FR-014)", () => {
    render(
      <KeepSaveToggle
        kept={false}
        pending={false}
        error="Not enough storage space is available to keep this save."
        onToggle={() => {}}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/not enough storage space/i);
  });
});
