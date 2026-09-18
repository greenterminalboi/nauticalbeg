import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { KeptSaveOffer } from "../../src/components/Overview/KeptSaveOffer";

describe("KeptSaveOffer", () => {
  it("shows the kept save's filename and date", () => {
    render(
      <KeptSaveOffer
        summary={{ saveId: "abc", filename: "Russia (Melted).eu5", inGameDate: "1628.8.14" }}
        onResume={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText(/Russia \(Melted\)\.eu5/)).toBeInTheDocument();
    expect(screen.getByText(/1628\.8\.14/)).toBeInTheDocument();
  });

  it("calls onResume and onDismiss from their respective buttons", () => {
    const onResume = vi.fn();
    const onDismiss = vi.fn();
    render(
      <KeptSaveOffer
        summary={{ saveId: "abc", filename: "save.eu5", inGameDate: null }}
        onResume={onResume}
        onDismiss={onDismiss}
      />,
    );

    screen.getByRole("button", { name: "Resume This Save" }).click();
    expect(onResume).toHaveBeenCalledOnce();

    screen.getByRole("button", { name: "Load a Different Save" }).click();
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
