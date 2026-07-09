function initMobileDrawer() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar || document.getElementById("menuToggle")) return;

  const toggle = document.createElement("button");
  toggle.id = "menuToggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Open navigation");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = "☰";

  const overlay = document.createElement("div");
  overlay.className = "sidebar-overlay";

  document.body.prepend(overlay);
  document.body.prepend(toggle);

  const setOpen = (open) => {
    sidebar.classList.toggle("open", open);
    overlay.classList.toggle("active", open);
    toggle.setAttribute("aria-expanded", String(open));
  };

  toggle.addEventListener("click", () => setOpen(!sidebar.classList.contains("open")));
  overlay.addEventListener("click", () => setOpen(false));
  sidebar.querySelectorAll("nav a").forEach((link) => {
    link.addEventListener("click", () => setOpen(false));
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setOpen(false);
  });
}
