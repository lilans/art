const visitCounter = document.querySelector(".visit-counter");
const visitCounterKey = "narod-home-visits";
let visits = 1;

try {
  const previous = Number(localStorage.getItem(visitCounterKey));
  if (Number.isSafeInteger(previous) && previous >= 0) {
    visits = Math.min(previous + 1, 999999);
  }
  localStorage.setItem(visitCounterKey, String(visits));
} catch {
  // The current visit can still be shown when storage is unavailable.
}

function labelVisitCounter() {
  const label = document.documentElement.lang === "ru"
    ? "Посещения в этом браузере"
    : "Visits in this browser";
  visitCounter.setAttribute("aria-label", `${label}: ${visits}`);
}

visitCounter.textContent = String(visits).padStart(6, "0");
labelVisitCounter();
visitCounter.hidden = false;
document.addEventListener("site:language", labelVisitCounter);
