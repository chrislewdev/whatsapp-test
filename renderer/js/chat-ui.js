/**
 * WhatsApp Multi-Account Desktop App
 * Chat UI JavaScript
 *
 * Handles chat interface, message display, and real-time messaging features
 */

class ChatUI {
  constructor(app) {
    this.app = app;
    this.currentMessages = new Map(); // chatId -> messages array
    this.messageObserver = null;
    this.typingTimeout = null;
    this.lastMessageId = null;

    this.init();
  }

  /**
   * Initialize chat UI features
   */
  init() {
    this.setupMessageDisplay();
    this.setupMessageInput();
    this.setupChatActions();
    this.setupFileHandling();
    this.setupMessageContextMenu();
    console.log("ChatUI initialized");
  }

  /**
   * Setup message display features
   */
  setupMessageDisplay() {
    // Setup auto-scroll on new messages
    this.setupAutoScroll();

    // Setup message status updates
    this.setupMessageStatusUpdates();

    // Setup message grouping by date
    this.setupMessageGrouping();
  }

  /**
   * Setup auto-scroll behavior
   */
  setupAutoScroll() {
    const messagesContainer = this.app.elements.messagesContainer;
    if (!messagesContainer) return;

    // Track if user is at bottom
    let isAtBottom = true;

    messagesContainer.addEventListener("scroll", () => {
      const { scrollTop, scrollHeight, clientHeight } = messagesContainer;
      isAtBottom = scrollTop + clientHeight >= scrollHeight - 10;
    });

    // Auto-scroll on new messages if user is at bottom
    this.originalAddMessage = this.app.addMessageToUI.bind(this.app);
    this.app.addMessageToUI = (messageText, isSent = false) => {
      this.originalAddMessage(messageText, isSent);

      if (isAtBottom || isSent) {
        setTimeout(() => {
          messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 0);
      } else {
        // Show "new messages" indicator
        this.showNewMessagesIndicator();
      }
    };
  }

  /**
   * Show new messages indicator
   */
  showNewMessagesIndicator() {
    const messagesContainer = this.app.elements.messagesContainer;
    if (!messagesContainer) return;

    // Remove existing indicator
    const existing = messagesContainer.querySelector(".new-messages-indicator");
    if (existing) existing.remove();

    // Create new indicator
    const indicator = document.createElement("div");
    indicator.className = "new-messages-indicator";
    indicator.innerHTML = `
      <button class="new-messages-btn">
        <span>↓</span> New messages
      </button>
    `;

    // Add click handler
    indicator
      .querySelector(".new-messages-btn")
      .addEventListener("click", () => {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        indicator.remove();
      });

    messagesContainer.appendChild(indicator);
  }

  /**
   * Setup enhanced message input features
   */
  setupMessageInput() {
    const messageInput = this.app.elements.messageInput;
    if (!messageInput) return;

    // Setup emoji picker
    this.setupEmojiPicker();

    // Setup message formatting
    this.setupMessageFormatting();

    // Setup typing indicators
    this.setupTypingIndicators();

    // Setup mention detection
    this.setupMentionDetection();

    // Setup draft saving
    this.setupDraftSaving();
  }

  /**
   * Setup emoji picker
   */
  setupEmojiPicker() {
    const emojiBtn = document.getElementById("emojiBtn");
    if (!emojiBtn) return;

    // Create emoji picker
    const emojiPicker = document.createElement("div");
    emojiPicker.className = "emoji-picker hidden";
    emojiPicker.innerHTML = this.createEmojiPickerHTML();

    document.body.appendChild(emojiPicker);

    // Toggle emoji picker
    emojiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleEmojiPicker(emojiPicker, emojiBtn);
    });

    // Close on outside click
    document.addEventListener("click", (e) => {
      if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.classList.add("hidden");
      }
    });

    // Handle emoji selection
    emojiPicker.addEventListener("click", (e) => {
      const emoji = e.target.closest(".emoji-item");
      if (emoji) {
        this.insertEmoji(emoji.textContent);
        emojiPicker.classList.add("hidden");
      }
    });
  }

  /**
   * Create emoji picker HTML
   */
  createEmojiPickerHTML() {
    const emojiCategories = {
      Smileys: [
        "😀",
        "😃",
        "😄",
        "😁",
        "😆",
        "😅",
        "😂",
        "🤣",
        "😊",
        "😇",
        "🙂",
        "🙃",
        "😉",
        "😌",
        "😍",
        "🥰",
        "😘",
        "😗",
        "😙",
        "😚",
        "😋",
        "😛",
        "😝",
        "😜",
        "🤪",
        "🤨",
        "🧐",
        "🤓",
        "😎",
        "🤩",
      ],
      "Hand gestures": [
        "👋",
        "🤚",
        "🖐️",
        "✋",
        "🖖",
        "👌",
        "🤏",
        "✌️",
        "🤞",
        "🤟",
        "🤘",
        "🤙",
        "👈",
        "👉",
        "👆",
        "🖕",
        "👇",
        "☝️",
        "👍",
        "👎",
        "👊",
        "✊",
        "🤛",
        "🤜",
        "👏",
        "🙌",
        "👐",
        "🤲",
        "🤝",
        "🙏",
      ],
      Hearts: [
        "❤️",
        "🧡",
        "💛",
        "💚",
        "💙",
        "💜",
        "🖤",
        "🤍",
        "🤎",
        "💔",
        "❣️",
        "💕",
        "💞",
        "💓",
        "💗",
        "💖",
        "💘",
        "💝",
        "💟",
      ],
    };

    let html = '<div class="emoji-picker-tabs">';
    Object.keys(emojiCategories).forEach((category, index) => {
      html += `<button class="emoji-tab ${
        index === 0 ? "active" : ""
      }" data-category="${category}">${category}</button>`;
    });
    html += "</div>";

    html += '<div class="emoji-picker-content">';
    Object.entries(emojiCategories).forEach(([category, emojis], index) => {
      html += `<div class="emoji-category ${
        index === 0 ? "active" : ""
      }" data-category="${category}">`;
      emojis.forEach((emoji) => {
        html += `<span class="emoji-item">${emoji}</span>`;
      });
      html += "</div>";
    });
    html += "</div>";

    return html;
  }

  /**
   * Toggle emoji picker
   */
  toggleEmojiPicker(picker, button) {
    const isHidden = picker.classList.contains("hidden");

    if (isHidden) {
      // Position picker above button
      const buttonRect = button.getBoundingClientRect();
      picker.style.position = "fixed";
      picker.style.bottom = window.innerHeight - buttonRect.top + 10 + "px";
      picker.style.right = window.innerWidth - buttonRect.right + "px";
      picker.classList.remove("hidden");
    } else {
      picker.classList.add("hidden");
    }
  }

  /**
   * Insert emoji at cursor position
   */
  insertEmoji(emoji) {
    const messageInput = this.app.elements.messageInput;
    if (!messageInput) return;

    const cursorPos = messageInput.selectionStart;
    const textBefore = messageInput.value.substring(0, cursorPos);
    const textAfter = messageInput.value.substring(messageInput.selectionEnd);

    messageInput.value = textBefore + emoji + textAfter;
    messageInput.focus();

    // Set cursor position after emoji
    const newPos = cursorPos + emoji.length;
    messageInput.setSelectionRange(newPos, newPos);

    // Trigger input event for auto-resize
    messageInput.dispatchEvent(new Event("input"));
  }

  /**
   * Setup message formatting (bold, italic, etc.)
   */
  setupMessageFormatting() {
    const messageInput = this.app.elements.messageInput;
    if (!messageInput) return;

    messageInput.addEventListener("keydown", (e) => {
      // Ctrl/Cmd + B for bold
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        this.formatText("*", "*");
      }

      // Ctrl/Cmd + I for italic
      if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        this.formatText("_", "_");
      }

      // Ctrl/Cmd + Shift + X for strikethrough
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "X") {
        e.preventDefault();
        this.formatText("~", "~");
      }
    });
  }

  /**
   * Format selected text
   */
  formatText(startChar, endChar) {
    const messageInput = this.app.elements.messageInput;
    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;

    if (start === end) return; // No selection

    const selectedText = messageInput.value.substring(start, end);
    const formattedText = startChar + selectedText + endChar;

    const textBefore = messageInput.value.substring(0, start);
    const textAfter = messageInput.value.substring(end);

    messageInput.value = textBefore + formattedText + textAfter;

    // Update selection
    messageInput.setSelectionRange(start, start + formattedText.length);
    messageInput.focus();
  }

  /**
   * Setup typing indicators
   */
  setupTypingIndicators() {
    const messageInput = this.app.elements.messageInput;
    if (!messageInput) return;

    messageInput.addEventListener("input", () => {
      // Clear existing timeout
      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }

      // Show typing indicator (simplified - would send to backend)
      this.showTypingIndicator(true);

      // Hide after 3 seconds of no typing
      this.typingTimeout = setTimeout(() => {
        this.showTypingIndicator(false);
      }, 3000);
    });
  }

  /**
   * Show/hide typing indicator
   */
  showTypingIndicator(show) {
    // This would typically send typing status to backend
    // For now, just update UI state
    const chatHeader = this.app.elements.chatHeader;
    if (!chatHeader) return;

    const statusElement = chatHeader.querySelector(".contact-status");
    if (!statusElement) return;

    if (show && this.app.currentChat) {
      statusElement.textContent = "typing...";
      statusElement.classList.add("typing");
    } else {
      statusElement.textContent = "Click to view contact info";
      statusElement.classList.remove("typing");
    }
  }

  /**
   * Setup mention detection (@username)
   */
  setupMentionDetection() {
    const messageInput = this.app.elements.messageInput;
    if (!messageInput) return;

    messageInput.addEventListener("input", (e) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart;

      // Find @ symbol before cursor
      const textBeforeCursor = value.substring(0, cursorPos);
      const atMatch = textBeforeCursor.match(/@(\w*)$/);

      if (atMatch) {
        const searchTerm = atMatch[1];
        this.showMentionSuggestions(searchTerm, cursorPos - atMatch[0].length);
      } else {
        this.hideMentionSuggestions();
      }
    });
  }

  /**
   * Show mention suggestions
   */
  showMentionSuggestions(searchTerm, position) {
    // Simplified - would query contacts from backend
    const suggestions = ["Alice", "Bob", "Charlie"].filter((name) =>
      name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (suggestions.length === 0) {
      this.hideMentionSuggestions();
      return;
    }

    // Create or update suggestions dropdown
    let dropdown = document.querySelector(".mention-suggestions");
    if (!dropdown) {
      dropdown = document.createElement("div");
      dropdown.className = "mention-suggestions";
      document.body.appendChild(dropdown);
    }

    dropdown.innerHTML = suggestions
      .map((name) => `<div class="mention-item">${name}</div>`)
      .join("");

    // Position dropdown
    const messageInput = this.app.elements.messageInput;
    const rect = messageInput.getBoundingClientRect();
    dropdown.style.position = "fixed";
    dropdown.style.left = rect.left + "px";
    dropdown.style.bottom = window.innerHeight - rect.top + 5 + "px";
    dropdown.classList.remove("hidden");

    // Handle selection
    dropdown.onclick = (e) => {
      const item = e.target.closest(".mention-item");
      if (item) {
        this.insertMention(item.textContent, position);
        this.hideMentionSuggestions();
      }
    };
  }

  /**
   * Insert mention
   */
  insertMention(name, position) {
    const messageInput = this.app.elements.messageInput;
    const value = messageInput.value;

    // Find the @ and replace with full mention
    const beforeAt = value.substring(0, position);
    const afterCursor = value.substring(messageInput.selectionStart);

    messageInput.value = beforeAt + "@" + name + " " + afterCursor;

    // Set cursor after mention
    const newPos = position + name.length + 2;
    messageInput.setSelectionRange(newPos, newPos);
    messageInput.focus();
  }

  /**
   * Hide mention suggestions
   */
  hideMentionSuggestions() {
    const dropdown = document.querySelector(".mention-suggestions");
    if (dropdown) {
      dropdown.classList.add("hidden");
    }
  }

  /**
   * Setup draft saving
   */
  setupDraftSaving() {
    const messageInput = this.app.elements.messageInput;
    if (!messageInput) return;

    // Save draft on input
    messageInput.addEventListener("input", () => {
      if (this.app.currentChat && messageInput.value.trim()) {
        localStorage.setItem(
          `draft_${this.app.currentChat}`,
          messageInput.value
        );
      }
    });

    // Load draft when switching chats
    const originalSelectChat = this.app.selectChat.bind(this.app);
    this.app.selectChat = (chatId) => {
      // Save current draft
      if (this.app.currentChat && messageInput.value.trim()) {
        localStorage.setItem(
          `draft_${this.app.currentChat}`,
          messageInput.value
        );
      }

      // Call original method
      originalSelectChat(chatId);

      // Load draft for new chat
      const draft = localStorage.getItem(`draft_${chatId}`);
      if (draft) {
        messageInput.value = draft;
        this.app.adjustMessageInputHeight();
      } else {
        messageInput.value = "";
      }
    };
  }

  /**
   * Setup chat action buttons
   */
  setupChatActions() {
    // Voice call button
    const voiceCallBtn = document.getElementById("voiceCallBtn");
    voiceCallBtn?.addEventListener("click", () => {
      this.app.showNotification("Voice calls not yet implemented", "info");
    });

    // Video call button
    const videoCallBtn = document.getElementById("videoCallBtn");
    videoCallBtn?.addEventListener("click", () => {
      this.app.showNotification("Video calls not yet implemented", "info");
    });

    // Chat menu button
    const chatMenuBtn = document.getElementById("chatMenuBtn");
    chatMenuBtn?.addEventListener("click", (e) => {
      this.showChatMenu(e);
    });
  }

  /**
   * Show chat menu
   */
  showChatMenu(event) {
    if (!this.app.currentChat) return;

    const menu = document.createElement("div");
    menu.className = "context-menu";
    menu.innerHTML = `
      <div class="context-menu-item" data-action="search">
        <span>🔍</span> Search in chat
      </div>
      <div class="context-menu-item" data-action="media">
        <span>📎</span> View media
      </div>
      <div class="context-menu-item" data-action="clear">
        <span>🗑️</span> Clear chat
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="mute">
        <span>🔕</span> Mute notifications
      </div>
      <div class="context-menu-item danger" data-action="block">
        <span>🚫</span> Block contact
      </div>
    `;

    // Position menu
    menu.style.position = "fixed";
    menu.style.left = event.pageX + "px";
    menu.style.top = event.pageY + "px";
    document.body.appendChild(menu);

    // Handle menu actions
    menu.addEventListener("click", (e) => {
      const action = e.target.closest(".context-menu-item")?.dataset.action;
      if (action) {
        this.handleChatMenuAction(action);
        menu.remove();
      }
    });

    // Remove on outside click
    setTimeout(() => {
      document.addEventListener("click", function removeMenu(e) {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener("click", removeMenu);
        }
      });
    }, 0);
  }

  /**
   * Handle chat menu actions
   */
  handleChatMenuAction(action) {
    switch (action) {
      case "search":
        this.showChatSearch();
        break;
      case "media":
        this.app.showNotification("Media view not yet implemented", "info");
        break;
      case "clear":
        this.clearChatHistory();
        break;
      case "mute":
        this.app.showNotification(
          "Mute notifications not yet implemented",
          "info"
        );
        break;
      case "block":
        this.app.showNotification("Block contact not yet implemented", "info");
        break;
    }
  }

  /**
   * Show chat search
   */
  showChatSearch() {
    const chatHeader = this.app.elements.chatHeader;
    if (!chatHeader) return;

    // Create search bar
    const searchBar = document.createElement("div");
    searchBar.className = "chat-search-bar";
    searchBar.innerHTML = `
      <input type="text" placeholder="Search messages..." class="chat-search-input">
      <button class="chat-search-close">×</button>
    `;

    chatHeader.appendChild(searchBar);

    const searchInput = searchBar.querySelector(".chat-search-input");
    const closeBtn = searchBar.querySelector(".chat-search-close");

    // Focus search input
    searchInput.focus();

    // Handle search
    searchInput.addEventListener("input", (e) => {
      this.highlightMessages(e.target.value);
    });

    // Handle close
    closeBtn.addEventListener("click", () => {
      this.clearMessageHighlights();
      searchBar.remove();
    });

    // Close on escape
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.clearMessageHighlights();
        searchBar.remove();
      }
    });
  }

  /**
   * Highlight messages containing search term
   */
  highlightMessages(searchTerm) {
    const messages = document.querySelectorAll(".message-content");

    messages.forEach((message) => {
      const text = message.textContent;
      message.innerHTML = text; // Reset

      if (searchTerm && text.toLowerCase().includes(searchTerm.toLowerCase())) {
        const regex = new RegExp(`(${searchTerm})`, "gi");
        message.innerHTML = text.replace(regex, "<mark>$1</mark>");
        message.closest(".message").classList.add("search-match");
      } else {
        message.closest(".message").classList.remove("search-match");
      }
    });
  }

  /**
   * Clear message highlights
   */
  clearMessageHighlights() {
    const messages = document.querySelectorAll(".message-content");
    messages.forEach((message) => {
      message.innerHTML = message.textContent;
      message.closest(".message").classList.remove("search-match");
    });
  }

  /**
   * Clear chat history
   */
  clearChatHistory() {
    if (!this.app.currentChat) return;

    const confirmed = confirm(
      "Clear all messages in this chat?\n\nThis action cannot be undone."
    );
    if (!confirmed) return;

    const chatMessages = document.getElementById("chatMessages");
    if (chatMessages) {
      chatMessages.innerHTML = `
        <div class="message system">
          <div class="message-bubble">
            <div class="message-content">Chat cleared</div>
            <div class="message-time">${utils.formatTime(Date.now())}</div>
          </div>
        </div>
      `;
    }

    // Clear local message cache
    this.currentMessages.delete(this.app.currentChat);

    this.app.showNotification("Chat history cleared", "info");
  }

  /**
   * Setup file handling (drag & drop, paste)
   */
  setupFileHandling() {
    const messagesContainer = this.app.elements.messagesContainer;
    const messageInput = this.app.elements.messageInput;

    if (!messagesContainer || !messageInput) return;

    // Setup drag and drop
    messagesContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      messagesContainer.classList.add("drag-over");
    });

    messagesContainer.addEventListener("dragleave", (e) => {
      if (!messagesContainer.contains(e.relatedTarget)) {
        messagesContainer.classList.remove("drag-over");
      }
    });

    messagesContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      messagesContainer.classList.remove("drag-over");

      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        this.handleFileUpload(files);
      }
    });

    // Setup paste handling
    messageInput.addEventListener("paste", (e) => {
      const items = Array.from(e.clipboardData.items);
      const files = items
        .filter((item) => item.kind === "file")
        .map((item) => item.getAsFile());

      if (files.length > 0) {
        e.preventDefault();
        this.handleFileUpload(files);
      }
    });

    // Attach button
    const attachBtn = document.getElementById("attachBtn");
    attachBtn?.addEventListener("click", () => {
      this.showAttachmentMenu();
    });
  }

  /**
   * Handle file upload
   */
  async handleFileUpload(files) {
    for (const file of files) {
      try {
        // Validate file
        if (file.size > 16 * 1024 * 1024) {
          // 16MB limit
          this.app.showNotification(
            `File "${file.name}" is too large (max 16MB)`,
            "error"
          );
          continue;
        }

        // Show upload progress
        this.showFileUploadProgress(file);

        // TODO: Implement actual file upload to backend
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Simulate upload

        // Add file message to UI
        this.addFileMessageToUI(file);

        this.app.showNotification(
          `File "${file.name}" sent successfully`,
          "info"
        );
      } catch (error) {
        console.error("File upload error:", error);
        this.app.showNotification(
          `Failed to send file "${file.name}"`,
          "error"
        );
      }
    }
  }

  /**
   * Show file upload progress
   */
  showFileUploadProgress(file) {
    const progressDiv = document.createElement("div");
    progressDiv.className = "file-upload-progress";
    progressDiv.innerHTML = `
      <div class="upload-info">
        <span class="file-name">${file.name}</span>
        <span class="file-size">${this.formatFileSize(file.size)}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%"></div>
      </div>
    `;

    const messagesContainer = this.app.elements.messagesContainer;
    messagesContainer.appendChild(progressDiv);

    // Simulate progress
    let progress = 0;
    const progressFill = progressDiv.querySelector(".progress-fill");
    const interval = setInterval(() => {
      progress += 20;
      progressFill.style.width = progress + "%";

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => progressDiv.remove(), 500);
      }
    }, 200);
  }

  /**
   * Add file message to UI
   */
  addFileMessageToUI(file) {
    const chatMessages = document.getElementById("chatMessages");
    if (!chatMessages) return;

    const isImage = file.type.startsWith("image/");
    const fileUrl = URL.createObjectURL(file);

    const messageDiv = document.createElement("div");
    messageDiv.className = "message sent file-message";

    if (isImage) {
      messageDiv.innerHTML = `
        <div class="message-bubble">
          <div class="message-content">
            <img src="${fileUrl}" alt="${
        file.name
      }" class="message-image" style="max-width: 200px; border-radius: 8px;">
          </div>
          <div class="message-time">${utils.formatTime(Date.now())}</div>
        </div>
      `;
    } else {
      messageDiv.innerHTML = `
        <div class="message-bubble">
          <div class="message-content file-attachment">
            <div class="file-icon">📄</div>
            <div class="file-info">
              <div class="file-name">${file.name}</div>
              <div class="file-size">${this.formatFileSize(file.size)}</div>
            </div>
            <button class="file-download" onclick="this.parentElement.querySelector('a').click()">
              <a href="${fileUrl}" download="${
        file.name
      }" style="display: none;"></a>
              ⬇️
            </button>
          </div>
          <div class="message-time">${utils.formatTime(Date.now())}</div>
        </div>
      `;
    }

    chatMessages.appendChild(messageDiv);
    this.app.elements.messagesContainer.scrollTop =
      this.app.elements.messagesContainer.scrollHeight;
  }

  /**
   * Format file size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Show attachment menu
   */
  showAttachmentMenu() {
    const menu = document.createElement("div");
    menu.className = "attachment-menu";
    menu.innerHTML = `
      <div class="attachment-option" data-type="image">
        <span class="attachment-icon">🖼️</span>
        <span class="attachment-label">Photo</span>
        <input type="file" accept="image/*" multiple style="display: none;">
      </div>
      <div class="attachment-option" data-type="document">
        <span class="attachment-icon">📄</span>
        <span class="attachment-label">Document</span>
        <input type="file" multiple style="display: none;">
      </div>
      <div class="attachment-option" data-type="camera">
        <span class="attachment-icon">📷</span>
        <span class="attachment-label">Camera</span>
      </div>
    `;

    // Position menu
    const attachBtn = document.getElementById("attachBtn");
    const rect = attachBtn.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.bottom = window.innerHeight - rect.top + 10 + "px";
    menu.style.left = rect.left + "px";

    document.body.appendChild(menu);

    // Handle option clicks
    menu.addEventListener("click", (e) => {
      const option = e.target.closest(".attachment-option");
      if (!option) return;

      const type = option.dataset.type;
      const fileInput = option.querySelector('input[type="file"]');

      if (fileInput) {
        fileInput.click();
        fileInput.addEventListener("change", (e) => {
          const files = Array.from(e.target.files);
          if (files.length > 0) {
            this.handleFileUpload(files);
          }
        });
      } else if (type === "camera") {
        this.app.showNotification("Camera feature not yet implemented", "info");
      }

      menu.remove();
    });

    // Remove on outside click
    setTimeout(() => {
      document.addEventListener("click", function removeMenu(e) {
        if (!menu.contains(e.target) && e.target !== attachBtn) {
          menu.remove();
          document.removeEventListener("click", removeMenu);
        }
      });
    }, 0);
  }

  /**
   * Setup message context menu
   */
  setupMessageContextMenu() {
    const messagesContainer = this.app.elements.messagesContainer;
    if (!messagesContainer) return;

    messagesContainer.addEventListener("contextmenu", (e) => {
      const message = e.target.closest(".message");
      if (message) {
        e.preventDefault();
        this.showMessageContextMenu(e, message);
      }
    });
  }

  /**
   * Show message context menu
   */
  showMessageContextMenu(event, message) {
    const menu = document.createElement("div");
    menu.className = "context-menu";

    const isSent = message.classList.contains("sent");

    menu.innerHTML = `
      <div class="context-menu-item" data-action="copy">
        <span>📋</span> Copy text
      </div>
      <div class="context-menu-item" data-action="reply">
        <span>↩️</span> Reply
      </div>
      <div class="context-menu-item" data-action="forward">
        <span>↗️</span> Forward
      </div>
      ${
        isSent
          ? `
        <div class="context-menu-divider"></div>
        <div class="context-menu-item danger" data-action="delete">
          <span>🗑️</span> Delete
        </div>
      `
          : ""
      }
    `;

    // Position menu
    menu.style.position = "fixed";
    menu.style.left = event.pageX + "px";
    menu.style.top = event.pageY + "px";
    document.body.appendChild(menu);

    // Handle actions
    menu.addEventListener("click", (e) => {
      const action = e.target.closest(".context-menu-item")?.dataset.action;
      if (action) {
        this.handleMessageContextAction(action, message);
        menu.remove();
      }
    });

    // Remove on outside click
    setTimeout(() => {
      document.addEventListener("click", function removeMenu(e) {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener("click", removeMenu);
        }
      });
    }, 0);
  }

  /**
   * Handle message context actions
   */
  handleMessageContextAction(action, message) {
    const messageContent =
      message.querySelector(".message-content")?.textContent;

    switch (action) {
      case "copy":
        if (messageContent) {
          navigator.clipboard.writeText(messageContent);
          this.app.showNotification("Message copied to clipboard", "info");
        }
        break;

      case "reply":
        this.replyToMessage(message);
        break;

      case "forward":
        this.app.showNotification(
          "Forward message not yet implemented",
          "info"
        );
        break;

      case "delete":
        this.deleteMessage(message);
        break;
    }
  }

  /**
   * Reply to message
   */
  replyToMessage(message) {
    const messageInput = this.app.elements.messageInput;
    if (!messageInput) return;

    const messageContent =
      message.querySelector(".message-content")?.textContent;
    const isReceived = message.classList.contains("received");
    const sender = isReceived ? "Contact" : "You";

    // Create reply preview
    const replyPreview = document.createElement("div");
    replyPreview.className = "reply-preview";
    replyPreview.innerHTML = `
      <div class="reply-content">
        <div class="reply-sender">${sender}</div>
        <div class="reply-text">${messageContent?.substring(0, 50)}${
      messageContent?.length > 50 ? "..." : ""
    }</div>
      </div>
      <button class="reply-cancel">×</button>
    `;

    // Insert before message input
    const inputArea = this.app.elements.messageInputArea;
    inputArea.insertBefore(replyPreview, inputArea.firstChild);

    // Handle cancel
    replyPreview
      .querySelector(".reply-cancel")
      .addEventListener("click", () => {
        replyPreview.remove();
      });

    // Focus input
    messageInput.focus();
  }

  /**
   * Delete message
   */
  deleteMessage(message) {
    const confirmed = confirm(
      "Delete this message?\n\nThis action cannot be undone."
    );
    if (!confirmed) return;

    message.remove();
    this.app.showNotification("Message deleted", "info");
  }

  /**
   * Setup message status updates
   */
  setupMessageStatusUpdates() {
    // This would integrate with backend to show message delivery status
    // For now, just simulate status updates
    this.simulateMessageStatus();
  }

  /**
   * Simulate message status updates
   */
  simulateMessageStatus() {
    // Add status indicators to sent messages
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (
            node.nodeType === 1 &&
            node.classList?.contains("message") &&
            node.classList?.contains("sent")
          ) {
            this.addMessageStatus(node);
          }
        });
      });
    });

    const chatMessages = document.getElementById("chatMessages");
    if (chatMessages) {
      observer.observe(chatMessages, { childList: true });
    }
  }

  /**
   * Add message status indicator
   */
  addMessageStatus(messageElement) {
    const timeElement = messageElement.querySelector(".message-time");
    if (!timeElement) return;

    // Add status icon
    const statusIcon = document.createElement("span");
    statusIcon.className = "message-status sending";
    statusIcon.innerHTML = "🕐";
    timeElement.appendChild(statusIcon);

    // Simulate status progression
    setTimeout(() => {
      statusIcon.className = "message-status sent";
      statusIcon.innerHTML = "✓";
    }, 1000);

    setTimeout(() => {
      statusIcon.className = "message-status delivered";
      statusIcon.innerHTML = "✓✓";
    }, 2000);
  }

  /**
   * Setup message grouping by date
   */
  setupMessageGrouping() {
    // This would group messages by date with date headers
    // Implementation would go here for date separators
  }

  /**
   * Cleanup method
   */
  cleanup() {
    // Clear timeouts
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    // Remove event listeners and elements
    const emojiPicker = document.querySelector(".emoji-picker");
    if (emojiPicker) {
      emojiPicker.remove();
    }

    const mentionSuggestions = document.querySelector(".mention-suggestions");
    if (mentionSuggestions) {
      mentionSuggestions.remove();
    }

    console.log("ChatUI cleaned up");
  }
}

// Initialize ChatUI when app is ready
document.addEventListener("DOMContentLoaded", () => {
  const initChatUI = () => {
    if (window.WhatsAppApp) {
      window.ChatUI = new ChatUI(window.WhatsAppApp);
    } else {
      setTimeout(initChatUI, 100);
    }
  };

  setTimeout(initChatUI, 600);
});
