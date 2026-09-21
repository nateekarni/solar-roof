import { OperationActions } from "./operation-actions";

export function OperationPageHeader({
  resource,
  eyebrow,
  title,
  description,
  action,
}: {
  resource?: string;
  eyebrow: string;
  title: string;
  description: string;
  action?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-3.5">
      <div className="min-w-0">
        <span className="eyebrow">{eyebrow}</span>
        <h1 className="text-xl font-bold tracking-tight text-foreground md:text-2xl mt-0.5">
          {title}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0 flex-wrap">
        <OperationActions resource={resource || ""} title={title} action={action} />
      </div>
    </div>
  );
}
