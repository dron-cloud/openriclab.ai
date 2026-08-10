(() => {
  "use strict";

  const header = document.querySelector(".site-header");
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  const navLinks = [...document.querySelectorAll('.site-nav a[href^="#"]')];
  const revealItems = document.querySelectorAll(".reveal");
  const year = document.getElementById("current-year");

  if (year) year.textContent = new Date().getFullYear();

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
      navToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
      document.body.classList.toggle("nav-open", isOpen);
    });
    navLinks.forEach(link => link.addEventListener("click", closeNav));
    document.addEventListener("keydown", event => {
      if (event.key === "Escape") closeNav();
    });
  }

  const updateHeader = () => {
    if (!header) return;
    header.classList.toggle("scrolled", window.scrollY > 18);
  };
  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach(item => item.classList.add("visible"));
  } else {
    const revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -45px 0px" });
    revealItems.forEach(item => revealObserver.observe(item));
  }

  const sectionIds = navLinks
    .map(link => link.getAttribute("href"))
    .filter(href => href && href.length > 1)
    .map(href => href.slice(1));
  const sections = sectionIds.map(id => document.getElementById(id)).filter(Boolean);

  if (sections.length && "IntersectionObserver" in window) {
    const sectionObserver = new IntersectionObserver(entries => {
      const visibleEntries = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
      if (!visibleEntries.length) return;
      const activeId = visibleEntries[0].target.id;
      navLinks.forEach(link => {
        link.classList.toggle("active", link.getAttribute("href") === `#${activeId}`);
      });
    }, { rootMargin: "-25% 0px -60% 0px", threshold: [0.01, 0.2, 0.5] });
    sections.forEach(section => sectionObserver.observe(section));
  }

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", event => {
      const targetId = anchor.getAttribute("href");
      if (!targetId || targetId === "#") return;
      const target = document.querySelector(targetId);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
    });
  });

  // ------------------------------------------------------------
  // WirelessAI Copilot — Ollama Cloud via secure backend proxy
  // ------------------------------------------------------------
  const copilotInput = document.querySelector("#copilot-preview-input");
  const copilotForm = document.querySelector("#copilot-preview-form");
  const copilotNote = document.querySelector("#copilot-preview-note");
  const copilotChat = document.querySelector("#copilot-chat");
  const copilotSubmit = document.querySelector("#copilot-submit");
  const apiMeta = document.querySelector('meta[name="wirelessai-api-url"]');
  const COPILOT_API_URL = (window.WIRELESSAI_API_URL || apiMeta?.content || "").trim();

  // Keep a short conversation locally so follow-up questions have context.
  const conversation = [];
  const MAX_HISTORY_MESSAGES = 8;

  const escapeHTML = value => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const formatAnswer = value => {
    // Safe lightweight formatting: preserve paragraphs and line breaks without
    // injecting model-provided HTML into the page.
    const safe = escapeHTML(value || "");
    return safe
      .split(/\n{2,}/)
      .map(paragraph => `<p>${paragraph.replaceAll("\n", "<br>")}</p>`)
      .join("");
  };

  const appendMessage = (role, text, { loading = false } = {}) => {
    if (!copilotChat) return null;
    const row = document.createElement("div");
    row.className = `chat-row ${role === "user" ? "user-row" : "assistant-row"}`;
    if (role === "assistant") {
      const avatar = document.createElement("div");
      avatar.className = "chat-avatar";
      avatar.textContent = "AI";
      row.appendChild(avatar);
    }
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role === "user" ? "user-bubble" : "assistant-bubble"}`;
    if (loading) {
      bubble.classList.add("chat-loading");
      bubble.innerHTML = '<span></span><span></span><span></span>';
    } else if (role === "assistant") {
      bubble.innerHTML = formatAnswer(text);
    } else {
      bubble.textContent = text;
    }
    row.appendChild(bubble);
    copilotChat.appendChild(row);
    copilotChat.scrollTop = copilotChat.scrollHeight;
    return row;
  };

  const setBusy = busy => {
    if (copilotSubmit) {
      copilotSubmit.disabled = busy;
      copilotSubmit.textContent = busy ? "Thinking…" : "Ask";
    }
    if (copilotInput) copilotInput.disabled = busy;
  };

  document.querySelectorAll(".prompt-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      if (!copilotInput) return;
      copilotInput.value = chip.dataset.prompt || chip.textContent.trim();
      copilotInput.focus();
    });
  });

  if (copilotForm) {
    copilotForm.addEventListener("submit", async event => {
      event.preventDefault();
      const question = copilotInput?.value.trim();
      if (!question) {
        copilotInput?.focus();
        return;
      }

      if (!COPILOT_API_URL) {
        appendMessage("user", question);
        appendMessage(
          "assistant",
          "WirelessAI is not connected to the Ollama backend yet. Deploy backend/app.py, set OLLAMA_API_KEY on the server, then put the deployed /api/chat URL in the wirelessai-api-url meta tag in index.html."
        );
        if (copilotNote) {
          copilotNote.textContent = "Backend not configured — no request was sent to Ollama.";
        }
        return;
      }

      appendMessage("user", question);
      conversation.push({ role: "user", content: question });
      if (copilotInput) copilotInput.value = "";
      setBusy(true);
      const loadingRow = appendMessage("assistant", "", { loading: true });

      try {
        const response = await fetch(COPILOT_API_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: question,
            history: conversation.slice(-MAX_HISTORY_MESSAGES)
          })
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.detail || payload.error || `HTTP ${response.status}`);
        }

        const answer = payload.answer || payload.message || "No answer was returned.";
        loadingRow?.remove();
        appendMessage("assistant", answer);
        conversation.push({ role: "assistant", content: answer });
        if (conversation.length > MAX_HISTORY_MESSAGES) {
          conversation.splice(0, conversation.length - MAX_HISTORY_MESSAGES);
        }
        if (copilotNote) {
          const model = payload.model ? ` · ${payload.model}` : "";
          copilotNote.textContent = `Live via Ollama Cloud${model}. API credentials remain server-side.`;
        }
      } catch (error) {
        loadingRow?.remove();
        appendMessage("assistant", `I could not reach the WirelessAI backend. ${error.message}`);
        if (copilotNote) copilotNote.textContent = "Connection error — verify the backend URL, CORS origin, and OLLAMA_API_KEY environment variable.";
      } finally {
        setBusy(false);
        copilotInput?.focus();
      }
    });
  }
})();
