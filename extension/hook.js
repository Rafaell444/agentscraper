// Runs inside MyHome's own page (world: MAIN): when the page asks MyHome's
// API for the phone number ("ნომრის ნახვა"), pass the answer on to
// content.js.  Nothing is changed in the request or the response.
(() => {
  const PHONE_API = "/statements/phone/show";
  const forward = (text) => {
    try {
      window.postMessage({ source: "thc-phone", payload: JSON.parse(text) }, location.origin);
    } catch {
      // not JSON
    }
  };

  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = String(args[0] && args[0].url ? args[0].url : args[0]);
      if (url.includes(PHONE_API)) response.clone().text().then(forward, () => undefined);
    } catch {
      // never break the page
    }
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (String(url).includes(PHONE_API)) this.addEventListener("load", () => forward(this.responseText));
    return originalOpen.call(this, method, url, ...rest);
  };
})();
