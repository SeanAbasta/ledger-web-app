// Sets the colour theme before first paint, so a dark-mode user never sees a light flash.
// Mirrors src/ui/theme.ts: keep the two in step. Preference lives in localStorage, per device.
(function () {
  var KEY = "ledger.theme";
  var mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
  function pref() {
    try {
      var v = localStorage.getItem(KEY);
      return v === "dark" || v === "auto" ? v : "light";
    } catch (e) {
      return "light";
    }
  }
  function apply() {
    var p = pref();
    var dark = p === "dark" || (p === "auto" && !!mq && mq.matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute("content", dark ? "#0e0f12" : "#eef0f5");
  }
  apply();
  if (mq && mq.addEventListener) mq.addEventListener("change", apply); // "auto" follows the system live
})();
