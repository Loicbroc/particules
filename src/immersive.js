export function setupImmersive({ onChange } = {}) {
  const button = document.getElementById("interface-button");
  const targets = [...document.querySelectorAll(".brand, .header-caption, .header-actions > :not(#interface-button), #controls, .scene-status, .scene-bottom, .footer")];
  const previousInert = new Map();
  let hidden = false;
  const setHidden = (value) => {
    if (hidden === value) return;
    hidden = value;
    if (hidden) document.querySelectorAll("dialog[open]").forEach((dialog) => dialog.close());
    for (const target of targets) {
      if (hidden) {
        previousInert.set(target, target.inert);
        target.inert = true;
      } else target.inert = previousInert.get(target) || false;
    }
    document.body.classList.toggle("interface-hidden", hidden);
    button.setAttribute("aria-pressed", String(hidden));
    const label = hidden ? "Afficher l’interface" : "Masquer l’interface";
    button.setAttribute("aria-label", label);
    button.title = `${label} (H)`;
    button.querySelector("use").setAttribute("href", hidden ? "#i-eye" : "#i-eye-off");
    if (targets.some((target) => target.contains(document.activeElement))) button.focus({ preventScroll: true });
    onChange?.(hidden);
  };
  button.addEventListener("click", () => setHidden(!hidden));
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey || event.repeat) return;
    if (event.key === "Escape" && hidden) {
      event.preventDefault();
      setHidden(false);
    } else if (event.key.toLowerCase() === "h" && !event.target.closest("input, select, textarea, [contenteditable=true]")) {
      event.preventDefault();
      setHidden(!hidden);
    }
  });
  return { setHidden, get hidden() { return hidden; } };
}
