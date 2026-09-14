import { sanitizeNegativeKeywords } from "@context-buyer/connectors";

describe("sanitizeNegativeKeywords", () => {
  it("drops positives overlap, empties, dupes, and overlong phrases", () => {
    expect(
      sanitizeNegativeKeywords(
        [
          "бесплатно",
          " Бесплатно ",
          "купить asus",
          "",
          "x".repeat(81),
          "скачать",
        ],
        ["купить asus", "rog"],
      ),
    ).toEqual(["бесплатно", "скачать"]);
  });
});
