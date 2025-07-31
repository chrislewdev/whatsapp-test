const { contextBridge, ipcRenderer } = require('electron');

// Expose safe APIs to the renderer process
// This is the security bridge between main and renderer processes
contextBridge.exposeInMainWorld('electronAPI', {
  // Account Management APIs
  account: {
    create: (accountData) => ipcRenderer.invoke('account:create', accountData),
    list: () => ipcRenderer.invoke('account:list'),
    switch: (accountId) => ipcRenderer.invoke('account:switch', accountId),
    getQR: (accountId) => ipcRenderer.invoke('account:getQR', accountId)
  },

  // Message APIs
  message: {
    send: (accountId, phoneNumber, message) => 
      ipcRenderer.invoke('message:send', accountId, phoneNumber, message),
    getChats: (accountId) => ipcRenderer.invoke('message:getChats', accountId)
  },

  // Auto-messaging APIs
  autoMessage: {
    schedule: (scheduleData) => ipcRenderer.invoke('autoMessage:schedule', scheduleData),
    getScheduled: () => ipcRenderer.invoke('autoMessage:getScheduled')
  },

  // Template APIs
  template: {
    save: (templateData) => ipcRenderer.invoke('template:save', templateData),
    list: () => ipcRenderer.invoke('template:list')
  },

  // System APIs
  system: {
    getStatus: () => ipcRenderer.invoke('system:getStatus')
  },

  // Event listeners for real-time updates
  onAccountUpdate: (callback) => {
    ipcRenderer.on('account:update', (event, data) => callback(data));
  },

  onMessageReceived: (callback) => {
    ipcRenderer.on('message:received', (event, data) => callback(data));
  },

  onQRUpdate: (callback) => {
    ipcRenderer.on('qr:update', (event, data) => callback(data));
  },

  onError: (callback) => {
    ipcRenderer.on('error:notification', (event, data) => callback(data));
  },

  // Remove event listeners
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel);
  }
});

// Simple utility functions that don't need main process
contextBridge.exposeInMainWorld('utils', {
  // Date formatting
  formatDate: (date) => {
    return new Date(date).toLocaleDateString();
  },

  formatTime: (date) => {
    return new Date(date).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  },

  // Phone number validation
  validatePhoneNumber: (phone) => {
    // Basic phone number validation
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
  },

  // Generate unique IDs
  generateId: () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // Template variable processing (client-side for preview)
  processTemplate: (template, variables = {}) => {
    let processed = template;
    processed = processed.replace(/{name}/g, variables.name || '[Name]');
    processed = processed.replace(/{date}/g, variables.date || new Date().toLocaleDateString());
    processed = processed.replace(/{time}/g, variables.time || new Date().toLocaleTimeString());
    return processed;
  }
});

console.log('Preload script loaded - Security bridge established');