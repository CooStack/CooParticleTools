import { createId, resolveElement } from "./utils.js";

function buildSandboxSource(channel) {
  const safeChannel = JSON.stringify(channel);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      background: #ffffff;
      color: #0f172a;
    }
  </style>
</head>
<body>
  <script>
    (function () {
      const CHANNEL = ${safeChannel};

      function toText(value) {
        if (typeof value === "string") {
          return value;
        }
        if (value === null) {
          return "null";
        }
        if (typeof value === "undefined") {
          return "undefined";
        }
        if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
          return String(value);
        }
        if (value instanceof Error) {
          return value.stack || value.message || String(value);
        }
        try {
          return JSON.stringify(value);
        } catch (error) {
          return Object.prototype.toString.call(value);
        }
      }

      function send(type, payload) {
        parent.postMessage({ channel: CHANNEL, type: type, payload: payload || {} }, "*");
      }

      const toolkit = {
        version: "1.0.0-demo",
        sum(a, b) {
          return Number(a || 0) + Number(b || 0);
        },
        nowISO() {
          return new Date().toISOString();
        }
      };

      async function magicBolt(target, options) {
        const text = String(target || "");
        const retries = options && typeof options.retries === "number" ? options.retries : 0;
        const timeoutMs = options && typeof options.timeoutMs === "number" ? options.timeoutMs : 60;

        if (timeoutMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(timeoutMs, 300)));
        }

        return text.length + retries;
      }

      globalThis.toolkit = toolkit;
      globalThis.magicBolt = magicBolt;

      ["log", "info", "warn", "error"].forEach(function (level) {
        const original = console[level] ? console[level].bind(console) : console.log.bind(console);
        console[level] = function () {
          const args = Array.prototype.slice.call(arguments).map(toText);
          send("console", { level: level, args: args });
          original.apply(console, arguments);
        };
      });

      window.addEventListener("error", function (event) {
        send("runtime-error", {
          message: String(event.message || "Unknown runtime error"),
          stack: event.error && event.error.stack ? String(event.error.stack) : "",
          source: event.filename || "",
          lineno: event.lineno || 0,
          colno: event.colno || 0
        });
      });

      window.addEventListener("unhandledrejection", function (event) {
        const reason = event.reason;
        send("runtime-error", {
          message: reason && reason.message ? String(reason.message) : String(reason),
          stack: reason && reason.stack ? String(reason.stack) : "",
          source: "unhandledrejection",
          lineno: 0,
          colno: 0
        });
      });

      function runCode(code) {
        return new Promise(function (resolve, reject) {
          const runId = "__ct_run_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);

          function cleanup() {
            window.removeEventListener("error", onInlineScriptError, true);
            delete window[runId];
          }

          function onInlineScriptError(event) {
            if (!window[runId]) {
              return;
            }
            const error = event && event.error ? event.error : new Error(event && event.message ? event.message : "Script parse error");
            cleanup();
            reject(error);
          }

          window[runId] = {
            resolve: function () {
              cleanup();
              resolve();
            },
            reject: function (error) {
              cleanup();
              reject(error || new Error("Run failed"));
            }
          };

          window.addEventListener("error", onInlineScriptError, true);

          const script = document.createElement("script");
          script.type = "text/javascript";
          script.text = [
            "(async function () {",
            "  try {",
            String(code || ""),
            "    window['" + runId + "'].resolve();",
            "  } catch (error) {",
            "    window['" + runId + "'].reject(error);",
            "  }",
            "})();",
            "//# sourceURL=code_tip_preview_exec.js"
          ].join("\\n");

          document.body.appendChild(script);
          script.remove();
        });
      }

      window.addEventListener("message", async function (event) {
        const data = event.data;
        if (!data || data.channel !== CHANNEL || data.type !== "code-tip:run") {
          return;
        }

        send("console-clear", {});
        send("run-start", {});

        try {
          await runCode(String(data.code || ""));
          send("run-success", {});
        } catch (error) {
          send("runtime-error", {
            message: error && error.message ? String(error.message) : String(error),
            stack: error && error.stack ? String(error.stack) : "",
            source: "runtime",
            lineno: 0,
            colno: 0
          });
          send("run-fail", {});
        }
      });

      send("sandbox-ready", {});
    })();
  <\/script>
</body>
</html>`;
}

export function createPreviewSandbox(options = {}) {
  const mount = resolveElement(options.mount, "previewMount");
  const channel = createId("ct-preview");

  mount.innerHTML = "";

  const iframe = document.createElement("iframe");
  iframe.className = "ct-preview-frame";
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("referrerpolicy", "no-referrer");
  iframe.srcdoc = buildSandboxSource(channel);

  mount.appendChild(iframe);

  let ready = false;
  let resolveReady = null;
  const readyPromise = new Promise((resolve) => {
    resolveReady = resolve;
  });

  const onMessage = (event) => {
    const data = event.data;
    if (!data || data.channel !== channel || event.source !== iframe.contentWindow) {
      return;
    }

    if (data.type === "sandbox-ready") {
      ready = true;
      resolveReady();
    }

    if (typeof options.onMessage === "function") {
      options.onMessage(data);
    }
  };

  window.addEventListener("message", onMessage);

  async function run(code) {
    if (!ready) {
      await readyPromise;
    }

    iframe.contentWindow.postMessage(
      {
        channel,
        type: "code-tip:run",
        code: String(code || "")
      },
      "*"
    );
  }

  function dispose() {
    window.removeEventListener("message", onMessage);
    iframe.remove();
  }

  return {
    channel,
    iframe,
    run,
    dispose
  };
}
