"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { useT } from "../../providers/locale-provider";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    console.error("Application Error:", error);
  }, [error]);

  return (
    <main className="content flex min-h-[60vh] items-center justify-center">
      <Card className="max-w-md border-border bg-card p-6 shadow-md text-center">
        <CardContent className="flex flex-col items-center gap-4 p-0">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-6" />
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-foreground">
              {t("errors.loadFailed")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {error.message || t("errors.apiError")}
            </p>
          </div>
          <Button
            onClick={() => reset()}
            className="mt-2 gap-2 text-xs font-semibold"
          >
            <RotateCcw className="size-3.5" />
            {t("errors.retry")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
