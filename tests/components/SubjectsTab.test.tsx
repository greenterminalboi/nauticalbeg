import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { SubjectsTab } from "../../src/components/Overview/SubjectsTab";
import * as queries from "../../src/storage/queries";
import type { SaveDatabase } from "../../src/storage/db";
import type { NationSummary, SubjectRelation } from "../../src/storage/queries";

const fakeDb = {} as SaveDatabase;
const nations: NationSummary[] = [
  { idx: 1259, tag: "POR", name: "Portugal" },
  { idx: 1368, tag: "JMB", name: "JMB" },
];

const relations: SubjectRelation[] = [
  { overlordIdx: 1259, subjectIdx: 1368, subjectTag: "JMB", subjectName: "JMB", subjectType: "colonial_nation", startDate: "1601.3.2" },
  { overlordIdx: 1368, subjectIdx: 1372, subjectTag: "PNI", subjectName: "PNI", subjectType: "tributary", startDate: null },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SubjectsTab (specs/018 US9)", () => {
  it("shows the nation's subjects and their subjects, with each subject's type (FR-024, FR-025)", async () => {
    vi.spyOn(queries, "listSubjectRelations").mockResolvedValue({ available: true, rows: relations });
    render(<SubjectsTab db={fakeDb} nationIdx={1259} nationName="Portugal" nations={nations} onOpenNation={vi.fn()} />);

    const tree = await screen.findByRole("region", { name: "Subjects of Portugal" });
    const jmb = within(tree).getByRole("button", { name: /JMB.*Colonial Nation/ });
    expect(jmb.closest("li")).toHaveTextContent("since 1601.3.2");
    // PNI is nested under JMB, and isn't in the nation selector: shown, not clickable.
    const nested = jmb.closest("li")!.querySelector("ul")!;
    expect(nested).toHaveTextContent("PNI");
    expect(nested).toHaveTextContent("Tributary");
    expect(within(nested).queryByRole("button")).not.toBeInTheDocument();
  });

  it("opens a subject's Overview when it's clicked (FR-026)", async () => {
    vi.spyOn(queries, "listSubjectRelations").mockResolvedValue({ available: true, rows: relations });
    const onOpenNation = vi.fn();
    render(<SubjectsTab db={fakeDb} nationIdx={1259} nationName="Portugal" nations={nations} onOpenNation={onOpenNation} />);
    fireEvent.click(await screen.findByRole("button", { name: /JMB/ }));
    expect(onOpenNation).toHaveBeenCalledWith(1368);
  });

  it("says so when the nation has no subjects", async () => {
    vi.spyOn(queries, "listSubjectRelations").mockResolvedValue({ available: true, rows: relations });
    render(<SubjectsTab db={fakeDb} nationIdx={1} nationName="Sweden" nations={nations} onOpenNation={vi.fn()} />);
    expect(await screen.findByText("Sweden has no subjects.")).toBeInTheDocument();
  });

  it("says when the save has no subject data at all", async () => {
    vi.spyOn(queries, "listSubjectRelations").mockResolvedValue({ available: false, rows: [] });
    render(<SubjectsTab db={fakeDb} nationIdx={1259} nationName="Portugal" nations={nations} onOpenNation={vi.fn()} />);
    expect(await screen.findByText("Not in this save's data — reload the save file")).toBeInTheDocument();
  });
});
