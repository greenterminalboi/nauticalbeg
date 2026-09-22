import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTableSort, type SortAccessor } from "../../src/components/Overview/useTableSort";

interface Row {
  id: number;
  name: string;
  value: number | null;
}

const ACCESSORS: SortAccessor<Row>[] = [
  { key: "name", value: (r) => r.name },
  { key: "value", value: (r) => r.value },
];

const ROWS: Row[] = [
  { id: 1, name: "Beta", value: 5 },
  { id: 2, name: "Alpha", value: null },
  { id: 3, name: "Gamma", value: 10 },
];

describe("useTableSort (specs/012-firepower-tab post-ship)", () => {
  it("leaves rows in original order until a column is clicked", () => {
    const { result } = renderHook(() => useTableSort(ROWS, ACCESSORS));
    expect(result.current.sortedRows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(result.current.sortKey).toBeNull();
  });

  it("sorts ascending on first click, descending on second click of the same column", () => {
    const { result } = renderHook(() => useTableSort(ROWS, ACCESSORS));
    act(() => result.current.toggleSort("name"));
    expect(result.current.sortedRows.map((r) => r.name)).toEqual(["Alpha", "Beta", "Gamma"]);
    expect(result.current.direction).toBe("asc");

    act(() => result.current.toggleSort("name"));
    expect(result.current.sortedRows.map((r) => r.name)).toEqual(["Gamma", "Beta", "Alpha"]);
    expect(result.current.direction).toBe("desc");
  });

  it("switches to a new column at ascending, never carrying over the old column's direction", () => {
    const { result } = renderHook(() => useTableSort(ROWS, ACCESSORS));
    act(() => result.current.toggleSort("name"));
    act(() => result.current.toggleSort("name")); // now desc
    act(() => result.current.toggleSort("value")); // switch column
    expect(result.current.sortKey).toBe("value");
    expect(result.current.direction).toBe("asc");
  });

  it("always sorts a null value last, in both directions — never treated as 0", () => {
    const { result } = renderHook(() => useTableSort(ROWS, ACCESSORS));
    act(() => result.current.toggleSort("value"));
    expect(result.current.sortedRows.map((r) => r.name)).toEqual(["Beta", "Gamma", "Alpha"]); // asc: 5, 10, null
    act(() => result.current.toggleSort("value"));
    expect(result.current.sortedRows.map((r) => r.name)).toEqual(["Gamma", "Beta", "Alpha"]); // desc: 10, 5, null (still last)
  });
});
