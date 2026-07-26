'use strict';

function createProjectCloseGuard({ inspect, prompt, save, close, reportError }) {
  let inFlight = null;

  async function run() {
    let state;
    try {
      state = await inspect();
    } catch (error) {
      reportError(error?.message || String(error));
      return 'failed';
    }

    if (state?.ok === false) {
      reportError(state.message || '无法检查项目保存状态。');
      return 'failed';
    }
    if (!state?.handled || !state.dirty || state.autoSaved) {
      close();
      return 'closed';
    }

    const choice = await prompt(state);
    if (choice === 'cancel') return 'canceled';
    if (choice === 'discard') {
      close();
      return 'closed';
    }
    if (choice !== 'save') return 'canceled';

    let result;
    try {
      result = await save(state);
    } catch (error) {
      reportError(error?.message || String(error));
      return 'failed';
    }
    if (result?.ok) {
      let latestState;
      try {
        latestState = await inspect();
      } catch (error) {
        reportError(error?.message || String(error));
        return 'failed';
      }
      if (latestState?.ok === false) {
        reportError(latestState.message || '无法检查项目保存状态。');
        return 'failed';
      }
      if (latestState?.handled && latestState.dirty && !latestState.autoSaved) {
        reportError('项目在保存期间又发生了更改，请再次退出。');
        return 'failed';
      }
      close();
      return 'closed';
    }
    if (result?.canceled) return 'canceled';
    reportError(result?.message || '项目保存失败。');
    return 'failed';
  }

  return Object.freeze({
    requestClose() {
      if (!inFlight) {
        inFlight = run().finally(() => {
          inFlight = null;
        });
      }
      return inFlight;
    },
  });
}

module.exports = { createProjectCloseGuard };
