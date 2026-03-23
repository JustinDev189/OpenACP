import { useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import type { ConfigField } from "../api/types";
import { Card } from "../components/shared/Card";
import { Button } from "../components/shared/Button";
import { Toggle } from "../components/shared/Toggle";

export function ConfigPage() {
  const [fields, setFields] = useState<ConfigField[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [needsRestart, setNeedsRestart] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    api
      .get<{ fields: ConfigField[] }>("/api/config/editable")
      .then((data) => setFields(data.fields))
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleSave = useCallback(async (path: string, value: unknown) => {
    setSaving(path);
    try {
      const result = await api.patch<{ ok: boolean; needsRestart: boolean }>(
        "/api/config",
        { path, value },
      );
      if (result.needsRestart) setNeedsRestart(true);
      setFields((prev) =>
        prev.map((f) => (f.path === path ? { ...f, value } : f)),
      );
      setToast({ message: `Saved ${path}`, type: "success" });
    } catch (err) {
      setToast({
        message: `Failed to save ${path}: ${(err as Error).message}`,
        type: "error",
      });
    } finally {
      setSaving(null);
    }
  }, []);

  const handleRestart = useCallback(async () => {
    if (!confirm("Restart the server to apply changes?")) return;
    await api.post("/api/restart");
  }, []);

  if (loading) return <div className="text-zinc-500">Loading config...</div>;
  if (error)
    return <div className="text-red-500">Failed to load config: {error}</div>;

  // Group fields by group
  const groups = new Map<string, ConfigField[]>();
  for (const field of fields) {
    const group = field.group || "General";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(field);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Configuration</h1>
        {needsRestart && (
          <Button variant="danger" onClick={handleRestart}>
            Restart to Apply
          </Button>
        )}
      </div>

      {Array.from(groups.entries()).map(([groupName, groupFields]) => (
        <Card key={groupName} title={groupName}>
          <div className="space-y-4">
            {groupFields.map((field) => (
              <ConfigFieldRow
                key={field.path}
                field={field}
                saving={saving === field.path}
                onSave={handleSave}
              />
            ))}
          </div>
        </Card>
      ))}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 px-4 py-2 rounded-md text-sm shadow-lg ${
            toast.type === "success"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
}

function ConfigFieldRow({
  field,
  saving,
  onSave,
}: {
  field: ConfigField;
  saving: boolean;
  onSave: (path: string, value: unknown) => void;
}) {
  const [localValue, setLocalValue] = useState<unknown>(field.value);
  const isDirty = JSON.stringify(localValue) !== JSON.stringify(field.value);

  useEffect(() => {
    setLocalValue(field.value);
  }, [field.value]);

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-sm font-medium flex items-center gap-2">
          {field.displayName}
          {!field.hotReload && (
            <span className="text-xs px-1.5 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
              restart
            </span>
          )}
        </div>
        <div className="text-xs text-zinc-500 font-mono">{field.path}</div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {field.type === "boolean" ? (
          <Toggle
            checked={localValue as boolean}
            onChange={(val) => onSave(field.path, val)}
            disabled={saving}
          />
        ) : field.type === "enum" && field.options ? (
          <select
            value={String(localValue)}
            onChange={(e) => {
              setLocalValue(e.target.value);
              onSave(field.path, e.target.value);
            }}
            disabled={saving}
            className="px-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
          >
            {field.options.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        ) : field.type === "number" ? (
          <>
            <input
              type="number"
              value={String(localValue)}
              onChange={(e) => setLocalValue(Number(e.target.value))}
              disabled={saving}
              className="w-24 px-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
            />
            {isDirty && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => onSave(field.path, localValue)}
                disabled={saving}
              >
                Save
              </Button>
            )}
          </>
        ) : (
          <>
            <input
              type="text"
              value={String(localValue ?? "")}
              onChange={(e) => setLocalValue(e.target.value)}
              disabled={saving}
              className="w-48 px-2 py-1 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
            />
            {isDirty && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => onSave(field.path, localValue)}
                disabled={saving}
              >
                Save
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
