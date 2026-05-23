import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnswerType, Assignment, Checklist, Report, User } from "../types";
import { styles } from "../styles/appStyles";
import DashboardShell from "../components/DashboardShell";
import ReportDetail from "../components/ReportDetail";
import { getAssignments } from "../services/assignmentService";
import { getChecklists } from "../services/checklistService";
import { apiPost, FILE_BASE, uploadPhotos } from "../services/api";
import {
  deleteDraft,
  getDraft,
  saveDraft,
  saveDraftKeepalive,
} from "../services/draftService";
import { getReports } from "../services/reportService";
import { generateChecklistPdf } from "../utils/generateChecklistPdf";

type FillItem = {
  itemId: number;
  sectionTitle?: string;
  question: string;
  answerType: AnswerType;
  options?: string[];
  answer: string;
  comment: string;
  photos: string[];
};

type Props = {
  user: User;
  onLogout: () => Promise<void>;
};

function getAnswerButtonStyle(
  option: "YES" | "NO" | "N/A",
  selected: string
): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: "8px 14px",
    borderRadius: 10,
    border: "1px solid #d8c7aa",
    background: "#ffffff",
    color: "#243b2d",
    cursor: "pointer",
    fontWeight: 700,
    minWidth: 72,
    transition: "all 0.15s ease",
  };

  if (selected !== option) return base;

  if (option === "YES") {
    return {
      ...base,
      background: "#16a34a",
      color: "#ffffff",
      border: "1px solid #16a34a",
    };
  }

  if (option === "NO") {
    return {
      ...base,
      background: "#dc2626",
      color: "#ffffff",
      border: "1px solid #dc2626",
    };
  }

  return {
    ...base,
    background: "#2f6f4e",
    color: "#ffffff",
    border: "1px solid #2f6f4e",
  };
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

export default function UserPage({ user, onLogout }: Props) {
  const localDraftKey = `mod_draft_${user.id}`;
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [activeAssignmentId, setActiveAssignmentId] = useState<number | null>(null);
  const [selectedReport, setSelectedReport] = useState<Report | null>(null);
  const [expandedAssignmentId, setExpandedAssignmentId] = useState<number | null>(null);
  const [expandedChecklistId, setExpandedChecklistId] = useState<number | null>(null);
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
  const [form, setForm] = useState<Record<number, FillItem>>({});
  const [message, setMessage] = useState("");
  const [uploadingItemId, setUploadingItemId] = useState<number | null>(null);
  const [isRestoringDraft, setIsRestoringDraft] = useState(false);
  const [currentSectionIndex, setCurrentSectionIndex] = useState(0);
  const activeAssignmentIdRef = useRef<number | null>(null);
  const latestFormRef = useRef<Record<number, FillItem>>({});
  const saveTimeoutRef = useRef<number | null>(null);

  const load = async () => {
    const [a, c, r] = await Promise.all([
      getAssignments(),
      getChecklists(),
      getReports(),
    ]);
    setAssignments(a);
    setChecklists(c);
    setReports(r);
  };

  useEffect(() => {
    load();
  }, []);

  const activeAssignment =
    assignments.find((a) => a.id === activeAssignmentId) || null;

  useEffect(() => {
    activeAssignmentIdRef.current = activeAssignmentId;
  }, [activeAssignmentId]);

  useEffect(() => {
    latestFormRef.current = form;
  }, [form]);

  const activeChecklist = useMemo(() => {
    if (!activeAssignment) return null;
    return checklists.find((c) => c.id === activeAssignment.checklist_id) || null;
  }, [activeAssignment, checklists]);

  const activeSections = activeChecklist?.sections || [];
  const currentSection = activeSections[currentSectionIndex] || null;
  const isFirstSection = currentSectionIndex === 0;
  const isLastSection =
    activeSections.length === 0 || currentSectionIndex === activeSections.length - 1;
  const totalQuestionCount = activeSections.reduce(
    (total, section) => total + section.items.length,
    0
  );
  const answeredQuestionCount = activeSections.reduce(
    (total, section) =>
      total +
      section.items.filter((item) => (form[item.id]?.answer || "").trim()).length,
    0
  );
  const progressPercent =
    totalQuestionCount > 0
      ? Math.round((answeredQuestionCount / totalQuestionCount) * 100)
      : 0;

  useEffect(() => {
    if (!activeChecklist) {
      setCurrentSectionIndex(0);
      return;
    }

    if (currentSectionIndex >= activeSections.length) {
      setCurrentSectionIndex(Math.max(activeSections.length - 1, 0));
    }
  }, [activeChecklist, activeSections.length, currentSectionIndex]);

  function readLocalDrafts() {
    const raw = localStorage.getItem(localDraftKey);
    if (!raw) return {} as Record<string, { form: Record<number, FillItem>; updatedAt: string }>;

    try {
      return JSON.parse(raw) as Record<
        string,
        { form: Record<number, FillItem>; updatedAt: string }
      >;
    } catch {
      return {};
    }
  }

  function writeLocalDraft(assignmentId: number, nextForm: Record<number, FillItem>) {
    const drafts = readLocalDrafts();
    drafts[String(assignmentId)] = {
      form: nextForm,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(localDraftKey, JSON.stringify(drafts));
  }

  function removeLocalDraft(assignmentId: number) {
    const drafts = readLocalDrafts();
    delete drafts[String(assignmentId)];
    localStorage.setItem(localDraftKey, JSON.stringify(drafts));
  }

  function scheduleRemoteDraftSave(
    assignmentId: number,
    nextForm: Record<number, FillItem>
  ) {
    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(() => {
      saveDraft(assignmentId, nextForm).catch((error) => {
        console.error(error);
      });
    }, 400);
  }

  function persistDraft(
    assignmentId: number,
    nextForm: Record<number, FillItem>,
    options?: { immediateRemote?: boolean }
  ) {
    latestFormRef.current = nextForm;
    writeLocalDraft(assignmentId, nextForm);

    if (options?.immediateRemote) {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }

      saveDraftKeepalive(assignmentId, nextForm);
      return;
    }

    scheduleRemoteDraftSave(assignmentId, nextForm);
  }

  const openAssignment = async (assignment: Assignment) => {
    const checklist = checklists.find((c) => c.id === assignment.checklist_id);
    if (!checklist) return;

    const initial: Record<number, FillItem> = {};

    checklist.sections.forEach((section) => {
      section.items.forEach((item) => {
        initial[item.id] = {
          itemId: item.id,
          sectionTitle: section.title,
          question: item.question,
          answerType: item.answerType || item.answer_type || "FORMAT1",
          options: item.options || [],
          answer: "",
          comment: "",
          photos: [],
        };
      });
    });

    setIsRestoringDraft(true);
    setSelectedReport(null);
    setActiveAssignmentId(assignment.id);
    setCurrentSectionIndex(0);

    let merged = initial;
    const localDrafts = readLocalDrafts();
    const localDraft = localDrafts[String(assignment.id)];

    try {
      const response = await getDraft(assignment.id);
      const remoteDraft = response.draft;

      const newestDraft =
        remoteDraft && localDraft
          ? new Date(remoteDraft.updatedAt).getTime() >=
            new Date(localDraft.updatedAt).getTime()
            ? remoteDraft
            : localDraft
          : remoteDraft || localDraft;

      if (newestDraft?.form) {
        merged = Object.fromEntries(
          Object.entries(initial).map(([itemId, initialItem]) => [
            itemId,
            {
              ...initialItem,
              ...(newestDraft.form[Number(itemId)] || {}),
              answerType: initialItem.answerType,
              options: initialItem.options,
            },
          ])
        ) as Record<number, FillItem>;

        setMessage("Saved draft loaded. You can continue from where you left off.");
      } else {
        setMessage("");
      }
    } catch (error) {
      console.error(error);

      if (localDraft?.form) {
        merged = Object.fromEntries(
          Object.entries(initial).map(([itemId, initialItem]) => [
            itemId,
            {
              ...initialItem,
              ...(localDraft.form[Number(itemId)] || {}),
              answerType: initialItem.answerType,
              options: initialItem.options,
            },
          ])
        ) as Record<number, FillItem>;
        setMessage("Offline saved draft loaded.");
      }
    } finally {
      setForm(merged);
      latestFormRef.current = merged;
      writeLocalDraft(assignment.id, merged);
      setIsRestoringDraft(false);
    }
  };

  const handleAddPhotos = async (itemId: number, files: FileList | null) => {
    if (!files || files.length === 0) return;

    try {
      setUploadingItemId(itemId);
      const uploaded = await uploadPhotos(files);

      setForm((prev) => {
        const nextForm = {
          ...prev,
          [itemId]: {
            ...prev[itemId],
            photos: [...(prev[itemId]?.photos || []), ...uploaded],
          },
        };

        if (activeAssignmentIdRef.current) {
          persistDraft(activeAssignmentIdRef.current, nextForm);
        }

        return nextForm;
      });
    } catch (error) {
      console.error(error);
      alert("Photo upload failed.");
    } finally {
      setUploadingItemId(null);
    }
  };

  const removePhoto = (itemId: number, photoIndex: number) => {
    setForm((prev) => {
      const nextForm = {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          photos: prev[itemId].photos.filter((_, idx) => idx !== photoIndex),
        },
      };

      if (activeAssignmentIdRef.current) {
        persistDraft(activeAssignmentIdRef.current, nextForm);
      }

      return nextForm;
    });
  };

  const updateAnswer = (itemId: number, answer: string) => {
    setForm((prev) => {
      const nextForm = {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          answer,
        },
      };

      if (activeAssignmentIdRef.current) {
        persistDraft(activeAssignmentIdRef.current, nextForm);
      }

      return nextForm;
    });
  };

  const toggleMultiAnswer = (itemId: number, option: string) => {
    setForm((prev) => {
      const currentAnswers = (prev[itemId]?.answer || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const hasOption = currentAnswers.includes(option);
      const nextAnswers = hasOption
        ? currentAnswers.filter((value) => value !== option)
        : [...currentAnswers, option];
      const nextForm = {
        ...prev,
        [itemId]: {
          ...prev[itemId],
          answer: nextAnswers.join(", "),
        },
      };

      if (activeAssignmentIdRef.current) {
        persistDraft(activeAssignmentIdRef.current, nextForm);
      }

      return nextForm;
    });
  };

  const submit = async () => {
    if (!activeChecklist || !activeAssignment) return;

    const items = activeChecklist.sections.flatMap((section) =>
      section.items.map((item) => ({
        ...form[item.id],
        sectionTitle: section.title,
        answerType: item.answerType || item.answer_type || "FORMAT1",
      }))
    );

    await apiPost("/reports", {
      assignmentId: activeAssignment.id,
      items,
    });

    await deleteDraft(activeAssignment.id).catch(() => null);
    removeLocalDraft(activeAssignment.id);

    setMessage("Checklist completed.");
    setActiveAssignmentId(null);
    setForm({});
    setCurrentSectionIndex(0);
    await load();
  };

  const goToSection = (nextIndex: number) => {
    const boundedIndex = Math.min(Math.max(nextIndex, 0), activeSections.length - 1);
    setCurrentSectionIndex(boundedIndex);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  useEffect(() => {
    const flushDraft = () => {
      if (isRestoringDraft) return;

      const assignmentId = activeAssignmentIdRef.current;
      if (!assignmentId) return;

      persistDraft(assignmentId, latestFormRef.current, { immediateRemote: true });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushDraft();
      }
    };

    window.addEventListener("pagehide", flushDraft);
    window.addEventListener("beforeunload", flushDraft);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pagehide", flushDraft);
      window.removeEventListener("beforeunload", flushDraft);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isRestoringDraft]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const handleDownloadPdf = async (report: Report) => {
    const pdfPayload = mapReportToPdfPayload(report);
    await generateChecklistPdf(pdfPayload as any);
  };

  const getChecklistQuestionCount = (checklist: Checklist) =>
    checklist.sections.reduce((total, section) => total + section.items.length, 0);

  return (
    <DashboardShell user={user} onLogout={onLogout}>
      {message ? (
        <div style={{ ...styles.section, background: "#dbe9d2" }}>{message}</div>
      ) : null}

      {selectedReport ? (
        <ReportDetail
          report={selectedReport}
          onBack={() => setSelectedReport(null)}
          onDownloadPdf={handleDownloadPdf}
        />
      ) : !activeAssignment || !activeChecklist ? (
        <>
          <div style={styles.section}>
            <h3 style={styles.title}>My Assignments</h3>

            {assignments.filter((a) => a.status === "assigned").length === 0 ? (
              <div style={styles.small}>No active assignments.</div>
            ) : (
              <div style={styles.compactList}>
                {assignments
                  .filter((a) => a.status === "assigned")
                  .map((a) => {
                    const isExpanded = expandedAssignmentId === a.id;

                    return (
                      <div key={a.id} style={styles.compactRow}>
                        <button
                          type="button"
                          style={styles.compactRowHeader}
                          onClick={() =>
                            setExpandedAssignmentId(isExpanded ? null : a.id)
                          }
                        >
                          <span>
                            <span style={styles.compactRowTitle}>
                              {a.checklistTitle}
                            </span>
                            <span style={styles.compactRowMeta}>
                              Assigned By: {a.assignedByName}
                            </span>
                          </span>
                          <span style={styles.compactRowChevron}>
                            {isExpanded ? "-" : "+"}
                          </span>
                        </button>

                        {isExpanded ? (
                          <div style={styles.compactRowBody}>
                            <div style={styles.small}>
                              Status: {a.status} - Assigned at:{" "}
                              {new Date(a.assigned_at).toLocaleDateString()}
                            </div>
                            <div style={styles.compactActions}>
                              <button
                                style={styles.button}
                                onClick={() => openAssignment(a)}
                              >
                                Open Checklist
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

          <div style={styles.section}>
            <h3 style={styles.title}>Templates</h3>

            {checklists.length === 0 ? (
              <div style={styles.small}>No templates available.</div>
            ) : (
              <div style={styles.compactList}>
                {checklists.map((checklist) => {
                  const isExpanded = expandedChecklistId === checklist.id;
                  const questionCount = getChecklistQuestionCount(checklist);

                  return (
                    <div key={checklist.id} style={styles.compactRow}>
                      <button
                        type="button"
                        style={styles.compactRowHeader}
                        onClick={() =>
                          setExpandedChecklistId(isExpanded ? null : checklist.id)
                        }
                      >
                        <span>
                          <span style={styles.compactRowTitle}>
                            {checklist.title}
                          </span>
                          <span style={styles.compactRowMeta}>
                            {checklist.sections.length} section - {questionCount} questions
                          </span>
                        </span>
                        <span style={styles.compactRowChevron}>
                          {isExpanded ? "-" : "+"}
                        </span>
                      </button>

                      {isExpanded ? (
                        <div style={styles.compactRowBody}>
                          {(checklist.image_path || checklist.imagePath) ? (
                            <img
                              src={(checklist.image_path || checklist.imagePath || "").startsWith("http") ? (checklist.image_path || checklist.imagePath) : `${FILE_BASE}${checklist.image_path || checklist.imagePath}`}
                              alt={checklist.title}
                              style={{
                                width: "100%",
                                maxWidth: 180,
                                height: "auto",
                                objectFit: "contain",
                                borderRadius: 10,
                                border: "1px solid #d8c7aa",
                                marginBottom: 10,
                                display: "block",
                              }}
                            />
                          ) : null}

                          <div style={styles.small}>
                            Created: {new Date(checklist.created_at).toLocaleDateString()}
                          </div>

                          <div style={{ marginTop: 10 }}>
                            {checklist.sections.map((section) => (
                              <div key={section.id} style={{ marginBottom: 8 }}>
                                <strong>{section.title}</strong>
                                <div style={styles.small}>
                                  {section.items.length} questions
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={styles.section}>
            <h3 style={styles.title}>Completed Reports</h3>

            {reports.length === 0 ? (
              <div style={styles.small}>No reports yet.</div>
            ) : (
              <div style={styles.compactList}>
                {reports.map((r) => {
                  const isExpanded = expandedReportId === r.id;

                  return (
                    <div key={r.id} style={styles.compactRow}>
                      <button
                        type="button"
                        style={styles.compactRowHeader}
                        onClick={() => setExpandedReportId(isExpanded ? null : r.id)}
                      >
                        <span>
                          <span style={styles.compactRowTitle}>
                            {r.checklistTitle}
                          </span>
                          <span style={styles.compactRowMeta}>
                            Completed By: {r.completedByName}
                          </span>
                        </span>
                        <span style={styles.compactRowChevron}>
                          {isExpanded ? "-" : "+"}
                        </span>
                      </button>

                      {isExpanded ? (
                        <div style={styles.compactRowBody}>
                          <div style={styles.small}>
                            Status: {r.status} - Completed:{" "}
                            {new Date(r.completed_at).toLocaleDateString()}
                          </div>
                          <div style={styles.compactActions}>
                            <button
                              style={styles.secondaryButton}
                              onClick={() => setSelectedReport(r)}
                            >
                              View Report
                            </button>
                            <button
                              style={styles.button}
                              onClick={() => handleDownloadPdf(r)}
                            >
                              Download PDF
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
        </>
      ) : (
        <div style={styles.section}>
          {(activeChecklist.image_path || activeChecklist.imagePath) ? (
            <img
              src={(activeChecklist.image_path || activeChecklist.imagePath || "").startsWith("http") ? (activeChecklist.image_path || activeChecklist.imagePath) : `${FILE_BASE}${activeChecklist.image_path || activeChecklist.imagePath}`}
              alt={activeChecklist.title}
              style={{
                width: "25%",
                minWidth: 120,
                maxWidth: 220,
                height: "auto",
                objectFit: "contain",
                borderRadius: 10,
                border: "1px solid #d8c7aa",
                marginBottom: 14,
                display: "block",
              }}
            />
          ) : null}
          <h3 style={styles.title}>{activeChecklist.title}</h3>

          <div
            style={{
              ...styles.section,
              background: "#fbf6ea",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontWeight: 800, color: "#243b2d" }}>
                Section {currentSectionIndex + 1} of {activeSections.length}
              </div>
              <div style={styles.small}>
                {currentSection?.title || "No section selected"}
              </div>
            </div>

            <div style={{ width: "100%" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#5b513f",
                }}
              >
                <span>Progress</span>
                <span>
                  {answeredQuestionCount}/{totalQuestionCount} answered ({progressPercent}%)
                </span>
              </div>
              <div
                aria-label="Checklist progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
                role="progressbar"
                style={{
                  width: "100%",
                  height: 12,
                  borderRadius: 999,
                  background: "#e8deca",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${progressPercent}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: progressPercent === 100 ? "#16a34a" : "#2f6f4e",
                    transition: "width 0.2s ease",
                  }}
                />
              </div>
            </div>

            <div style={{ ...styles.row, marginTop: 0 }}>
              {activeSections.map((section, index) => (
                <button
                  key={section.id}
                  type="button"
                  aria-label={`Go to section ${index + 1}`}
                  title={section.title}
                  onClick={() => goToSection(index)}
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border:
                      index === currentSectionIndex
                        ? "1px solid #2f6f4e"
                        : "1px solid #d8c7aa",
                    background: index === currentSectionIndex ? "#2f6f4e" : "#fffaf0",
                    color: index === currentSectionIndex ? "#fff" : "#5b513f",
                    cursor: "pointer",
                    fontWeight: 800,
                  }}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>

          {currentSection ? (
            <div key={currentSection.id} style={styles.section}>
              <h3 style={{ marginTop: 0, color: "#2f6f4e" }}>
                {currentSectionIndex + 1}. {currentSection.title}
              </h3>

              {currentSection.items.map((item, index) => (
                <div key={item.id} style={{ ...styles.section, background: "#fffaf0" }}>
                  <strong>
                    {index + 1}. {item.question}
                  </strong>

                  {(item.answerType || item.answer_type || "FORMAT1") === "FORMAT1" ? (
                    <div style={{ ...styles.row, marginTop: 10 }}>
                      {(["YES", "NO", "N/A"] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          style={getAnswerButtonStyle(value, form[item.id]?.answer || "")}
                          onClick={() => updateAnswer(item.id, value)}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  {(item.answerType || item.answer_type) === "DATE" ? (
                    <div style={{ marginTop: 10 }}>
                      <input
                        type="date"
                        style={styles.input}
                        value={form[item.id]?.answer || ""}
                        onChange={(e) => updateAnswer(item.id, e.target.value)}
                      />
                    </div>
                  ) : null}

                  {(item.answerType || item.answer_type) === "TEXT" ? (
                    <div style={{ marginTop: 10 }}>
                      <textarea
                        style={{ ...styles.input, minHeight: 90 }}
                        placeholder="Answer"
                        value={form[item.id]?.answer || ""}
                        onChange={(e) => updateAnswer(item.id, e.target.value)}
                      />
                    </div>
                  ) : null}

                  {(item.answerType || item.answer_type) === "MULTIPLE_CHOICE" ? (
                    <div style={{ marginTop: 10 }}>
                      <select
                        style={styles.input}
                        value={form[item.id]?.answer || ""}
                        onChange={(e) => updateAnswer(item.id, e.target.value)}
                      >
                        <option value="">Select option</option>
                        {(item.options || []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  {(item.answerType || item.answer_type) === "RADIO_BUTTON" ? (
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      {(item.options || []).map((option) => {
                        const selectedAnswers = (form[item.id]?.answer || "")
                          .split(",")
                          .map((value) => value.trim())
                          .filter(Boolean);
                        const isChecked = selectedAnswers.includes(option);

                        return (
                        <label
                          key={option}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "10px 12px",
                            border: "1px solid #d8c7aa",
                            borderRadius: 10,
                            background:
                              isChecked ? "#dbe9d2" : "#fffaf0",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          <input
                            type="checkbox"
                            name={`question-${item.id}`}
                            value={option}
                            checked={isChecked}
                            onChange={() => toggleMultiAnswer(item.id, option)}
                          />
                          <span>{option}</span>
                        </label>
                        );
                      })}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 10 }}>
                    <textarea
                      style={{ ...styles.input, minHeight: 80 }}
                      placeholder="Comment"
                      value={form[item.id]?.comment || ""}
                      onChange={(e) =>
                        setForm((prev) => {
                          const nextForm = {
                            ...prev,
                            [item.id]: {
                              ...prev[item.id],
                              comment: e.target.value,
                            },
                          };

                          if (activeAssignmentIdRef.current) {
                            persistDraft(activeAssignmentIdRef.current, nextForm);
                          }

                          return nextForm;
                        })
                      }
                    />
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                      Add Photos
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleAddPhotos(item.id, e.target.files)}
                    />
                    {uploadingItemId === item.id ? (
                      <div style={{ marginTop: 8, color: "#2f6f4e", fontSize: 13 }}>
                        Uploading photos...
                      </div>
                    ) : null}
                  </div>

                  {form[item.id]?.photos?.length > 0 && (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                        gap: 12,
                        marginTop: 12,
                      }}
                    >
                      {form[item.id].photos.map((photo, idx) => {
                        const src = photo.startsWith("http")
                          ? photo
                          : `${FILE_BASE}${photo}`;

                        return (
                          <div
                            key={idx}
                            style={{
                              border: "1px solid #d8c7aa",
                              borderRadius: 12,
                              padding: 10,
                              background: "#fbf6ea",
                            }}
                          >
                            <img
                              src={src}
                              alt={`uploaded-${idx}`}
                              style={{
                                width: "100%",
                                height: 110,
                                objectFit: "cover",
                                borderRadius: 10,
                                display: "block",
                              }}
                            />
                            <button
                              type="button"
                              style={{
                                background: "#dc2626",
                                color: "#fff",
                                border: "none",
                                padding: "6px 10px",
                                borderRadius: 8,
                                cursor: "pointer",
                                marginTop: 8,
                                fontSize: 12,
                              }}
                              onClick={() => removePhoto(item.id, idx)}
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          <div style={styles.row}>
            <button
              style={styles.secondaryButton}
              onClick={() => {
                setActiveAssignmentId(null);
                setCurrentSectionIndex(0);
                setMessage("Checklist draft saved.");
              }}
            >
              Cancel
            </button>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => goToSection(currentSectionIndex - 1)}
              disabled={isFirstSection}
            >
              Previous Section
            </button>

            {isLastSection ? (
              <button style={styles.button} onClick={submit}>
                Complete Checklist
              </button>
            ) : (
              <button
                type="button"
                style={styles.button}
                onClick={() => goToSection(currentSectionIndex + 1)}
              >
                Next Section
              </button>
            )}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}
