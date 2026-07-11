import { debounce as sharedDebounce } from "../../src/js/shared/function.js";
import { downloadTextFile as sharedDownloadTextFile, readTextFile as sharedReadTextFile } from "../../src/js/shared/file.js";
import { escapeHtml as sharedEscapeHtml } from "../../src/js/shared/string.js";

const idSeed = {
  value: 0
};

export function createId(prefix = "ct") {
  idSeed.value += 1;
  const time = Date.now().toString(36);
  return `${prefix}-${time}-${idSeed.value.toString(36)}`;
}

export function resolveElement(target, label = "element") {
  if (target instanceof HTMLElement) {
    return target;
  }

  if (typeof target === "string") {
    const element = document.querySelector(target);
    if (!element) {
      throw new Error(`CodeTip: cannot find ${label} by selector \"${target}\".`);
    }
    return element;
  }

  throw new Error(`CodeTip: invalid ${label}, expected selector string or HTMLElement.`);
}

export const debounce = sharedDebounce;

export function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
}

export function sanitizeFileName(name, fallback = "extra-lib.d.ts") {
  const raw = String(name || fallback);
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.endsWith(".d.ts") ? cleaned : `${cleaned}.d.ts`;
}

export const escapeHtml = sharedEscapeHtml;

export function createDisposableBucket() {
  const entries = [];
  return {
    add(disposable) {
      if (disposable && typeof disposable.dispose === "function") {
        entries.push(disposable);
      }
      return disposable;
    },
    dispose() {
      while (entries.length > 0) {
        const current = entries.pop();
        try {
          current.dispose();
        } catch (error) {
          console.error("CodeTip: dispose failed", error);
        }
      }
    }
  };
}

export function severityText(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "error") {
    return "Error";
  }
  if (normalized === "warning" || normalized === "warn") {
    return "Warning";
  }
  if (normalized === "info") {
    return "Info";
  }
  return "Hint";
}

export function downloadTextFile(fileName, content, mime = "text/plain") {
  sharedDownloadTextFile(fileName, content, mime);
}

export function readTextFile(file) {
  return sharedReadTextFile(file);
}
