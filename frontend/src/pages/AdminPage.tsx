import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { AnswerType, Assignment, Checklist, Report, User } from "../types";
import { styles } from "../styles/appStyles";
import DashboardShell from "../components/DashboardShell";
import ReportDetail from "../components/ReportDetail";
import WalkThroughPanel from "../components/WalkThroughPanel";
import { createAssignment, getAssignments } from "../services/assignmentService";
import {
  createChecklist,
  updateChecklist,
  deleteChecklist,
  forceDeleteChecklist,
  getChecklists,
  getDeletedChecklists,
  restoreChecklist,
} from "../services/checklistService";
import { deleteReport, getReports } from "../services/reportService";
import { createUser, deleteUser, getUsers, updateUser } from "../services/userService";
import { generateChecklistPdf } from "../utils/generateChecklistPdf";
import { generateAiActionPlan } from "../services/aiActionPlanService";
import { exportActionPlansToExcel } from "../services/exportService";
import { FILE_BASE, uploadPhotos } from "../services/api";

type Props = {
  user: User;
  onLogout: () => Promise<void>;
};

type SectionForm = {
  title: string;
  items: QuestionForm[];
};

type QuestionForm = {
  question: string;
  answerType: AnswerType;
  options: string[];
};

type AdminSectionKey = "templates" | "assignments" | "users" | "walkthrough" | "reports";

const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  FORMAT1: "Yes / No / N/A",
  DATE: "Date",
  TEXT: "Text",
  MULTIPLE_CHOICE: "Dropdown",
  RADIO_BUTTON: "Check Box",
};

const ADMIN_SECTIONS: Array<{
  key: AdminSectionKey;
  label: string;
  description: string;
}> = [
  {
    key: "templates",
    label: "Templates",
    description: "Create and manage checklist templates",
  },
  {
    key: "assignments",
    label: "Assignments",
    description: "Assign checklist work to users",
  },
  {
    key: "users",
    label: "User Management",
    description: "Approve, create, and edit users",
  },
  {
    key: "walkthrough",
    label: "Walk-Through",
    description: "Run an on-the-go inspection",
  },
  {
    key: "reports",
    label: "Completed Reports",
    description: "Review reports and export files",
  },
];

function createEmptyQuestion(): QuestionForm {
  return {
    question: "",
    answerType: "FORMAT1",
    options: [""],
  };
}

function normalizeQuestionForm(item: {
  question?: string;
  answerType?: AnswerType;
  answer_type?: AnswerType;
  options?: string[];
}): QuestionForm {
  return {
    question: item.question || "",
    answerType: item.answerType || item.answer_type || "FORMAT1",
    options: item.options?.length ? item.options : [""],
  };
}

function extractImportedQuestions(rows: unknown[][]) {
  const normalizedRows = rows
    .map((row) => row.map((cell) => String(cell || "").trim()))
    .filter((row) => row.some(Boolean));

  if (normalizedRows.length === 0) return [];

  const firstRow = normalizedRows[0].map((cell) => cell.toLowerCase());
  const questionColumnIndex = firstRow.findIndex((cell) =>
    ["question", "questions", "soru", "sorular"].includes(cell)
  );
  const hasHeader = questionColumnIndex >= 0;
  const columnIndex = hasHeader
    ? questionColumnIndex
    : normalizedRows[0].findIndex(Boolean);
  const sourceRows = hasHeader ? normalizedRows.slice(1) : normalizedRows;

  if (columnIndex < 0) return [];

  return sourceRows
    .map((row) => row[columnIndex])
    .map((question) => String(question || "").trim())
    .filter(Boolean);
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function mapReportToPdfPayload(report: Report) {
  return {
    hotelName: report.checklistTitle,
    reportTitle: "Checklist Completion Report",
    checklistTitle: report.checklistTitle,
    assignedToName: report.assignedToName,
    assignedByName: report.assignedByName,
    completedByName: report.completedByName,
    completedAt: report.completed_at,
    status: report.status,
    items: (report.items || []).map((item) => ({
      title: item.question,
      question: item.question,
      answer: item.answer as "YES" | "NO" | "N/A" | "",
      answerType: item.answerType || item.answer_type || "FORMAT1",
      comment: item.comment || "",
      photos: item.photos || [],
      sectionTitle: item.sectionTitle || "",
    })),
  };
}

function formatAdminDate(value?: string) {
  if (!value) return "-";

  try {
    return new Date(value).toLocaleString("tr-TR");
  } catch {
    return value;
  }
}

const compactListStyle: React.CSSProperties = {
  border: "1px solid #e4d8c7",
  borderRadius: 10,
  overflow: "hidden",
  background: "#fffaf2",
};

function compactRowStyle(index: number, expanded: boolean): React.CSSProperties {
  return {
    borderBottom: "1px solid #e4d8c7",
    background: expanded ? "#f0eadf" : index % 2 === 0 ? "#fffaf2" : "#fbf6ec",
  };
}

const compactRowHeaderStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
  alignItems: "center",
  padding: "10px 12px",
  cursor: "pointer",
};

const compactRowActionsStyle: React.CSSProperties = {
  borderTop: "1px solid #e4d8c7",
  padding: "10px 12px",
  background: "#fffdf8",
};

export default function AdminPage({ user, onLogout }: Props) {
  const [activeAdminPage, setActiveAdminPage] = useState<AdminSectionKey>("templates");
  const [users, setUsers] = useState<User[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [deletedChecklists, setDeletedChecklists] = useState<Checklist[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [expandedAssignmentId, setExpandedAssignmentId] = useState<number | null>(null);

  const [title, setTitle] = useState("");
  const [templateImagePath, setTemplateImagePath] = useState("");
  const [templateImageUploading, setTemplateImageUploading] = useState(false);
  const [sections, setSections] = useState<SectionForm[]>([
    {
      title: "",
      items: [createEmptyQuestion()],
    },
  ]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draggedQuestion, setDraggedQuestion] = useState<{
    sectionIndex: number;
    questionIndex: number;
  } | null>(null);

  const [selectedChecklistId, setSelectedChecklistId] = useState<number>(0);
  const [selectedUserId, setSelectedUserId] = useState<number>(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [actionPlanReportId, setActionPlanReportId] = useState<number | null>(null);

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"admin" | "user">("user");
  const [editingUserId, setEditingUserId] = useState<number | null>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editName, setEditName] = useState("");
  const [editRole, setEditRole] = useState<"admin" | "user">("user");
  const [pendingUserForms, setPendingUserForms] = useState<
    Record<number, { username: string; password: string; name: string }>
  >({});
  const pendingUsers = users.filter((u) => u.approvalStatus === "pending");
  const approvedUsers = users.filter((u) => u.approvalStatus !== "pending");

  const load = async () => {
    const [u, c, deleted, a, r] = await Promise.all([
      getUsers(),
      getChecklists(),
      getDeletedChecklists(),
      getAssignments(),
      getReports(),
    ]);

    setUsers(u);
    setChecklists(c);
    setDeletedChecklists(deleted);
    setAssignments(a);
    setReports(r);
    setPendingUserForms((prev) => {
      const next = { ...prev };

      u.filter((candidate) => candidate.approvalStatus === "pending").forEach((candidate) => {
        next[candidate.id] = next[candidate.id] || {
          username: candidate.username,
          password: candidate.password || "",
          name: candidate.name,
        };
      });

      Object.keys(next).forEach((key) => {
        const pendingExists = u.some(
          (candidate) =>
            candidate.id === Number(key) && candidate.approvalStatus === "pending"
        );

        if (!pendingExists) {
          delete next[Number(key)];
        }
      });

      return next;
    });

    if (!selectedChecklistId && c[0]) {
      setSelectedChecklistId(c[0].id);
    }

    const assignableUsers = u.filter(
      (x) => x.role === "user" && x.active !== false && x.approvalStatus !== "pending"
    );
    if (!selectedUserId && assignableUsers[0]) {
      setSelectedUserId(assignableUsers[0].id);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const resetTemplateForm = () => {
    setEditingId(null);
    setTitle("");
    setTemplateImagePath("");
    setSections([
      {
        title: "",
        items: [createEmptyQuestion()],
      },
    ]);
  };

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        title: "",
        items: [createEmptyQuestion()],
      },
    ]);
  };

  const moveSection = (sectionIndex: number, direction: -1 | 1) => {
    setSections((prev) => moveItem(prev, sectionIndex, sectionIndex + direction));
  };

  const updateSectionTitle = (sectionIndex: number, value: string) => {
    setSections((prev) =>
      prev.map((section, index) =>
        index === sectionIndex ? { ...section, title: value } : section
      )
    );
  };

  const addQuestionToSection = (sectionIndex: number) => {
    setSections((prev) =>
      prev.map((section, index) =>
        index === sectionIndex
          ? { ...section, items: [...section.items, createEmptyQuestion()] }
          : section
      )
    );
  };

  const removeQuestionFromSection = (sectionIndex: number, questionIndex: number) => {
    setSections((prev) =>
      prev.map((section, index) => {
        if (index !== sectionIndex) return section;

        return {
          ...section,
          items: section.items.filter((_, itemIndex) => itemIndex !== questionIndex),
        };
      })
    );
  };

  const moveQuestionToIndex = (
    sectionIndex: number,
    fromQuestionIndex: number,
    toQuestionIndex: number
  ) => {
    setSections((prev) =>
      prev.map((section, index) => {
        if (index !== sectionIndex) return section;

        return {
          ...section,
          items: moveItem(section.items, fromQuestionIndex, toQuestionIndex),
        };
      })
    );
  };

  const handleQuestionDrop = (sectionIndex: number, questionIndex: number) => {
    if (!draggedQuestion || draggedQuestion.sectionIndex !== sectionIndex) {
      setDraggedQuestion(null);
      return;
    }

    moveQuestionToIndex(sectionIndex, draggedQuestion.questionIndex, questionIndex);
    setDraggedQuestion(null);
  };

  const updateQuestion = (
    sectionIndex: number,
    questionIndex: number,
    value: string
  ) => {
    setSections((prev) =>
      prev.map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;

        return {
          ...section,
          items: section.items.map((question, qIndex) =>
            qIndex === questionIndex ? { ...question, question: value } : question
          ),
        };
      })
    );
  };

  const updateQuestionAnswerType = (
    sectionIndex: number,
    questionIndex: number,
    answerType: AnswerType
  ) => {
    setSections((prev) =>
      prev.map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;

        return {
          ...section,
          items: section.items.map((question, qIndex) =>
            qIndex === questionIndex
              ? {
                  ...question,
                  answerType,
                  options:
                    ["MULTIPLE_CHOICE", "RADIO_BUTTON"].includes(answerType)
                      ? question.options.length
                        ? question.options
                        : [""]
                      : [""],
                }
              : question
          ),
        };
      })
    );
  };

  const updateQuestionOption = (
    sectionIndex: number,
    questionIndex: number,
    optionIndex: number,
    value: string
  ) => {
    setSections((prev) =>
      prev.map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;

        return {
          ...section,
          items: section.items.map((question, qIndex) =>
            qIndex === questionIndex
              ? {
                  ...question,
                  options: question.options.map((option, index) =>
                    index === optionIndex ? value : option
                  ),
                }
              : question
          ),
        };
      })
    );
  };

  const addQuestionOption = (sectionIndex: number, questionIndex: number) => {
    setSections((prev) =>
      prev.map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;

        return {
          ...section,
          items: section.items.map((question, qIndex) =>
            qIndex === questionIndex
              ? { ...question, options: [...question.options, ""] }
              : question
          ),
        };
      })
    );
  };

  const removeQuestionOption = (
    sectionIndex: number,
    questionIndex: number,
    optionIndex: number
  ) => {
    setSections((prev) =>
      prev.map((section, sIndex) => {
        if (sIndex !== sectionIndex) return section;

        return {
          ...section,
          items: section.items.map((question, qIndex) =>
            qIndex === questionIndex
              ? {
                  ...question,
                  options: question.options.filter((_, index) => index !== optionIndex),
                }
              : question
          ),
        };
      })
    );
  };

  const startEditTemplate = (checklist: Checklist) => {
    setActiveAdminPage("templates");
    setEditingId(checklist.id);
    setTitle(checklist.title);
    setTemplateImagePath(checklist.image_path || checklist.imagePath || "");
    setSections(
      (checklist.sections || []).map((section) => ({
        title: section.title,
        items: (section.items || []).map(normalizeQuestionForm),
      }))
    );
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleTemplateImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    try {
      setTemplateImageUploading(true);
      const uploaded = await uploadPhotos(files);
      setTemplateImagePath(uploaded[0] || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template image could not be uploaded");
    } finally {
      setTemplateImageUploading(false);
    }
  };

  const handleImportQuestionsFromExcel = async (file: File | null) => {
    if (!file) return;

    setMessage("");
    setError("");

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        setError("Excel file does not contain a sheet.");
        return;
      }

      const rows = XLSX.utils.sheet_to_json<unknown[]>(
        workbook.Sheets[firstSheetName],
        { header: 1, blankrows: false }
      );
      const importedQuestions = extractImportedQuestions(rows);

      if (importedQuestions.length === 0) {
        setError("No questions found. Use a 'Question' column or put questions in the first column.");
        return;
      }

      setEditingId(null);
      setTitle((currentTitle) => currentTitle || "Imported Template");
      setSections([
        {
          title: "Imported Questions",
          items: importedQuestions.map((question) => ({
            question,
            answerType: "FORMAT1",
            options: [""],
          })),
        },
      ]);
      setActiveAdminPage("templates");
      setMessage(`${importedQuestions.length} questions imported. Review sections and question types before saving.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Excel import failed");
    }
  };

  const saveChecklist = async () => {
    setMessage("");
    setError("");

    const payload = {
      title: title.trim(),
      sections: sections
        .filter((section) => section.title.trim())
        .map((section) => ({
          title: section.title.trim(),
          items: section.items
            .map((item) => ({
              question: item.question.trim(),
              answerType: item.answerType,
              options:
                ["MULTIPLE_CHOICE", "RADIO_BUTTON"].includes(item.answerType)
                  ? item.options.map((option) => option.trim()).filter(Boolean)
                  : [],
            }))
            .filter((item) => item.question),
        }))
        .filter((section) => section.items.length > 0),
    };

    if (!payload.title || payload.sections.length === 0) {
      setError("Checklist title and at least one valid section are required.");
      return;
    }

    const hasChoiceWithoutOptions = payload.sections.some((section) =>
      section.items.some(
        (item) =>
          ["MULTIPLE_CHOICE", "RADIO_BUTTON"].includes(item.answerType) &&
          item.options.length === 0
      )
    );

    if (hasChoiceWithoutOptions) {
      setError("Dropdown ve Check Box sorulari icin en az bir secenek girilmelidir.");
      return;
    }

    try {
      if (editingId) {
        await updateChecklist(editingId, payload.title, templateImagePath, payload.sections);
        setMessage("Checklist updated.");
      } else {
        await createChecklist(payload.title, templateImagePath, payload.sections);
        setMessage("Checklist created.");
      }

      resetTemplateForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checklist could not be saved");
    }
  };

  const handleDuplicateTemplate = async (checklist: Checklist) => {
    setMessage("");
    setError("");

    const payload = {
      title: `${checklist.title} Copy`,
      imagePath: checklist.image_path || checklist.imagePath || "",
      sections: (checklist.sections || []).map((section) => ({
        title: section.title,
        items: (section.items || []).map((item) => ({
          question: item.question,
          answerType: item.answerType || item.answer_type || "FORMAT1",
          options: item.options || [],
        })),
      })),
    };

    try {
      await createChecklist(payload.title, payload.imagePath, payload.sections);
      setMessage("Template copied successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template could not be copied");
    }
  };

  const assign = async () => {
    setMessage("");
    setError("");

    if (!selectedChecklistId || !selectedUserId) {
      setError("Checklist and user selection are required.");
      return;
    }

    try {
      await createAssignment(selectedChecklistId, selectedUserId);
      setMessage("Checklist assigned.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assignment failed");
    }
  };

  const handleDownloadPdf = async (report: Report) => {
    const pdfPayload = mapReportToPdfPayload(report);
    await generateChecklistPdf(pdfPayload as any);
  };

  const handleDownloadActionPlanExcel = async (report: Report) => {
    setMessage("");
    setError("");

    const failedItems = (report.items || []).filter(
      (item) => (item.answerType || item.answer_type || "FORMAT1") === "FORMAT1" && item.answer === "NO"
    );

    if (failedItems.length === 0) {
      setError("This report has no failed YES/NO items to convert into an action plan.");
      return;
    }

    try {
      setActionPlanReportId(report.id);
      const result = await generateAiActionPlan(report);
      exportActionPlansToExcel(result.actionPlans, report);
      setMessage(
        result.provider === "azure-openai" || result.provider === "openai"
          ? `AI action plan Excel generated for ${result.industry || "the selected profile"}.`
          : "Action plan Excel generated with local fallback classification. Add Azure OpenAI or OpenAI credentials on the backend for AI-generated analysis."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI action plan Excel could not be generated");
    } finally {
      setActionPlanReportId(null);
    }
  };

  const handleCreateUser = async () => {
    setMessage("");
    setError("");

    if (!newUsername.trim() || !newPassword.trim() || !newName.trim()) {
      setError("Username, password and full name are required.");
      return;
    }

    try {
      await createUser({
        username: newUsername.trim(),
        password: newPassword,
        name: newName.trim(),
        role: newRole,
      });

      setNewUsername("");
      setNewPassword("");
      setNewName("");
      setNewRole("user");
      setMessage("User created successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User could not be created");
    }
  };

  const startEditUser = (targetUser: User) => {
    setExpandedUserId(targetUser.id);
    setEditingUserId(targetUser.id);
    setEditUsername(targetUser.username);
    setEditPassword("");
    setEditName(targetUser.name);
    setEditRole(targetUser.role);
    setMessage("");
    setError("");
  };

  const cancelEditUser = () => {
    setEditingUserId(null);
    setEditUsername("");
    setEditPassword("");
    setEditName("");
    setEditRole("user");
  };

  const handleUpdateUser = async () => {
    if (!editingUserId) return;

    setMessage("");
    setError("");

    if (!editUsername.trim() || !editName.trim()) {
      setError("Username and full name are required.");
      return;
    }

    try {
      await updateUser(editingUserId, {
        username: editUsername.trim(),
        name: editName.trim(),
        role: editRole,
        ...(editPassword.trim() ? { password: editPassword } : {}),
      });
      setMessage("User updated successfully.");
      cancelEditUser();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User could not be updated");
    }
  };

  const handleDeleteUser = async (userId: number) => {
    setMessage("");
    setError("");

    const confirmDelete = window.confirm("Are you sure you want to delete this user?");
    if (!confirmDelete) return;

    try {
      await deleteUser(userId);

      setMessage("User deleted successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User could not be deleted");
    }
  };

  const handleApproveUser = async (targetUser: User) => {
    setMessage("");
    setError("");

    const pendingForm = pendingUserForms[targetUser.id] || {
      username: targetUser.username,
      password: targetUser.password || "",
      name: targetUser.name,
    };

    if (!pendingForm.username.trim() || !pendingForm.password.trim() || !pendingForm.name.trim()) {
      setError("Username, password and full name are required before approval.");
      return;
    }

    try {
      await updateUser(targetUser.id, {
        username: pendingForm.username.trim(),
        password: pendingForm.password,
        name: pendingForm.name.trim(),
        approvalStatus: "approved",
        active: true,
        role: "user",
      });
      setMessage(`${targetUser.username} approved successfully.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "User could not be approved");
    }
  };

  const handleDeleteTemplate = async (checklistId: number) => {
    setMessage("");
    setError("");

    const confirmDelete = window.confirm("Are you sure you want to delete this template?");
    if (!confirmDelete) return;

    try {
      await deleteChecklist(checklistId);
      if (editingId === checklistId) {
        resetTemplateForm();
      }
      setMessage("Template moved to Recycle Bin.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template could not be deleted");
    }
  };

  const handleForceDeleteTemplate = async (checklistId: number) => {
    setMessage("");
    setError("");

    const confirmDelete = window.confirm(
      "This will permanently delete the template and all linked assignments and reports. Do you want to continue?"
    );
    if (!confirmDelete) return;

    try {
      await forceDeleteChecklist(checklistId);
      if (editingId === checklistId) {
        resetTemplateForm();
      }
      setSelectedReport(null);
      setMessage("Template and linked records deleted successfully.");
      await load();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Template could not be force deleted"
      );
    }
  };

  const handleRestoreTemplate = async (checklistId: number) => {
    setMessage("");
    setError("");

    try {
      await restoreChecklist(checklistId);
      setMessage("Template restored successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template could not be restored");
    }
  };

  const handleDeleteReport = async (reportId: number) => {
    setMessage("");
    setError("");

    const confirmDelete = window.confirm("Are you sure you want to delete this completed report?");
    if (!confirmDelete) return;

    try {
      await deleteReport(reportId);
      setSelectedReport(null);
      setMessage("Report deleted successfully.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Report could not be deleted");
    }
  };

  return (
    <DashboardShell user={user} onLogout={onLogout}>
      {selectedReport ? (
        <div>
          <div
            className="responsive-report-top"
            style={{ ...styles.row, justifyContent: "space-between", marginBottom: 14 }}
          >
            <button
              style={styles.secondaryButton}
              onClick={() => setSelectedReport(null)}
            >
              Back
            </button>

            <div className="responsive-report-actions" style={styles.row}>
              <button
                style={styles.button}
                onClick={() => handleDownloadPdf(selectedReport)}
              >
                Download PDF
              </button>
              <button
                style={styles.button}
                onClick={() => handleDownloadActionPlanExcel(selectedReport)}
                disabled={actionPlanReportId === selectedReport.id}
              >
                {actionPlanReportId === selectedReport.id
                  ? "Preparing Excel..."
                  : "AI Action Plan Excel"}
              </button>
              <button
                style={styles.button}
                onClick={() => handleDeleteReport(selectedReport.id)}
              >
                Delete Report
              </button>
            </div>
          </div>

          <ReportDetail
            report={selectedReport}
            onBack={() => setSelectedReport(null)}
            onDownloadPdf={handleDownloadPdf}
            onDownloadActionPlan={handleDownloadActionPlanExcel}
            actionPlanLoading={actionPlanReportId === selectedReport.id}
          />
        </div>
      ) : (
        <>
          <div
            className="responsive-tab-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
              gap: 10,
              marginBottom: 14,
            }}
          >
            {ADMIN_SECTIONS.map((section) => {
              const isActive = activeAdminPage === section.key;

              return (
                <button
                  key={section.key}
                  type="button"
                  onClick={() => {
                    setActiveAdminPage(section.key);
                    setSelectedReport(null);
                    setMessage("");
                    setError("");
                  }}
                  style={{
                    border: isActive ? "2px solid #3f6f58" : "1px solid #e4d8c7",
                    borderRadius: 10,
                    background: isActive ? "#e7f0e5" : "#fffaf2",
                    color: "#2f2a24",
                    cursor: "pointer",
                    padding: "12px 14px",
                    textAlign: "left",
                    minHeight: 74,
                    boxShadow: isActive ? "0 2px 8px rgba(63,111,88,0.14)" : "none",
                  }}
                >
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>{section.label}</div>
                  <div style={{ fontSize: 12, color: "#776b5d", lineHeight: 1.3 }}>
                    {section.description}
                  </div>
                </button>
              );
            })}
          </div>

          {message ? (
            <div style={{ ...styles.section, background: "#ecfeff", color: "#0f172a" }}>
              {message}
            </div>
          ) : null}

          {error ? (
            <div style={{ ...styles.section, background: "#fef2f2", color: "#991b1b" }}>
              {error}
            </div>
          ) : null}

          {activeAdminPage === "templates" ? (
            <>
          <div style={styles.section}>
            <h3 style={styles.title}>
              {editingId ? "Edit Checklist Template" : "Create Checklist Template"}
            </h3>

            <input
              style={{ ...styles.input, marginBottom: 12 }}
              placeholder="Checklist display title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            <div style={{ ...styles.section, background: "#fffaf2", marginTop: 0, marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>
                Import Questions from Excel
              </label>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  handleImportQuestionsFromExcel(e.target.files?.[0] || null);
                  e.target.value = "";
                }}
              />
              <div style={{ ...styles.small, marginTop: 8 }}>
                Excel can contain only a Question column, or questions in the first filled column.
              </div>
            </div>

            <div style={{ ...styles.section, background: "#fffaf2", marginTop: 0, marginBottom: 12 }}>
              <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>
                Template Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleTemplateImageUpload(e.target.files)}
              />
              {templateImageUploading ? (
                <div style={{ ...styles.small, marginTop: 8 }}>Uploading image...</div>
              ) : null}
              {templateImagePath ? (
                <div style={{ marginTop: 12 }}>
                  <img
                    src={templateImagePath.startsWith("http") ? templateImagePath : `${FILE_BASE}${templateImagePath}`}
                    alt="Template"
                    style={{
                      width: "25%",
                      minWidth: 120,
                      maxWidth: 220,
                      height: "auto",
                      objectFit: "contain",
                      borderRadius: 10,
                      border: "1px solid #e4d8c7",
                      display: "block",
                    }}
                  />
                  <button
                    type="button"
                    style={{ ...styles.secondaryButton, marginTop: 10 }}
                    onClick={() => setTemplateImagePath("")}
                  >
                    Remove Image
                  </button>
                </div>
              ) : null}
            </div>

            {sections.map((section, sectionIndex) => (
              <div key={sectionIndex} style={{ ...styles.section, background: "#fffaf2" }}>
                <div style={{ ...styles.row, marginBottom: 10 }}>
                  <button
                    style={styles.secondaryButton}
                    onClick={() => moveSection(sectionIndex, -1)}
                    disabled={sectionIndex === 0}
                  >
                    Move Section Up
                  </button>
                  <button
                    style={styles.secondaryButton}
                    onClick={() => moveSection(sectionIndex, 1)}
                    disabled={sectionIndex === sections.length - 1}
                  >
                    Move Section Down
                  </button>
                </div>

                <input
                  style={{ ...styles.input, marginBottom: 10 }}
                  placeholder={`Section ${sectionIndex + 1} title`}
                  value={section.title}
                  onChange={(e) => updateSectionTitle(sectionIndex, e.target.value)}
                />

                {section.items.map((item, questionIndex) => (
                  <div
                    key={questionIndex}
                    style={{
                      ...styles.questionEditRow,
                      opacity:
                        draggedQuestion?.sectionIndex === sectionIndex &&
                        draggedQuestion?.questionIndex === questionIndex
                          ? 0.55
                          : 1,
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={() => handleQuestionDrop(sectionIndex, questionIndex)}
                  >
                    <div
                      draggable
                      role="button"
                      tabIndex={0}
                      title="Drag to reorder"
                      aria-label="Drag question to reorder"
                      style={{
                        ...styles.questionDragHandle,
                        ...(draggedQuestion?.sectionIndex === sectionIndex &&
                        draggedQuestion?.questionIndex === questionIndex
                          ? styles.questionDragHandleActive
                          : {}),
                      }}
                      onDragStart={(e) => {
                        setDraggedQuestion({ sectionIndex, questionIndex });
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData(
                          "text/plain",
                          `${sectionIndex}:${questionIndex}`
                        );
                      }}
                      onDragEnd={() => setDraggedQuestion(null)}
                    >
                      ::
                    </div>
                    <div>
                      <input
                        style={{ ...styles.input, marginBottom: 8 }}
                        placeholder={`Question ${questionIndex + 1}`}
                        value={item.question}
                        onChange={(e) =>
                          updateQuestion(sectionIndex, questionIndex, e.target.value)
                        }
                      />
                      <select
                        style={{ ...styles.input, marginBottom: 8 }}
                        value={item.answerType}
                        onChange={(e) =>
                          updateQuestionAnswerType(
                            sectionIndex,
                            questionIndex,
                            e.target.value as AnswerType
                          )
                        }
                      >
                        {(Object.keys(ANSWER_TYPE_LABELS) as AnswerType[]).map((type) => (
                          <option key={type} value={type}>
                            {ANSWER_TYPE_LABELS[type]}
                          </option>
                        ))}
                      </select>

                      {["MULTIPLE_CHOICE", "RADIO_BUTTON"].includes(item.answerType) ? (
                        <div style={{ ...styles.section, marginTop: 0, background: "#fbf6ec" }}>
                          <div style={{ ...styles.small, marginBottom: 8 }}>
                            Answer options
                          </div>
                          {item.options.map((option, optionIndex) => (
                            <div
                              key={optionIndex}
                              style={{ ...styles.row, marginBottom: 8, alignItems: "center" }}
                            >
                              <input
                                style={{ ...styles.input, flex: 1 }}
                                placeholder={`Option ${optionIndex + 1}`}
                                value={option}
                                onChange={(e) =>
                                  updateQuestionOption(
                                    sectionIndex,
                                    questionIndex,
                                    optionIndex,
                                    e.target.value
                                  )
                                }
                              />
                              <button
                                type="button"
                                style={styles.secondaryButton}
                                onClick={() =>
                                  removeQuestionOption(
                                    sectionIndex,
                                    questionIndex,
                                    optionIndex
                                  )
                                }
                                disabled={item.options.length === 1}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            style={styles.secondaryButton}
                            onClick={() => addQuestionOption(sectionIndex, questionIndex)}
                          >
                            Add Option
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      title="Delete question"
                      aria-label="Delete question"
                      style={styles.iconButton}
                      onClick={() => removeQuestionFromSection(sectionIndex, questionIndex)}
                    >
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="M19 6l-1 14H6L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                      </svg>
                    </button>
                  </div>
                ))}

                <button
                  style={styles.secondaryButton}
                  onClick={() => addQuestionToSection(sectionIndex)}
                >
                  Add Question
                </button>
              </div>
            ))}

            <div style={{ ...styles.row, marginTop: 12 }}>
              <button style={styles.secondaryButton} onClick={addSection}>
                Add Section
              </button>
              {editingId ? (
                <button style={styles.secondaryButton} onClick={resetTemplateForm}>
                  Cancel Edit
                </button>
              ) : null}
              <button style={styles.button} onClick={saveChecklist}>
                {editingId ? "Update Checklist" : "Save Checklist"}
              </button>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.title}>Templates</h3>

            {checklists.length === 0 ? (
              <div style={styles.small}>No templates found.</div>
            ) : (
              checklists.map((c) => (
                <div key={c.id} style={styles.section}>
                  {(c.image_path || c.imagePath) ? (
                    <img
                      src={(c.image_path || c.imagePath || "").startsWith("http") ? (c.image_path || c.imagePath) : `${FILE_BASE}${c.image_path || c.imagePath}`}
                      alt={c.title}
                      style={{
                        width: "25%",
                        minWidth: 100,
                        maxWidth: 180,
                        height: "auto",
                        objectFit: "contain",
                        borderRadius: 10,
                        border: "1px solid #e4d8c7",
                        marginBottom: 10,
                        display: "block",
                      }}
                    />
                  ) : null}
                  <strong>{c.title}</strong>
                  <br />
                  Sections: {Array.isArray(c.sections) ? c.sections.length : 0}
                  <br />
                  <div style={{ marginTop: 8 }}>
                    {Array.isArray(c.sections) &&
                      c.sections.map((section) => (
                        <div key={section.id} style={{ marginBottom: 6 }}>
                          <strong>- {section.title}</strong> ({section.items.length} questions)
                        </div>
                      ))}
                  </div>
                  <div style={{ ...styles.row, marginTop: 10 }}>
                    <button
                      style={styles.secondaryButton}
                      onClick={() => startEditTemplate(c)}
                    >
                      Edit Template
                    </button>
                    <button
                      style={styles.secondaryButton}
                      onClick={() => handleDuplicateTemplate(c)}
                    >
                      Copy Template
                    </button>
                    <button
                      style={styles.button}
                      onClick={() => handleDeleteTemplate(c.id)}
                    >
                      Move to Recycle Bin
                    </button>
                    <button
                      style={{ ...styles.button, background: "#b91c1c" }}
                      onClick={() => handleForceDeleteTemplate(c.id)}
                    >
                      Force Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={styles.section}>
            <h3 style={styles.title}>Recycle Bin</h3>
            <div style={{ ...styles.small, marginBottom: 10 }}>
              Deleted templates stay here until restored or permanently deleted.
            </div>

            {deletedChecklists.length === 0 ? (
              <div style={styles.small}>Recycle Bin is empty.</div>
            ) : (
              deletedChecklists.map((c) => (
                <div key={c.id} style={styles.section}>
                  <strong>{c.title}</strong>
                  <br />
                  Sections: {Array.isArray(c.sections) ? c.sections.length : 0}
                  <br />
                  <div style={styles.small}>
                    Deleted at {formatAdminDate(c.deleted_at || undefined)}
                    {c.deletedByName ? ` by ${c.deletedByName}` : ""}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {Array.isArray(c.sections) &&
                      c.sections.map((section) => (
                        <div key={section.id} style={{ marginBottom: 6 }}>
                          <strong>- {section.title}</strong> ({section.items.length} questions)
                        </div>
                      ))}
                  </div>
                  <div style={{ ...styles.row, marginTop: 10 }}>
                    <button
                      style={styles.secondaryButton}
                      onClick={() => handleRestoreTemplate(c.id)}
                    >
                      Restore Template
                    </button>
                    <button
                      style={{ ...styles.button, background: "#b91c1c" }}
                      onClick={() => handleForceDeleteTemplate(c.id)}
                    >
                      Permanently Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
            </>
          ) : null}

          {activeAdminPage === "assignments" ? (
          <div style={styles.section}>
            <h3 style={styles.title}>Assignments</h3>

            <div style={{ ...styles.row, marginBottom: 12 }}>
              <select
                style={styles.input}
                value={selectedChecklistId}
                onChange={(e) => setSelectedChecklistId(Number(e.target.value))}
              >
                <option value={0}>Select checklist</option>
                {checklists.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>

              <select
                style={styles.input}
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(Number(e.target.value))}
              >
                <option value={0}>Select user</option>
                {users
                  .filter(
                    (u) =>
                      u.role === "user" &&
                      u.active !== false &&
                      u.approvalStatus !== "pending"
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>

              <button style={styles.button} onClick={assign}>
                Assign
              </button>
            </div>

            {assignments.length === 0 ? (
              <div style={styles.small}>No assignments found.</div>
            ) : (
              <div style={compactListStyle}>
                {assignments.map((a, index) => {
                  const isExpanded = expandedAssignmentId === a.id;

                  return (
                    <div
                      key={a.id}
                      style={{
                        ...compactRowStyle(index, isExpanded),
                        borderBottom:
                          index === assignments.length - 1 ? "none" : "1px solid #e4d8c7",
                      }}
                    >
                      <div
                        className="responsive-compact-row"
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setExpandedAssignmentId((current) =>
                            current === a.id ? null : a.id
                          )
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedAssignmentId((current) =>
                              current === a.id ? null : a.id
                            );
                          }
                        }}
                        style={compactRowHeaderStyle}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#2f2a24",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={a.checklistTitle}
                          >
                            {a.checklistTitle}
                          </div>
                          <div style={styles.small}>
                            Assigned to {a.assignedToName} - {a.status}
                          </div>
                        </div>
                        <div style={{ ...styles.small, color: "#5f5448", fontWeight: 600 }}>
                          {isExpanded ? "Close" : "Open"}
                        </div>
                      </div>

                      {isExpanded ? (
                        <div
                          style={compactRowActionsStyle}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div
                            className="responsive-detail-grid"
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                              gap: 10,
                            }}
                          >
                            <div>
                              <div style={styles.small}>Assigned To</div>
                              <div style={{ fontWeight: 600 }}>{a.assignedToName}</div>
                            </div>
                            <div>
                              <div style={styles.small}>Assigned By</div>
                              <div style={{ fontWeight: 600 }}>{a.assignedByName}</div>
                            </div>
                            <div>
                              <div style={styles.small}>Assigned At</div>
                              <div style={{ fontWeight: 600 }}>
                                {formatAdminDate(a.assigned_at)}
                              </div>
                            </div>
                            <div>
                              <div style={styles.small}>Status</div>
                              <div style={{ fontWeight: 600 }}>{a.status}</div>
                            </div>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          {activeAdminPage === "users" ? (
          <div style={styles.section}>
            <h3 style={styles.title}>User Management</h3>

            {pendingUsers.length > 0 ? (
              <div style={{ ...styles.section, background: "#f8ecd8", marginBottom: 14 }}>
                <h4 style={{ ...styles.title, marginBottom: 10 }}>Pending Approval</h4>

                {pendingUsers.map((u) => (
                  <div key={u.id} style={styles.section}>
                    <div style={{ ...styles.row, marginBottom: 10 }}>
                      <input
                        style={styles.input}
                        placeholder="Username"
                        value={pendingUserForms[u.id]?.username || ""}
                        onChange={(e) =>
                          setPendingUserForms((prev) => ({
                            ...prev,
                            [u.id]: {
                              username: e.target.value,
                              password: prev[u.id]?.password || u.password || "",
                              name: prev[u.id]?.name || u.name,
                            },
                          }))
                        }
                      />
                      <input
                        style={styles.input}
                        placeholder="Password"
                        value={pendingUserForms[u.id]?.password || ""}
                        onChange={(e) =>
                          setPendingUserForms((prev) => ({
                            ...prev,
                            [u.id]: {
                              username: prev[u.id]?.username || u.username,
                              password: e.target.value,
                              name: prev[u.id]?.name || u.name,
                            },
                          }))
                        }
                      />
                      <input
                        style={styles.input}
                        placeholder="Full Name"
                        value={pendingUserForms[u.id]?.name || ""}
                        onChange={(e) =>
                          setPendingUserForms((prev) => ({
                            ...prev,
                            [u.id]: {
                              username: prev[u.id]?.username || u.username,
                              password: prev[u.id]?.password || u.password || "",
                              name: e.target.value,
                            },
                          }))
                        }
                      />
                    </div>
                    Status: waiting for admin approval
                    <div style={{ ...styles.row, marginTop: 10 }}>
                      <button
                        style={styles.button}
                        onClick={() => handleApproveUser(u)}
                      >
                        Approve User
                      </button>
                      <button
                        style={styles.secondaryButton}
                        onClick={() => handleDeleteUser(u.id)}
                      >
                        Reject Request
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div style={{ ...styles.row, marginBottom: 14 }}>
              <input
                style={styles.input}
                placeholder="Username"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <input
                style={styles.input}
                placeholder="Full Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <select
                style={styles.input}
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as "admin" | "user")}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>

              <button style={styles.button} onClick={handleCreateUser}>
                Create User
              </button>
            </div>

            {approvedUsers.length === 0 ? (
              <div style={styles.small}>No users found.</div>
            ) : (
              <div style={compactListStyle}>
                {approvedUsers.map((u, index) => {
                  const isExpanded = expandedUserId === u.id || editingUserId === u.id;

                  return (
                    <div
                      key={u.id}
                      style={{
                        ...compactRowStyle(index, isExpanded),
                        borderBottom:
                          index === approvedUsers.length - 1 ? "none" : "1px solid #e4d8c7",
                      }}
                    >
                      <div
                        className="responsive-compact-row"
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setExpandedUserId((current) => (current === u.id ? null : u.id))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedUserId((current) => (current === u.id ? null : u.id));
                          }
                        }}
                        style={compactRowHeaderStyle}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#2f2a24",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={u.name}
                          >
                            {u.name}
                          </div>
                          <div style={styles.small}>
                            {u.username} - {u.role} - {u.active === false ? "Inactive" : "Active"}
                          </div>
                        </div>
                        <div style={{ ...styles.small, color: "#5f5448", fontWeight: 600 }}>
                          {isExpanded ? "Close" : "Open"}
                        </div>
                      </div>

                      {isExpanded ? (
                        <div
                          style={compactRowActionsStyle}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {editingUserId === u.id ? (
                            <>
                              <div className="responsive-compact-actions" style={{ ...styles.row, marginBottom: 10 }}>
                                <input
                                  style={styles.input}
                                  placeholder="Username"
                                  value={editUsername}
                                  onChange={(e) => setEditUsername(e.target.value)}
                                />
                                <input
                                  style={styles.input}
                                  placeholder="New Password (optional)"
                                  type="password"
                                  value={editPassword}
                                  onChange={(e) => setEditPassword(e.target.value)}
                                />
                                <input
                                  style={styles.input}
                                  placeholder="Full Name"
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                />
                                <select
                                  style={styles.input}
                                  value={editRole}
                                  onChange={(e) =>
                                    setEditRole(e.target.value as "admin" | "user")
                                  }
                                >
                                  <option value="user">user</option>
                                  <option value="admin">admin</option>
                                </select>
                              </div>
                              <div className="responsive-compact-actions" style={styles.row}>
                                <button style={styles.secondaryButton} onClick={cancelEditUser}>
                                  Cancel
                                </button>
                                <button style={styles.button} onClick={handleUpdateUser}>
                                  Save Changes
                                </button>
                              </div>
                            </>
                          ) : (
                            <div className="responsive-compact-actions" style={styles.row}>
                              <button
                                style={styles.secondaryButton}
                                onClick={() => startEditUser(u)}
                              >
                                Edit User
                              </button>
                              <button
                                style={styles.button}
                                onClick={() => handleDeleteUser(u.id)}
                                disabled={u.id === user.id}
                              >
                                Delete User
                              </button>
                              {u.id === user.id ? (
                                <span style={{ fontSize: 12, color: "#6b7280" }}>
                                  You cannot delete your own account
                                </span>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}

          {activeAdminPage === "walkthrough" ? (
            <WalkThroughPanel user={user} onSubmitted={load} />
          ) : null}

          {activeAdminPage === "reports" ? (
          <div style={styles.section}>
            <h3 style={styles.title}>Completed Reports</h3>

            {reports.length === 0 ? (
              <div style={styles.small}>No reports yet.</div>
            ) : (
              <div style={compactListStyle}>
                {reports.map((r, index) => {
                  const isExpanded = expandedReportId === r.id;

                  return (
                    <div
                      key={r.id}
                      style={{
                        ...compactRowStyle(index, isExpanded),
                        borderBottom:
                          index === reports.length - 1 ? "none" : "1px solid #e4d8c7",
                      }}
                    >
                      <div
                        className="responsive-compact-row"
                        role="button"
                        tabIndex={0}
                        onClick={() =>
                          setExpandedReportId((current) => (current === r.id ? null : r.id))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setExpandedReportId((current) =>
                              current === r.id ? null : r.id
                            );
                          }
                        }}
                        style={compactRowHeaderStyle}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#2f2a24",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={r.checklistTitle}
                          >
                            {r.checklistTitle}
                          </div>
                          <div style={styles.small}>
                            Completed by {r.completedByName} - Assigned to{" "}
                            {r.assignedToName} - {r.status} -{" "}
                            {formatAdminDate(r.completed_at)}
                          </div>
                        </div>
                        <div style={{ ...styles.small, color: "#5f5448", fontWeight: 600 }}>
                          {isExpanded ? "Close" : "Open"}
                        </div>
                      </div>

                      {isExpanded ? (
                        <div
                          style={compactRowActionsStyle}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="responsive-compact-actions" style={styles.row}>
                            <button
                              style={styles.secondaryButton}
                              onClick={() => setSelectedReport(r)}
                            >
                              View Detail
                            </button>

                            <button
                              style={styles.button}
                              onClick={() => handleDownloadPdf(r)}
                            >
                              Download PDF
                            </button>

                            <button
                              style={styles.button}
                              onClick={() => handleDownloadActionPlanExcel(r)}
                              disabled={actionPlanReportId === r.id}
                            >
                              {actionPlanReportId === r.id
                                ? "Preparing Excel..."
                                : "AI Action Plan Excel"}
                            </button>

                            <button
                              style={styles.button}
                              onClick={() => handleDeleteReport(r.id)}
                            >
                              Delete Report
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          ) : null}
        </>
      )}
    </DashboardShell>
  );
}
