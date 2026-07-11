function getContactText(key) {
  const locale = getCurrentLocale();

  return (
    window.HUIHUI_I18N?.[locale]?.contact?.[key] ||
    window.HUIHUI_I18N?.zh?.contact?.[key] ||
    ""
  );
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

    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = getContactText("submitting");
    contactStatus.textContent = "";

    try {
      const response = await fetch(contactForm.action, {
        method: "POST",
        body: new FormData(contactForm),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.message || getContactText("error"));
      }

      contactForm.reset();

      if (window.turnstile) {
        window.turnstile.reset();
      }

      contactStatus.textContent = getContactText("success");
    } catch (error) {
      contactStatus.textContent = getContactText("error");
    } finally {
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
