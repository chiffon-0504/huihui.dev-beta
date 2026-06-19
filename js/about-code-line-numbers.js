function setCodeRevealProgress(wrapper, progress) {
  const hiddenPercent = `${(1 - progress) * 100}%`;
  const clipPath = `inset(0 0 ${hiddenPercent} 0)`;
  const pre = wrapper.querySelector("pre");
  const code = wrapper.querySelector("code");
  const lineNumbers = wrapper.querySelector(".line-numbers-rows");
  const customLineNumbers = wrapper.querySelector(".custom-line-numbers");

  wrapper.style.setProperty("--code-reveal-progress", progress.toFixed(3));

  if (pre) {
    pre.style.position = "relative";
  }

  [code, lineNumbers, customLineNumbers].forEach((element) => {
    if (!element) return;
    element.style.clipPath = clipPath;
    element.style.transition = "clip-path 0.08s linear";
    element.style.willChange = "clip-path";
  });
}

function rebuildAboutCodeLineNumbers() {
  const blocks = document.querySelectorAll(".about-page .code-block pre.line-numbers, .about-page .code-block pre");

  blocks.forEach((pre) => {
    const code = pre.querySelector("code");
    const wrapper = pre.closest(".code-block");
    if (!code || !wrapper) return;

    pre.classList.remove("line-numbers");
    wrapper.classList.add("code-block-with-gutter");

    pre.querySelectorAll(".line-numbers-rows").forEach((rows) => {
      rows.remove();
    });

    wrapper.querySelectorAll(":scope > .custom-line-numbers").forEach((gutter) => {
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

    wrapper.insertBefore(gutter, pre);
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
