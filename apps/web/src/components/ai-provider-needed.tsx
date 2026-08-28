import Link from "next/link";
import { Alert } from "@/ui/alert";

export function AiProviderNeeded({ ready }: { ready: boolean }) {
  if (ready) return null;
  return (
    <Alert tone="alert" className="mb-4">
      Подключите ИИ-провайдера в{" "}
      <Link href="/settings/ai" className="font-medium underline">
        Настройках
      </Link>
      , иначе агенты семантики, объявлений и оптимизации не запустятся.
    </Alert>
  );
}
