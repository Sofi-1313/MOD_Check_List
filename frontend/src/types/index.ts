export type Role = "admin" | "user";
export type AnswerType = "FORMAT1" | "DATE" | "TEXT" | "MULTIPLE_CHOICE" | "RADIO_BUTTON";

export type User = {
  id: number;
  username: string;
  password?: string;
  name: string;
  role: Role;
  active?: boolean;
  approvalStatus?: "pending" | "approved" | "rejected";
  created_at?: string;
};

export type Session = {
  token: string;
  expiresAt: string;
  user: User;
};

export type ChecklistItem = {
  id: number;
  checklist_id: number;
  section_id: number;
  question: string;
  answerType?: AnswerType;
  answer_type?: AnswerType;
  options?: string[];
  options_json?: string;
  sort_order: number;
};

export type ChecklistSection = {
  id: number;
  checklist_id: number;
  title: string;
  sort_order: number;
  items: ChecklistItem[];
};

export type Checklist = {
  id: number;
  title: string;
  image_path?: string;
  imagePath?: string;
  created_at: string;
  deleted_at?: string | null;
  deletedByName?: string;
  sections: ChecklistSection[];
};

export type Assignment = {
  id: number;
  checklist_id: number;
  assigned_to_user_id: number;
  assigned_by_user_id: number;
  assigned_at: string;
  status: "assigned" | "completed";
  checklistTitle: string;
  checklistImagePath?: string;
  assignedToName: string;
  assignedByName: string;
};

export type Report = {
  id: number;
  assignment_id: number;
  checklistTitle: string;
  completedByName: string;
  assignedToName: string;
  assignedByName: string;
  completed_at: string;
  status: string;
  items: Array<{
    id: number;
    checklist_item_id: number;
    question: string;
    answer: string;
    answerType?: AnswerType;
    answer_type?: AnswerType;
    comment: string;
    sectionTitle?: string;
    photos: string[];
  }>;
  checklistImagePath?: string;
};

export type AiActionPlan = {
  failedItemId: string;
  reportId: string;
  checklistTitle: string;
  sectionTitle: string;
  issue: string;
  failedAnswer: string;
  comment: string;
  rootCause: string;
  correctiveAction: string;
  preventiveAction: string;
  priority: "Critical" | "High" | "Medium" | "Low" | string;
  department: string;
  owner: string;
  departmentReason: string;
  estimatedDurationMinutes: number;
  confidence: "High" | "Medium" | "Low" | string;
  dueDate: string;
  status: "Open" | "In Progress" | "Blocked" | "Completed" | string;
  progress: number;
  followUpNotes: string;
};

export type AiActionPlanResponse = {
  provider: "azure-openai" | "openai" | "fallback" | "none";
  industry?: string;
  actionPlans: AiActionPlan[];
};

export type DraftChecklist = {
  assignmentId: number;
  userId: number;
  form: Record<
    number,
    {
      itemId: number;
      sectionTitle?: string;
      question: string;
      answerType?: AnswerType;
      answer: string;
      comment: string;
      photos: string[];
    }
  >;
  updatedAt: string;
};
