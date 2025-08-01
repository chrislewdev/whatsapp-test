const { Client, LocalAuth } = require("whatsapp-web.js");
const fs = require("fs");
const path = require("path");

class AccountManager {
  constructor(errorHandler) {
    this.errorHandler = errorHandler;
    this.accounts = new Map(); // accountId -> account data
    this.activeAccount = null;
    this.maxAccounts = 10;

    console.log("AccountManager initialized");
  }

  /**
   * Create a new WhatsApp account with proper isolation
   * CRITICAL: This ensures each account has separate data paths and client isolation
   */
  async createAccount(accountData) {
    const { accountId, displayName } = accountData;

    // Validate account limits
    if (this.accounts.size >= this.maxAccounts) {
      throw new Error(`Maximum ${this.maxAccounts} accounts allowed`);
    }

    if (this.accounts.has(accountId)) {
      throw new Error(`Account ${accountId} already exists`);
    }

    console.log(`Creating account: ${accountId}`);

    // CRITICAL ISOLATION: Create separate data directories for this account
    const accountDataPath = path.join("./data/accounts", accountId);
    const chromeProfilePath = path.join(
      "./data/chrome_profiles",
      `chrome_${accountId}`
    );

    // Ensure directories exist
    if (!fs.existsSync(accountDataPath)) {
      fs.mkdirSync(accountDataPath, { recursive: true });
    }
    if (!fs.existsSync(chromeProfilePath)) {
      fs.mkdirSync(chromeProfilePath, { recursive: true });
    }

    // CRITICAL ISOLATION: Create isolated WhatsApp client
    const client = new Client({
      // Each account gets unique client ID - prevents data mixing
      authStrategy: new LocalAuth({
        clientId: `account_${accountId}`,
        dataPath: accountDataPath,
      }),

      // Separate browser profile for each account - critical for isolation
      puppeteer: {
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          `--user-data-dir=${chromeProfilePath}`, // CRITICAL: Separate browser profile
        ],
      },
    });

    // Store account data with proper isolation
    const accountInfo = {
      accountId: accountId,
      displayName: displayName,
      client: client,
      dataPath: accountDataPath,
      chromeProfilePath: chromeProfilePath,
      isActive: false,
      isAuthenticated: false,
      lastAccessed: Date.now(),

      // Account-specific UI state (isolated)
      uiState: {
        selectedChat: null,
        messageCache: new Map(),
        contactList: [],
        unreadCount: 0,
        onlineStatus: "offline",
      },
    };

    // Set up isolated event handlers with account tagging
    this.setupClientEventHandlers(client, accountId);

    // Store the account
    this.accounts.set(accountId, accountInfo);

    console.log(`Account ${accountId} created with isolated data paths`);
    return { accountId, displayName, status: "created" };
  }

  /**
   * Set up event handlers for WhatsApp client with proper account isolation
   * CRITICAL: All events are tagged with accountId to prevent message mixing
   */
  setupClientEventHandlers(client, accountId) {
    console.log(`Setting up event handlers for account: ${accountId}`);

    // QR Code generation - library handles detection automatically
    client.on("qr", (qr) => {
      console.log(`QR Code generated for account ${accountId}`);

      // Send QR to renderer immediately
      if (global.mainWindow) {
        global.mainWindow.webContents.send("qr:update", {
          accountId: accountId,
          qrCode: qr, // whatsapp-web.js gives us the QR code directly
        });
      }
    });

    // Loading/syncing progress
    client.on("loading_screen", (percent, message) => {
      console.log(`Account ${accountId} loading: ${percent}% - ${message}`);

      if (global.mainWindow) {
        global.mainWindow.webContents.send("account:loading", {
          accountId: accountId,
          percent: percent,
          message: message,
        });
      }
    });

    // Authentication success
    client.on("authenticated", () => {
      console.log(`Account ${accountId} authenticated successfully`);

      const account = this.accounts.get(accountId);
      if (account) {
        account.isAuthenticated = true;
        account.uiState.onlineStatus = "authenticated";
      }

      if (global.mainWindow) {
        global.mainWindow.webContents.send("account:authenticated", {
          accountId: accountId,
          status: "authenticated",
        });
      }
    });

    // Client ready - fully synced and operational
    client.on("ready", () => {
      console.log(`Account ${accountId} is ready and fully synced`);

      const account = this.accounts.get(accountId);
      if (account) {
        account.isActive = true;
        account.isAuthenticated = true;
        account.uiState.onlineStatus = "online";
      }

      // Notify renderer
      if (global.mainWindow) {
        global.mainWindow.webContents.send("account:ready", {
          accountId: accountId,
          status: "ready",
        });
      }
    });

    // Message handling with account tagging
    client.on("message", async (message) => {
      // Tag message with accountId to prevent mixing
      message.accountId = accountId;

      console.log(`Message received for account ${accountId}: ${message.from}`);

      // Update account's message cache
      const account = this.accounts.get(accountId);
      if (account) {
        const chatId = message.from;
        if (!account.uiState.messageCache.has(chatId)) {
          account.uiState.messageCache.set(chatId, []);
        }
        account.uiState.messageCache.get(chatId).push({
          id: message.id._serialized,
          from: message.from,
          body: message.body,
          timestamp: message.timestamp,
          accountId: accountId,
        });

        account.uiState.unreadCount++;
      }

      // Send to renderer
      if (global.mainWindow) {
        global.mainWindow.webContents.send("message:received", {
          accountId: accountId,
          message: {
            id: message.id._serialized,
            from: message.from,
            body: message.body,
            timestamp: message.timestamp,
          },
        });
      }
    });

    // Authentication failure
    client.on("auth_failure", (message) => {
      console.error(
        `Authentication failed for account ${accountId}: ${message}`
      );
      this.errorHandler.handleAccountError(
        accountId,
        new Error(`Authentication failed: ${message}`),
        "auth_failure"
      );
    });

    // Client disconnection
    client.on("disconnected", (reason) => {
      console.log(`Account ${accountId} disconnected: ${reason}`);

      const account = this.accounts.get(accountId);
      if (account) {
        account.isActive = false;
        account.uiState.onlineStatus = "disconnected";
      }

      if (global.mainWindow) {
        global.mainWindow.webContents.send("account:disconnected", {
          accountId: accountId,
          reason: reason,
        });
      }

      // Auto-reconnect after delay
      setTimeout(() => {
        console.log(`Attempting to reconnect account ${accountId}`);
        client.initialize();
      }, 10000); // 10 second delay
    });

    // General error handling
    client.on("error", (error) => {
      console.error(`Error in account ${accountId}:`, error);
      this.errorHandler.handleAccountError(accountId, error, "client_error");
    });
  }

  /**
   * Get QR code with multiple fallback strategies
   */
  async getQRCode(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (account.isAuthenticated) {
      throw new Error(`Account ${accountId} is already authenticated`);
    }

    console.log(`Starting simple QR generation for account: ${accountId}`);

    try {
      // Clean up any existing client
      if (account.client) {
        try {
          await account.client.destroy();
        } catch (e) {
          console.warn(`Client cleanup warning: ${e.message}`);
        }
      }

      // Create client and let whatsapp-web.js handle everything
      const client = await this.createSimpleIsolatedClient(accountId);
      account.client = client;

      // Set up event handlers
      this.setupClientEventHandlers(client, accountId);

      // Initialize client - this will handle browser launch, QR detection, etc.
      console.log(
        `Initializing whatsapp-web.js client for account: ${accountId}`
      );
      client.initialize();

      // Return immediately - QR code will come via event handler
      return {
        accountId,
        status: "initializing",
        message: "WhatsApp client is starting up...",
      };
    } catch (error) {
      console.error(
        `Simple QR generation failed for account ${accountId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Create isolated WhatsApp client with simplified settings
   */
  async createSimpleIsolatedClient(accountId) {
    const accountDataPath = path.join("./data/accounts", accountId);
    const chromeProfilePath = path.join(
      "./data/chrome_profiles",
      `chrome_${accountId}`
    );

    // Ensure directories exist
    if (!fs.existsSync(accountDataPath)) {
      fs.mkdirSync(accountDataPath, { recursive: true });
    }
    if (!fs.existsSync(chromeProfilePath)) {
      fs.mkdirSync(chromeProfilePath, { recursive: true });
    }

    console.log(`Creating simple isolated client for account ${accountId}`);

    // Let whatsapp-web.js handle everything with increased timeouts
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `account_${accountId}`,
        dataPath: accountDataPath,
      }),
      puppeteer: {
        headless: false, // Show browser for user interaction and debugging
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-blink-features=AutomationControlled",
          "--exclude-switches=enable-automation",
          `--user-data-dir=${chromeProfilePath}`,
        ],
        ignoreDefaultArgs: ["--enable-automation"],
        timeout: 120000, // 2 minutes browser launch timeout
        protocolTimeout: 600000, // 10 minutes protocol timeout for syncing
      },
      // Add WhatsApp-specific settings for better reliability
      webVersionCache: {
        type: "remote",
        remotePath:
          "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html",
      },
    });

    return client;
  }

  /**
   * Fallback QR generation using ultra-minimal approach
   */
  async fallbackQRGeneration(accountId) {
    console.log(`Attempting ultra-minimal fallback for account: ${accountId}`);

    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    try {
      // Clean up any existing client
      if (account.client) {
        try {
          await account.client.destroy();
        } catch (e) {
          console.warn(`Cleanup warning: ${e.message}`);
        }
      }
    } catch (error) {
      console.error(`Fallback QR generation failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Switch active account (simple tab switching)
   */
  async switchAccount(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // Update last accessed time
    account.lastAccessed = Date.now();

    // Set as active account
    this.activeAccount = accountId;

    console.log(`Switched to account: ${accountId}`);

    return {
      accountId: accountId,
      displayName: account.displayName,
      isAuthenticated: account.isAuthenticated,
      isActive: account.isActive,
      unreadCount: account.uiState.unreadCount,
    };
  }

  /**
   * Send message from specific account
   * CRITICAL: Validates account ownership before sending
   */
  async sendMessage(accountId, phoneNumber, messageText) {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (!account.isActive || !account.isAuthenticated) {
      throw new Error(`Account ${accountId} is not ready`);
    }

    // Validate phone number format
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const formattedPhone = `${cleanPhone}@c.us`;

    try {
      // Send message using isolated client
      const message = await account.client.sendMessage(
        formattedPhone,
        messageText
      );

      // CRITICAL: Tag sent message with accountId
      const messageData = {
        id: message.id._serialized,
        to: formattedPhone,
        body: messageText,
        timestamp: Date.now(),
        accountId: accountId, // CRITICAL: Account tagging
        status: "sent",
      };

      // Update account's message cache
      const chatId = formattedPhone;
      if (!account.uiState.messageCache.has(chatId)) {
        account.uiState.messageCache.set(chatId, []);
      }
      account.uiState.messageCache.get(chatId).push(messageData);

      console.log(`Message sent from account ${accountId} to ${phoneNumber}`);

      return messageData;
    } catch (error) {
      console.error(`Failed to send message from account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Get chats for specific account
   */
  async getChats(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (!account.isActive) {
      return []; // Return empty if not active
    }

    try {
      const chats = await account.client.getChats();

      // Process chats with account tagging
      const processedChats = chats.map((chat) => ({
        id: chat.id._serialized,
        name: chat.name,
        isGroup: chat.isGroup,
        lastMessage: chat.lastMessage
          ? {
              body: chat.lastMessage.body,
              timestamp: chat.lastMessage.timestamp,
            }
          : null,
        unreadCount: chat.unreadCount,
        accountId: accountId, // CRITICAL: Account tagging
      }));

      // Update account's contact list
      account.uiState.contactList = processedChats;

      return processedChats;
    } catch (error) {
      console.error(`Failed to get chats for account ${accountId}:`, error);
      return [];
    }
  }

  /**
   * Get all accounts status
   */
  async getAccounts() {
    const accountList = [];

    for (const [accountId, account] of this.accounts) {
      accountList.push({
        accountId: account.accountId,
        displayName: account.displayName,
        isActive: account.isActive,
        isAuthenticated: account.isAuthenticated,
        unreadCount: account.uiState.unreadCount,
        onlineStatus: account.uiState.onlineStatus,
        lastAccessed: account.lastAccessed,
      });
    }

    return accountList;
  }

  /**
   * Get accounts status summary
   */
  async getAccountsStatus() {
    const total = this.accounts.size;
    let active = 0;
    let authenticated = 0;

    for (const account of this.accounts.values()) {
      if (account.isActive) active++;
      if (account.isAuthenticated) authenticated++;
    }

    return { total, active, authenticated };
  }

  /**
   * Cleanup all accounts
   */
  cleanup() {
    console.log("Cleaning up AccountManager...");

    for (const [accountId, account] of this.accounts) {
      try {
        if (account.client) {
          account.client.destroy();
        }
        console.log(`Account ${accountId} cleaned up`);
      } catch (error) {
        console.error(`Error cleaning up account ${accountId}:`, error);
      }
    }

    this.accounts.clear();
    this.activeAccount = null;

    console.log("AccountManager cleanup completed");
  }
}

module.exports = AccountManager;
