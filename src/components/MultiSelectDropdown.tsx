"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Option = { id: string; name: string };

export function MultiSelectDropdown({
  placeholder,
  options,
  selected,
  onChange,
}: {
  placeholder: string;
  options: Option[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filtered = useMemo(
    () => options.filter((o) => o.name.toLowerCase().includes(query.toLowerCase())),
    [options, query]
  );

  const selectedNames = useMemo(
    () => options.filter((o) => selected.includes(o.id)).map((o) => o.name),
    [options, selected]
  );

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  }

  const summary =
    selected.length === 0
      ? placeholder
      : selected.length <= 2
      ? selectedNames.join(", ")
      : `${selected.length} seleccionados`;

  return (
    <div className="multiselect" ref={rootRef}>
      <button
        type="button"
        className="multiselect-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={selected.length ? undefined : "multiselect-placeholder"}>{summary}</span>
        <span className="multiselect-caret" aria-hidden>
          ⌄
        </span>
      </button>
      {open ? (
        <div className="multiselect-panel">
          <input
            type="text"
            className="multiselect-search"
            placeholder="Buscar…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="multiselect-actions">
            <button type="button" onClick={() => onChange(options.map((o) => o.id))}>
              Todos
            </button>
            <button type="button" onClick={() => onChange([])}>
              Ninguno
            </button>
          </div>
          <div className="multiselect-list">
            {filtered.length === 0 ? (
              <div className="multiselect-empty">Sin resultados</div>
            ) : (
              filtered.map((o) => (
                <label className="multiselect-option" key={o.id}>
                  <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
                  <span>{o.name}</span>
                </label>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
