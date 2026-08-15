(() => {
  "use strict";

  // ============================================================
  // GENERAL WEBSITE
  // ============================================================

  const header = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  const navLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
  const revealItems = document.querySelectorAll(".reveal");
  const year = document.getElementById("current-year");

  if (year) {
    year.textContent = new Date().getFullYear();
  }

  // ------------------------------------------------------------
  // Mobile navigation
  // ------------------------------------------------------------

  const closeNav = () => {
    if (!nav || !navToggle) return;

    nav.classList.remove("open");
    navToggle.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "Open navigation");
    document.body.classList.remove("nav-open");
  };

  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");

      navToggle.classList.toggle("open", isOpen);
      navToggle.setAttribute("aria-expanded", String(isOpen));
      navToggle.setAttribute(
        "aria-label",
        isOpen ? "Close navigation" : "Open navigation"
      );

      document.body.classList.toggle("nav-open", isOpen);
    });

    navLinks.forEach(link => {
      link.addEventListener("click", closeNav);
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeNav();
      }
    });
  }

  // ------------------------------------------------------------
  // Header scroll state
  // ------------------------------------------------------------

  const updateHeader = () => {
    if (!header) return;

    header.classList.toggle(
      "scrolled",
      window.scrollY > 18
    );
  };

  updateHeader();

  window.addEventListener(
    "scroll",
    updateHeader,
    { passive: true }
  );

  // ------------------------------------------------------------
  // Reduced motion
  // ------------------------------------------------------------

  const prefersReducedMotion =
    window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

  // ------------------------------------------------------------
  // Reveal animations
  // ------------------------------------------------------------

  if (
    prefersReducedMotion ||
    !("IntersectionObserver" in window)
  ) {
    revealItems.forEach(item => {
      item.classList.add("visible");
    });
  } else {
    const revealObserver =
      new IntersectionObserver(
        entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting) {
              entry.target.classList.add("visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        {
          threshold: 0.12,
          rootMargin: "0px 0px -45px 0px"
        }
      );

    revealItems.forEach(item => {
      revealObserver.observe(item);
    });
  }

  // ------------------------------------------------------------
  // Active navigation section
  // ------------------------------------------------------------

  const sections = navLinks
    .map(link => link.getAttribute("href"))
    .filter(
      href =>
        href &&
        href.startsWith("#") &&
        href.length > 1
    )
    .map(href =>
      document.getElementById(
        href.slice(1)
      )
    )
    .filter(Boolean);

  if (
    sections.length > 0 &&
    "IntersectionObserver" in window
  ) {
    const sectionObserver =
      new IntersectionObserver(
        entries => {
          const visible = entries
            .filter(
              entry =>
                entry.isIntersecting
            )
            .sort(
              (a, b) =>
                b.intersectionRatio -
                a.intersectionRatio
            );

          if (!visible.length) return;

          const activeId =
            visible[0].target.id;

          navLinks.forEach(link => {
            link.classList.toggle(
              "active",
              link.getAttribute("href") ===
                `#${activeId}`
            );
          });
        },
        {
          rootMargin:
            "-25% 0px -60% 0px",
          threshold: [
            0.01,
            0.2,
            0.5
          ]
        }
      );

    sections.forEach(section => {
      sectionObserver.observe(section);
    });
  }

  // ------------------------------------------------------------
  // Smooth scrolling
  // ------------------------------------------------------------

  document
    .querySelectorAll('a[href^="#"]')
    .forEach(anchor => {
      anchor.addEventListener(
        "click",
        event => {
          const targetId =
            anchor.getAttribute("href");

          if (
            !targetId ||
            targetId === "#"
          ) {
            return;
          }

          const target =
            document.querySelector(
              targetId
            );

          if (!target) return;

          event.preventDefault();

          target.scrollIntoView({
            behavior:
              prefersReducedMotion
                ? "auto"
                : "smooth",
            block:
              "start"
          });
        }
      );
    });

  // ============================================================
  // GENERAL-PURPOSE AI CHAT
  // ============================================================

  const chat =
    document.getElementById(
      "copilot-chat"
    );

  const form =
    document.getElementById(
      "copilot-preview-form"
    );

  const input =
    document.getElementById(
      "copilot-preview-input"
    );

  const submit =
    document.getElementById(
      "copilot-submit"
    );

  const languageButtons = [
    ...document.querySelectorAll(
      ".language-button"
    )
  ];

  const apiMeta =
    document.querySelector(
      'meta[name="wirelessai-api-url"]'
    );

  const API_URL = (
    window.WIRELESSAI_API_URL ||
    apiMeta?.content ||
    ""
  ).trim();

  const MAX_HISTORY_MESSAGES = 8;
  const MAX_INPUT_CHARACTERS = 6000;

  // Backend timeout is 180 seconds.
  // Browser timeout is slightly longer.
  const REQUEST_TIMEOUT_MS = 190000;

  let conversation = [];
  let busy = false;
  let selectedLanguage = "en";

  // ============================================================
  // LANGUAGE SELECTOR
  // ============================================================

  const updateLanguageUI =
    language => {
      selectedLanguage =
        language === "km"
          ? "km"
          : "en";

      languageButtons.forEach(
        button => {
          const isActive =
            button.dataset.language ===
            selectedLanguage;

          button.classList.toggle(
            "active",
            isActive
          );

          button.setAttribute(
            "aria-pressed",
            String(isActive)
          );
        }
      );

      if (input) {
        input.placeholder =
          selectedLanguage === "km"
            ? "សូមសួរសំណួររបស់អ្នក..."
            : "Start Chatting...";
      }

      if (submit && !busy) {
        submit.textContent =
          selectedLanguage === "km"
            ? "សួរ"
            : "Ask";
      }

      input?.focus();
    };

  languageButtons.forEach(
    button => {
      button.addEventListener(
        "click",
        () => {
          updateLanguageUI(
            button.dataset.language
          );
        }
      );
    }
  );

  // ============================================================
  // SAFE ANSWER FORMATTING
  // ============================================================

  const escapeHTML = value =>
    String(value)
      .replaceAll(
        "&",
        "&amp;"
      )
      .replaceAll(
        "<",
        "&lt;"
      )
      .replaceAll(
        ">",
        "&gt;"
      )
      .replaceAll(
        '"',
        "&quot;"
      )
      .replaceAll(
        "'",
        "&#039;"
      );

  const formatAnswer =
    value => {
      const text =
        String(value || "");

      if (
        window.marked &&
        typeof window.marked.parse ===
          "function" &&
        window.DOMPurify
      ) {
        try {
          const rendered =
            window.marked.parse(
              text,
              {
                gfm: true,
                breaks: true
              }
            );

          return (
            window.DOMPurify.sanitize(
              rendered
            )
          );
        } catch (error) {
          console.warn(
            "Markdown rendering failed:",
            error
          );
        }
      }

      return escapeHTML(text)
        .replace(
          /\n/g,
          "<br>"
        );
    };

  const secureLinks =
    container => {
      if (!container) return;

      container
        .querySelectorAll("a")
        .forEach(link => {
          const href =
            link.getAttribute(
              "href"
            ) || "";

          if (
            href.startsWith(
              "https://"
            ) ||
            href.startsWith(
              "http://"
            )
          ) {
            link.target =
              "_blank";

            link.rel =
              "noopener noreferrer";
          }
        });
    };

  // ============================================================
  // CHAT MESSAGE RENDERING
  // ============================================================

  const appendMessage = (
    role,
    text,
    { loading = false } = {}
  ) => {
    if (!chat) return null;

    const row =
      document.createElement(
        "div"
      );

    row.className =
      `chat-row ${
        role === "user"
          ? "user-row"
          : "assistant-row"
      }`;

    if (
      role === "assistant"
    ) {
      const avatar =
        document.createElement(
          "div"
        );

      avatar.className =
        "chat-avatar";

      avatar.textContent =
        "AI";

      row.appendChild(
        avatar
      );
    }

    const bubble =
      document.createElement(
        "div"
      );

    bubble.className =
      `chat-bubble ${
        role === "user"
          ? "user-bubble"
          : "assistant-bubble"
      }`;

    if (loading) {
      bubble.classList.add(
        "chat-loading"
      );

      bubble.textContent =
        selectedLanguage === "km"
          ? "កំពុងគិត..."
          : "Thinking…";
    } else if (
      role === "assistant"
    ) {
      bubble.innerHTML =
        formatAnswer(text);

      secureLinks(
        bubble
      );
    } else {
      bubble.textContent =
        text;
    }

    row.appendChild(
      bubble
    );

    chat.appendChild(
      row
    );

    chat.scrollTop =
      chat.scrollHeight;

    return row;
  };

  // ============================================================
  // BUSY STATE
  // ============================================================

  const setBusy =
    state => {
      busy = state;

      if (submit) {
        submit.disabled =
          state;

        submit.textContent =
          state
            ? (
                selectedLanguage === "km"
                  ? "កំពុងគិត..."
                  : "Thinking…"
              )
            : (
                selectedLanguage === "km"
                  ? "សួរ"
                  : "Ask"
              );
      }

      if (input) {
        input.disabled =
          state;
      }

      languageButtons.forEach(
        button => {
          button.disabled =
            state;
        }
      );
    };

  // ============================================================
  // INPUT CONFIGURATION
  // ============================================================

  if (input) {
    input.maxLength =
      MAX_INPUT_CHARACTERS;
  }

  updateLanguageUI("en");

  // ============================================================
  // FORM SUBMISSION
  // ============================================================

  if (
    form &&
    input &&
    chat
  ) {
    form.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        if (busy) return;

        const question =
          input.value.trim();

        if (!question) {
          input.focus();
          return;
        }

        if (
          question.length >
          MAX_INPUT_CHARACTERS
        ) {
          appendMessage(
            "assistant",
            selectedLanguage === "km"
              ? "សំណួររបស់អ្នកវែងពេក។ សូមបន្ថយប្រវែងសំណួរ។"
              : "Your question is too long. Please shorten it."
          );
          return;
        }

        if (!API_URL) {
          appendMessage(
            "user",
            question
          );

          appendMessage(
            "assistant",
            selectedLanguage === "km"
              ? "AI backend មិនទាន់ត្រូវបានកំណត់ទេ។"
              : "The AI backend URL is not configured."
          );

          return;
        }

        const historyForRequest =
          conversation.slice(
            -MAX_HISTORY_MESSAGES
          );

        appendMessage(
          "user",
          question
        );

        conversation.push({
          role: "user",
          content: question
        });

        input.value = "";

        setBusy(true);

        const loadingRow =
          appendMessage(
            "assistant",
            "",
            {
              loading: true
            }
          );

        const controller =
          new AbortController();

        const timeoutId =
          window.setTimeout(
            () =>
              controller.abort(),
            REQUEST_TIMEOUT_MS
          );

        try {
          const response =
            await fetch(
              API_URL,
              {
                method:
                  "POST",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body:
                  JSON.stringify({
                    message:
                      question,

                    history:
                      historyForRequest,

                    language:
                      selectedLanguage
                  }),

                signal:
                  controller.signal
              }
            );

          const payload =
            await response
              .json()
              .catch(
                () => ({})
              );

          if (!response.ok) {
            let message =
              payload.detail ||
              payload.error ||
              `HTTP ${response.status}`;

            if (
              response.status === 429
            ) {
              message =
                selectedLanguage === "km"
                  ? "មានសំណើច្រើនពេក។ សូមរង់ចាំបន្តិច ហើយសាកល្បងម្តងទៀត។"
                  : "Too many requests. Please wait a few minutes and try again.";
            } else if (
              response.status === 413
            ) {
              message =
                selectedLanguage === "km"
                  ? "សាររបស់អ្នកវែងពេក។"
                  : "Your message is too long.";
            } else if (
              response.status === 504
            ) {
              message =
                selectedLanguage === "km"
                  ? "AI ចំណាយពេលយូរពេកក្នុងការឆ្លើយតប។ សូមសាកល្បងម្តងទៀត។"
                  : "The AI model took too long to respond. Please try again.";
            }

            throw new Error(
              message
            );
          }

          const answer =
            String(
              payload.answer ||
              payload.message ||
              ""
            ).trim();

          if (!answer) {
            throw new Error(
              selectedLanguage === "km"
                ? "AI មិនបានផ្តល់ចម្លើយទេ។"
                : "The AI model returned an empty response."
            );
          }

          loadingRow?.remove();

          appendMessage(
            "assistant",
            answer
          );

          conversation.push({
            role:
              "assistant",

            content:
              answer
          });

          if (
            conversation.length >
            MAX_HISTORY_MESSAGES
          ) {
            conversation =
              conversation.slice(
                -MAX_HISTORY_MESSAGES
              );
          }
        } catch (error) {
          loadingRow?.remove();

          console.error(
            "AI Chat error:",
            error
          );

          let message =
            selectedLanguage === "km"
              ? "មិនអាចភ្ជាប់ទៅ AI backend បានទេ។"
              : "I could not reach the AI backend.";

          if (
            error &&
            error.name ===
              "AbortError"
          ) {
            message =
              selectedLanguage === "km"
                ? "សំណើបានផុតកំណត់ពេល។ សូមសាកល្បងម្តងទៀត។"
                : "The request timed out. Please try again.";
          } else if (
            error &&
            error.message
          ) {
            message =
              error.message;
          }

          appendMessage(
            "assistant",
            message
          );

          // Remove the unanswered user turn.
          if (
            conversation.length &&
            conversation[
              conversation.length - 1
            ].role === "user"
          ) {
            conversation.pop();
          }
        } finally {
          window.clearTimeout(
            timeoutId
          );

          setBusy(
            false
          );

          input.focus();
        }
      }
    );
  }

  // ============================================================
  // BACKEND HEALTH CHECK
  // ============================================================

  const checkBackendHealth =
    async () => {
      if (!API_URL) return;

      const healthURL =
        API_URL.replace(
          /\/api\/chat\/?$/,
          "/api/health"
        );

      try {
        const response =
          await fetch(
            healthURL,
            {
              method:
                "GET",

              cache:
                "no-store"
            }
          );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const payload =
          await response.json();

        console.info(
          "AI Chat backend:",
          payload
        );
      } catch (error) {
        console.warn(
          "AI Chat health check failed:",
          error
        );
      }
    };

  checkBackendHealth();
})();
