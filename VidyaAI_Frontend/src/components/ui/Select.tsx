"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type SelectProps = {
  value: string | number;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
};

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "bottom" | "top";
};

function computeMenuPosition(trigger: HTMLButtonElement): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const viewportPadding = 12;
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
  const maxHeight = Math.min(256, openUp ? spaceAbove - gap : spaceBelow - gap);

  return {
    top: openUp ? rect.top - gap : rect.bottom + gap,
    left: rect.left,
    width: rect.width,
    maxHeight: Math.max(120, maxHeight),
    placement: openUp ? "top" : "bottom",
  };
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled = false,
  className = "",
  size = "md",
  "aria-label": ariaLabel,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<MenuPosition | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const stringValue = value === "" || value === undefined || value === null ? "" : String(value);
  const selected = options.find((option) => option.value === stringValue);

  function openMenu() {
    if (disabled || !triggerRef.current) return;
    setMenuStyle(computeMenuPosition(triggerRef.current));
    setOpen(true);
  }

  function closeMenu() {
    setOpen(false);
  }

  function toggleMenu() {
    if (disabled) return;
    if (open) {
      closeMenu();
      return;
    }
    openMenu();
  }

  useEffect(() => {
    if (!open) return;

    const reposition = () => {
      if (!triggerRef.current) return;
      setMenuStyle(computeMenuPosition(triggerRef.current));
    };

    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);

    const closeOnOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeMenu();
    };

    // Defer so the opening click does not immediately close the menu.
    const timer = window.setTimeout(() => {
      document.addEventListener("mousedown", closeOnOutside);
    }, 0);

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", onEscape);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", onEscape);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const padding = size === "sm" ? "px-3 py-2 text-sm" : "px-3.5 py-2.5 text-sm";

  const menu =
    open && !disabled && menuStyle && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            className="select-menu select-menu-portal scroll-area"
            style={{
              position: "fixed",
              top: menuStyle.placement === "bottom" ? menuStyle.top : undefined,
              bottom:
                menuStyle.placement === "top"
                  ? window.innerHeight - menuStyle.top
                  : undefined,
              left: menuStyle.left,
              width: menuStyle.width,
              maxHeight: menuStyle.maxHeight,
              zIndex: 9999,
            }}
          >
            {options.map((option) => {
              const isSelected = option.value === stringValue;
              return (
                <li key={option.value} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (option.disabled) return;
                      onChange(option.value);
                      closeMenu();
                    }}
                    className={`select-option ${isSelected ? "select-option-active" : ""} ${
                      option.disabled ? "select-option-disabled" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate font-medium">{option.label}</span>
                      {option.description && (
                        <span className="mt-0.5 block truncate text-xs text-slate-500">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-indigo-300" />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled}
        onClick={toggleMenu}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleMenu();
          }
        }}
        className={`select-trigger ${padding} ${disabled ? "select-trigger-disabled" : ""}`}
      >
        <span className={`min-w-0 flex-1 truncate text-left ${selected ? "text-slate-100" : "text-slate-500"}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${open ? "rotate-180 text-indigo-300" : ""}`}
        />
      </button>
      {menu}
    </div>
  );
}
