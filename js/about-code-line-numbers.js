function rebuildAboutCodeLineNumbers() {
  const blocks = document.querySelectorAll(".about-page .code-block pre.line-numbers");

  blocks.forEach((pre) => {
    const code = pre.querySelector("code");
    if (!code) return;

    pre.classList.add("line-numbers");

    pre.querySelectorAll(":scope > .line-numbers-rows").forEach((rows) => {
      rows.remove();
    });

    code.querySelectorAll(":scope > .line-numbers-rows").forEach((rows) => {
      rows.remove();
    });

    const lineCount = Math.max(
      code.textContent.replace(/\n$/, "").split("\n").length,
      1
    );

    const rows = document.createElement("span");
    rows.className = "line-numbers-rows";
    rows.setAttribute("aria-hidden", "true");
    rows.innerHTML = Array.from({ length: lineCount }, () => "<span></span>").join("");

    code.appendChild(rows);
  });

  if (typeof requestScrollRevealUpdate === "function") {
    requestScrollRevealUpdate();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  requestAnimationFrame(() => {
    rebuildAboutCodeLineNumbers();
  });
});
