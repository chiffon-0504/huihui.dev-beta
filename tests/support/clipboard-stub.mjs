export async function installClipboardStub(page, mode = "resolve") {
  await page.addInitScript((initialMode) => {
    const state = {
      mode: initialMode,
      pending: [],
      writes: [],
    };

    Object.defineProperty(window, "__copyClipboard", {
      configurable: true,
      value: state,
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText(text) {
          state.writes.push(text);

          if (state.mode === "reject") {
            return Promise.reject(
              new DOMException("Fixture rejection", "NotAllowedError"),
            );
          }

          if (state.mode === "pending") {
            return new Promise((resolve, reject) => {
              state.pending.push({ reject, resolve });
            });
          }

          return Promise.resolve();
        },
      },
    });
  }, mode);
}

export async function focusWithTab(page, target, maximumPresses = 30) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });

  for (let index = 0; index < maximumPresses; index += 1) {
    await page.keyboard.press("Tab");

    if (await target.evaluate((element) => document.activeElement === element)) {
      return;
    }
  }

  throw new Error("Target was not reached with keyboard Tab navigation");
}
