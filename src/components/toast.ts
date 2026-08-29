/**
 * A confirmation that survives the page re-rendering underneath it.
 *
 * Why this is imperative DOM rather than a React component:
 *
 * Every "add" form in this app is rendered by a *server* component. Refreshing
 * the route after a successful submit — which has to happen, so the new row
 * appears in the list — makes React replace that whole subtree. Any message
 * held in the form's own state goes with it. In a production build that meant
 * the row was written and the person was told nothing at all, so they would
 * reasonably submit it again.
 *
 * A node appended to <body> is not part of React's tree, so no re-render can
 * take it away. It removes itself.
 */

const CONTAINER_ID = "eduplus-toasts";
const VISIBLE_MS = 5000;

function container(): HTMLElement {
  let element = document.getElementById(CONTAINER_ID);
  if (element) return element;

  element = document.createElement("div");
  element.id = CONTAINER_ID;
  // aria-live so a screen reader announces it without stealing focus.
  element.setAttribute("aria-live", "polite");
  element.setAttribute("role", "status");
  element.style.cssText = [
    "position:fixed",
    "inset-inline-end:1rem", // logical, so it mirrors for Arabic
    "bottom:1rem",
    "z-index:9999",
    "display:flex",
    "flex-direction:column",
    "gap:0.5rem",
    "pointer-events:none",
  ].join(";");
  document.body.appendChild(element);
  return element;
}

export function showToast(message: string, tone: "success" | "error" = "success") {
  if (typeof document === "undefined") return;

  const colours =
    tone === "success"
      ? { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" }
      : { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" };

  const toast = document.createElement("div");
  toast.textContent = message;
  toast.style.cssText = [
    `background:${colours.bg}`,
    `border:1px solid ${colours.border}`,
    `color:${colours.text}`,
    "padding:0.625rem 1rem",
    "border-radius:0.75rem",
    "font-size:0.8125rem",
    "box-shadow:0 4px 12px rgba(0,0,0,0.08)",
    "max-width:24rem",
    "pointer-events:auto",
    "transition:opacity 250ms ease",
  ].join(";");

  container().appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = "0";
    window.setTimeout(() => toast.remove(), 250);
  }, VISIBLE_MS);
}
