import { apiPost } from "./api";
import { AnswerType } from "../types";

export type AiChecklistImportResponse = {
  provider: "azure-openai" | "openai" | "fallback";
  title?: string;
  rowCount: number;
  sections: Array<{
    title: string;
    items: Array<{
      question: string;
      answerType: AnswerType;
      options: string[];
    }>;
  }>;
};

export function importChecklistWithAi(
  fileName: string,
  sheets: Array<{ name: string; rows: unknown[][] }>
) {
  return apiPost<AiChecklistImportResponse>("/ai/checklist-import", {
    fileName,
    sheets,
  });
}
