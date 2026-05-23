import React, { useEffect, useState } from "react";
import { AnswerType, User } from "../types";
import { uploadPhotos } from "../services/api";
import { submitWalkthroughReport } from "../services/reportService";
import { styles } from "../styles/appStyles";

type QuestionForm = {
  question: string;
  answerType: AnswerType;
  options: string[];
  answer: string;
  comment: string;
  photos: string[];
};

type SectionForm = {
  title: string;
  items: QuestionForm[];
};

type Props = {
  user: User;
  onSubmitted: () => Promise<void>;
};

const ANSWER_TYPE_LABELS: Record<AnswerType, string> = {
  FORMAT1: "Yes / No / N/A",
  DATE: "Date",
  TEXT: "Text",
  MULTIPLE_CHOICE: "Dropdown",
  RADIO_BUTTON: "Check Box",
};

function createEmptyQuestion(): QuestionForm {
  return {
    question: "",
    answerType: "FORMAT1",
    options: [""],
    answer: "",
    comment: "",
    photos: [],
  };
}

function createInitialSections(): SectionForm[] {
  return [
    {
      title: "",
      items: [createEmptyQuestion()],
    },
  ];
}

function answerButtonStyle(option: "YES" | "NO" | "N/A", selected: string) {
  const isSelected = selected === option;
  const selectedColor =
    option === "YES" ? "#16a34a" : option === "NO" ? "#b91c1c" : "#3f6f58";

  return {
    ...styles.secondaryButton,
    background: isSelected ? selectedColor : "#fffdf8",
    color: isSelected ? "#fff" : "#2f2a24",
    border: `1px solid ${isSelected ? selectedColor : "#d6c7b4"}`,
    minWidth: 64,
  };
}

export default function WalkThroughPanel({ user, onSubmitted }: Props) {
  const draftKey = `mod_walkthrough_draft_${user.id}`;
  const [title, setTitle] = useState("");
  const [sections, setSections] = useState<SectionForm[]>(createInitialSections);
  const [message, setMessage] = useState("");
  const [uploadingKey, setUploadingKey] = useState("");

  useEffect(() => {
    const raw = localStorage.getItem(draftKey);
    if (!raw) return;

    try {
      const draft = JSON.parse(raw) as { title?: string; sections?: SectionForm[] };
      setTitle(draft.title || "");
      setSections(draft.sections?.length ? draft.sections : createInitialSections());
    } catch {
      localStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  const saveDraft = () => {
    localStorage.setItem(draftKey, JSON.stringify({ title, sections }));
    setMessage("Walk-through draft saved.");
  };

  const clearDraft = () => {
    localStorage.removeItem(draftKey);
    setTitle("");
    setSections(createInitialSections());
    setMessage("");
  };

  const updateSectionTitle = (sectionIndex: number, value: string) => {
    setSections((prev) =>
      prev.map((section, index) =>
        index === sectionIndex ? { ...section, title: value } : section
      )
    );
  };

  const addSection = () => {
    setSections((prev) => [...prev, { title: "", items: [createEmptyQuestion()] }]);
  };

  const addQuestion = (sectionIndex: number) => {
    setSections((prev) =>
      prev.map((section, index) =>
        index === sectionIndex
          ? { ...section, items: [...section.items, createEmptyQuestion()] }
          : section
      )
    );
  };

  const updateQuestion = (
    sectionIndex: number,
    questionIndex: number,
    value: Partial<QuestionForm>
  ) => {
    setSections((prev) =>
      prev.map((section, sIndex) =>
        sIndex === sectionIndex
          ? {
              ...section,
              items: section.items.map((item, qIndex) =>
                qIndex === questionIndex ? { ...item, ...value } : item
              ),
            }
          : section
      )
    );
  };

  const removeQuestion = (sectionIndex: number, questionIndex: number) => {
    setSections((prev) =>
      prev.map((section, index) =>
        index === sectionIndex
          ? {
              ...section,
              items:
                section.items.length === 1
                  ? section.items
                  : section.items.filter((_, itemIndex) => itemIndex !== questionIndex),
            }
          : section
      )
    );
  };

  const updateOption = (
    sectionIndex: number,
    questionIndex: number,
    optionIndex: number,
    value: string
  ) => {
    const item = sections[sectionIndex]?.items[questionIndex];
    if (!item) return;

    updateQuestion(sectionIndex, questionIndex, {
      options: item.options.map((option, index) => (index === optionIndex ? value : option)),
    });
  };

  const addOption = (sectionIndex: number, questionIndex: number) => {
    const item = sections[sectionIndex]?.items[questionIndex];
    if (!item) return;

    updateQuestion(sectionIndex, questionIndex, {
      options: [...item.options, ""],
    });
  };

  const toggleMultiAnswer = (sectionIndex: number, questionIndex: number, option: string) => {
    const item = sections[sectionIndex]?.items[questionIndex];
    if (!item) return;

    const currentAnswers = item.answer
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const nextAnswers = currentAnswers.includes(option)
      ? currentAnswers.filter((value) => value !== option)
      : [...currentAnswers, option];

    updateQuestion(sectionIndex, questionIndex, { answer: nextAnswers.join(", ") });
  };

  const addPhotos = async (
    sectionIndex: number,
    questionIndex: number,
    files: FileList | null
  ) => {
    if (!files || files.length === 0) return;

    const key = `${sectionIndex}-${questionIndex}`;
    setUploadingKey(key);

    try {
      const uploaded = await uploadPhotos(files);
      const item = sections[sectionIndex]?.items[questionIndex];
      if (!item) return;

      updateQuestion(sectionIndex, questionIndex, {
        photos: [...item.photos, ...uploaded],
      });
    } finally {
      setUploadingKey("");
    }
  };

  const submit = async () => {
    setMessage("");

    const cleanSections = sections
      .map((section) => ({
        title: section.title.trim(),
        items: section.items
          .map((item) => ({
            question: item.question.trim(),
            answerType: item.answerType,
            options: ["MULTIPLE_CHOICE", "RADIO_BUTTON"].includes(item.answerType)
              ? item.options.map((option) => option.trim()).filter(Boolean)
              : [],
            answer: item.answer.trim(),
            comment: item.comment.trim(),
            photos: item.photos,
          }))
          .filter((item) => item.question),
      }))
      .filter((section) => section.title && section.items.length > 0);

    if (!title.trim() || cleanSections.length === 0) {
      setMessage("Title and at least one section with questions are required.");
      return;
    }

    await submitWalkthroughReport({ title: title.trim(), sections: cleanSections });
    localStorage.removeItem(draftKey);
    setTitle("");
    setSections(createInitialSections());
    setMessage("Walk-through submitted as a completed report.");
    await onSubmitted();
  };

  return (
    <div style={styles.section}>
      <h3 style={styles.title}>Walk-Through</h3>
      {message ? <div style={{ ...styles.section, background: "#e7f0e5" }}>{message}</div> : null}

      <input
        style={{ ...styles.input, marginBottom: 12 }}
        placeholder="Walk-through title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex} style={{ ...styles.section, background: "#fbf6ec" }}>
          <input
            style={{ ...styles.input, marginBottom: 10 }}
            placeholder={`Section ${sectionIndex + 1} title`}
            value={section.title}
            onChange={(e) => updateSectionTitle(sectionIndex, e.target.value)}
          />

          {section.items.map((item, questionIndex) => (
            <div key={questionIndex} style={{ ...styles.section, background: "#fffaf2" }}>
              <input
                style={{ ...styles.input, marginBottom: 8 }}
                placeholder={`Question ${questionIndex + 1}`}
                value={item.question}
                onChange={(e) =>
                  updateQuestion(sectionIndex, questionIndex, { question: e.target.value })
                }
              />

              <select
                style={{ ...styles.input, marginBottom: 8 }}
                value={item.answerType}
                onChange={(e) =>
                  updateQuestion(sectionIndex, questionIndex, {
                    answerType: e.target.value as AnswerType,
                    answer: "",
                    options: ["MULTIPLE_CHOICE", "RADIO_BUTTON"].includes(e.target.value)
                      ? item.options.length
                        ? item.options
                        : [""]
                      : [""],
                  })
                }
              >
                {(Object.keys(ANSWER_TYPE_LABELS) as AnswerType[]).map((type) => (
                  <option key={type} value={type}>
                    {ANSWER_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>

              {item.answerType === "FORMAT1" ? (
                <div style={{ ...styles.row, marginBottom: 8 }}>
                  {(["YES", "NO", "N/A"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      style={answerButtonStyle(option, item.answer)}
                      onClick={() => updateQuestion(sectionIndex, questionIndex, { answer: option })}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}

              {item.answerType === "DATE" ? (
                <input
                  type="date"
                  style={{ ...styles.input, marginBottom: 8 }}
                  value={item.answer}
                  onChange={(e) =>
                    updateQuestion(sectionIndex, questionIndex, { answer: e.target.value })
                  }
                />
              ) : null}

              {item.answerType === "TEXT" ? (
                <textarea
                  style={{ ...styles.input, minHeight: 80, marginBottom: 8 }}
                  placeholder="Answer"
                  value={item.answer}
                  onChange={(e) =>
                    updateQuestion(sectionIndex, questionIndex, { answer: e.target.value })
                  }
                />
              ) : null}

              {item.answerType === "MULTIPLE_CHOICE" ? (
                <>
                  <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
                    {item.options.map((option, optionIndex) => (
                      <input
                        key={optionIndex}
                        style={styles.input}
                        placeholder={`Option ${optionIndex + 1}`}
                        value={option}
                        onChange={(e) =>
                          updateOption(sectionIndex, questionIndex, optionIndex, e.target.value)
                        }
                      />
                    ))}
                  </div>
                  <select
                    style={{ ...styles.input, marginBottom: 8 }}
                    value={item.answer}
                    onChange={(e) =>
                      updateQuestion(sectionIndex, questionIndex, { answer: e.target.value })
                    }
                  >
                    <option value="">Select answer</option>
                    {item.options.filter(Boolean).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}

              {item.answerType === "RADIO_BUTTON" ? (
                <div style={{ display: "grid", gap: 8, marginBottom: 8 }}>
                  {item.options.map((option, optionIndex) => (
                    <input
                      key={optionIndex}
                      style={styles.input}
                      placeholder={`Option ${optionIndex + 1}`}
                      value={option}
                      onChange={(e) =>
                        updateOption(sectionIndex, questionIndex, optionIndex, e.target.value)
                      }
                    />
                  ))}
                  <div style={{ ...styles.row, gap: 8 }}>
                    {item.options.filter(Boolean).map((option) => {
                      const checked = item.answer
                        .split(",")
                        .map((value) => value.trim())
                        .includes(option);

                      return (
                        <label key={option} style={{ ...styles.secondaryButton }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              toggleMultiAnswer(sectionIndex, questionIndex, option)
                            }
                          />{" "}
                          {option}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {["MULTIPLE_CHOICE", "RADIO_BUTTON"].includes(item.answerType) ? (
                <button
                  type="button"
                  style={{ ...styles.secondaryButton, marginBottom: 8 }}
                  onClick={() => addOption(sectionIndex, questionIndex)}
                >
                  Add Option
                </button>
              ) : null}

              <textarea
                style={{ ...styles.input, minHeight: 72, marginBottom: 8 }}
                placeholder="Comment"
                value={item.comment}
                onChange={(e) =>
                  updateQuestion(sectionIndex, questionIndex, { comment: e.target.value })
                }
              />

              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => addPhotos(sectionIndex, questionIndex, e.target.files)}
              />
              {uploadingKey === `${sectionIndex}-${questionIndex}` ? (
                <div style={{ ...styles.small, marginTop: 6 }}>Uploading photos...</div>
              ) : null}
              {item.photos.length > 0 ? (
                <div style={{ ...styles.small, marginTop: 6 }}>
                  {item.photos.length} photo(s) attached
                </div>
              ) : null}

              <div style={{ ...styles.row, marginTop: 10 }}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => addQuestion(sectionIndex)}
                >
                  Add Question
                </button>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => removeQuestion(sectionIndex, questionIndex)}
                >
                  Remove Question
                </button>
              </div>
            </div>
          ))}

          <button type="button" style={styles.secondaryButton} onClick={addSection}>
            Add Section
          </button>
        </div>
      ))}

      <div style={{ ...styles.row, marginTop: 12 }}>
        <button type="button" style={styles.secondaryButton} onClick={clearDraft}>
          Clear
        </button>
        <button type="button" style={styles.secondaryButton} onClick={saveDraft}>
          Save Draft
        </button>
        <button type="button" style={styles.button} onClick={submit}>
          Submit Walk-Through
        </button>
      </div>
    </div>
  );
}
