import { describe, expect, it } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import { HoverTooltip } from "../../src/components/Overview/HoverTooltip";

describe("HoverTooltip (specs/012-firepower-tab post-ship)", () => {
  it("shows content on mouseenter and hides it on mouseleave — no delay, no native title attribute", () => {
    const { container, getByText } = render(
      <HoverTooltip content="line one\nline two">
        <span>trigger text</span>
      </HoverTooltip>,
    );
    const trigger = getByText("trigger text").closest(".hover-tooltip-trigger");
    expect(trigger).not.toBeNull();
    // The old fix relied on a native `title` attribute, which is slow/
    // easy to miss — confirm there isn't one, and the real content is
    // rendered content (findable/testable), not hidden OS chrome.
    expect(trigger?.getAttribute("title")).toBeNull();
    expect(container.querySelector(".hover-tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(trigger as Element);
    expect(container.querySelector(".hover-tooltip")).toBeInTheDocument();
    expect(container.querySelector(".hover-tooltip")?.textContent).toContain("line one");

    fireEvent.mouseLeave(trigger as Element);
    expect(container.querySelector(".hover-tooltip")).not.toBeInTheDocument();
  });
});
