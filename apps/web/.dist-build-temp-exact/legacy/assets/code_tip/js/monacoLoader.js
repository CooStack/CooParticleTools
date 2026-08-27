export const MONACO_VERSION = "0.55.1";
export const MONACO_BASE_URL = `https://cdn.jsdelivr.net/npm/monaco-editor@${MONACO_VERSION}/min/vs`;

let loaderPromise = null;
let monacoPromise = null;

function loadAmdLoaderScript() {
  if (loaderPromise) {
    return loaderPromise;
  }

  loaderPromise = new Promise((resolve, reject) => {
    if (window.require && typeof window.require.config === "function") {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `${MONACO_BASE_URL}/loader.js`;
    script.async = true;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error("CodeTip: failed to load Monaco AMD loader."));

    document.head.appendChild(script);
  });

  return loaderPromise;
}

function applyWorkerConfig() {
  const workerSource = `self.MonacoEnvironment = { baseUrl: '${MONACO_BASE_URL}' };importScripts('${MONACO_BASE_URL}/base/worker/workerMain.js');`;

  window.MonacoEnvironment = window.MonacoEnvironment || {};
  window.MonacoEnvironment.getWorkerUrl = () => {
    return `data:text/javascript;charset=utf-8,${encodeURIComponent(workerSource)}`;
  };
}

export function loadMonaco() {
  if (monacoPromise) {
    return monacoPromise;
  }

  monacoPromise = loadAmdLoaderScript().then(() => {
    return new Promise((resolve, reject) => {
      applyWorkerConfig();

      window.require.config({
        paths: {
          vs: MONACO_BASE_URL
        }
      });

      window.require(
        ["vs/editor/editor.main"],
        () => resolve(window.monaco),
        (error) => {
          reject(error instanceof Error ? error : new Error(String(error || "Unknown Monaco load error")));
        }
      );
    });
  });

  return monacoPromise;
}
