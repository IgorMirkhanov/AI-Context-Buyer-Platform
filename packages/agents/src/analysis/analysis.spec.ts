import { extractVisibleText, normalizeWebsiteUrl } from "./fetch-landing";
import { parseCustomSeeds, mergeSeedMasks } from "./pipeline";

describe("analysis fetch-landing", () => {
  it("strips html tags from landing page", () => {
    const text = extractVisibleText(
      "<html><body><h1>CRM</h1><p>Для отдела продаж</p></body></html>",
    );
    expect(text).toContain("CRM");
    expect(text).toContain("Для отдела продаж");
    expect(text).not.toContain("<p>");
  });

  it("normalizes website url without scheme", () => {
    expect(normalizeWebsiteUrl("example.com")).toBe("https://example.com/");
  });
});

describe("analysis seeds", () => {
  it("parses custom seeds from multiline text", () => {
    expect(parseCustomSeeds("ноутбук b2b\ncrm, закупка")).toEqual([
      "ноутбук b2b",
      "crm",
      "закупка",
    ]);
  });

  it("merges extra seeds with masks", () => {
    expect(mergeSeedMasks(["купить ноутбук"], ["crm b2b"])).toEqual([
      "купить ноутбук",
      "crm b2b",
    ]);
  });
});
