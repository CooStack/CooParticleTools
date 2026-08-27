export function debounce(fn, wait = 300) {
  let timer = null;

  const wrapped = (...args) => {
    if (timer) clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  };

  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return wrapped;
}
