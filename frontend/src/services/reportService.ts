import { apiGet, apiDelete, apiPost } from "./api";
import { AnswerType, Report } from "../types";

export async function getReports(): Promise<Report[]> {
  return apiGet("/reports");
}

export async function deleteReport(reportId: number) {
  return apiDelete(`/reports/${reportId}`);
}

export type WalkthroughReportPayload = {
  title: string;
  sections: Array<{
    title: string;
    items: Array<{
      question: string;
      answerType: AnswerType;
      options?: string[];
      answer: string;
      comment: string;
      photos: string[];
    }>;
  }>;
};

export async function submitWalkthroughReport(payload: WalkthroughReportPayload) {
  return apiPost<{ reportId: number }>("/reports/walkthrough", payload);
}
