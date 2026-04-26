// Типы и константы для addVideoAction.
// Вынесены из "use server"-файла: такие файлы могут экспортировать только async-функции.

export interface AddVideoState {
  status: "idle" | "success" | "error";
  error?: string;
}

export const addVideoInitialState: AddVideoState = { status: "idle" };
