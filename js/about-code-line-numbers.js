function rebuildAboutCodeLineNumbers() {
  const blocks = document.querySelectorAll(".about-page .code-block pre.line-numbers, .about-page .code-block pre");

  blocks.forEach((pre) => {
    const code = pre.querySelector("code");
    const wrapper = pre.closest(".code-block");
    const gutterParent = pre.parentElement;
    if (!code || !wrapper || !gutterParent) return;

    pre.classList.remove("line-numbers");
    wrapper.classList.add("code-block-with-gutter");

    pre.querySelectorAll(".line-numbers-rows").forEach((rows) => {
      rows.remove();
    });

    wrapper.querySelectorAll(":scope > .custom-line-numbers").forEach((gutter) => {
      gutter.remove();
    });
    gutterParent
      .querySelectorAll(":scope > .custom-line-numbers")
      .forEach((gutter) => {
        gutter.remove();
      });

    const lineCount = Math.max(
      code.textContent.replace(/\n$/, "").split("\n").length,
      1
    );

    const gutter = document.createElement("div");
    gutter.className = "custom-line-numbers";
    gutter.setAttribute("aria-hidden", "true");
    gutter.innerHTML = Array.from(
      { length: lineCount },
      (_, index) => `<span>${index + 1}</span>`
    ).join("");

    pre.before(gutter);
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
