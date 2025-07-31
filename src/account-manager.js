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
    // QR Code generation
    client.on("qr", (qr) => {
      console.log(`QR Code generated for account ${accountId}`);

      // Send QR to renderer with account tagging
      if (global.mainWindow) {
        global.mainWindow.webContents.send("qr:update", {
          accountId: accountId,
          qrCode: qr,
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
    });

    // Client ready
    client.on("ready", () => {
      console.log(`Account ${accountId} is ready`);

      const account = this.accounts.get(accountId);
      if (account) {
        account.isActive = true;
        account.uiState.onlineStatus = "online";
      }

      // Notify renderer
      if (global.mainWindow) {
        global.mainWindow.webContents.send("account:update", {
          accountId: accountId,
          status: "ready",
        });
      }
    });

    // CRITICAL: Message handling with account tagging
    client.on("message", async (message) => {
      // CRITICAL: Tag message with accountId to prevent mixing
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
          accountId: accountId, // CRITICAL: Always tag with account
        });

        // Update unread count
        account.uiState.unreadCount++;
      }

      // Send to renderer with account tagging
      if (global.mainWindow) {
        global.mainWindow.webContents.send("message:received", {
          accountId: accountId, // CRITICAL: Account identification
          message: {
            id: message.id._serialized,
            from: message.from,
            body: message.body,
            timestamp: message.timestamp,
          },
        });
      }
    });

    // Client disconnection
    client.on("disconnected", (reason) => {
      console.log(`Account ${accountId} disconnected: ${reason}`);

      const account = this.accounts.get(accountId);
      if (account) {
        account.isActive = false;
        account.uiState.onlineStatus = "disconnected";
      }

      // Attempt to reconnect after delay
      setTimeout(() => {
        console.log(`Attempting to reconnect account ${accountId}`);
        client.initialize();
      }, 5000);
    });

    // Error handling with account context
    client.on("error", (error) => {
      console.error(`Error in account ${accountId}:`, error);
      this.errorHandler.handleAccountError(accountId, error, "client_error");
    });
  }
  /**
   * Get QR code for account authentication with improved initialization
   */
  async getQRCode(accountId) {
    const account = this.accounts.get(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    if (account.isAuthenticated) {
      throw new Error(`Account ${accountId} is already authenticated`);
    }

    console.log(`Starting QR generation for account: ${accountId}`);

    try {
      // First, try to destroy any existing client
      if (account.client) {
        try {
          await account.client.destroy();
          console.log(`Destroyed existing client for account: ${accountId}`);
        } catch (destroyError) {
          console.warn(
            `Failed to destroy existing client: ${destroyError.message}`
          );
        }
      }

      // Create new client with retries
      const maxRetries = 3;
      let lastError;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(
          `QR generation attempt ${attempt}/${maxRetries} for account: ${accountId}`
        );

        try {
          // Create fresh client for this attempt
          const newClient = await this.createIsolatedClient(accountId);
          account.client = newClient;

          // Set up event handlers
          this.setupClientEventHandlers(newClient, accountId);

          // Wait for QR with timeout
          const result = await this.waitForQR(newClient, accountId, attempt);
          console.log(`QR generation successful for account: ${accountId}`);
          return result;
        } catch (attemptError) {
          lastError = attemptError;
          console.error(
            `QR generation attempt ${attempt} failed for account ${accountId}:`,
            attemptError.message
          );

          // Clean up failed client
          try {
            if (account.client) {
              await account.client.destroy();
            }
          } catch (cleanupError) {
            console.warn(
              `Cleanup error after attempt ${attempt}:`,
              cleanupError.message
            );
          }

          // Wait before retry (except last attempt)
          if (attempt < maxRetries) {
            const delay = attempt * 2000; // 2s, 4s delays
            console.log(`Waiting ${delay}ms before next attempt...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }

      throw new Error(
        `Failed to generate QR after ${maxRetries} attempts. Last error: ${lastError.message}`
      );
    } catch (error) {
      console.error(`QR generation failed for account ${accountId}:`, error);
      throw error;
    }
  }

  /**
   * Wait for QR code generation with proper timeout handling
   */
  async waitForQR(client, accountId, attempt) {
    return new Promise((resolve, reject) => {
      let isResolved = false;
      let qrTimeout;
      let healthCheckInterval;

      const cleanup = () => {
        if (qrTimeout) clearTimeout(qrTimeout);
        if (healthCheckInterval) clearInterval(healthCheckInterval);
      };

      const resolveOnce = (result) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          resolve(result);
        }
      };

      const rejectOnce = (error) => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(error);
        }
      };

      // Set up event handlers
      const onQR = (qr) => {
        console.log(
          `QR code received for account ${accountId} (attempt ${attempt})`
        );
        resolveOnce({
          accountId,
          qrCode: qr,
          status: "qr_generated",
        });
      };

      const onReady = () => {
        console.log(`Client already authenticated for account ${accountId}`);
        resolveOnce({
          accountId,
          status: "already_authenticated",
        });
      };

      const onAuthFailure = (msg) => {
        console.error(`Auth failure for account ${accountId}:`, msg);
        rejectOnce(new Error(`Authentication failed: ${msg}`));
      };

      const onDisconnected = (reason) => {
        console.error(
          `Client disconnected during init for account ${accountId}:`,
          reason
        );
        rejectOnce(new Error(`Disconnected during initialization: ${reason}`));
      };

      // Add event listeners
      client.once("qr", onQR);
      client.once("ready", onReady);
      client.once("auth_failure", onAuthFailure);
      client.once("disconnected", onDisconnected);

      // Health check to detect if client becomes unresponsive
      let healthCheckCount = 0;
      healthCheckInterval = setInterval(() => {
        healthCheckCount++;
        console.log(
          `Health check ${healthCheckCount} for account ${accountId} (attempt ${attempt})`
        );

        // Check if client is still alive by trying to access its properties
        try {
          if (!client.pupPage || client.pupPage.isClosed()) {
            rejectOnce(new Error("Browser page was closed unexpectedly"));
            return;
          }
        } catch (error) {
          console.warn(
            `Health check failed for account ${accountId}:`,
            error.message
          );
        }

        // If we've been waiting too long, something is wrong
        if (healthCheckCount > 12) {
          // 12 * 5s = 60s
          rejectOnce(
            new Error("Client appears to be unresponsive (health check failed)")
          );
        }
      }, 5000);

      // Set overall timeout
      const timeoutDuration = 70000; // 70 seconds
      qrTimeout = setTimeout(() => {
        rejectOnce(
          new Error(
            `Client initialization timed out after ${
              timeoutDuration / 1000
            }s (attempt ${attempt})`
          )
        );
      }, timeoutDuration);

      // Initialize client with additional error handling
      const initPromise = client.initialize();

      initPromise.catch((initError) => {
        console.error(
          `Client.initialize() failed for account ${accountId} (attempt ${attempt}):`,
          initError.message
        );

        // Don't immediately reject, sometimes the client recovers from init errors
        setTimeout(() => {
          if (!isResolved) {
            rejectOnce(
              new Error(`Initialization failed: ${initError.message}`)
            );
          }
        }, 5000); // Give it 5 seconds to recover
      });

      console.log(
        `Waiting for QR or ready event for account ${accountId} (attempt ${attempt}, timeout: ${timeoutDuration}ms)`
      );
    });
  }

  /**
   * Create isolated WhatsApp client with Electron-optimized settings
   */
  async createIsolatedClient(accountId) {
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

    console.log(`Creating client for account ${accountId}`);

    // Get Electron's Chrome executable path for better compatibility
    const { app } = require("electron");
    let executablePath;
    try {
      // Try to use Electron's Chrome
      executablePath = app.getPath("exe").replace("electron.exe", "chrome.exe");
      if (!fs.existsSync(executablePath)) {
        executablePath = undefined; // Let puppeteer find Chrome
      }
    } catch (error) {
      console.log("Could not get Electron Chrome path, using system Chrome");
      executablePath = undefined;
    }

    // Create client with Electron-compatible settings
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `account_${accountId}`,
        dataPath: accountDataPath,
      }),
      puppeteer: {
        headless: true,
        executablePath: executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          "--disable-background-timer-throttling",
          "--disable-backgrounding-occluded-windows",
          "--disable-renderer-backgrounding",
          "--disable-extensions",
          "--disable-plugins",
          "--disable-default-apps",
          "--disable-hang-monitor",
          "--disable-prompt-on-repost",
          "--disable-sync",
          "--disable-translate",
          "--disable-logging",
          "--disable-notifications",
          "--no-default-browser-check",
          "--no-experiments",
          "--memory-pressure-off",
          "--single-process", // Important for Electron compatibility
          "--disable-background-networking",
          "--disable-background-media-loading",
          "--disable-client-side-phishing-detection",
          "--disable-default-browser-check",
          "--disable-domain-reliability",
          "--disable-ipc-flooding-protection",
          `--user-data-dir=${chromeProfilePath}`,
        ],
        timeout: 0, // Disable puppeteer timeout, we handle it ourselves
        ignoreDefaultArgs: false,
        ignoreHTTPSErrors: true,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
        dumpio: false, // Set to true for debugging puppeteer
      },
    });

    return client;
  }

  /**
   * Fallback QR generation using alternative approach
   */
  async fallbackQRGeneration(accountId) {
    console.log(`Attempting fallback QR generation for account: ${accountId}`);

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

      // Create client with minimal puppeteer settings
      const client = new Client({
        authStrategy: new LocalAuth({
          clientId: `account_${accountId}`,
          dataPath: path.join("./data/accounts", accountId),
        }),
        puppeteer: {
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
          timeout: 0,
        },
      });

      account.client = client;
      this.setupClientEventHandlers(client, accountId);

      // Simple promise-based approach
      return new Promise((resolve, reject) => {
        let resolved = false;

        const finish = (result) => {
          if (!resolved) {
            resolved = true;
            resolve(result);
          }
        };

        const fail = (error) => {
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        };

        client.once("qr", (qr) => {
          console.log(`Fallback QR generated for account ${accountId}`);
          finish({ accountId, qrCode: qr, status: "qr_generated" });
        });

        client.once("ready", () => {
          console.log(`Fallback: Account ${accountId} already authenticated`);
          finish({ accountId, status: "already_authenticated" });
        });

        client.once("auth_failure", (msg) => {
          fail(new Error(`Fallback auth failure: ${msg}`));
        });

        setTimeout(() => {
          fail(new Error("Fallback method timed out after 90 seconds"));
        }, 90000);

        client.initialize().catch(fail);
      });
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
