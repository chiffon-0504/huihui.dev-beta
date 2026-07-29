function getContactText(key) {
  const locale = getCurrentLocale();

  return (
    window.HUIHUI_I18N?.[locale]?.contact?.[key] ||
    window.HUIHUI_I18N?.zh?.contact?.[key] ||
    ""
  );
}

function resetContactTurnstile(contactForm) {
  try {
    if (typeof window.turnstile?.reset === "function") {
      window.turnstile.reset();
    }
  } catch (error) {
    // Keep the form usable if the external Turnstile API fails unexpectedly.
  }

  contactForm
    .querySelectorAll("[name='cf-turnstile-response']")
    .forEach((field) => {
      field.value = "";
    });
}

function initContactForm() {
  const contactForm = document.getElementById("contact-form");
  const contactStatus = document.getElementById("contact-status");

  if (!contactForm || !contactStatus) return;
  if (contactForm.dataset.contactInitialized === "true") return;

  const submitButton = contactForm.querySelector("button[type='submit']");

  if (!submitButton) return;

  let isSubmitting = false;
  contactForm.dataset.contactInitialized = "true";

  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    const formData = new FormData(contactForm);
    const turnstileToken = formData.get("cf-turnstile-response");

    if (
      typeof turnstileToken !== "string" ||
      turnstileToken.trim() === ""
    ) {
      contactStatus.textContent = getContactText("error");
      return;
    }

    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = getContactText("submitting");
    contactStatus.textContent = "";

    try {
      const response = await fetch(contactForm.action, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || getContactText("error"));
      }

      contactForm.reset();

      contactStatus.textContent = getContactText("success");
    } catch (error) {
      contactStatus.textContent = getContactText("error");
    } finally {
      resetContactTurnstile(contactForm);
      isSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = getContactText("submit");
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initContactForm);
} else {
  initContactForm();
}
