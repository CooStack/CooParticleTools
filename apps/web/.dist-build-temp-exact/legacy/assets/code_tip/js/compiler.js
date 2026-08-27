import { createId } from "./utils.js";

export function createCompiler(options = {}) {
  const workerUrl = options.workerUrl || new URL("./compilerWorker.js", import.meta.url);
  const worker = new Worker(workerUrl, { type: "classic" });
  const pending = new Map();
  let disposed = false;

  worker.onmessage = (event) => {
    const data = event.data || {};
    const request = pending.get(data.id);

    if (!request) {
      return;
    }

    pending.delete(data.id);

    if (data.type === "compile:result") {
      request.resolve(data.result);
      return;
    }

    if (data.type === "compile:error") {
      request.reject(new Error(data.error && data.error.message ? data.error.message : "Compiler worker error"));
    }
  };

  worker.onerror = (event) => {
    const message = event && event.message ? event.message : "Compiler worker crashed";
    pending.forEach((request) => request.reject(new Error(message)));
    pending.clear();
  };

  function compile(payload) {
    if (disposed) {
      return Promise.reject(new Error("CodeTip: compiler has been disposed."));
    }

    const id = createId("compile");

    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({
        type: "compile",
        id,
        payload
      });
    });
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    worker.terminate();
    pending.forEach((request) => request.reject(new Error("Compiler disposed")));
    pending.clear();
  }

  return {
    compile,
    dispose
  };
}
