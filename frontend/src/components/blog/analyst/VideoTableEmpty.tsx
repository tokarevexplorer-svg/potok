// Пустое состояние таблицы: рендерится вместо таблицы, когда видео ещё нет.
// Вынесено наружу из <table>, чтобы текст не обрезался широкой горизонтальной прокруткой.

export default function VideoTableEmpty() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface px-6 py-16 text-center">
      <p className="font-display text-xl font-semibold text-ink">
        Пока ни одного видео
      </p>
      <p className="mt-2 max-w-md text-sm text-ink-muted">
        Нажми «Добавить видео» и вставь ссылку на Reel — он появится в таблице.
        Автоматический парсинг, транскрипция и AI-саммари появятся в следующих
        сессиях.
      </p>
    </div>
  );
}
