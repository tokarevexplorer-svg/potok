"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  ExternalLink,
  Folder,
  FolderPlus,
  Home,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import {
  type ArtifactEntry,
  listArtifacts,
  signedUrlForArtifact,
} from "@/lib/team/teamArtifactsService";
import {
  createArtifactFolder,
  deleteArtifact,
  deleteArtifactFolder,
  uploadFile,
} from "@/lib/team/teamBackendClient";
import ConfirmDialog from "@/components/blog/analyst/ConfirmDialog";
import ArtifactViewerModal from "./ArtifactViewerModal";

interface ArtifactBrowserProps {
  // Корневой префикс bucket'а («research», «texts», «ideas», «sources»).
  // Дальше пользователь может уходить вглубь подпапок.
  rootPrefix: string;
  // Можно ли создавать/удалять подпапки. Для texts/research/ideas — да,
  // для sources — да тоже (их режут по темам). Включено везде, оставлено как
  // прокс для возможного отключения в будущем.
  supportsFolders?: boolean;
  // Загрузка файлов с диска (только sources/ — там лежат PDF и материалы).
  supportsUpload?: boolean;
}

// Браузер папки в team-database. Хлебные крошки сверху, ниже — список
// записей (папки + файлы). Кнопки: создать папку, загрузить файл (если
// supportsUpload), обновить.
//
// При клике на папку — заходим внутрь (state.path меняется, ниже идёт новый
// listArtifacts). При клике на файл — открываем ArtifactViewerModal.
export default function ArtifactBrowser({
  rootPrefix,
  supportsFolders,
  supportsUpload,
}: ArtifactBrowserProps) {
  const [path, setPath] = useState<string>(rootPrefix);
  const [entries, setEntries] = useState<ArtifactEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewer, setViewer] = useState<ArtifactEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ArtifactEntry | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState<string | null>(null);
  const [folderBusy, setFolderBusy] = useState(false);

  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await listArtifacts(path);
      // Сначала папки, потом файлы. Внутри — по имени.
      items.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name, "ru");
      });
      setEntries(items);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Хлебные крошки: «research / 2026-петербург / архивы»
  const segments = path.split("/").filter(Boolean);
  const rootDepth = rootPrefix.split("/").filter(Boolean).length;

  function goUp() {
    const upPath = segments.slice(0, segments.length - 1).join("/");
    setPath(upPath || rootPrefix);
  }

  function goToSegment(index: number) {
    setPath(segments.slice(0, index + 1).join("/"));
  }

  async function handleCreateFolder() {
    const trimmed = folderName.trim();
    if (!trimmed) {
      setFolderError("Введи имя папки");
      return;
    }
    if (/[/\\]/.test(trimmed)) {
      setFolderError("В имени не должно быть слэшей");
      return;
    }
    setFolderBusy(true);
    setFolderError(null);
    try {
      await createArtifactFolder(`${path}/${trimmed}`);
      setCreatingFolder(false);
      setFolderName("");
      await reload();
    } catch (err) {
      setFolderError(err instanceof Error ? err.message : String(err));
    } finally {
      setFolderBusy(false);
    }
  }

  async function handleUpload(file: File) {
    setUploadBusy(true);
    setUploadError(null);
    try {
      // Прибавляем слэш в конец, чтобы бэкенд знал, что это префикс-папка.
      await uploadFile(file, `${path}/`);
      await reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploadBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusyDelete(true);
    try {
      if (pendingDelete.isFolder) {
        await deleteArtifactFolder(pendingDelete.path);
      } else {
        await deleteArtifact(pendingDelete.path);
      }
      setPendingDelete(null);
      await reload();
    } catch (err) {
      // Ошибка показывается через alert — модалка останется открытой только
      // если выбрать «Отмена». Это упрощает поток (ошибочные удаления редки).
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyDelete(false);
    }
  }

  async function handleEntryClick(entry: ArtifactEntry) {
    if (entry.isFolder) {
      setPath(entry.path);
      return;
    }
    // Markdown / json / txt — в модалку. PDF — в новую вкладку через signed URL.
    const lower = entry.name.toLowerCase();
    if (lower.endsWith(".pdf") || lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png")) {
      try {
        const url = await signedUrlForArtifact(entry.path);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
      return;
    }
    setViewer(entry);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Хлебные крошки + действия */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Breadcrumbs
          segments={segments}
          rootDepth={rootDepth}
          onGoToSegment={goToSegment}
          onGoToRoot={() => setPath(rootPrefix)}
          onGoUp={segments.length > rootDepth ? goUp : undefined}
        />
        <div className="flex items-center gap-2">
          {supportsFolders && !creatingFolder && (
            <button
              type="button"
              onClick={() => {
                setCreatingFolder(true);
                setFolderName("");
                setFolderError(null);
              }}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
            >
              <FolderPlus size={14} /> Папка
            </button>
          )}
          {supportsUpload && (
            <label
              className={`focus-ring inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink ${
                uploadBusy ? "pointer-events-none opacity-50" : ""
              }`}
            >
              {uploadBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Загрузить файл
              <input
                type="file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                  e.target.value = ""; // сброс, чтобы повторно выбрать тот же
                }}
              />
            </label>
          )}
          <button
            type="button"
            onClick={() => void reload()}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
            title="Обновить"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {creatingFolder && (
        <div className="rounded-xl border border-line bg-elevated p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              autoFocus
              type="text"
              value={folderName}
              placeholder="Название папки"
              onChange={(e) => setFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleCreateFolder();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setCreatingFolder(false);
                }
              }}
              className="focus-ring min-w-[240px] flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink"
            />
            <button
              type="button"
              onClick={() => void handleCreateFolder()}
              disabled={folderBusy}
              className="focus-ring inline-flex h-9 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:opacity-50"
            >
              {folderBusy ? <Loader2 size={14} className="animate-spin" /> : "Создать"}
            </button>
            <button
              type="button"
              onClick={() => setCreatingFolder(false)}
              className="focus-ring inline-flex h-9 items-center rounded-lg border border-line bg-surface px-3 text-sm text-ink-muted transition hover:text-ink"
            >
              Отмена
            </button>
          </div>
          {folderError && <p className="mt-2 text-xs text-rose-700">{folderError}</p>}
        </div>
      )}

      {uploadError && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">{uploadError}</p>
      )}

      {/* Список */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-12 text-sm text-ink-muted">
          <Loader2 size={16} className="animate-spin" /> Грузим…
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-10 text-center">
          <p className="text-sm text-ink-muted">Папка пустая.</p>
          <p className="mt-1 text-xs text-ink-faint">
            Артефакты сюда попадают автоматически после задач команды.
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
          {entries.map((entry) => (
            <li
              key={entry.path}
              className="group flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 hover:bg-elevated/60"
            >
              <button
                type="button"
                onClick={() => void handleEntryClick(entry)}
                className="focus-ring flex flex-1 items-center gap-3 text-left"
              >
                {entry.isFolder ? (
                  <Folder size={18} className="flex-shrink-0 text-accent" />
                ) : (
                  <span className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center text-sm">
                    {fileIcon(entry.name)}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{entry.name}</p>
                  <p className="text-xs text-ink-faint">
                    {entry.isFolder ? "Папка" : describeFile(entry)}
                  </p>
                </div>
                {entry.isFolder ? (
                  <ChevronRight size={16} className="flex-shrink-0 text-ink-faint" />
                ) : (
                  <ExternalLink
                    size={14}
                    className="flex-shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100"
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => setPendingDelete(entry)}
                className="focus-ring inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-ink-faint opacity-0 transition hover:bg-rose-50 hover:text-rose-700 group-hover:opacity-100"
                title={entry.isFolder ? "Удалить папку" : "Удалить файл"}
                aria-label="Удалить"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {viewer && (
        <ArtifactViewerModal
          path={viewer.path}
          name={viewer.name}
          onClose={() => setViewer(null)}
          onChanged={() => void reload()}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          open
          title={pendingDelete.isFolder ? "Удалить папку?" : "Удалить файл?"}
          description={
            pendingDelete.isFolder
              ? `«${pendingDelete.name}» — папку можно удалить, только если она пустая.`
              : `«${pendingDelete.name}» — файл будет удалён без возможности восстановления.`
          }
          confirmLabel="Удалить"
          tone="danger"
          busy={busyDelete}
          busyLabel="Удаляю…"
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

// ---------- helpers / sub-components ----------

function Breadcrumbs({
  segments,
  rootDepth,
  onGoToSegment,
  onGoToRoot,
  onGoUp,
}: {
  segments: string[];
  rootDepth: number;
  onGoToSegment: (index: number) => void;
  onGoToRoot: () => void;
  onGoUp?: () => void;
}) {
  const trail = segments.map((seg, idx) => ({ seg, idx }));
  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
      <button
        type="button"
        onClick={onGoToRoot}
        className="focus-ring inline-flex items-center gap-1 rounded-md px-2 py-1 transition hover:bg-elevated hover:text-ink"
        title="К корню раздела"
      >
        <Home size={14} />
        {trail[0]?.seg ?? "—"}
      </button>
      {trail.slice(1).map(({ seg, idx }) => (
        <span key={`${seg}-${idx}`} className="inline-flex items-center gap-1">
          <ChevronRight size={12} className="text-ink-faint" />
          <button
            type="button"
            onClick={() => onGoToSegment(idx)}
            className="focus-ring rounded-md px-2 py-1 transition hover:bg-elevated hover:text-ink"
          >
            {seg}
          </button>
        </span>
      ))}
      {onGoUp && trail.length > rootDepth && (
        <button
          type="button"
          onClick={onGoUp}
          className="focus-ring ml-2 rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
        >
          ↑ выше
        </button>
      )}
    </nav>
  );
}

function fileIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "📝";
  if (lower.endsWith(".json")) return "🧾";
  if (lower.endsWith(".pdf")) return "📕";
  if (lower.endsWith(".txt")) return "📄";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png") || lower.endsWith(".webp")) {
    return "🖼️";
  }
  return "📎";
}

function describeFile(entry: ArtifactEntry): string {
  const parts: string[] = [];
  if (entry.size != null) parts.push(formatSize(entry.size));
  if (entry.updatedAt) {
    const d = new Date(entry.updatedAt);
    parts.push(d.toLocaleString("ru", { dateStyle: "short", timeStyle: "short" }));
  }
  return parts.join(" · ") || "файл";
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
