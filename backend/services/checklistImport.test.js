const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractSourceItems,
  normalizeImportedSections,
} = require("./checklistImport");

test("extracts every criteria row and preserves its standard", () => {
  const items = extractSourceItems([
    {
      name: "HACCP",
      rows: [
        ["Section", "Criteria", "Standart"],
        ["Mal Kabul", "Soğuk ürün teslim sıcaklığı kontrol edildi", "≤ 5°C"],
        ["Soğuk Depo", "Buzdolabı sıcaklığı uygun", "0-5°C"],
      ],
    },
  ]);

  assert.equal(items.length, 2);
  assert.equal(items[0].section, "Mal Kabul");
  assert.match(items[0].question, /Standart: ≤ 5°C/);
  assert.equal(items[1].sourceKey, "1:3");
});

test("keeps every source row exactly once when AI omits or duplicates rows", () => {
  const sourceItems = [
    {
      sourceKey: "1:2",
      sheetName: "Sheet1",
      rowNumber: 2,
      section: "A",
      question: "Question A",
      rawCells: ["A", "Question A"],
    },
    {
      sourceKey: "1:3",
      sheetName: "Sheet1",
      rowNumber: 3,
      section: "B",
      question: "Question B",
      rawCells: ["B", "Question B"],
    },
  ];

  const sections = normalizeImportedSections(sourceItems, [
    {
      title: "AI Section",
      items: [
        { sourceKey: "1:2", question: "Improved A", answerType: "FORMAT1" },
        { sourceKey: "1:2", question: "Duplicate A", answerType: "TEXT" },
      ],
    },
  ]);
  const importedItems = sections.flatMap((section) => section.items);

  assert.equal(importedItems.length, 2);
  assert.equal(importedItems.filter((item) => item.sourceKey === "1:2").length, 1);
  assert.equal(importedItems.filter((item) => item.sourceKey === "1:3").length, 1);
  assert.equal(importedItems.find((item) => item.sourceKey === "1:2").question, "Improved A");
});
