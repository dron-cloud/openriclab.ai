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

  const fileApiMeta =
    document.querySelector(
      'meta[name="wirelessai-file-api-url"]'
    );

  const FILE_API_URL = (
    window.WIRELESSAI_FILE_API_URL ||
    fileApiMeta?.content ||
    ""
  ).trim();

  const fileInput =
    document.getElementById(
      "copilot-file-input"
    );

  const fileButton =
    document.getElementById(
      "copilot-file-button"
    );

  const filePreview =
    document.getElementById(
      "copilot-file-preview"
    );

  const fileRemove =
    document.getElementById(
      "copilot-file-remove"
    );

  const fileName =
    document.getElementById(
      "copilot-file-name"
    );

  const fileSize =
    document.getElementById(
      "copilot-file-size"
    );

  const MAX_FILE_BYTES =
    10 * 1024 * 1024;

  let selectedFile = null;

  const MAX_HISTORY_MESSAGES = 8;
  const MAX_INPUT_CHARACTERS = 6000;

  // Streaming uses an idle timeout, not one absolute request timer.
  // Every progress event or response chunk resets the timer.
  const REQUEST_IDLE_TIMEOUT_MS = 190000;

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

      if (fileButton) {
        fileButton.disabled =
          state;
      }

      if (fileRemove) {
        fileRemove.disabled =
          state;
      }

      if (fileInput) {
        fileInput.disabled =
          state;
      }
    };

  // ============================================================
  // FILE UPLOAD UI
  // ============================================================

  const formatFileSize =
    bytes => {
      if (
        !Number.isFinite(bytes) ||
        bytes < 0
      ) {
        return "";
      }

      if (
        bytes < 1024
      ) {
        return `${bytes} B`;
      }

      if (
        bytes <
        1024 * 1024
      ) {
        return `${(
          bytes / 1024
        ).toFixed(1)} KB`;
      }

      return `${(
        bytes /
        (1024 * 1024)
      ).toFixed(2)} MB`;
    };

  const clearSelectedFile =
    () => {
      selectedFile = null;

      if (fileInput) {
        fileInput.value = "";
      }

      if (fileName) {
        fileName.textContent = "";
      }

      if (fileSize) {
        fileSize.textContent = "";
      }

      if (filePreview) {
        filePreview.hidden = true;
      }
    };

  const showSelectedFile =
    file => {
      if (!file) {
        clearSelectedFile();
        return;
      }

      selectedFile = file;

      if (fileName) {
        fileName.textContent =
          file.name;
      }

      if (fileSize) {
        fileSize.textContent =
          formatFileSize(
            file.size
          );
      }

      if (filePreview) {
        filePreview.hidden = false;
      }
    };

  fileButton?.addEventListener(
    "click",
    () => {
      if (busy) return;

      fileInput?.click();
    }
  );

  fileInput?.addEventListener(
    "change",
    () => {
      const file =
        fileInput.files?.[0];

      if (!file) {
        clearSelectedFile();
        return;
      }

      if (
        file.size >
        MAX_FILE_BYTES
      ) {
        clearSelectedFile();

        appendMessage(
          "assistant",
          selectedLanguage === "km"
            ? "ឯកសារធំពេក។ ទំហំអតិបរមាគឺ 10 MB។"
            : "The file is too large. Maximum size is 10 MB."
        );

        return;
      }

      showSelectedFile(
        file
      );

      input?.focus();
    }
  );

  fileRemove?.addEventListener(
    "click",
    () => {
      if (busy) return;

      clearSelectedFile();
      input?.focus();
    }
  );

  // ============================================================
  // INPUT CONFIGURATION
  // ============================================================

  if (input) {
    input.maxLength =
      MAX_INPUT_CHARACTERS;
  }

  updateLanguageUI("en");

  // ============================================================
  // FORM SUBMISSION — STREAMING FIRST + JSON FALLBACK
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

        const fileForRequest =
          selectedFile;

        const requestUrl =
          fileForRequest
            ? FILE_API_URL
            : API_URL;

        if (!requestUrl) {
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

        const requestLanguage =
          selectedLanguage;

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
            { loading: true }
          );

        const controller =
          new AbortController();

        let idleTimeoutId = null;

        const resetIdleTimeout = () => {
          if (idleTimeoutId) {
            window.clearTimeout(
              idleTimeoutId
            );
          }

          idleTimeoutId =
            window.setTimeout(
              () => controller.abort(),
              REQUEST_IDLE_TIMEOUT_MS
            );
        };

        resetIdleTimeout();

        let assistantRow = null;
        let assistantBubble = null;
        let answer = "";

        const ensureAssistantBubble = () => {
          if (assistantBubble) {
            return assistantBubble;
          }

          loadingRow?.remove();

          assistantRow =
            appendMessage(
              "assistant",
              ""
            );

          assistantBubble =
            assistantRow?.querySelector(
              ".assistant-bubble"
            ) || null;

          return assistantBubble;
        };

        const renderStreamingAnswer = () => {
          const bubble =
            ensureAssistantBubble();

          if (!bubble) return;

          bubble.innerHTML =
            formatAnswer(answer);

          secureLinks(bubble);

          chat.scrollTop =
            chat.scrollHeight;
        };

        const updateLoadingStage =
          stage => {
            const bubble =
              loadingRow?.querySelector(
                ".assistant-bubble"
              );

            if (!bubble) return;

            if (
              requestLanguage === "km"
            ) {
              if (
                stage ===
                "translating_question"
              ) {
                bubble.textContent =
                  "កំពុងបកប្រែសំណួរ...";
              } else if (
                stage ===
                "reasoning"
              ) {
                bubble.textContent =
                  "កំពុងគិត...";
              } else if (
                stage ===
                "translating_answer"
              ) {
                bubble.textContent =
                  "កំពុងរៀបចំចម្លើយជាភាសាខ្មែរ...";
              }
            } else {
              bubble.textContent =
                "Thinking…";
            }
          };

        const handleStreamEvent =
          eventPayload => {
            if (
              !eventPayload ||
              typeof eventPayload !== "object"
            ) {
              return;
            }

            resetIdleTimeout();

            if (
              eventPayload.type === "start"
            ) {
              return;
            }

            if (
              eventPayload.type === "status"
            ) {
              updateLoadingStage(
                eventPayload.stage
              );
              return;
            }

            if (
              eventPayload.type === "chunk"
            ) {
              const chunk =
                String(
                  eventPayload.content || ""
                );

              if (!chunk) return;

              answer += chunk;
              renderStreamingAnswer();
              return;
            }

            if (
              eventPayload.type === "error"
            ) {
              throw new Error(
                eventPayload.message ||
                  (
                    requestLanguage === "km"
                      ? "AI service មានបញ្ហា។ សូមសាកល្បងម្តងទៀត។"
                      : "The AI service encountered an error. Please try again."
                  )
              );
            }
          };

        const consumeNDJSON =
          async response => {
            if (
              !response.body ||
              typeof response.body.getReader !==
                "function"
            ) {
              throw new Error(
                requestLanguage === "km"
                  ? "កម្មវិធីរុករកនេះមិនគាំទ្រ AI streaming ទេ។"
                  : "This browser does not support AI streaming."
              );
            }

            const reader =
              response.body.getReader();

            const decoder =
              new TextDecoder("utf-8");

            let buffer = "";

            while (true) {
              const {
                value,
                done
              } = await reader.read();

              if (done) break;

              resetIdleTimeout();

              buffer +=
                decoder.decode(
                  value,
                  { stream: true }
                );

              const lines =
                buffer.split("\n");

              buffer =
                lines.pop() || "";

              for (
                const rawLine
                of lines
              ) {
                const line =
                  rawLine.trim();

                if (!line) continue;

                let payload;

                try {
                  payload =
                    JSON.parse(line);
                } catch (parseError) {
                  console.warn(
                    "Skipping invalid AI stream event:",
                    line,
                    parseError
                  );
                  continue;
                }

                handleStreamEvent(payload);
              }
            }

            buffer += decoder.decode();

            const finalLine =
              buffer.trim();

            if (finalLine) {
              try {
                handleStreamEvent(
                  JSON.parse(finalLine)
                );
              } catch (parseError) {
                if (
                  parseError instanceof SyntaxError
                ) {
                  console.warn(
                    "Ignoring incomplete final stream event:",
                    finalLine
                  );
                } else {
                  throw parseError;
                }
              }
            }
          };

        try {
          let response;

          if (fileForRequest) {
            const formData =
              new FormData();

            formData.append(
              "message",
              question
            );

            formData.append(
              "language",
              requestLanguage
            );

            formData.append(
              "file",
              fileForRequest,
              fileForRequest.name
            );

            response =
              await fetch(
                requestUrl,
                {
                  method:
                    "POST",

                  headers: {
                    "Accept":
                      "application/x-ndjson, application/json"
                  },

                  body:
                    formData,

                  signal:
                    controller.signal
                }
              );
          } else {
            response =
              await fetch(
                requestUrl,
                {
                  method:
                    "POST",

                  headers: {
                    "Content-Type":
                      "application/json",

                    "Accept":
                      "application/x-ndjson, application/json"
                  },

                  body:
                    JSON.stringify({
                      message:
                        question,

                      history:
                        historyForRequest,

                      language:
                        requestLanguage
                    }),

                  signal:
                    controller.signal
                }
              );
          }

          resetIdleTimeout();

          if (!response.ok) {
            const payload =
              await response
                .json()
                .catch(
                  () => ({})
                );

            let message =
              payload.detail ||
              payload.error ||
              `HTTP ${response.status}`;

            if (
              response.status === 429
            ) {
              message =
                requestLanguage === "km"
                  ? "មានសំណើច្រើនពេក។ សូមរង់ចាំបន្តិច ហើយសាកល្បងម្តងទៀត។"
                  : "Too many requests. Please wait a few minutes and try again.";
            } else if (
              response.status === 413
            ) {
              message =
                requestLanguage === "km"
                  ? "សាររបស់អ្នកវែងពេក។"
                  : "Your message is too long.";
            } else if (
              response.status === 415
            ) {
              message =
                payload.detail ||
                (
                  requestLanguage === "km"
                    ? "ប្រភេទឯកសារនេះមិនត្រូវបានគាំទ្រទេ។"
                    : "This file type is not supported."
                );
            } else if (
              response.status === 422
            ) {
              message =
                payload.detail ||
                (
                  requestLanguage === "km"
                    ? "មិនអាចអានខ្លឹមសារពីឯកសារនេះបានទេ។"
                    : "The uploaded file could not be read."
                );
            } else if (
              response.status === 504
            ) {
              message =
                requestLanguage === "km"
                  ? "AI ចំណាយពេលយូរពេកក្នុងការឆ្លើយតប។ សូមសាកល្បងម្តងទៀត។"
                  : "The AI model took too long to respond. Please try again.";
            }

            throw new Error(message);
          }

          const contentType =
            (
              response.headers.get(
                "content-type"
              ) || ""
            ).toLowerCase();

          // --------------------------------------------------
          // Preferred path: true streaming backend
          // --------------------------------------------------
          if (
            contentType.includes(
              "application/x-ndjson"
            ) ||
            contentType.includes(
              "application/ndjson"
            )
          ) {
            await consumeNDJSON(
              response
            );
          }

          // --------------------------------------------------
          // Compatibility fallback: older JSON backend
          // --------------------------------------------------
          else {
            const payload =
              await response.json();

            const fallbackAnswer =
              String(
                payload?.answer ||
                payload?.message ||
                ""
              ).trim();

            if (!fallbackAnswer) {
              throw new Error(
                requestLanguage === "km"
                  ? "AI មិនបានផ្តល់ចម្លើយទេ។"
                  : "The AI model returned an empty response."
              );
            }

            answer =
              fallbackAnswer;

            renderStreamingAnswer();
          }

          if (!answer.trim()) {
            throw new Error(
              requestLanguage === "km"
                ? "AI មិនបានផ្តល់ចម្លើយទេ។"
                : "The AI model returned an empty response."
            );
          }

          conversation.push({
            role: "assistant",
            content: answer
          });

          if (fileForRequest) {
            clearSelectedFile();
          }

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
          assistantRow?.remove();

          console.error(
            "AI Chat error:",
            error
          );

          let message =
            requestLanguage === "km"
              ? "មិនអាចភ្ជាប់ទៅ AI backend បានទេ។"
              : "I could not reach the AI backend.";

          if (
            error &&
            error.name === "AbortError"
          ) {
            message =
              requestLanguage === "km"
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

          if (
            conversation.length &&
            conversation[
              conversation.length - 1
            ].role === "user"
          ) {
            conversation.pop();
          }
        } finally {
          if (idleTimeoutId) {
            window.clearTimeout(
              idleTimeoutId
            );
          }

          setBusy(false);
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