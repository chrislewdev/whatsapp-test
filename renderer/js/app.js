/**
 * WhatsApp Multi-Account Desktop App
 * Main Application JavaScript
 *
 * Handles the core application logic, UI state management,
 * and communication with the Electron main process
 */

class WhatsAppMultiApp {
  constructor() {
    // App state
    this.currentAccount = null;
    this.currentChat = null;
    this.accounts = new Map();
    this.isInitialized = false;

    // UI elements
    this.elements = {};

    // Event handlers storage
    this.eventHandlers = new Map();

    // Initialize the app
    this.init();
  }

  /**
   * Initialize the application
   */
  async init() {
    console.log("Initializing WhatsApp Multi-Account App...");

    try {
      // Cache DOM elements
      this.cacheElements();

      // Set up event listeners
      this.setupEventListeners();

      // Set up Electron IPC listeners
      this.setupIPCListeners();

      // Initialize UI state
      this.initializeUI();

      // Load existing accounts
      await this.loadAccounts();

      this.isInitialized = true;
      console.log("App initialized successfully");
    } catch (error) {
      console.error("Failed to initialize app:", error);
      this.showNotification("Failed to initialize application", "error");
    }
  }

  /**
   * Cache frequently used DOM elements
   */
  cacheElements() {
    this.elements = {
      // Main containers
      welcomeScreen: document.getElementById("welcomeScreen"),
      accountSetup: document.getElementById("accountSetup"),
      chatInterface: document.getElementById("chatInterface"),

      // Account tabs
      accountTabs: document.getElementById("accountTabs"),
      addAccountBtn: document.getElementById("addAccountBtn"),

      // Top controls
      autoMessageBtn: document.getElementById("autoMessageBtn"),
      settingsBtn: document.getElementById("settingsBtn"),
      statusIndicator: document.getElementById("statusIndicator"),

      // Welcome screen
      getStartedBtn: document.getElementById("getStartedBtn"),

      // Account setup
      accountName: document.getElementById("accountName"),
      qrContainer: document.getElementById("qrContainer"),
      cancelSetupBtn: document.getElementById("cancelSetupBtn"),
      confirmSetupBtn: document.getElementById("confirmSetupBtn"),

      // Chat interface
      currentAccountInfo: document.getElementById("currentAccountInfo"),
      chatSearch: document.getElementById("chatSearch"),
      chatList: document.getElementById("chatList"),
      chatHeader: document.getElementById("chatHeader"),
      messagesContainer: document.getElementById("messagesContainer"),
      messageInput: document.getElementById("messageInput"),
      sendBtn: document.getElementById("sendBtn"),

      // Modals
      autoMessageModal: document.getElementById("autoMessageModal"),
      settingsModal: document.getElementById("settingsModal"),
      closeAutoMessageBtn: document.getElementById("closeAutoMessageBtn"),
      closeSettingsBtn: document.getElementById("closeSettingsBtn"),

      // Notifications
      notificationContainer: document.getElementById("notificationContainer"),
      loadingOverlay: document.getElementById("loadingOverlay"),
    };

    // Verify all elements exist
    for (const [key, element] of Object.entries(this.elements)) {
      if (!element) {
        console.warn(`Element not found: ${key}`);
      }
    }
  }

  /**
   * Set up event listeners for UI interactions
   */
  setupEventListeners() {
    // Top bar controls
    this.elements.addAccountBtn?.addEventListener("click", () =>
      this.showAccountSetup()
    );
    this.elements.getStartedBtn?.addEventListener("click", () =>
      this.showAccountSetup()
    );
    this.elements.autoMessageBtn?.addEventListener("click", () =>
      this.showAutoMessageModal()
    );
    this.elements.settingsBtn?.addEventListener("click", () =>
      this.showSettingsModal()
    );

    // Account setup
    this.elements.cancelSetupBtn?.addEventListener("click", () =>
      this.hideAccountSetup()
    );
    this.elements.confirmSetupBtn?.addEventListener("click", () =>
      this.confirmAccountSetup()
    );
    this.elements.accountName?.addEventListener("input", () =>
      this.validateAccountSetup()
    );

    // Modal close buttons
    this.elements.closeAutoMessageBtn?.addEventListener("click", () =>
      this.hideAutoMessageModal()
    );
    this.elements.closeSettingsBtn?.addEventListener("click", () =>
      this.hideSettingsModal()
    );

    // Chat interface
    this.elements.chatSearch?.addEventListener("input", (e) =>
      this.filterChats(e.target.value)
    );
    this.elements.messageInput?.addEventListener("keydown", (e) =>
      this.handleMessageInputKeydown(e)
    );
    this.elements.sendBtn?.addEventListener("click", () => this.sendMessage());

    // Modal overlay clicks (close on outside click)
    this.elements.autoMessageModal?.addEventListener("click", (e) => {
      if (e.target === this.elements.autoMessageModal) {
        this.hideAutoMessageModal();
      }
    });

    this.elements.settingsModal?.addEventListener("click", (e) => {
      if (e.target === this.elements.settingsModal) {
        this.hideSettingsModal();
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) =>
      this.handleKeyboardShortcuts(e)
    );

    console.log("Event listeners set up");
  }

  /**
   * Set up IPC listeners for communication with main process
   */
  setupIPCListeners() {
    if (!window.electronAPI) {
      console.warn("Electron API not available");
      return;
    }

    // Account updates
    window.electronAPI.onAccountUpdate((data) => {
      console.log("Account update received:", data);
      this.handleAccountUpdate(data);
    });

    // Message received
    window.electronAPI.onMessageReceived((data) => {
      console.log("Message received:", data);
      this.handleMessageReceived(data);
    });

    // QR code updates
    window.electronAPI.onQRUpdate((data) => {
      console.log("QR update received:", data);
      this.handleQRUpdate(data);
    });

    // Error notifications
    window.electronAPI.onError((data) => {
      console.log("Error notification:", data);
      this.showNotification(data.message, data.type);
    });

    console.log("IPC listeners set up");
  }

  /**
   * Initialize UI state
   */
  initializeUI() {
    // Hide all screens initially
    this.hideAllScreens();

    // Show welcome screen by default
    this.showWelcomeScreen();

    // Update status indicator
    this.updateStatusIndicator("offline", "Offline");

    // Enable message input auto-resize
    this.setupMessageInputAutoResize();

    console.log("UI initialized");
  }

  /**
   * Load existing accounts from backend
   */
  async loadAccounts() {
    if (!window.electronAPI) {
      console.warn("Cannot load accounts - Electron API not available");
      return;
    }

    try {
      this.showLoading("Loading accounts...");

      const response = await window.electronAPI.account.list();

      if (response.success) {
        const accounts = response.data;
        console.log("Loaded accounts:", accounts);

        // Clear existing accounts
        this.accounts.clear();

        // Add accounts to UI
        for (const account of accounts) {
          this.addAccountTab(account);
          this.accounts.set(account.accountId, account);
        }

        // Show appropriate screen
        if (accounts.length > 0) {
          this.showChatInterface();
          // Switch to first authenticated account
          const authenticatedAccount = accounts.find(
            (acc) => acc.isAuthenticated
          );
          if (authenticatedAccount) {
            await this.switchToAccount(authenticatedAccount.accountId);
          }
        } else {
          this.showWelcomeScreen();
        }

        this.updateStatusIndicator("online", `${accounts.length} accounts`);
      } else {
        console.error("Failed to load accounts:", response.error);
        this.showNotification("Failed to load accounts", "error");
        this.showWelcomeScreen();
      }
    } catch (error) {
      console.error("Error loading accounts:", error);
      this.showNotification("Error loading accounts", "error");
      this.showWelcomeScreen();
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Screen management
   */
  hideAllScreens() {
    this.elements.welcomeScreen?.classList.add("hidden");
    this.elements.accountSetup?.classList.add("hidden");
    this.elements.chatInterface?.classList.add("hidden");
  }

  showWelcomeScreen() {
    this.hideAllScreens();
    this.elements.welcomeScreen?.classList.remove("hidden");
  }

  showAccountSetup() {
    this.hideAllScreens();
    this.elements.accountSetup?.classList.remove("hidden");
    this.elements.accountName?.focus();
    this.elements.qrContainer.innerHTML =
      '<div class="qr-loading">Enter account name and click "Add Account" to generate QR code</div>';
  }

  hideAccountSetup() {
    if (this.accounts.size > 0) {
      this.showChatInterface();
    } else {
      this.showWelcomeScreen();
    }
    // Reset form
    this.elements.accountName.value = "";
    this.elements.confirmSetupBtn.disabled = true;
  }

  showChatInterface() {
    this.hideAllScreens();
    this.elements.chatInterface?.classList.remove("hidden");
  }

  /**
   * Account setup validation
   */
  validateAccountSetup() {
    const accountName = this.elements.accountName?.value?.trim();
    const isValid = accountName && accountName.length >= 2;

    if (this.elements.confirmSetupBtn) {
      this.elements.confirmSetupBtn.disabled = !isValid;
    }

    return isValid;
  }

  /**
   * Confirm account setup - create new account
   */
  async confirmAccountSetup() {
    if (!this.validateAccountSetup()) {
      this.showNotification("Please enter a valid account name", "warning");
      return;
    }

    const accountName = this.elements.accountName.value.trim();
    const accountId = `account_${Date.now()}`;

    try {
      this.showLoading("Creating account...");
      console.log("Starting account creation for:", accountName);

      // Add timeout to prevent infinite loading
      const createAccountPromise = window.electronAPI.account.create({
        accountId: accountId,
        displayName: accountName,
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(
          () =>
            reject(new Error("Account creation timed out after 30 seconds")),
          30000
        );
      });

      const response = await Promise.race([
        createAccountPromise,
        timeoutPromise,
      ]);

      if (response.success) {
        console.log("Account created:", response.data);

        // Add account to UI
        const accountData = {
          accountId: accountId,
          displayName: accountName,
          isActive: false,
          isAuthenticated: false,
          unreadCount: 0,
          onlineStatus: "connecting",
        };

        this.addAccountTab(accountData);
        this.accounts.set(accountId, accountData);

        this.showNotification(
          "Account created successfully. Requesting QR code...",
          "info"
        );

        // Request QR code with better error handling and user feedback
        try {
          this.elements.qrContainer.innerHTML = `
            <div class="qr-loading">
              <div class="loading-spinner"></div>
              <div>Initializing WhatsApp client...</div>
              <div class="loading-details">This may take 30-60 seconds</div>
            </div>
          `;

          console.log("Requesting QR code for account:", accountId);
          const qrResponse = await window.electronAPI.account.getQR(accountId);

          if (qrResponse.success) {
            if (qrResponse.data.status === "already_authenticated") {
              this.elements.qrContainer.innerHTML = `
                <div class="qr-success">
                  <div>✅ Account already authenticated!</div>
                  <div>This account is ready to use.</div>
                </div>
              `;
              this.showNotification(
                "Account is already authenticated and ready!",
                "info"
              );
            } else {
              this.showNotification(
                "QR code generated. Please scan with WhatsApp mobile app.",
                "info"
              );
            }
          } else {
            console.error("QR generation failed:", qrResponse.error);
            this.handleQRGenerationFailure(accountId, qrResponse.error);
          }
        } catch (qrError) {
          console.error("QR generation error:", qrError);
          this.handleQRGenerationFailure(
            accountId,
            qrError.message || "Unknown error occurred"
          );
        }
      } else {
        console.error("Failed to create account:", response.error);
        this.showNotification(
          `Failed to create account: ${response.error}`,
          "error"
        );
      }
    } catch (error) {
      console.error("Error creating account:", error);
      if (error.message.includes("timed out")) {
        this.showNotification(
          "Account creation timed out. Please try again.",
          "error"
        );
      } else {
        this.showNotification(
          `Error creating account: ${error.message}`,
          "error"
        );
      }
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Retry QR code generation
   */
  async retryQRGeneration(accountId) {
    try {
      this.elements.qrContainer.innerHTML =
        '<div class="qr-loading">Retrying QR code generation...</div>';

      const response = await window.electronAPI.account.getQR(accountId);

      if (response.success) {
        this.showNotification("QR code generated successfully!", "info");
      } else {
        this.elements.qrContainer.innerHTML = `
          <div class="qr-error">
            <p>Still unable to generate QR code</p>
            <p>Error: ${response.error}</p>
            <button onclick="window.WhatsAppApp.retryQRGeneration('${accountId}')">Try Again</button>
          </div>
        `;
        this.showNotification(
          `QR generation failed: ${response.error}`,
          "error"
        );
      }
    } catch (error) {
      console.error("Retry QR generation error:", error);
      this.showNotification(
        "Retry failed. Please check console for details.",
        "error"
      );
    }
  }

  /**
   * Handle QR generation failure with user-friendly options
   */
  handleQRGenerationFailure(accountId, errorMessage) {
    const isTimeoutError =
      errorMessage.includes("timed out") || errorMessage.includes("timeout");
    const isNetworkError =
      errorMessage.includes("network") || errorMessage.includes("connection");

    let errorExplanation = "";
    let troubleshootingTips = "";

    if (isTimeoutError) {
      errorExplanation = "The WhatsApp client took too long to initialize.";
      troubleshootingTips = `
        <div class="troubleshooting-tips">
          <p><strong>Common causes:</strong></p>
          <ul>
            <li>Slow internet connection</li>
            <li>System resources being used by other apps</li>
            <li>Antivirus software blocking the process</li>
          </ul>
          <p><strong>Try:</strong></p>
          <ul>
            <li>Close other applications to free up memory</li>
            <li>Check your internet connection</li>
            <li>Temporarily disable antivirus</li>
          </ul>
        </div>
      `;
    } else if (isNetworkError) {
      errorExplanation = "Unable to connect to WhatsApp servers.";
      troubleshootingTips = `
        <div class="troubleshooting-tips">
          <p><strong>Please check:</strong></p>
          <ul>
            <li>Your internet connection</li>
            <li>Firewall settings</li>
            <li>VPN or proxy settings</li>
          </ul>
        </div>
      `;
    } else {
      errorExplanation = "An unexpected error occurred during setup.";
    }

    this.elements.qrContainer.innerHTML = `
      <div class="qr-error">
        <div class="error-icon">⚠️</div>
        <div class="error-main">
          <h4>QR Code Generation Failed</h4>
          <p>${errorExplanation}</p>
        </div>
        <div class="error-details">
          <details>
            <summary>Technical Details</summary>
            <code>${errorMessage}</code>
          </details>
        </div>
        ${troubleshootingTips}
        <div class="error-actions">
          <button onclick="window.WhatsAppApp.retryQRGeneration('${accountId}')" class="btn-retry">
            🔄 Try Again
          </button>
          <button onclick="window.WhatsAppApp.advancedRetry('${accountId}')" class="btn-advanced">
            🔧 Advanced Retry
          </button>
          <button onclick="window.WhatsAppApp.cancelAccountSetup('${accountId}')" class="btn-cancel">
            ❌ Cancel
          </button>
        </div>
      </div>
    `;

    this.showNotification(`QR generation failed: ${errorExplanation}`, "error");
  }

  /**
   * Advanced retry with fallback methods
   */
  async advancedRetry(accountId) {
    try {
      this.elements.qrContainer.innerHTML =
        '<div class="qr-loading"><div class="loading-spinner"></div><div>Trying advanced retry method...</div></div>';

      this.showNotification(
        "Attempting advanced retry with fallback...",
        "info"
      );

      // First try the normal method once more
      let response;
      try {
        const qrPromise = window.electronAPI.account.getQR(accountId);
        const qrTimeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("Advanced retry timed out")),
            60000
          );
        });
        response = await Promise.race([qrPromise, qrTimeoutPromise]);
      } catch (normalRetryError) {
        console.log("Normal retry failed, trying fallback method...");

        // Try fallback method
        this.elements.qrContainer.innerHTML =
          '<div class="qr-loading"><div class="loading-spinner"></div><div>Trying fallback method...</div><div class="loading-details">Using minimal settings...</div></div>';

        // Note: You'd need to add this IPC handler
        const fallbackPromise =
          window.electronAPI.account.fallbackQR(accountId);
        const fallbackTimeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("Fallback method timed out")),
            90000
          );
        });
        response = await Promise.race([
          fallbackPromise,
          fallbackTimeoutPromise,
        ]);
      }

      if (response.success) {
        this.showNotification(
          "QR code generated successfully with advanced retry!",
          "info"
        );
      } else {
        throw new Error(response.error);
      }
    } catch (error) {
      console.error("Advanced retry error:", error);
      this.elements.qrContainer.innerHTML = `
        <div class="qr-error">
          <div class="error-icon">❌</div>
          <div class="error-main">
            <h4>All Retry Methods Failed</h4>
            <p>We've tried multiple approaches but couldn't generate a QR code.</p>
          </div>
          <div class="troubleshooting-tips">
            <p><strong>This might help:</strong></p>
            <ul>
              <li>Restart the application completely</li>
              <li>Check if Chrome/Chromium is installed on your system</li>
              <li>Temporarily disable antivirus/firewall</li>
              <li>Free up system memory (close other apps)</li>
              <li>Try running as administrator</li>
            </ul>
          </div>
          <div class="error-actions">
            <button onclick="window.WhatsAppApp.restartApp()" class="btn-retry">
              🔄 Restart App
            </button>
            <button onclick="window.WhatsAppApp.cancelAccountSetup('${accountId}')" class="btn-cancel">
              ❌ Cancel Setup
            </button>
          </div>
        </div>
      `;
      this.showNotification(
        "All retry methods failed. Try restarting the app.",
        "error"
      );
    }
  }

  /**
   * Restart the application
   */
  restartApp() {
    if (
      window.electronAPI &&
      window.electronAPI.system &&
      window.electronAPI.system.restart
    ) {
      window.electronAPI.system.restart();
    } else {
      // Fallback: reload the window
      window.location.reload();
    }
  }

  /**
   * Cancel account setup and remove failed account
   */
  async cancelAccountSetup(accountId) {
    try {
      // Remove from local accounts
      this.accounts.delete(accountId);

      // Remove tab
      const tab = this.elements.accountTabs?.querySelector(
        `[data-account-id="${accountId}"]`
      );
      if (tab) {
        tab.remove();
      }

      // Show appropriate screen
      if (this.accounts.size > 0) {
        this.showChatInterface();
      } else {
        this.showWelcomeScreen();
      }

      this.showNotification("Account setup cancelled", "info");
    } catch (error) {
      console.error("Error cancelling account setup:", error);
      this.showNotification("Error cancelling setup", "error");
    }
  }

  /**
   * Add account tab to UI
   */
  addAccountTab(accountData) {
    const tabsContainer = this.elements.accountTabs;
    const addButton = this.elements.addAccountBtn;

    if (!tabsContainer || !addButton) return;

    // Create tab element
    const tab = document.createElement("button");
    tab.className = "tab-btn";
    tab.dataset.accountId = accountData.accountId;

    // Tab content
    const displayName = accountData.displayName || accountData.accountId;
    tab.innerHTML = `
      <span class="tab-name">${displayName}</span>
      ${
        accountData.unreadCount > 0
          ? `<span class="unread-count">${accountData.unreadCount}</span>`
          : ""
      }
    `;

    // Add click handler
    tab.addEventListener("click", () =>
      this.switchToAccount(accountData.accountId)
    );

    // Insert before add button
    tabsContainer.insertBefore(tab, addButton);

    console.log(`Added tab for account: ${accountData.accountId}`);
  }

  /**
   * Switch to a specific account
   */
  async switchToAccount(accountId) {
    if (this.currentAccount === accountId) return;

    try {
      this.showLoading("Switching account...");

      const response = await window.electronAPI.account.switch(accountId);

      if (response.success) {
        const accountData = response.data;

        // Update current account
        this.currentAccount = accountId;
        this.accounts.set(accountId, {
          ...this.accounts.get(accountId),
          ...accountData,
        });

        // Update UI
        this.updateActiveTab(accountId);
        this.updateCurrentAccountInfo(accountData);
        await this.loadChatsForAccount(accountId);

        // Show chat interface
        this.showChatInterface();

        console.log(`Switched to account: ${accountId}`);
      } else {
        console.error("Failed to switch account:", response.error);
        this.showNotification(
          `Failed to switch account: ${response.error}`,
          "error"
        );
      }
    } catch (error) {
      console.error("Error switching account:", error);
      this.showNotification("Error switching account", "error");
    } finally {
      this.hideLoading();
    }
  }

  /**
   * Update active tab styling
   */
  updateActiveTab(accountId) {
    // Remove active class from all tabs
    const tabs = this.elements.accountTabs?.querySelectorAll(".tab-btn");
    tabs?.forEach((tab) => {
      tab.classList.remove("active");
    });

    // Add active class to current tab
    const activeTab = this.elements.accountTabs?.querySelector(
      `[data-account-id="${accountId}"]`
    );
    activeTab?.classList.add("active");
  }

  /**
   * Update current account info in sidebar
   */
  updateCurrentAccountInfo(accountData) {
    const accountInfo = this.elements.currentAccountInfo;
    if (!accountInfo) return;

    const avatar = accountInfo.querySelector(".account-avatar .avatar-text");
    const name = accountInfo.querySelector(".account-name");
    const status = accountInfo.querySelector(".account-status");

    if (avatar) {
      avatar.textContent = accountData.displayName
        ? accountData.displayName.charAt(0).toUpperCase()
        : "?";
    }

    if (name) {
      name.textContent = accountData.displayName || accountData.accountId;
    }

    if (status) {
      const statusText = accountData.isAuthenticated
        ? accountData.isActive
          ? "Online"
          : "Connected"
        : "Connecting...";
      status.textContent = statusText;
    }
  }

  /**
   * Load chats for specific account
   */
  async loadChatsForAccount(accountId) {
    if (!window.electronAPI) return;

    try {
      const response = await window.electronAPI.message.getChats(accountId);

      if (response.success) {
        const chats = response.data;
        this.displayChats(chats);
        console.log(`Loaded ${chats.length} chats for account ${accountId}`);
      } else {
        console.error("Failed to load chats:", response.error);
        this.displayChats([]); // Show empty state
      }
    } catch (error) {
      console.error("Error loading chats:", error);
      this.displayChats([]);
    }
  }

  /**
   * Display chats in sidebar
   */
  displayChats(chats) {
    const chatList = this.elements.chatList;
    if (!chatList) return;

    if (chats.length === 0) {
      chatList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">💬</div>
          <div class="empty-state-title">No chats yet</div>
          <div class="empty-state-description">Start a conversation by sending a message</div>
        </div>
      `;
      return;
    }

    // Create chat items
    const chatItems = chats.map((chat) => this.createChatItem(chat)).join("");
    chatList.innerHTML = chatItems;

    // Add click handlers
    chatList.querySelectorAll(".chat-item").forEach((item) => {
      item.addEventListener("click", () => {
        const chatId = item.dataset.chatId;
        this.selectChat(chatId);
      });
    });
  }

  /**
   * Create HTML for a chat item
   */
  createChatItem(chat) {
    const lastMessage = chat.lastMessage;
    const timeStr = lastMessage ? utils.formatTime(lastMessage.timestamp) : "";
    const messagePreview = lastMessage
      ? lastMessage.body.length > 50
        ? lastMessage.body.substring(0, 50) + "..."
        : lastMessage.body
      : "No messages yet";

    return `
      <div class="chat-item" data-chat-id="${chat.id}">
        <div class="contact-avatar">
          <span class="avatar-text">${this.getContactInitial(chat.name)}</span>
        </div>
        <div class="chat-details">
          <span class="contact-name">${chat.name || chat.id}</span>
          <span class="last-message">${messagePreview}</span>
        </div>
        <div class="chat-meta">
          ${timeStr ? `<span class="message-time">${timeStr}</span>` : ""}
          ${
            chat.unreadCount > 0
              ? `<span class="unread-badge">${chat.unreadCount}</span>`
              : ""
          }
        </div>
      </div>
    `;
  }

  /**
   * Get contact initial for avatar
   */
  getContactInitial(name) {
    if (!name) return "?";
    return name.charAt(0).toUpperCase();
  }

  /**
   * Select a chat
   */
  selectChat(chatId) {
    // Update UI
    this.updateActiveChatItem(chatId);
    this.updateChatHeader(chatId);
    this.loadMessagesForChat(chatId);

    // Enable message input
    this.elements.messageInput.disabled = false;
    this.elements.sendBtn.disabled = false;

    this.currentChat = chatId;
    console.log(`Selected chat: ${chatId}`);
  }

  /**
   * Update active chat item styling
   */
  updateActiveChatItem(chatId) {
    const chatItems = this.elements.chatList?.querySelectorAll(".chat-item");
    chatItems?.forEach((item) => {
      item.classList.remove("active");
      if (item.dataset.chatId === chatId) {
        item.classList.add("active");
      }
    });
  }

  /**
   * Update chat header with selected contact info
   */
  updateChatHeader(chatId) {
    const chatHeader = this.elements.chatHeader;
    if (!chatHeader) return;

    // Find chat data
    const chatItem = this.elements.chatList?.querySelector(
      `[data-chat-id="${chatId}"]`
    );
    if (!chatItem) return;

    const contactName =
      chatItem.querySelector(".contact-name")?.textContent || "Unknown";
    const avatar = chatHeader.querySelector(".contact-avatar .avatar-text");
    const name = chatHeader.querySelector(".contact-name");
    const status = chatHeader.querySelector(".contact-status");

    if (avatar) {
      avatar.textContent = this.getContactInitial(contactName);
    }

    if (name) {
      name.textContent = contactName;
    }

    if (status) {
      status.textContent = "Click to view contact info";
    }
  }

  /**
   * Load messages for selected chat
   */
  loadMessagesForChat(chatId) {
    // For now, show placeholder - would integrate with backend message loading
    const messagesContainer = this.elements.messagesContainer;
    if (!messagesContainer) return;

    messagesContainer.innerHTML = `
      <div class="chat-messages" id="chatMessages">
        <div class="message received">
          <div class="message-bubble">
            <div class="message-content">Welcome to WhatsApp Multi! Start typing to send your first message.</div>
            <div class="message-time">${utils.formatTime(Date.now())}</div>
          </div>
        </div>
      </div>
    `;

    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  /**
   * Handle message input keydown (Enter to send)
   */
  handleMessageInputKeydown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  /**
   * Send message
   */
  async sendMessage() {
    if (!this.currentAccount || !this.currentChat) {
      this.showNotification("Please select a chat first", "warning");
      return;
    }

    const messageText = this.elements.messageInput?.value?.trim();
    if (!messageText) return;

    try {
      // Extract phone number from chat ID (simplified)
      const phoneNumber = this.currentChat.replace("@c.us", "");

      const response = await window.electronAPI.message.send(
        this.currentAccount,
        phoneNumber,
        messageText
      );

      if (response.success) {
        // Add message to UI immediately
        this.addMessageToUI(messageText, true);

        // Clear input
        this.elements.messageInput.value = "";
        this.adjustMessageInputHeight();

        console.log("Message sent successfully");
      } else {
        console.error("Failed to send message:", response.error);
        this.showNotification(
          `Failed to send message: ${response.error}`,
          "error"
        );
      }
    } catch (error) {
      console.error("Error sending message:", error);
      this.showNotification("Error sending message", "error");
    }
  }

  /**
   * Add message to UI
   */
  addMessageToUI(messageText, isSent = false) {
    const chatMessages = document.getElementById("chatMessages");
    if (!chatMessages) return;

    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${isSent ? "sent" : "received"}`;
    messageDiv.innerHTML = `
      <div class="message-bubble">
        <div class="message-content">${this.escapeHtml(messageText)}</div>
        <div class="message-time">${utils.formatTime(Date.now())}</div>
      </div>
    `;

    chatMessages.appendChild(messageDiv);

    // Scroll to bottom
    this.elements.messagesContainer.scrollTop =
      this.elements.messagesContainer.scrollHeight;
  }

  /**
   * Filter chats based on search input
   */
  filterChats(searchTerm) {
    const chatItems = this.elements.chatList?.querySelectorAll(".chat-item");
    if (!chatItems) return;

    const term = searchTerm.toLowerCase().trim();

    chatItems.forEach((item) => {
      const contactName =
        item.querySelector(".contact-name")?.textContent?.toLowerCase() || "";
      const lastMessage =
        item.querySelector(".last-message")?.textContent?.toLowerCase() || "";

      const matches = contactName.includes(term) || lastMessage.includes(term);
      item.style.display = matches ? "flex" : "none";
    });
  }

  /**
   * Handle keyboard shortcuts
   */
  handleKeyboardShortcuts(event) {
    // Ctrl/Cmd + 1-9 for account switching
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key >= "1" &&
      event.key <= "9"
    ) {
      event.preventDefault();
      const accountIndex = parseInt(event.key) - 1;
      const tabs = this.elements.accountTabs?.querySelectorAll(
        ".tab-btn[data-account-id]"
      );
      if (tabs && tabs[accountIndex]) {
        const accountId = tabs[accountIndex].dataset.accountId;
        this.switchToAccount(accountId);
      }
    }

    // Escape to close modals
    if (event.key === "Escape") {
      this.hideAutoMessageModal();
      this.hideSettingsModal();
    }
  }

  /**
   * Modal management
   */
  showAutoMessageModal() {
    this.elements.autoMessageModal?.classList.remove("hidden");
    // Initialize auto-messaging UI if not already done
    if (window.AutoMessagingUI) {
      window.AutoMessagingUI.initialize();
    }
  }

  hideAutoMessageModal() {
    this.elements.autoMessageModal?.classList.add("hidden");
  }

  showSettingsModal() {
    this.elements.settingsModal?.classList.remove("hidden");
    this.loadSettingsData();
  }

  hideSettingsModal() {
    this.elements.settingsModal?.classList.add("hidden");
  }

  /**
   * Load settings data
   */
  async loadSettingsData() {
    const accountsOverview = document.getElementById("accountsOverview");
    if (!accountsOverview) return;

    if (this.accounts.size === 0) {
      accountsOverview.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">No accounts configured</div>
          <div class="empty-state-description">Add an account to get started</div>
        </div>
      `;
      return;
    }

    const accountItems = Array.from(this.accounts.values())
      .map(
        (account) => `
      <div class="account-overview-item">
        <div class="account-overview-info">
          <div class="account-overview-avatar">
            <span>${
              account.displayName
                ? account.displayName.charAt(0).toUpperCase()
                : "?"
            }</span>
          </div>
          <div class="account-overview-details">
            <span class="account-overview-name">${
              account.displayName || account.accountId
            }</span>
            <span class="account-overview-status">${
              account.isAuthenticated ? "Connected" : "Not connected"
            }</span>
          </div>
        </div>
        <div class="account-overview-actions">
          <button class="btn-mini btn-disconnect" data-account-id="${
            account.accountId
          }">Disconnect</button>
          <button class="btn-mini btn-remove" data-account-id="${
            account.accountId
          }">Remove</button>
        </div>
      </div>
    `
      )
      .join("");

    accountsOverview.innerHTML = accountItems;

    // Add event handlers for account actions
    accountsOverview.querySelectorAll(".btn-disconnect").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const accountId = e.target.dataset.accountId;
        this.disconnectAccount(accountId);
      });
    });

    accountsOverview.querySelectorAll(".btn-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const accountId = e.target.dataset.accountId;
        this.removeAccount(accountId);
      });
    });
  }

  /**
   * Setup message input auto-resize
   */
  setupMessageInputAutoResize() {
    const messageInput = this.elements.messageInput;
    if (!messageInput) return;

    messageInput.addEventListener("input", () => {
      this.adjustMessageInputHeight();
    });
  }

  adjustMessageInputHeight() {
    const messageInput = this.elements.messageInput;
    if (!messageInput) return;

    messageInput.style.height = "auto";
    messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + "px";
  }

  /**
   * Event handlers for IPC messages
   */
  handleAccountUpdate(data) {
    const { accountId, status } = data;
    const account = this.accounts.get(accountId);

    if (account) {
      account.status = status;

      // Update tab if needed
      const tab = this.elements.accountTabs?.querySelector(
        `[data-account-id="${accountId}"]`
      );
      if (tab && status === "ready") {
        tab.classList.add("authenticated");
      }

      // Update current account info if this is the active account
      if (this.currentAccount === accountId) {
        this.updateCurrentAccountInfo(account);
      }
    }
  }

  handleMessageReceived(data) {
    const { accountId, message } = data;

    // Add message to UI if chat is currently active
    if (
      this.currentAccount === accountId &&
      this.currentChat === message.from
    ) {
      this.addMessageToUI(message.body, false);
    }

    // Update unread count
    const account = this.accounts.get(accountId);
    if (account && this.currentAccount !== accountId) {
      account.unreadCount = (account.unreadCount || 0) + 1;
      this.updateTabUnreadCount(accountId, account.unreadCount);
    }

    // Show notification
    const accountName = account?.displayName || accountId;
    this.showNotification(
      `New message from ${message.from} (${accountName})`,
      "info"
    );
  }

  handleQRUpdate(data) {
    const { accountId, qrCode } = data;

    if (this.elements.qrContainer && qrCode) {
      this.elements.qrContainer.innerHTML = `<img src="data:image/png;base64,${qrCode}" alt="QR Code" />`;
    }
  }

  /**
   * Update tab unread count
   */
  updateTabUnreadCount(accountId, count) {
    const tab = this.elements.accountTabs?.querySelector(
      `[data-account-id="${accountId}"]`
    );
    if (!tab) return;

    let unreadSpan = tab.querySelector(".unread-count");

    if (count > 0) {
      if (!unreadSpan) {
        unreadSpan = document.createElement("span");
        unreadSpan.className = "unread-count";
        tab.appendChild(unreadSpan);
      }
      unreadSpan.textContent = count > 99 ? "99+" : count.toString();
    } else if (unreadSpan) {
      unreadSpan.remove();
    }
  }

  /**
   * Status indicator management
   */
  updateStatusIndicator(status, text) {
    const statusDot =
      this.elements.statusIndicator?.querySelector(".status-dot");
    const statusText =
      this.elements.statusIndicator?.querySelector(".status-text");

    if (statusDot) {
      statusDot.className = `status-dot ${status}`;
    }

    if (statusText) {
      statusText.textContent = text;
    }
  }

  /**
   * Loading overlay management
   */
  showLoading(text = "Loading...") {
    if (this.elements.loadingOverlay) {
      const loadingText =
        this.elements.loadingOverlay.querySelector(".loading-text");
      if (loadingText) {
        loadingText.textContent = text;
      }
      this.elements.loadingOverlay.classList.remove("hidden");
    }
  }

  hideLoading() {
    this.elements.loadingOverlay?.classList.add("hidden");
  }

  /**
   * Notification system
   */
  showNotification(message, type = "info", duration = 5000) {
    if (!this.elements.notificationContainer) return;

    const notification = document.createElement("div");
    notification.className = `notification ${type}`;
    notification.innerHTML = `
      <div class="notification-icon"></div>
      <div class="notification-content">
        <div class="notification-message">${this.escapeHtml(message)}</div>
        <div class="notification-time">${utils.formatTime(Date.now())}</div>
      </div>
      <button class="notification-close">&times;</button>
    `;

    // Add close handler
    const closeBtn = notification.querySelector(".notification-close");
    closeBtn.addEventListener("click", () => {
      notification.remove();
    });

    // Auto remove after duration
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, duration);

    this.elements.notificationContainer.appendChild(notification);
  }

  /**
   * Utility methods
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  disconnectAccount(accountId) {
    // TODO: Implement account disconnection
    console.log("Disconnect account:", accountId);
    this.showNotification(
      "Account disconnection not yet implemented",
      "warning"
    );
  }

  removeAccount(accountId) {
    // TODO: Implement account removal
    console.log("Remove account:", accountId);
    this.showNotification("Account removal not yet implemented", "warning");
  }
}

// Initialize the app when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM loaded, initializing app...");
  window.WhatsAppApp = new WhatsAppMultiApp();
});

// Global error handler
window.addEventListener("error", (event) => {
  console.error("Global error:", event.error);
  if (window.WhatsAppApp) {
    window.WhatsAppApp.showNotification(
      "An unexpected error occurred",
      "error"
    );
  }
});

// Global unhandled promise rejection handler
window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
  if (window.WhatsAppApp) {
    window.WhatsAppApp.showNotification(
      "An unexpected error occurred",
      "error"
    );
  }
});
