import { redirect } from "next/navigation";

// Старый URL «Аналитика» — оставлен как редирект на «Базу референсов».
export default function AnalystRedirect() {
  redirect("/blog/references");
}
