import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { DriverSchema, DriverSchemaProperty } from "@/api/deviceLink";
import { type SerialRecord, deviceNumber, isRawNumber, parseDeviceJson } from "@/serial";
import { button, input, label, primary } from "./ui";

type Kind = "boolean" | "number" | "enum" | "text" | "json";

interface FieldSpec {
  key: string;
  kind: Kind;
  title: string;
  description?: string;
  options?: string[];
  readOnly: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
}

type Draft = Record<string, string | boolean>;

const humanize = (key: string) =>
  key.replace(/_/g, " ").replace(/^\w/, (char) => char.toUpperCase());

const schemaType = (property?: DriverSchemaProperty) =>
  Array.isArray(property?.type) ? property.type[0] : property?.type;

function kindOf(value: unknown, property?: DriverSchemaProperty): Kind {
  if (property?.enum?.length) return "enum";
  const type = schemaType(property);
  if (type === "boolean") return "boolean";
  if (type === "number" || type === "integer") return "number";
  if (type === "string") return "text";
  if (type === "object" || type === "array") return "json";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number" || isRawNumber(value)) return "number";
  if (value !== null && typeof value === "object") return "json";
  return "text";
}

function toDraft(spec: FieldSpec, value: unknown): string | boolean {
  if (spec.kind === "boolean") return value === true;
  // A number too big for JS, kept exactly as the board wrote it.
  if (isRawNumber(value)) return value.rawJSON;
  if (spec.kind === "json") return value === undefined ? "" : JSON.stringify(value);
  return value === undefined || value === null ? "" : String(value);
}

function fromDraft(spec: FieldSpec, draft: string | boolean): unknown {
  if (spec.kind === "boolean") return draft === true;
  const text = String(draft);
  if (spec.kind === "number") {
    const parsed = Number(text);
    if (text.trim() === "" || Number.isNaN(parsed)) {
      throw new Error(`${spec.title} must be a number.`);
    }
    return deviceNumber(text);
  }
  if (spec.kind === "json") return parseDeviceJson(text);
  return text;
}

const NONE: string[] = [];
const HIDDEN = ["object"];

export function parseJsonObject(text: string): SerialRecord {
  const parsed = parseDeviceJson(text);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Config must be a JSON object.");
  }
  return parsed as SerialRecord;
}

/**
 * Edit a board object's config. The fields are exactly the properties the
 * board reported (nothing is hard-coded); the driver's JSON Schema, when it
 * describes a property, only adds its type, title, options and limits.
 * Anything the form can't express is editable in the raw JSON view.
 *
 * `onApply` receives only the changed properties in form view, or the whole
 * object in JSON view (like `rrivctl set <object> -f file.json`).
 */
export function ConfigForm({
  name,
  values,
  schema,
  readOnly = NONE,
  hidden = HIDDEN,
  disabled,
  busy,
  onApply,
}: {
  /** Accessible name prefix, e.g. "Datalogger" → "Apply datalogger config". */
  name: string;
  values: SerialRecord;
  schema?: DriverSchema | null;
  readOnly?: string[];
  hidden?: string[];
  disabled?: boolean;
  busy?: boolean;
  onApply: (changes: SerialRecord) => void;
}) {
  const specs = useMemo<FieldSpec[]>(() => {
    const properties = schema?.properties ?? {};
    const keys = Object.keys(values).filter((key) => !hidden.includes(key));
    return keys.map((key) => {
      const property = properties[key];
      return {
        key,
        kind: kindOf(values[key], property),
        title: property?.title ?? humanize(key),
        description: property?.description,
        options: property?.enum?.map(String),
        readOnly: readOnly.includes(key),
        min: property?.minimum,
        max: property?.maximum,
        maxLength: property?.maxLength,
      };
    });
    // Keyed on contents so callers can pass inline arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, schema, readOnly.join(), hidden.join()]);

  const initial = useMemo(() => {
    const draft: Draft = {};
    for (const spec of specs) draft[spec.key] = toDraft(spec, values[spec.key]);
    return draft;
  }, [specs, values]);

  const [mode, setMode] = useState<"form" | "json">("form");
  const [draft, setDraft] = useState<Draft>(initial);
  const [json, setJson] = useState(() => JSON.stringify(values, null, 2));
  const [error, setError] = useState<string | null>(null);

  const shown = useRef({ initial, json: JSON.stringify(values, null, 2) });
  /** Set on Apply: the next values are the board's answer, so reset fully. */
  const awaitingApply = useRef(false);

  // New values from the board (a re-read, or the reply to Apply). After an
  // Apply the editor resets to what the board reports. Otherwise only fields
  // the user hasn't touched are updated, so a re-read that lands mid-edit
  // can't overwrite (or splice into) what they're typing.
  useEffect(() => {
    const nextJson = JSON.stringify(values, null, 2);
    const previous = shown.current;
    shown.current = { initial, json: nextJson };
    if (awaitingApply.current) {
      awaitingApply.current = false;
      setDraft(initial);
      setJson(nextJson);
      setError(null);
      return;
    }
    setDraft((current) => {
      const next: Draft = {};
      for (const [key, value] of Object.entries(initial)) {
        const edited = key in current && current[key] !== previous.initial[key];
        next[key] = edited ? current[key]! : value;
      }
      return next;
    });
    setJson((current) => (current === previous.json ? nextJson : current));
  }, [initial, values]);

  const changed = specs.filter((spec) => !spec.readOnly && draft[spec.key] !== initial[spec.key]);
  const lower = name.toLowerCase();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (mode === "json") {
        const parsed = parseJsonObject(json);
        awaitingApply.current = true;
        onApply(parsed);
        return;
      }
      const changes: SerialRecord = {};
      for (const spec of changed) changes[spec.key] = fromDraft(spec, draft[spec.key]!);
      awaitingApply.current = true;
      onApply(changes);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  const canApply = mode === "json" ? json.trim().length > 0 : changed.length > 0;

  return (
    <form onSubmit={submit} className="space-y-4" aria-label={`${name} config`}>
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs" role="group" aria-label="Editor view">
          {(["form", "json"] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={mode === view}
              onClick={() => setMode(view)}
              className={[
                "rounded-md px-2.5 py-1 transition",
                mode === view ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:text-fg",
              ].join(" ")}
            >
              {view === "form" ? "Form" : "JSON"}
            </button>
          ))}
        </div>
        {mode === "form" && changed.length ? (
          <span className="text-xs text-fg-subtle">
            {changed.length} unsaved change{changed.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {mode === "form" ? (
        specs.length ? (
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {specs.map((spec) => (
              <FormField
                key={spec.key}
                spec={spec}
                value={draft[spec.key] ?? ""}
                dirty={draft[spec.key] !== initial[spec.key]}
                disabled={disabled}
                onChange={(next) => {
                  // Editing again after a failed Apply keeps the edits on re-read.
                  awaitingApply.current = false;
                  setDraft((prev) => ({ ...prev, [spec.key]: next }));
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-fg-subtle">Nothing to edit. Use the JSON view to set properties.</p>
        )
      ) : (
        <textarea
          className={`${input} h-56 font-mono text-xs`}
          aria-label={`${name} config JSON`}
          spellCheck={false}
          value={json}
          disabled={disabled}
          onChange={(event) => {
            awaitingApply.current = false;
            setJson(event.target.value);
          }}
        />
      )}

      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className={primary}
          aria-label={`Apply ${lower} config`}
          disabled={disabled || busy || !canApply}
        >
          {busy ? "Applying…" : "Apply to board"}
        </button>
        <button
          type="button"
          className={button}
          disabled={disabled || busy}
          onClick={() => {
            setDraft(initial);
            setJson(JSON.stringify(values, null, 2));
            setError(null);
          }}
        >
          Reset
        </button>
      </div>
    </form>
  );
}

function FormField({
  spec,
  value,
  dirty,
  disabled,
  onChange,
}: {
  spec: FieldSpec;
  value: string | boolean;
  dirty: boolean;
  disabled?: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const id = `config-${spec.key}`;
  const off = disabled || spec.readOnly;
  const heading = (
    <span className="flex items-center gap-2">
      <span className={label}>{spec.title}</span>
      {dirty ? <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-label="changed" /> : null}
    </span>
  );

  if (spec.kind === "boolean") {
    return (
      <label htmlFor={id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
        <span className="min-w-0">
          {heading}
          {spec.description ? <span className="mt-0.5 block text-xs text-fg-subtle">{spec.description}</span> : null}
        </span>
        <input
          id={id}
          type="checkbox"
          className="h-4 w-4 accent-[var(--color-accent)]"
          checked={value === true}
          disabled={off}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    );
  }

  return (
    <label htmlFor={id} className="block min-w-0">
      {heading}
      {spec.kind === "enum" ? (
        <select
          id={id}
          className={`${input} mt-1`}
          value={String(value)}
          disabled={off}
          onChange={(event) => onChange(event.target.value)}
        >
          {String(value) === "" ? <option value="">—</option> : null}
          {spec.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className={`${input} mt-1 ${spec.kind === "json" ? "font-mono text-xs" : ""}`}
          type={spec.kind === "number" ? "number" : "text"}
          inputMode={spec.kind === "number" ? "decimal" : undefined}
          min={spec.min}
          max={spec.max}
          maxLength={spec.maxLength}
          step="any"
          value={String(value)}
          readOnly={spec.readOnly}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {spec.description ? <span className="mt-1 block text-xs text-fg-subtle">{spec.description}</span> : null}
    </label>
  );
}
