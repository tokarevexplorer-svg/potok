"use client";

import { useState } from "react";
import { ListPlus, Plus } from "lucide-react";
import Button from "@/components/ui/Button";
import AddVideoModal from "./AddVideoModal";
import AddVideoBatchModal from "./AddVideoBatchModal";

// Две кнопки рядом: основное действие (одно видео) — акцентная,
// вторичное (массовое) — secondary, чтобы не конкурировала визуально.
export default function AddVideoButton() {
  const [singleOpen, setSingleOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" onClick={() => setSingleOpen(true)}>
          <Plus size={18} />
          Добавить видео
        </Button>
        <Button
          size="lg"
          variant="secondary"
          onClick={() => setBatchOpen(true)}
          title="Вставить список ссылок и обработать пачкой"
        >
          <ListPlus size={18} />
          Добавить много
        </Button>
      </div>
      <AddVideoModal open={singleOpen} onClose={() => setSingleOpen(false)} />
      <AddVideoBatchModal open={batchOpen} onClose={() => setBatchOpen(false)} />
    </>
  );
}
