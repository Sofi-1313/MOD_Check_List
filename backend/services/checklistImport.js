const ANSWER_TYPES = new Set([
  "FORMAT1",
  "DATE",
  "TEXT",
  "MULTIPLE_CHOICE",
  "RADIO_BUTTON",
]);

const SECTION_HEADERS = [
  "section",
  "category",
  "department",
  "area",
  "bolum",
  "kategori",
  "departman",
  "alan",
];

const QUESTION_HEADERS = [
  "criteria",
  "criterion",
  "question",
  "questions",
  "checklist item",
  "control point",
  "soru",
  "sorular",
  "kriter",
  "kontrol noktasi",
  "madde",
  "aciklama",
];

const STANDARD_HEADERS = [
  "standard",
  "standart",
  "requirement",
  "expected",
  "limit",
  "hedef",
  "gereklilik",
];

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForMatch(value) {
  return cleanText(value)
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i");
}

function findHeaderIndex(row, aliases) {
  return row.findIndex((cell) => aliases.includes(normalizeForMatch(cell)));
}

function detectHeader(rows) {
  const candidates = rows.slice(0, 10);
  let best = null;

  candidates.forEach((row, index) => {
    const sectionIndex = findHeaderIndex(row, SECTION_HEADERS);
    const questionIndex = findHeaderIndex(row, QUESTION_HEADERS);
    const standardIndex = findHeaderIndex(row, STANDARD_HEADERS);
    const score =
      (sectionIndex >= 0 ? 1 : 0) +
      (questionIndex >= 0 ? 3 : 0) +
      (standardIndex >= 0 ? 1 : 0);

    if (!best || score > best.score) {
      best = { index, sectionIndex, questionIndex, standardIndex, score };
    }
  });

  return best && best.score >= 3 ? best : null;
}

function looksLikeSectionRow(row) {
  const filled = row.filter(Boolean);
  if (filled.length !== 1) return false;

  const value = filled[0];
  return value.length <= 80 && !/[?.:;]$/.test(value);
}

function appendStandard(question, standard) {
  if (!standard) return question;
  if (normalizeForMatch(question).includes(normalizeForMatch(standard))) return question;

  const label = /[çğıöşü]/i.test(`${question}${standard}`) ? "Standart" : "Standard";
  return `${question} (${label}: ${standard})`;
}

function extractSourceItems(sheets) {
  const items = [];

  (Array.isArray(sheets) ? sheets : []).forEach((sheet, sheetIndex) => {
    const sheetName = cleanText(sheet?.name) || `Sheet ${sheetIndex + 1}`;
    const rows = (Array.isArray(sheet?.rows) ? sheet.rows : [])
      .map((row, rowIndex) => ({
        rowNumber: rowIndex + 1,
        cells: (Array.isArray(row) ? row : [row]).map(cleanText),
      }))
      .filter(({ cells }) => cells.some(Boolean));

    if (rows.length === 0) return;

    const header = detectHeader(rows.map(({ cells }) => cells));
    const dataRows = header ? rows.slice(header.index + 1) : rows;
    let activeSection = sheetName;

    dataRows.forEach(({ cells, rowNumber }) => {
      if (!header && looksLikeSectionRow(cells)) {
        activeSection = cells.find(Boolean) || activeSection;
        return;
      }

      const firstFilledIndex = cells.findIndex(Boolean);
      if (firstFilledIndex < 0) return;

      const section = header
        ? cleanText(cells[header.sectionIndex]) || activeSection
        : activeSection;
      const question = header
        ? cleanText(cells[header.questionIndex])
        : cleanText(cells[firstFilledIndex]);
      const standard =
        header && header.standardIndex >= 0
          ? cleanText(cells[header.standardIndex])
          : "";

      if (!question) return;
      activeSection = section || activeSection;

      items.push({
        sourceKey: `${sheetIndex + 1}:${rowNumber}`,
        sheetName,
        rowNumber,
        section: section || sheetName,
        question: appendStandard(question, standard),
        rawCells: cells.filter(Boolean),
      });
    });
  });

  return items;
}

function fallbackSections(sourceItems) {
  const sectionMap = new Map();

  sourceItems.forEach((item) => {
    const title = cleanText(item.section) || cleanText(item.sheetName) || "Imported Questions";
    if (!sectionMap.has(title)) sectionMap.set(title, []);

    sectionMap.get(title).push({
      sourceKey: item.sourceKey,
      question: item.question,
      answerType: "FORMAT1",
      options: [],
    });
  });

  return Array.from(sectionMap, ([title, items]) => ({ title, items }));
}

function normalizeImportedSections(sourceItems, aiSections) {
  const bySourceKey = new Map(sourceItems.map((item) => [item.sourceKey, item]));
  const used = new Set();
  const sections = [];

  (Array.isArray(aiSections) ? aiSections : []).forEach((section) => {
    const title = cleanText(section?.title);
    const items = [];

    (Array.isArray(section?.items) ? section.items : []).forEach((item) => {
      const sourceKey = cleanText(item?.sourceKey);
      const source = bySourceKey.get(sourceKey);
      if (!source || used.has(sourceKey)) return;

      const answerType = ANSWER_TYPES.has(item?.answerType)
        ? item.answerType
        : "FORMAT1";
      const options = Array.isArray(item?.options)
        ? item.options.map(cleanText).filter(Boolean)
        : [];

      items.push({
        sourceKey,
        question: cleanText(item?.question) || source.question,
        answerType,
        options: ["MULTIPLE_CHOICE", "RADIO_BUTTON"].includes(answerType)
          ? options
          : [],
      });
      used.add(sourceKey);
    });

    if (title && items.length > 0) sections.push({ title, items });
  });

  const missing = sourceItems.filter((item) => !used.has(item.sourceKey));
  fallbackSections(missing).forEach((fallbackSection) => {
    const existing = sections.find(
      (section) =>
        normalizeForMatch(section.title) === normalizeForMatch(fallbackSection.title)
    );

    if (existing) {
      existing.items.push(...fallbackSection.items);
    } else {
      sections.push(fallbackSection);
    }
  });

  return sections.length > 0 ? sections : fallbackSections(sourceItems);
}

function buildChecklistImportPayload(sourceItems, fileName) {
  return {
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You convert spreadsheet checklist rows into a structured checklist.",
          "Every supplied source item must appear exactly once in the result.",
          "Create concise, meaningful section titles and preserve the source language.",
          "Rewrite fragments as clear audit questions or verification statements.",
          "Preserve limits, standards, temperatures, dates, and other compliance details.",
          "Use FORMAT1 for yes/no/not-applicable checks unless the row clearly requires DATE, TEXT, MULTIPLE_CHOICE, or RADIO_BUTTON.",
          "Never invent compliance requirements.",
          "Return only valid JSON.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          task: "Review every spreadsheet row and organize it into checklist sections.",
          fileName: cleanText(fileName),
          constraints: [
            "Each sourceKey must occur exactly once",
            "Do not omit or merge source rows",
            "Do not add rows that are not in sourceItems",
            "Keep standards and numeric limits in the question",
            "options must be empty unless the answer type requires choices",
          ],
          expectedShape: {
            title: "Checklist title inferred from the file",
            sections: [
              {
                title: "Section title",
                items: [
                  {
                    sourceKey: "1:2",
                    question: "Question text",
                    answerType: "FORMAT1",
                    options: [],
                  },
                ],
              },
            ],
          },
          sourceItems,
        }),
      },
    ],
  };
}

module.exports = {
  buildChecklistImportPayload,
  extractSourceItems,
  normalizeImportedSections,
};
