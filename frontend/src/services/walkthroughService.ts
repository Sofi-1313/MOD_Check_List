import { apiGet, apiPost } from "./api";
import { WalkThroughItem, WalkThroughReport } from "../types";

export async function getWalkThroughs(): Promise<WalkThroughReport[]> {
  return apiGet("/walkthroughs");
}

export async function createWalkThrough(title: string, items: WalkThroughItem[]) {
  return apiPost<{ success: boolean; reportId: number }>("/walkthroughs", {
    title,
    items,
  });
}
