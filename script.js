(() => {
  "use strict";

  // ============================================================
  // General website behavior
  // ============================================================

  const header = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  const navLinks = [
    ...document.querySelectorAll('.site-nav a[href^="#"]')
  ];
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
  // Header styling on scroll
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
  // Reveal animations
  // ------------------------------------------------------------

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;

  if (
    prefersReducedMotion ||
    !("IntersectionObserver" in window)
  ) {
    revealItems.forEach(item => {
      item.classList.add("visible");
    });
  } else {
    const revealObserver = new IntersectionObserver(
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
  // Active navigation link
  // ------------------------------------------------------------

  const sectionIds = navLinks
    .map(link => link.getAttribute("href"))
    .filter(href => href && href.length > 1)
    .map(href => href.slice(1));

  const sections = sectionIds
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if (
    sections.length &&
    "IntersectionObserver" in window
  ) {
    const sectionObserver = new IntersectionObserver(
      entries => {
        const visibleEntries = entries
          .filter(entry => entry.isIntersecting)
          .sort(
            (a, b) =>
              b.intersectionRatio -
              a.intersectionRatio
          );

        if (!visibleEntries.length) return;

        const activeId =
          visibleEntries[0].target.id;

        navLinks.forEach(link => {
          link.classList.toggle(
            "active",
            link.getAttribute("href") ===
              `#${activeId}`
          );
        });
      },
      {
        rootMargin: "-25% 0px -60% 0px",
        threshold: [0.01, 0.2, 0.5]
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
            document.querySelector(targetId);

          if (!target) return;

          event.preventDefault();

          target.scrollIntoView({
            behavior:
              prefersReducedMotion
                ? "auto"
                : "smooth",
            block: "start"
          });
        }
      );
    });

  // ============================================================
  // WirelessAI Copilot
  // Ollama Cloud through secure Render backend
  // ============================================================

  const copilotInput =
    document.querySelector(
      "#copilot-preview-input"
    );

  const copilotForm =
    document.querySelector(
      "#copilot-preview-form"
    );

  const copilotNote =
    document.querySelector(
      "#copilot-preview-note"
    );

  const copilotChat =
    document.querySelector(
      "#copilot-chat"
    );

  const copilotSubmit =
    document.querySelector(
      "#copilot-submit"
    );

  const apiMeta =
    document.querySelector(
      'meta[name="wirelessai-api-url"]'
    );

  const COPILOT_API_URL = (
    window.WIRELESSAI_API_URL ||
    apiMeta?.content ||
    ""
  ).trim();

  // Short local conversation history
  const conversation = [];

  const MAX_HISTORY_MESSAGES = 8;

  // ------------------------------------------------------------
  // HTML safety
  // ------------------------------------------------------------

  const escapeHTML = value =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  // ------------------------------------------------------------
  // Format assistant answer
  // ------------------------------------------------------------

  const formatAnswer = value => {
    const markdown = String(value || "").trim();

    if (!markdown) {
      return "<p>No response returned.</p>";
    }

    // If Marked fails to load, safely fall back to plain text.
    if (!window.marked) {
      const safe = markdown
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");

      return `<p>${safe.replaceAll("\n", "<br>")}</p>`;
    }

    // Convert Markdown -> HTML
    const rendered = marked.parse(markdown, {
      gfm: true,
      breaks: true
    });

    // Sanitize generated HTML
    if (window.DOMPurify) {
      return DOMPurify.sanitize(rendered);
    }

    return rendered;
  };

  // ------------------------------------------------------------
  // Append message to chatbot
  // ------------------------------------------------------------

  const appendMessage = (
    role,
    text,
    { loading = false } = {}
  ) => {
    if (!copilotChat) return null;

    const row =
      document.createElement("div");

    row.className =
      `chat-row ${
        role === "user"
          ? "user-row"
          : "assistant-row"
      }`;

    if (role === "assistant") {
      const avatar =
        document.createElement("div");

      avatar.className =
        "chat-avatar";

      avatar.textContent = "AI";

      row.appendChild(avatar);
    }

    const bubble =
      document.createElement("div");

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
        "Thinking…";
    } else if (
      role === "assistant"
    ) {
      bubble.innerHTML =
        formatAnswer(text);
    } else {
      bubble.textContent = text;
    }

    row.appendChild(bubble);

    copilotChat.appendChild(row);

    copilotChat.scrollTop =
      copilotChat.scrollHeight;

    return row;
  };

  // ------------------------------------------------------------
  // Busy state
  // ------------------------------------------------------------

  const setBusy = busy => {
    if (copilotSubmit) {
      copilotSubmit.disabled = busy;

      copilotSubmit.textContent =
        busy
          ? "Thinking…"
          : "Ask";
    }

    if (copilotInput) {
      copilotInput.disabled = busy;
    }
  };

  // ------------------------------------------------------------
  // Prompt chips
  // ------------------------------------------------------------

  document
    .querySelectorAll(".prompt-chip")
    .forEach(chip => {
      chip.addEventListener(
        "click",
        () => {
          if (!copilotInput) return;

          copilotInput.value =
            chip.dataset.prompt ||
            chip.textContent.trim();

          copilotInput.focus();
        }
      );
    });

  // ------------------------------------------------------------
  // Chat submit
  // ------------------------------------------------------------

  if (copilotForm) {
    copilotForm.addEventListener(
      "submit",
      async event => {
        event.preventDefault();

        const question =
          copilotInput?.value.trim();

        if (!question) {
          copilotInput?.focus();
          return;
        }

        // ----------------------------------------
        // Backend URL missing
        // ----------------------------------------

        if (!COPILOT_API_URL) {
          appendMessage(
            "user",
            question
          );

          appendMessage(
            "assistant",
            "WirelessAI is not connected to the backend. Please configure the wirelessai-api-url meta tag in index.html."
          );

          if (copilotNote) {
            copilotNote.textContent =
              "Backend URL is not configured.";
          }

          return;
        }

        // ----------------------------------------
        // Show user question
        // ----------------------------------------

        appendMessage(
          "user",
          question
        );

        conversation.push({
          role: "user",
          content: question
        });

        if (copilotInput) {
          copilotInput.value = "";
        }

        setBusy(true);

        const loadingRow =
          appendMessage(
            "assistant",
            "",
            { loading: true }
          );

        // ----------------------------------------
        // Send question to backend
        // ----------------------------------------

        try {
          const response =
            await fetch(
              COPILOT_API_URL,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json"
                },

                body: JSON.stringify({
                  message: question,

                  history:
                    conversation.slice(
                      -MAX_HISTORY_MESSAGES
                    )
                })
              }
            );

          // --------------------------------------
          // Parse backend response
          // --------------------------------------

          const payload =
            await response
              .json()
              .catch(() => ({}));

          if (!response.ok) {
            throw new Error(
              payload.detail ||
              payload.error ||
              `HTTP ${response.status}`
            );
          }

          const answer =
            payload.answer ||
            payload.message ||
            "No answer was returned.";

          // --------------------------------------
          // Replace loading bubble
          // --------------------------------------

          loadingRow?.remove();

          appendMessage(
            "assistant",
            answer
          );

          // --------------------------------------
          // Save assistant response
          // --------------------------------------

          conversation.push({
            role: "assistant",
            content: answer
          });

          if (
            conversation.length >
            MAX_HISTORY_MESSAGES
          ) {
            conversation.splice(
              0,
              conversation.length -
                MAX_HISTORY_MESSAGES
            );
          }

          // --------------------------------------
          // Status message
          // --------------------------------------

          if (copilotNote) {
            const model =
              payload.model
                ? ` · ${payload.model}`
                : "";

            const provider =
              payload.provider
                ? ` · ${payload.provider}`
                : "";

            copilotNote.textContent =
              `Live${provider}${model}. API credentials remain securely on the server.`;
          }
        } catch (error) {
          // --------------------------------------
          // Request failure
          // --------------------------------------

          loadingRow?.remove();

          console.error(
            "WirelessAI error:",
            error
          );

          appendMessage(
            "assistant",
            `I could not reach the WirelessAI backend. ${error.message}`
          );

          if (copilotNote) {
            copilotNote.textContent =
              "Connection error — verify the Render backend URL, CORS settings, and Ollama configuration.";
          }
        } finally {
          setBusy(false);

          copilotInput?.focus();
        }
      }
    );
  }

  // ============================================================
  // Optional backend health check
  // ============================================================

  const checkBackendHealth =
    async () => {
      if (
        !COPILOT_API_URL ||
        !copilotNote
      ) {
        return;
      }

      try {
        const healthURL =
          COPILOT_API_URL.replace(
            /\/api\/chat\/?$/,
            "/api/health"
          );

        const response =
          await fetch(
            healthURL,
            {
              method: "GET"
            }
          );

        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          );
        }

        const payload =
          await response.json();

        if (
          payload.status === "ok"
        ) {
          const model =
            payload.model
              ? ` · ${payload.model}`
              : "";

          copilotNote.textContent =
            `WirelessAI online${model}.`;
        } else {
          copilotNote.textContent =
            "WirelessAI backend is online, but the Ollama API key may not be configured.";
        }
      } catch (error) {
        console.warn(
          "WirelessAI health check failed:",
          error
        );

        copilotNote.textContent =
          "WirelessAI backend is currently unavailable.";
      }
    };

  checkBackendHealth();

})();