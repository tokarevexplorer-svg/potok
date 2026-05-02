// Сервис Google Drive: постоянное хранилище превью.
//
// Зачем: Instagram CDN отдаёт превью с подписью, которая протухает за ~24 часа,
// и блокирует чужой Referer. Решение — после парсинга скачиваем картинку и
// перезаливаем на Google Drive, в публичную папку. Запоминаем fileId, чтобы
// при удалении видео могли удалить и сам файл.
//
// Авторизация: Service Account. Поддерживаем два способа отдать credentials,
// чтобы локально и на Railway не плодить разные ветки кода:
//   1. GOOGLE_DRIVE_CREDENTIALS_JSON — содержимое JSON-ключа в виде строки
//      (Railway не позволяет загружать файлы — переменная единственный путь).
//   2. GOOGLE_DRIVE_CREDENTIALS_PATH — путь к JSON-файлу (для локальной разработки).
//
// Если ни одна переменная не задана — сервис «выключен»: isEnabled() возвращает
// false, остальные функции бросают понятную ошибку. videoProcessor проверяет
// флаг и в этом случае оставляет оригинальный Instagram-URL — приложение
// продолжает работать как раньше, просто превью продолжают протухать.

import { readFileSync } from "node:fs";
import { Readable } from "node:stream";
import { google } from "googleapis";
import { env } from "../config/env.js";

const SCOPES = ["https://www.googleapis.com/auth/drive.file"];

let driveClient = null;
let initError = null;
let initialized = false;

// Ленивая инициализация: пока никто не вызвал — не лезем в credentials.
// Это нужно, чтобы бэкенд стартовал даже если Google Drive не настроен
// (тогда uploadThumbnail просто не будет вызываться — см. videoProcessor).
function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  if (!env.googleDriveFolderId) {
    initError = "GOOGLE_DRIVE_FOLDER_ID не задан — сервис превью отключён.";
    return;
  }

  let credentials;
  try {
    credentials = loadCredentials();
  } catch (err) {
    initError = `Не удалось прочитать credentials: ${err.message}`;
    return;
  }
  if (!credentials) {
    initError =
      "Ни GOOGLE_DRIVE_CREDENTIALS_JSON, ни GOOGLE_DRIVE_CREDENTIALS_PATH не заданы — сервис превью отключён.";
    return;
  }

  try {
    const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
    driveClient = google.drive({ version: "v3", auth });
  } catch (err) {
    initError = `Ошибка инициализации Google Drive: ${err.message}`;
  }
}

function loadCredentials() {
  if (env.googleDriveCredentialsJson) {
    return JSON.parse(env.googleDriveCredentialsJson);
  }
  if (env.googleDriveCredentialsPath) {
    return JSON.parse(readFileSync(env.googleDriveCredentialsPath, "utf-8"));
  }
  return null;
}

// Готов ли сервис к работе. Если false — пропускаем шаг загрузки в processor.
// Логируем initError ровно один раз, чтобы лог не зашумился на массовом батче.
let warnedAboutDisabled = false;
export function isEnabled() {
  ensureInitialized();
  if (driveClient) return true;
  if (!warnedAboutDisabled && initError) {
    console.warn(`[googleDrive] ${initError}`);
    warnedAboutDisabled = true;
  }
  return false;
}

// Скачивает картинку по URL и заливает в папку на Drive. Делает файл публичным
// (anyone can view) и возвращает {url, fileId}. URL — формата
// https://drive.google.com/uc?export=view&id=FILE_ID — встраиваемый в <img>.
//
// imageUrl — ссылка с Instagram CDN (или любая другая).
// filename — короткое имя без пути; добавим расширение .jpg, если его нет.
export async function uploadThumbnail(imageUrl, filename) {
  ensureInitialized();
  if (!driveClient) {
    throw new Error(initError ?? "Google Drive не инициализирован.");
  }

  const safeName = filename.endsWith(".jpg") ? filename : `${filename}.jpg`;

  // Скачиваем без Referer — Instagram отдаёт картинку только без него.
  const response = await fetch(imageUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    },
    redirect: "follow",
    // Не зависаем дольше 15 секунд — превью маленькое, скачивается быстро.
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Не удалось скачать превью (${response.status} ${response.statusText}).`);
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());

  // Drive API хочет stream — оборачиваем буфер в Readable.
  const mediaStream = Readable.from(buffer);

  const created = await driveClient.files.create({
    requestBody: {
      name: safeName,
      parents: [env.googleDriveFolderId],
      mimeType: contentType,
    },
    media: {
      mimeType: contentType,
      body: mediaStream,
    },
    fields: "id",
  });

  const fileId = created.data.id;
  if (!fileId) {
    throw new Error("Drive не вернул fileId — что-то пошло не так.");
  }

  // Делаем файл публичным. Без этого URL отдаст 401, превью не отрисуется.
  // role=reader, type=anyone — стандартный способ «по ссылке могут смотреть все».
  await driveClient.permissions.create({
    fileId,
    requestBody: { role: "reader", type: "anyone" },
  });

  // URL для встраивания в <img>. Формат `uc?export=view` поддерживает прямой
  // доступ к содержимому файла (а не превью-страницу Drive).
  const url = `https://drive.google.com/uc?export=view&id=${fileId}`;
  return { url, fileId };
}

// Удаление файла с Drive. Best effort — если файл уже удалён вручную или
// инициализация не удалась, ошибку проглатываем (логируем) и возвращаем false:
// удаление видео из БД не должно блокироваться очисткой Drive.
export async function deleteThumbnail(fileId) {
  ensureInitialized();
  if (!driveClient) {
    console.warn("[googleDrive] deleteThumbnail: сервис не инициализирован, пропускаем");
    return false;
  }

  try {
    await driveClient.files.delete({ fileId });
    return true;
  } catch (err) {
    // 404 — файла уже нет, это нормально. Остальное — логируем, но не падаем.
    const status = err?.code ?? err?.response?.status;
    if (status === 404) return true;
    console.warn(`[googleDrive] не удалось удалить ${fileId}: ${err.message}`);
    return false;
  }
}

// Сколько раз подряд можно вызывать deleteThumbnail в цикле без задержки —
// тестировал, Drive нормально переваривает ~5 удалений в секунду. Для
// массового удаления видео этого хватает.
export async function deleteManyThumbnails(fileIds) {
  let deleted = 0;
  for (const id of fileIds) {
    if (!id) continue;
    const ok = await deleteThumbnail(id);
    if (ok) deleted += 1;
  }
  return deleted;
}
