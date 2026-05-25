import React, { useEffect, useState } from "react";
import { FILE_BASE, uploadPhotos } from "../services/api";
import { createWalkThrough, getWalkThroughs } from "../services/walkthroughService";
import { styles } from "../styles/appStyles";
import { WalkThroughItem, WalkThroughReport } from "../types";

type DraftEntry = WalkThroughItem & {
  localId: string;
};

function createCommentEntry(): DraftEntry {
  return {
    localId: crypto.randomUUID(),
    rowType: "comment",
    comment: "",
    photos: [],
  };
}

function createSectionEntry(): DraftEntry {
  return {
    localId: crypto.randomUUID(),
    rowType: "section",
    sectionTitle: "",
    photos: [],
  };
}

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString("tr-TR");
  } catch {
    return value;
  }
}

export default function WalkThroughPage() {
  const [title, setTitle] = useState("On the Go Inspection");
  const [entries, setEntries] = useState<DraftEntry[]>([createSectionEntry(), createCommentEntry()]);
  const [reports, setReports] = useState<WalkThroughReport[]>([]);
  const [expandedReportId, setExpandedReportId] = useState<number | null>(null);
  const [uploadingEntryId, setUploadingEntryId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    const data = await getWalkThroughs();
    setReports(data);
  };

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Walk-Through could not be loaded"));
  }, []);

  const updateEntry = (localId: string, patch: Partial<DraftEntry>) => {
    setEntries((prev) =>
      prev.map((entry) => (entry.localId === localId ? { ...entry, ...patch } : entry))
    );
  };

  const removeEntry = (localId: string) => {
    setEntries((prev) => prev.filter((entry) => entry.localId !== localId));
  };

  const insertEntryAfter = (index: number, entry: DraftEntry) => {
    setEntries((prev) => [
      ...prev.slice(0, index + 1),
      entry,
      ...prev.slice(index + 1),
    ]);
  };

  const addPhotos = async (localId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    try {
      setUploadingEntryId(localId);
      const uploaded = await uploadPhotos(files);
      setEntries((prev) =>
        prev.map((entry) =>
          entry.localId === localId
            ? { ...entry, photos: [...(entry.photos || []), ...uploaded] }
            : entry
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed");
    } finally {
      setUploadingEntryId(null);
    }
  };

  const removePhoto = (localId: string, photoIndex: number) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.localId === localId
          ? {
              ...entry,
              photos: entry.photos.filter((_, index) => index !== photoIndex),
            }
          : entry
      )
    );
  };

  const submit = async () => {
    setMessage("");
    setError("");

    const validEntries = entries
      .map((entry) => ({
        rowType: entry.rowType,
        sectionTitle: (entry.sectionTitle || "").trim(),
        comment: (entry.comment || "").trim(),
        photos: entry.photos || [],
      }))
      .filter((entry) =>
        entry.rowType === "section" ? entry.sectionTitle : entry.comment
      ) as WalkThroughItem[];

    if (!title.trim() || validEntries.length === 0) {
      setError("Title and at least one section or comment are required.");
      return;
    }

    try {
      await createWalkThrough(title.trim(), validEntries);
      setTitle("On the Go Inspection");
      setEntries([createSectionEntry(), createCommentEntry()]);
      setMessage("Walk-Through saved.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Walk-Through could not be saved");
    }
  };

  return (
    <>
      {message ? (
        <div style={{ ...styles.section, background: "#dbe9d2", color: "#243b2d" }}>
          {message}
        </div>
      ) : null}

      {error ? (
        <div style={{ ...styles.section, background: "#fef2f2", color: "#991b1b" }}>
          {error}
        </div>
      ) : null}

      <div style={styles.section}>
        <h3 style={styles.title}>Walk-Through</h3>

        <input
          style={{ ...styles.input, marginBottom: 12 }}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Walk-Through title"
        />

        <div style={{ display: "grid", gap: 12 }}>
          {entries.map((entry, index) => (
            <div key={entry.localId} style={{ ...styles.section, background: "#fffaf0", marginTop: 0 }}>
              {entry.rowType === "section" ? (
                <input
                  style={styles.input}
                  value={entry.sectionTitle || ""}
                  onChange={(event) =>
                    updateEntry(entry.localId, { sectionTitle: event.target.value })
                  }
                  placeholder="Section title"
                />
              ) : (
                <>
                  <label style={{ display: "block", marginBottom: 6, fontWeight: 700 }}>
                    Comment {entries.slice(0, index + 1).filter((item) => item.rowType === "comment").length}
                  </label>
                  <textarea
                    style={{ ...styles.input, minHeight: 96 }}
                    value={entry.comment || ""}
                    onChange={(event) =>
                      updateEntry(entry.localId, { comment: event.target.value })
                    }
                    placeholder="Comment"
                  />

                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: "block", marginBottom: 6, fontWeight: 600 }}>
                      Add Photos
                    </label>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(event) => addPhotos(entry.localId, event.target.files)}
                    />
                    {uploadingEntryId === entry.localId ? (
                      <div style={{ marginTop: 8, color: "#2f6f4e", fontSize: 13 }}>
                        Uploading photos...
                      </div>
                    ) : null}
                  </div>

                  {entry.photos.length > 0 ? (
                    <div style={styles.photoGrid}>
                      {entry.photos.map((photo, photoIndex) => {
                        const src = photo.startsWith("http") ? photo : `${FILE_BASE}${photo}`;

                        return (
                          <div key={photo} style={styles.photoCard}>
                            <img
                              src={src}
                              alt={`walk-through-${photoIndex}`}
                              style={styles.photoPreview}
                            />
                            <button
                              type="button"
                              style={styles.removeButton}
                              onClick={() => removePhoto(entry.localId, photoIndex)}
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </>
              )}

              <div style={{ ...styles.row, marginTop: 12, justifyContent: "space-between" }}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => removeEntry(entry.localId)}
                  disabled={entries.length === 1}
                >
                  Remove
                </button>
                <div style={styles.row}>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={() => insertEntryAfter(index, createSectionEntry())}
                  >
                    + Section
                  </button>
                  <button
                    type="button"
                    style={styles.secondaryButton}
                    onClick={() => insertEntryAfter(index, createCommentEntry())}
                  >
                    + Comment
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div style={styles.bottomActions}>
          <button type="button" style={styles.button} onClick={submit}>
            Save Walk-Through
          </button>
        </div>
      </div>

      <div style={styles.section}>
        <h3 style={styles.title}>Walk-Through Reports</h3>

        {reports.length === 0 ? (
          <div style={styles.small}>No Walk-Through reports yet.</div>
        ) : (
          <div style={styles.compactList}>
            {reports.map((report) => {
              const isExpanded = expandedReportId === report.id;

              return (
                <div key={report.id} style={styles.compactRow}>
                  <button
                    type="button"
                    style={styles.compactRowHeader}
                    onClick={() => setExpandedReportId(isExpanded ? null : report.id)}
                  >
                    <span>
                      <span style={styles.compactRowTitle}>{report.title}</span>
                      <span style={styles.compactRowMeta}>
                        Created By: {report.createdByName} - {formatDate(report.createdAt)}
                      </span>
                    </span>
                    <span style={styles.compactRowChevron}>{isExpanded ? "-" : "+"}</span>
                  </button>

                  {isExpanded ? (
                    <div style={styles.compactRowBody}>
                      {report.items.map((item, index) =>
                        item.rowType === "section" ? (
                          <h4 key={item.id || index} style={{ margin: "8px 0", color: "#2f6f4e" }}>
                            {item.sectionTitle}
                          </h4>
                        ) : (
                          <div
                            key={item.id || index}
                            style={{ ...styles.section, background: "#fffaf0" }}
                          >
                            <div style={{ whiteSpace: "pre-wrap" }}>{item.comment}</div>
                            {item.photos.length > 0 ? (
                              <div style={styles.photoGrid}>
                                {item.photos.map((photo, photoIndex) => {
                                  const src = photo.startsWith("http") ? photo : `${FILE_BASE}${photo}`;

                                  return (
                                    <img
                                      key={`${photo}-${photoIndex}`}
                                      src={src}
                                      alt={`walk-through-report-${photoIndex}`}
                                      style={styles.photoPreview}
                                    />
                                  );
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
