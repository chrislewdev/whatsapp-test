/**
 * WhatsApp Multi-Account Desktop App
 * Tab Management JavaScript
 *
 * Handles account tab switching, management, and UI updates
 * Works with the main app to provide seamless multi-account experience
 */

class TabManager {
  constructor(app) {
    this.app = app;
    this.tabContextMenu = null;
    this.draggedTab = null;
    this.setupTabFeatures();
  }

  /**
   * Setup advanced tab features
   */
  setupTabFeatures() {
    this.setupTabContextMenu();
    this.setupTabDragAndDrop();
    this.setupTabKeyboardNavigation();
    console.log("Tab features initialized");
  }

  /**
   * Setup right-click context menu for tabs
   */
  setupTabContextMenu() {
    // Remove existing context menu if any
    if (this.tabContextMenu) {
      this.tabContextMenu.remove();
    }

    // Create context menu
    this.tabContextMenu = document.createElement("div");
    this.tabContextMenu.className = "context-menu hidden";
    this.tabContextMenu.innerHTML = `
      <div class="context-menu-item" data-action="rename">
        <span>📝</span> Rename Account
      </div>
      <div class="context-menu-item" data-action="duplicate">
        <span>📋</span> Duplicate Tab
      </div>
      <div class="context-menu-divider"></div>
      <div class="context-menu-item" data-action="disconnect">
        <span>🔌</span> Disconnect
      </div>
      <div class="context-menu-item danger" data-action="remove">
        <span>🗑️</span> Remove Account
      </div>
    `;

    document.body.appendChild(this.tabContextMenu);

    // Add event handlers for context menu
    this.tabContextMenu.addEventListener("click", (e) => {
      const action = e.target.closest(".context-menu-item")?.dataset.action;
      if (action && this.currentContextTab) {
        this.handleTabContextAction(action, this.currentContextTab);
      }
      this.hideTabContextMenu();
    });

    // Setup tab right-click detection
    document.addEventListener("contextmenu", (e) => {
      const tab = e.target.closest(".tab-btn[data-account-id]");
      if (tab) {
        e.preventDefault();
        this.showTabContextMenu(e, tab);
      }
    });

    // Hide context menu on outside click
    document.addEventListener("click", (e) => {
      if (!this.tabContextMenu.contains(e.target)) {
        this.hideTabContextMenu();
      }
    });
  }

  /**
   * Show tab context menu
   */
  showTabContextMenu(event, tab) {
    this.currentContextTab = tab;
    const accountId = tab.dataset.accountId;
    const account = this.app.accounts.get(accountId);

    // Update menu items based on account state
    const disconnectItem = this.tabContextMenu.querySelector(
      '[data-action="disconnect"]'
    );
    const duplicateItem = this.tabContextMenu.querySelector(
      '[data-action="duplicate"]'
    );

    if (disconnectItem) {
      disconnectItem.style.display = account?.isAuthenticated ? "flex" : "none";
    }

    if (duplicateItem) {
      duplicateItem.style.display = "none"; // Hide for now - complex feature
    }

    // Position and show menu
    this.tabContextMenu.style.left = event.pageX + "px";
    this.tabContextMenu.style.top = event.pageY + "px";
    this.tabContextMenu.classList.remove("hidden");

    // Adjust position if menu goes off-screen
    setTimeout(() => {
      const rect = this.tabContextMenu.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      if (rect.right > windowWidth) {
        this.tabContextMenu.style.left = event.pageX - rect.width + "px";
      }

      if (rect.bottom > windowHeight) {
        this.tabContextMenu.style.top = event.pageY - rect.height + "px";
      }
    }, 0);
  }

  /**
   * Hide tab context menu
   */
  hideTabContextMenu() {
    this.tabContextMenu?.classList.add("hidden");
    this.currentContextTab = null;
  }

  /**
   * Handle tab context menu actions
   */
  async handleTabContextAction(action, tab) {
    const accountId = tab.dataset.accountId;
    const account = this.app.accounts.get(accountId);

    switch (action) {
      case "rename":
        await this.renameAccount(accountId, tab);
        break;

      case "disconnect":
        await this.disconnectAccount(accountId);
        break;

      case "remove":
        await this.removeAccount(accountId, tab);
        break;

      case "duplicate":
        this.app.showNotification("Duplicate tab feature coming soon", "info");
        break;

      default:
        console.warn("Unknown tab context action:", action);
    }
  }

  /**
   * Rename account
   */
  async renameAccount(accountId, tab) {
    const account = this.app.accounts.get(accountId);
    const currentName = account?.displayName || accountId;

    const newName = prompt("Enter new account name:", currentName);
    if (!newName || newName.trim() === currentName) {
      return;
    }

    const trimmedName = newName.trim();
    if (trimmedName.length < 2) {
      this.app.showNotification(
        "Account name must be at least 2 characters",
        "warning"
      );
      return;
    }

    try {
      // Update local data
      if (account) {
        account.displayName = trimmedName;
        this.app.accounts.set(accountId, account);
      }

      // Update tab UI
      const tabName = tab.querySelector(".tab-name");
      if (tabName) {
        tabName.textContent = trimmedName;
      }

      // Update current account info if active
      if (this.app.currentAccount === accountId) {
        this.app.updateCurrentAccountInfo(account);
      }

      this.app.showNotification("Account renamed successfully", "info");
      console.log(`Account ${accountId} renamed to: ${trimmedName}`);
    } catch (error) {
      console.error("Error renaming account:", error);
      this.app.showNotification("Failed to rename account", "error");
    }
  }

  /**
   * Disconnect account
   */
  async disconnectAccount(accountId) {
    const account = this.app.accounts.get(accountId);
    if (!account?.isAuthenticated) {
      this.app.showNotification("Account is not connected", "warning");
      return;
    }

    const confirmed = confirm(
      `Disconnect account "${
        account.displayName || accountId
      }"?\n\nYou will need to scan QR code again to reconnect.`
    );
    if (!confirmed) return;

    try {
      this.app.showLoading("Disconnecting account...");

      // Update local state
      account.isAuthenticated = false;
      account.isActive = false;
      account.onlineStatus = "offline";
      this.app.accounts.set(accountId, account);

      // Update UI
      const tab = this.app.elements.accountTabs?.querySelector(
        `[data-account-id="${accountId}"]`
      );
      if (tab) {
        tab.classList.remove("authenticated");
        this.updateTabStatus(tab, "disconnected");
      }

      // If this was the current account, switch to another or show welcome
      if (this.app.currentAccount === accountId) {
        const otherAccount = Array.from(this.app.accounts.values()).find(
          (acc) => acc.accountId !== accountId && acc.isAuthenticated
        );

        if (otherAccount) {
          await this.app.switchToAccount(otherAccount.accountId);
        } else {
          this.app.showWelcomeScreen();
          this.app.currentAccount = null;
        }
      }

      this.app.showNotification("Account disconnected successfully", "info");
      console.log(`Account ${accountId} disconnected`);
    } catch (error) {
      console.error("Error disconnecting account:", error);
      this.app.showNotification("Failed to disconnect account", "error");
    } finally {
      this.app.hideLoading();
    }
  }

  /**
   * Remove account completely
   */
  async removeAccount(accountId, tab) {
    const account = this.app.accounts.get(accountId);
    const accountName = account?.displayName || accountId;

    const confirmed = confirm(
      `Remove account "${accountName}" permanently?\n\nThis will delete all local data for this account. This action cannot be undone.`
    );
    if (!confirmed) return;

    try {
      this.app.showLoading("Removing account...");

      // Remove from local storage
      this.app.accounts.delete(accountId);

      // Remove tab from UI
      tab.remove();

      // If this was the current account, switch to another or show welcome
      if (this.app.currentAccount === accountId) {
        const remainingAccounts = Array.from(this.app.accounts.values());

        if (remainingAccounts.length > 0) {
          const nextAccount =
            remainingAccounts.find((acc) => acc.isAuthenticated) ||
            remainingAccounts[0];
          await this.app.switchToAccount(nextAccount.accountId);
        } else {
          this.app.showWelcomeScreen();
          this.app.currentAccount = null;
          this.app.updateStatusIndicator("offline", "No accounts");
        }
      }

      this.app.showNotification("Account removed successfully", "info");
      console.log(`Account ${accountId} removed`);
    } catch (error) {
      console.error("Error removing account:", error);
      this.app.showNotification("Failed to remove account", "error");
    } finally {
      this.app.hideLoading();
    }
  }

  /**
   * Setup drag and drop for tab reordering
   */
  setupTabDragAndDrop() {
    const tabsContainer = this.app.elements.accountTabs;
    if (!tabsContainer) return;

    // Use event delegation for dynamic tabs
    tabsContainer.addEventListener("dragstart", (e) => {
      const tab = e.target.closest(".tab-btn[data-account-id]");
      if (tab) {
        this.handleTabDragStart(e, tab);
      }
    });

    tabsContainer.addEventListener("dragover", (e) => {
      e.preventDefault();
      const tab = e.target.closest(".tab-btn[data-account-id]");
      if (tab && tab !== this.draggedTab) {
        this.handleTabDragOver(e, tab);
      }
    });

    tabsContainer.addEventListener("drop", (e) => {
      e.preventDefault();
      const tab = e.target.closest(".tab-btn[data-account-id]");
      if (tab) {
        this.handleTabDrop(e, tab);
      }
    });

    tabsContainer.addEventListener("dragend", (e) => {
      this.handleTabDragEnd(e);
    });
  }

  /**
   * Handle tab drag start
   */
  handleTabDragStart(event, tab) {
    this.draggedTab = tab;
    tab.classList.add("dragging");
    tab.draggable = true;

    // Set drag data
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", tab.dataset.accountId);

    console.log("Started dragging tab:", tab.dataset.accountId);
  }

  /**
   * Handle tab drag over
   */
  handleTabDragOver(event, tab) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    // Add visual feedback
    tab.classList.add("drag-over");

    // Remove drag-over class from other tabs
    const allTabs = this.app.elements.accountTabs?.querySelectorAll(
      ".tab-btn[data-account-id]"
    );
    allTabs?.forEach((t) => {
      if (t !== tab) {
        t.classList.remove("drag-over");
      }
    });
  }

  /**
   * Handle tab drop
   */
  handleTabDrop(event, dropTarget) {
    event.preventDefault();

    if (!this.draggedTab || this.draggedTab === dropTarget) {
      return;
    }

    const container = this.app.elements.accountTabs;
    const addButton = this.app.elements.addAccountBtn;

    // Determine drop position
    const dropRect = dropTarget.getBoundingClientRect();
    const dragRect = this.draggedTab.getBoundingClientRect();
    const isAfter = event.clientX > dropRect.left + dropRect.width / 2;

    // Reorder tabs
    if (isAfter) {
      container.insertBefore(
        this.draggedTab,
        dropTarget.nextElementSibling || addButton
      );
    } else {
      container.insertBefore(this.draggedTab, dropTarget);
    }

    console.log("Reordered tabs");
    this.app.showNotification("Tab order updated", "info");
  }

  /**
   * Handle tab drag end
   */
  handleTabDragEnd(event) {
    // Clean up drag state
    if (this.draggedTab) {
      this.draggedTab.classList.remove("dragging");
      this.draggedTab.draggable = false;
      this.draggedTab = null;
    }

    // Remove all drag-related classes
    const allTabs = this.app.elements.accountTabs?.querySelectorAll(
      ".tab-btn[data-account-id]"
    );
    allTabs?.forEach((tab) => {
      tab.classList.remove("drag-over", "dragging");
    });
  }

  /**
   * Setup keyboard navigation for tabs
   */
  setupTabKeyboardNavigation() {
    document.addEventListener("keydown", (e) => {
      // Ctrl/Cmd + Left/Right arrows for tab navigation
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "ArrowLeft" || e.key === "ArrowRight")
      ) {
        e.preventDefault();
        this.navigateTabsWithKeyboard(e.key === "ArrowRight");
      }

      // Ctrl/Cmd + W to close current tab
      if ((e.ctrlKey || e.metaKey) && e.key === "w") {
        e.preventDefault();
        this.closeCurrentTab();
      }

      // Ctrl/Cmd + T to add new account
      if ((e.ctrlKey || e.metaKey) && e.key === "t") {
        e.preventDefault();
        this.app.showAccountSetup();
      }
    });
  }

  /**
   * Navigate tabs with keyboard
   */
  navigateTabsWithKeyboard(forward = true) {
    const tabs = Array.from(
      this.app.elements.accountTabs?.querySelectorAll(
        ".tab-btn[data-account-id]"
      ) || []
    );
    if (tabs.length === 0) return;

    let currentIndex = -1;
    if (this.app.currentAccount) {
      currentIndex = tabs.findIndex(
        (tab) => tab.dataset.accountId === this.app.currentAccount
      );
    }

    let nextIndex;
    if (forward) {
      nextIndex = currentIndex < tabs.length - 1 ? currentIndex + 1 : 0;
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
    }

    const nextTab = tabs[nextIndex];
    if (nextTab) {
      const accountId = nextTab.dataset.accountId;
      this.app.switchToAccount(accountId);
    }
  }

  /**
   * Close current tab
   */
  async closeCurrentTab() {
    if (!this.app.currentAccount) return;

    const tab = this.app.elements.accountTabs?.querySelector(
      `[data-account-id="${this.app.currentAccount}"]`
    );
    if (tab) {
      await this.removeAccount(this.app.currentAccount, tab);
    }
  }

  /**
   * Update tab visual status
   */
  updateTabStatus(tab, status) {
    // Remove all status classes
    tab.classList.remove("connecting", "connected", "disconnected", "error");

    // Add new status
    tab.classList.add(status);

    // Update tab tooltip
    const accountId = tab.dataset.accountId;
    const account = this.app.accounts.get(accountId);
    const statusText = this.getStatusText(status);

    tab.title = `${account?.displayName || accountId} - ${statusText}`;
  }

  /**
   * Get human-readable status text
   */
  getStatusText(status) {
    const statusMap = {
      connecting: "Connecting...",
      connected: "Connected",
      disconnected: "Disconnected",
      error: "Connection Error",
      authenticating: "Authenticating...",
    };

    return statusMap[status] || "Unknown";
  }

  /**
   * Add hover effects and animations to tabs
   */
  setupTabAnimations() {
    const style = document.createElement("style");
    style.textContent = `
      .tab-btn {
        transition: all 0.2s ease;
        position: relative;
        overflow: hidden;
      }
      
      .tab-btn:hover {
        transform: translateY(-1px);
      }
      
      .tab-btn.dragging {
        opacity: 0.5;
        transform: rotate(5deg);
      }
      
      .tab-btn.drag-over {
        background: var(--primary-green) !important;
        color: white !important;
        transform: scale(1.05);
      }
      
      .tab-btn.connecting::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 2px;
        background: linear-gradient(90deg, transparent, var(--primary-green), transparent);
        animation: connecting-pulse 1.5s infinite;
      }
      
      @keyframes connecting-pulse {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
      
      .tab-btn.error {
        background: #fee !important;
        border-color: #fcc !important;
        animation: error-shake 0.5s;
      }
      
      @keyframes error-shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-2px); }
        75% { transform: translateX(2px); }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Setup tab tooltips with account info
   */
  setupTabTooltips() {
    // Use mutation observer to handle dynamically added tabs
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (
            node.nodeType === 1 &&
            node.classList?.contains("tab-btn") &&
            node.dataset.accountId
          ) {
            this.addTabTooltip(node);
          }
        });
      });
    });

    if (this.app.elements.accountTabs) {
      observer.observe(this.app.elements.accountTabs, { childList: true });
    }

    // Add tooltips to existing tabs
    const existingTabs = this.app.elements.accountTabs?.querySelectorAll(
      ".tab-btn[data-account-id]"
    );
    existingTabs?.forEach((tab) => this.addTabTooltip(tab));
  }

  /**
   * Add tooltip to a tab
   */
  addTabTooltip(tab) {
    const accountId = tab.dataset.accountId;
    const account = this.app.accounts.get(accountId);

    if (account) {
      const statusText = account.isAuthenticated
        ? "Connected"
        : "Not connected";
      const unreadText =
        account.unreadCount > 0 ? ` - ${account.unreadCount} unread` : "";
      tab.title = `${
        account.displayName || accountId
      } - ${statusText}${unreadText}`;
    }
  }

  /**
   * Initialize all tab features
   */
  initialize() {
    this.setupTabAnimations();
    this.setupTabTooltips();
    console.log("TabManager initialized with all features");
  }

  /**
   * Cleanup method
   */
  cleanup() {
    if (this.tabContextMenu) {
      this.tabContextMenu.remove();
      this.tabContextMenu = null;
    }

    this.currentContextTab = null;
    this.draggedTab = null;

    console.log("TabManager cleaned up");
  }
}

// Initialize TabManager when app is ready
document.addEventListener("DOMContentLoaded", () => {
  // Wait for main app to initialize
  const initTabManager = () => {
    if (window.WhatsAppApp) {
      window.TabManager = new TabManager(window.WhatsAppApp);
      window.TabManager.initialize();
    } else {
      setTimeout(initTabManager, 100);
    }
  };

  setTimeout(initTabManager, 500);
});
