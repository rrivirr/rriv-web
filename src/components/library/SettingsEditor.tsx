import { useEffect, useRef, useState } from "react";
import type { DriverSchema, DriverSchemaProperty } from "@/api/deviceLink";

export type Settings = Record<string, unknown>;

const humanize = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());

const schemaType = (property?: DriverSchemaProperty) =>
  Array.isArray(property?.type) ? property.type[0] : property?.type;

type Kind = "boolean" | "number" | "text" | "json";

function kindOf(value: unknown, property?: DriverSchemaProperty): Kind {
  const type = schemaType(property);
  if (type === "boolean" || typeof value === "boolean") return "boolean";
  if (type === "number" || type === "integer" || typeof value === "number") return "number";
  if (type === "object" || type === "array" || (value !== null && typeof value === "object")) return "json";
  return "text";
}

/** A typed value: JSON when it parses (numbers, booleans, objects), else text. */
export function parseSettingValue(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed === "") return "";
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}

/**
 * Edit a whole config object: one row per setting (typed by the driver's
 * schema when it describes it, otherwise by the value), add and remove
 * settings, or edit it all as JSON. Calls `onChange` with the full object.
 */
export function SettingsEditor({
  label,
  value,
  onChange,
  schema,
}: {
  /** Accessible name prefix, e.g. "Sensor" → "Sensor settings". */
  label: string;
  value: Settings;
  onChange: (next: Settings) => void;
  schema?: DriverSchema | null;
}) {
  const [mode, setMode] = useState<"form" | "json">("form");
  const [json, setJson] = useState(() => JSON.stringify(value, null, 2));
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const properties = schema?.properties ?? {};
  const required = schema?.required ?? [];
  /**
   * Each setting's kind, fixed once seen: clearing a number field (briefly
   * "") mustn't turn it into a text field.
   */
  const kinds = useRef(new Map<string, Kind>());
  const kindFor = (key: string, current: unknown) => {
    const known = kinds.current.get(key);
    if (known && !(current === "" && known === "text")) return known;
    const kind = kindOf(current, properties[key]);
    if (current !== "") kinds.current.set(key, kind);
    return kind;
  };

  // Keep the JSON view in step with form edits (and a new starting point).
  useEffect(() => {
    if (mode === "form") setJson(JSON.stringify(value, null, 2));
  }, [value, mode]);

  const set = (key: string, next: unknown) => onChange({ ...value, [key]: next });
  const remove = (key: string) => {
    const { [key]: _removed, ...rest } = value;
    kinds.current.delete(key);
    onChange(rest);
  };
  const suggested = Object.keys(properties).filter((key) => !(key in value));

  const addSetting = () => {
    const key = newKey.trim();
    if (!key || key in value) return;
    set(key, parseSettingValue(newValue));
    setNewKey("");
    setNewValue("");
  };

  return (
    <div className="space-y-3" role="group" aria-label={`${label} settings`}>
      <div className="inline-flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label={`${label} editor view`}>
        {(["form", "json"] as const).map((view) => (
          <button
            key={view}
            type="button"
            aria-pressed={mode === view}
            onClick={() => {
              setJsonError(null);
              setMode(view);
            }}
            className={[
              "rounded-md px-2.5 py-1 transition",
              mode === view ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg",
            ].join(" ")}
          >
            {view === "form" ? "Form" : "JSON"}
          </button>
        ))}
      </div>

      {mode === "json" ? (
        <div className="space-y-1">
          <textarea
            className="field min-h-40 font-mono text-xs"
            aria-label={`${label} JSON`}
            value={json}
            onChange={(event) => {
              setJson(event.target.value);
              try {
                const parsed = JSON.parse(event.target.value) as unknown;
                if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
                  setJsonError("Settings must be a JSON object.");
                  return;
                }
                setJsonError(null);
                onChange(parsed as Settings);
              } catch {
                setJsonError("Not valid JSON yet.");
              }
            }}
          />
          {jsonError ? <p className="text-xs text-amber-600">{jsonError}</p> : null}
        </div>
      ) : (
        <div className="space-y-2">
          {Object.keys(value).length === 0 ? (
            <p className="text-xs text-fg-subtle">No settings yet.</p>
          ) : null}
          {Object.entries(value).map(([key, current]) => {
            const property = properties[key];
            const kind = kindFor(key, current);
            const title = property?.title ?? humanize(key);
            return (
              <div key={key} className="grid items-center gap-2 sm:grid-cols-[12rem_1fr_auto]">
                <label htmlFor={`${label}-${key}`} className="text-xs text-fg-muted">
                  {title}
                  {required.includes(key) ? " *" : ""}
                </label>
                {kind === "boolean" ? (
                  <input
                    id={`${label}-${key}`}
                    type="checkbox"
                    className="justify-self-start"
                    checked={current === true}
                    onChange={(event) => set(key, event.target.checked)}
                  />
                ) : property?.enum?.length ? (
                  <select
                    id={`${label}-${key}`}
                    className="field"
                    value={String(current ?? "")}
                    onChange={(event) => set(key, event.target.value)}
                  >
                    {property.enum.map((option) => (
                      <option key={String(option)} value={String(option)}>
                        {String(option)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`${label}-${key}`}
                    className={kind === "json" ? "field font-mono text-xs" : "field"}
                    type={kind === "number" ? "number" : "text"}
                    value={kind === "json" ? JSON.stringify(current) : String(current ?? "")}
                    onChange={(event) =>
                      set(
                        key,
                        kind === "number"
                          ? event.target.value === ""
                            ? ""
                            : Number(event.target.value)
                          : kind === "json"
                            ? parseSettingValue(event.target.value)
                            : event.target.value,
                      )
                    }
                  />
                )}
                <button
                  type="button"
                  className="btn btn-ghost px-2 py-1 text-xs"
                  aria-label={`Remove ${title}`}
                  onClick={() => remove(key)}
                >
                  Remove
                </button>
              </div>
            );
          })}

          <div className="grid gap-2 border-t border-border pt-2 sm:grid-cols-[12rem_1fr_auto]">
            <input
              className="field"
              aria-label={`${label}: new setting name`}
              placeholder="setting_name"
              list={suggested.length ? `${label}-suggested` : undefined}
              value={newKey}
              onChange={(event) => setNewKey(event.target.value)}
            />
            {suggested.length ? (
              <datalist id={`${label}-suggested`}>
                {suggested.map((key) => (
                  <option key={key} value={key} />
                ))}
              </datalist>
            ) : null}
            <input
              className="field"
              aria-label={`${label}: new setting value`}
              placeholder="value (numbers, true/false and JSON are typed)"
              value={newValue}
              onChange={(event) => setNewValue(event.target.value)}
            />
            <button
              type="button"
              className="btn btn-ghost"
              disabled={!newKey.trim() || newKey.trim() in value}
              onClick={addSetting}
            >
              Add setting
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
