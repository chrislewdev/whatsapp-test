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

    console.log(`Starting QR generation for account: ${accountId}`);

    let simpleError, directError, minimalError; // Declare variables at function scope

    // Strategy 1: Try simplified whatsapp-web.js approach
    try {
      console.log(
        `Trying simplified whatsapp-web.js approach for account: ${accountId}`
      );

      if (account.client) {
        try {
          await account.client.destroy();
        } catch (e) {
          console.warn(`Client cleanup warning: ${e.message}`);
        }
      }

      const newClient = await this.createIsolatedClient(accountId);
      account.client = newClient;
      this.setupClientEventHandlers(newClient, accountId);

      const result = await this.waitForQR(newClient, accountId, 1);
      console.log(`Simplified approach successful for account: ${accountId}`);
      return result;
    } catch (error) {
      simpleError = error; // Now properly scoped
      console.log(
        `Simplified approach failed for account ${accountId}: ${error.message}`
      );

      // Clean up failed client
      try {
        if (account.client) {
          await account.client.destroy();
        }
      } catch (e) {
        console.warn(`Cleanup warning: ${e.message}`);
      }
    }

    // Strategy 2: Try direct Puppeteer approach
    try {
      console.log(`Trying direct Puppeteer approach for account: ${accountId}`);
      const result = await this.directPuppeteerQR(accountId);
      console.log(
        `Direct Puppeteer approach successful for account: ${accountId}`
      );
      return result;
    } catch (error) {
      directError = error; // Now properly scoped
      console.log(
        `Direct Puppeteer approach failed for account ${accountId}: ${error.message}`
      );
    }

    // Strategy 3: Try absolute minimal settings
    try {
      console.log(`Trying minimal settings approach for account: ${accountId}`);

      const minimalClient = new Client({
        authStrategy: new LocalAuth({
          clientId: `account_${accountId}`,
          dataPath: path.join("./data/accounts", accountId),
        }),
        puppeteer: {
          headless: true,
          args: ["--no-sandbox"],
        },
      });

      account.client = minimalClient;
      this.setupClientEventHandlers(minimalClient, accountId);

      const result = await this.waitForQR(minimalClient, accountId, 1);
      console.log(
        `Minimal settings approach successful for account: ${accountId}`
      );
      return result;
    } catch (error) {
      minimalError = error; // Now properly scoped
      console.log(
        `Minimal settings approach failed for account ${accountId}: ${error.message}`
      );
    }

    // All strategies failed
    throw new Error(
      `All QR generation strategies failed. Simplified: ${simpleError?.message}, Direct: ${directError?.message}, Minimal: ${minimalError?.message}`
    );
  }

  /**
   * Simplified QR waiting with basic timeout
   */
  async waitForQR(client, accountId, attempt) {
    return new Promise((resolve, reject) => {
      let isResolved = false;
      let timeoutId;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
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

      // QR code received
      client.once("qr", (qr) => {
        console.log(
          `QR code received for account ${accountId} (attempt ${attempt})`
        );
        resolveOnce({
          accountId,
          qrCode: qr,
          status: "qr_generated",
        });
      });

      // Client ready (already authenticated)
      client.once("ready", () => {
        console.log(`Client already authenticated for account ${accountId}`);
        resolveOnce({
          accountId,
          status: "already_authenticated",
        });
      });

      // Authentication failure
      client.once("auth_failure", (msg) => {
        console.error(`Auth failure for account ${accountId}:`, msg);
        rejectOnce(new Error(`Authentication failed: ${msg}`));
      });

      // Client disconnection
      client.once("disconnected", (reason) => {
        console.error(`Client disconnected for account ${accountId}:`, reason);
        rejectOnce(new Error(`Client disconnected: ${reason}`));
      });

      // Simple timeout - no health checks
      timeoutId = setTimeout(() => {
        console.error(
          `Timeout waiting for QR for account ${accountId} (attempt ${attempt})`
        );
        rejectOnce(
          new Error(
            `QR generation timed out after 90 seconds (attempt ${attempt})`
          )
        );
      }, 90000); // 90 seconds

      // Initialize client
      console.log(
        `Initializing client for account ${accountId} (attempt ${attempt})`
      );
      client.initialize().catch((error) => {
        console.error(
          `Client initialization error for account ${accountId}:`,
          error
        );
        rejectOnce(new Error(`Client initialization failed: ${error.message}`));
      });
    });
  }

  /**
   * Alternative QR generation using direct puppeteer approach
   */
  async directPuppeteerQR(accountId) {
    console.log(`Trying direct Puppeteer approach for account: ${accountId}`);

    const puppeteer = require("puppeteer");
    let browser;
    let page;

    try {
      // Launch browser directly
      browser = await puppeteer.launch({
        headless: "new",
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
        ],
        timeout: 60000,
      });

      page = await browser.newPage();

      // Set a realistic user agent
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      );

      // Navigate to WhatsApp Web
      console.log("Navigating to WhatsApp Web...");
      await page.goto("https://web.whatsapp.com", {
        waitUntil: "networkidle2",
        timeout: 45000,
      });

      console.log("Navigated to WhatsApp Web, waiting for QR code...");

      // Try multiple QR code selectors
      const qrSelectors = [
        'canvas[aria-label="Scan me!"]',
        'canvas[role="img"]',
        "div[data-ref] canvas",
        "canvas",
        '[data-testid="qr-code"] canvas',
      ];

      let qrElement;
      let usedSelector;

      for (const selector of qrSelectors) {
        try {
          console.log(`Trying QR selector: ${selector}`);
          await page.waitForSelector(selector, { timeout: 10000 });
          qrElement = await page.$(selector);
          if (qrElement) {
            usedSelector = selector;
            console.log(`Found QR code with selector: ${selector}`);
            break;
          }
        } catch (selectorError) {
          console.log(`Selector ${selector} failed: ${selectorError.message}`);
          continue;
        }
      }

      if (!qrElement) {
        // Take a screenshot for debugging
        await page.screenshot({ path: `debug_${accountId}.png` });
        throw new Error(
          "Could not find QR code element with any known selector"
        );
      }

      // Get QR code as base64
      const qrCode = await page.evaluate((selector) => {
        const canvas = document.querySelector(selector);
        if (canvas) {
          return canvas.toDataURL().split(",")[1];
        }
        return null;
      }, usedSelector);

      if (qrCode) {
        console.log(`Direct QR code generated for account ${accountId}`);

        // IMPORTANT: Send QR code to frontend immediately
        if (global.mainWindow) {
          console.log(`Sending QR code to frontend for account ${accountId}`);
          global.mainWindow.webContents.send("qr:update", {
            accountId: accountId,
            qrCode: qrCode,
          });
          console.log(`QR code sent to frontend for account ${accountId}`);

          // Add a small delay to ensure the message is processed
          await new Promise((resolve) => setTimeout(resolve, 100));
        } else {
          console.warn("Main window not available for sending QR code");
        }

        return {
          accountId,
          qrCode: qrCode,
          status: "qr_generated",
        };
      } else {
        throw new Error("Could not extract QR code from canvas element");
      }
    } catch (error) {
      console.error(
        `Direct Puppeteer QR failed for account ${accountId}:`,
        error
      );
      throw error;
    } finally {
      if (page) {
        try {
          await page.close();
        } catch (e) {
          console.warn(`Page close warning: ${e.message}`);
        }
      }
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          console.warn(`Browser close warning: ${e.message}`);
        }
      }
    }
  }

  /**
   * Create isolated WhatsApp client with simplified settings
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

    console.log(
      `Creating client for account ${accountId} with simplified settings`
    );

    // Try to find Chrome executable paths
    const possiblePaths = [
      "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
      "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      process.env.CHROME_BIN,
      process.env.GOOGLE_CHROME_BIN,
    ].filter(Boolean);

    let executablePath;
    for (const path of possiblePaths) {
      if (fs.existsSync(path)) {
        executablePath = path;
        console.log(`Found Chrome at: ${path}`);
        break;
      }
    }

    // Create client with minimal, reliable settings
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: `account_${accountId}`,
        dataPath: accountDataPath,
      }),
      puppeteer: {
        headless: "new", // Use new headless mode
        executablePath: executablePath,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-first-run",
          "--disable-web-security",
          "--disable-features=VizDisplayCompositor",
          `--user-data-dir=${chromeProfilePath}`,
        ],
        ignoreDefaultArgs: ["--disable-extensions"],
        ignoreHTTPSErrors: true,
        timeout: 60000,
        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false,
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

      // Try the direct Puppeteer approach as fallback
      return await this.directPuppeteerQR(accountId);
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
