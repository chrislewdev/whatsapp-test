const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

// Import our core modules
const AccountManager = require("./src/account-manager");
const AutoMessaging = require("./src/auto-messaging");
const ErrorHandler = require("./src/error-handler");

class WhatsAppMultiApp {
  constructor() {
    this.mainWindow = null;
    this.accountManager = null;
    this.autoMessaging = null;
    this.errorHandler = null;
    this.isDev = process.argv.includes("--dev");

    // Initialize app
    this.init();
  }

  init() {
    // Ensure data directories exist
    this.createDataDirectories();

    // Initialize core components
    this.errorHandler = new ErrorHandler();
    this.accountManager = new AccountManager(this.errorHandler);
    this.autoMessaging = new AutoMessaging(this.accountManager);

    // Set up Electron event handlers
    this.setupElectronEvents();
    this.setupIPCHandlers();
  }

  createDataDirectories() {
    const dataDirs = [
      "./data",
      "./data/accounts",
      "./data/templates",
      "./data/schedules",
      "./data/chrome_profiles",
      "./data/logs",
    ];

    dataDirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      }
    });
  }

  setupElectronEvents() {
    // App ready - create main window
    app.whenReady().then(() => {
      this.createMainWindow();

      // macOS - recreate window when dock icon clicked
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createMainWindow();
        }
      });
    });

    // Quit when all windows closed (except macOS)
    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        this.cleanup();
        app.quit();
      }
    });

    // Before quit - cleanup
    app.on("before-quit", () => {
      this.cleanup();
    });
  }

  createMainWindow() {
    // Create the main application window
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false, // Security best practice
        contextIsolation: true, // Security best practice
        preload: path.join(__dirname, "preload.js"),
        webSecurity: true,
      },
      icon: path.join(__dirname, "build/icon.png"),
      show: false, // Don't show until ready
    });

    global.mainWindow = this.mainWindow;

    // Enable F12 to toggle DevTools
    this.mainWindow.webContents.on("before-input-event", (event, input) => {
      if (input.key === "F12") {
        this.mainWindow.webContents.toggleDevTools();
      }
      // Also enable Ctrl+Shift+I as alternative
      if ((input.control || input.meta) && input.shift && input.key === "I") {
        this.mainWindow.webContents.toggleDevTools();
      }
    });

    // Load the main interface
    this.mainWindow.loadFile("./renderer/index.html");

    // Show window when ready
    this.mainWindow.once("ready-to-show", () => {
      this.mainWindow.show();

      // Open DevTools in development
      if (this.isDev) {
        this.mainWindow.webContents.openDevTools();
      }
    });

    // Handle window closed
    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    console.log("Main window created");
  }

  setupIPCHandlers() {
    // Account Management IPC handlers
    ipcMain.handle("account:create", async (event, accountData) => {
      try {
        console.log(`Creating account: ${JSON.stringify(accountData)}`);
        const result = await this.accountManager.createAccount(accountData);
        console.log(`Account created successfully: ${result.accountId}`);
        return { success: true, data: result };
      } catch (error) {
        console.error(`Account creation failed:`, error);
        this.errorHandler.handleError("account:create", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("account:list", async () => {
      try {
        const accounts = await this.accountManager.getAccounts();
        return { success: true, data: accounts };
      } catch (error) {
        this.errorHandler.handleError("account:list", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("account:switch", async (event, accountId) => {
      try {
        const result = await this.accountManager.switchAccount(accountId);
        return { success: true, data: result };
      } catch (error) {
        this.errorHandler.handleError("account:switch", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("account:getQR", async (event, accountId) => {
      try {
        console.log(`QR request for account: ${accountId}`);
        const qrCode = await this.accountManager.getQRCode(accountId);
        console.log(`QR generated successfully for account: ${accountId}`);
        console.log(`QR data status: ${qrCode.status}`);
        return { success: true, data: qrCode };
      } catch (error) {
        console.error(`QR generation failed for account ${accountId}:`, error);
        this.errorHandler.handleError("account:getQR", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("account:fallbackQR", async (event, accountId) => {
      try {
        console.log(`Fallback QR request for account: ${accountId}`);
        const qrCode = await this.accountManager.fallbackQRGeneration(
          accountId
        );
        console.log(
          `Fallback QR generated successfully for account: ${accountId}`
        );
        return { success: true, data: qrCode };
      } catch (error) {
        console.error(
          `Fallback QR generation failed for account ${accountId}:`,
          error
        );
        return { success: false, error: error.message };
      }
    });

    // Message handling IPC handlers
    ipcMain.handle(
      "message:send",
      async (event, accountId, phoneNumber, message) => {
        try {
          const result = await this.accountManager.sendMessage(
            accountId,
            phoneNumber,
            message
          );
          return { success: true, data: result };
        } catch (error) {
          this.errorHandler.handleError("message:send", error);
          return { success: false, error: error.message };
        }
      }
    );

    ipcMain.handle("message:getChats", async (event, accountId) => {
      try {
        const chats = await this.accountManager.getChats(accountId);
        return { success: true, data: chats };
      } catch (error) {
        this.errorHandler.handleError("message:getChats", error);
        return { success: false, error: error.message };
      }
    });

    // Auto-messaging IPC handlers
    ipcMain.handle("autoMessage:schedule", async (event, scheduleData) => {
      try {
        const result = await this.autoMessaging.scheduleMessage(scheduleData);
        return { success: true, data: result };
      } catch (error) {
        this.errorHandler.handleError("autoMessage:schedule", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("autoMessage:getScheduled", async () => {
      try {
        const scheduled = await this.autoMessaging.getScheduledMessages();
        return { success: true, data: scheduled };
      } catch (error) {
        this.errorHandler.handleError("autoMessage:getScheduled", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("template:save", async (event, templateData) => {
      try {
        const result = await this.autoMessaging.saveTemplate(templateData);
        return { success: true, data: result };
      } catch (error) {
        this.errorHandler.handleError("template:save", error);
        return { success: false, error: error.message };
      }
    });

    ipcMain.handle("template:list", async () => {
      try {
        const templates = await this.autoMessaging.getTemplates();
        return { success: true, data: templates };
      } catch (error) {
        this.errorHandler.handleError("template:list", error);
        return { success: false, error: error.message };
      }
    });

    // System IPC handlers
    ipcMain.handle("system:getStatus", async () => {
      try {
        const status = {
          accounts: await this.accountManager.getAccountsStatus(),
          scheduled: await this.autoMessaging.getScheduledCount(),
          errors: await this.errorHandler.getRecentErrors(),
        };
        return { success: true, data: status };
      } catch (error) {
        return { success: false, error: error.message };
      }
    });

    console.log("IPC handlers registered");
  }

  cleanup() {
    console.log("Cleaning up application...");

    // Stop all WhatsApp clients
    if (this.accountManager) {
      this.accountManager.cleanup();
    }

    // Stop auto-messaging
    if (this.autoMessaging) {
      this.autoMessaging.cleanup();
    }

    console.log("Cleanup completed");
  }
}

// Create the application instance
const whatsappApp = new WhatsAppMultiApp();

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
  if (whatsappApp.errorHandler) {
    whatsappApp.errorHandler.handleError("uncaughtException", error);
  }
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
  if (whatsappApp.errorHandler) {
    whatsappApp.errorHandler.handleError("unhandledRejection", reason);
  }
});
