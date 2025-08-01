const { contextBridge, ipcRenderer } = require("electron");

// Expose safe APIs to the renderer process
// This is the security bridge between main and renderer processes
contextBridge.exposeInMainWorld("electronAPI", {
  // Account Management APIs
  account: {
    create: (accountData) => ipcRenderer.invoke("account:create", accountData),
    list: () => ipcRenderer.invoke("account:list"),
    switch: (accountId) => ipcRenderer.invoke("account:switch", accountId),
    getQR: (accountId) => ipcRenderer.invoke("account:getQR", accountId),
    fallbackQR: (accountId) =>
      ipcRenderer.invoke("account:fallbackQR", accountId), // Add this line
  },

  // Message APIs
  message: {
    send: (accountId, phoneNumber, message) =>
      ipcRenderer.invoke("message:send", accountId, phoneNumber, message),
    getChats: (accountId) => ipcRenderer.invoke("message:getChats", accountId),
  },

  // Auto-messaging APIs
  autoMessage: {
    schedule: (scheduleData) =>
      ipcRenderer.invoke("autoMessage:schedule", scheduleData),
    getScheduled: () => ipcRenderer.invoke("autoMessage:getScheduled"),
  },

  // Template APIs
  template: {
    save: (templateData) => ipcRenderer.invoke("template:save", templateData),
    list: () => ipcRenderer.invoke("template:list"),
  },

  // System APIs
  system: {
    getStatus: () => ipcRenderer.invoke("system:getStatus"),
  },

  // Event listeners for real-time updates
  onAccountUpdate: (callback) => {
    ipcRenderer.on("account:update", (event, data) => callback(data));
  },

  onMessageReceived: (callback) => {
    ipcRenderer.on("message:received", (event, data) => callback(data));
  },

  onQRUpdate: (callback) => {
    ipcRenderer.on("qr:update", (event, data) => callback(data));
  },

  onError: (callback) => {
    ipcRenderer.on("error:notification", (event, data) => callback(data));
  },

  onManualQRInstructions: (callback) => {
    ipcRenderer.on("show:manual-qr-instructions", (event, data) =>
      callback(data)
    );
  },

  onQRBrowserInstructions: (callback) => {
    ipcRenderer.on("qr:browser-instructions", (event, data) => callback(data));
  },

  onAccountAuthenticated: (callback) => {
    ipcRenderer.on("account:authenticated", (event, data) => callback(data));
  },

  onQRScanned: (callback) => {
    ipcRenderer.on("qr:scanned", (event, data) => callback(data));
  },

  onAccountReady: (callback) => {
    ipcRenderer.on("account:ready", (event, data) => callback(data));
  },

  onQRInitializing: (callback) => {
    ipcRenderer.on("qr:initializing", (event, data) => callback(data));
  },

  onAccountConnecting: (callback) => {
    ipcRenderer.on("account:connecting", (event, data) => callback(data));
  },

  onAccountTimeout: (callback) => {
    ipcRenderer.on("account:timeout", (event, data) => callback(data));
  },

  onAccountBrowserOnly: (callback) => {
    ipcRenderer.on("account:browser-only", (event, data) => callback(data));
  },

  onAccountClientFailed: (callback) => {
    ipcRenderer.on("account:client-failed", (event, data) => callback(data));
  },

  onAccountLoading: (callback) => {
    ipcRenderer.on("account:loading", (event, data) => callback(data));
  },

  onAccountDisconnected: (callback) => {
    ipcRenderer.on("account:disconnected", (event, data) => callback(data));
  },

  onAccountQRTimeout: (callback) => {
    ipcRenderer.on("account:qr-timeout", (event, data) => callback(data));
  },

  onAccountCriticalTimeout: (callback) => {
    ipcRenderer.on("account:critical-timeout", (event, data) => callback(data));
  },

  onAccountError: (callback) => {
    ipcRenderer.on("account:error", (event, data) => callback(data));
  },

  onAccountAuthFailed: (callback) => {
    ipcRenderer.on("account:auth-failed", (event, data) => callback(data));
  },

  // Remove event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Simple utility functions that don't need main process
contextBridge.exposeInMainWorld("utils", {
  // Date formatting
  formatDate: (date) => {
    return new Date(date).toLocaleDateString();
  },

  formatTime: (date) => {
    return new Date(date).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  },

  // Phone number validation
  validatePhoneNumber: (phone) => {
    // Basic phone number validation
    const cleaned = phone.replace(/\D/g, "");
    return cleaned.length >= 10 && cleaned.length <= 15;
  },

  // Generate unique IDs
  generateId: () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // Template variable processing (client-side for preview)
  processTemplate: (template, variables = {}) => {
    let processed = template;
    processed = processed.replace(/{name}/g, variables.name || "[Name]");
    processed = processed.replace(
      /{date}/g,
      variables.date || new Date().toLocaleDateString()
    );
    processed = processed.replace(
      /{time}/g,
      variables.time || new Date().toLocaleTimeString()
    );
    return processed;
  },
});

console.log("Preload script loaded - Security bridge established");
