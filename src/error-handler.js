const fs = require('fs');
const path = require('path');

class ErrorHandler {
  constructor() {
    this.retryAttempts = new Map(); // accountId -> retry count
    this.maxRetries = 3;
    this.retryDelay = 10000; // 10 seconds
    this.recentErrors = [];
    this.maxRecentErrors = 50;
    
    // Ensure logs directory exists
    this.logPath = path.join('./data/logs', 'errors.log');
    this.ensureLogDirectory();
    
    console.log('ErrorHandler initialized');
  }

  ensureLogDirectory() {
    const logDir = path.dirname(this.logPath);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  /**
   * Handle account-specific errors with smart retry logic
   * This prevents one account's issues from affecting others
   */
  async handleAccountError(accountId, error, context) {
    const timestamp = new Date().toISOString();
    const errorInfo = {
      accountId,
      error: error.message || error,
      context,
      timestamp,
      stack: error.stack
    };

    console.error(`Account ${accountId} error in ${context}:`, error);
    
    // Log error to file
    this.logError(errorInfo);
    
    // Add to recent errors (for UI display)
    this.addToRecentErrors(errorInfo);
    
    // Categorize error severity
    if (this.isCriticalError(error)) {
      await this.handleCriticalError(accountId, error, context);
      return;
    }
    
    if (this.isNetworkError(error)) {
      await this.handleNetworkError(accountId, error, context);
      return;
    }
    
    // Default: attempt retry with exponential backoff
    await this.handleRetryableError(accountId, error, context);
  }

  /**
   * Handle general application errors
   */
  handleError(context, error) {
    const timestamp = new Date().toISOString();
    const errorInfo = {
      accountId: 'system',
      error: error.message || error,
      context,
      timestamp,
      stack: error.stack
    };

    console.error(`System error in ${context}:`, error);
    
    // Log error
    this.logError(errorInfo);
    this.addToRecentErrors(errorInfo);
    
    // Notify user if main window exists
    this.notifyUser(`System Error: ${error.message}`, 'error');
  }

  /**
   * Determine if error is critical (account should be disabled)
   */
  isCriticalError(error) {
    const criticalMessages = [
      'Authentication failure',
      'Account banned',
      'Invalid session',
      'Protocol error',
      'Unauthorized',
      'Account not found'
    ];
    
    const errorMessage = error.message || error.toString();
    return criticalMessages.some(msg => 
      errorMessage.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Determine if error is network-related (recoverable)
   */
  isNetworkError(error) {
    const networkMessages = [
      'network error',
      'connection refused',
      'timeout',
      'socket hang up',
      'getaddrinfo',
      'connect ETIMEDOUT',
      'connect ECONNREFUSED'
    ];
    
    const errorMessage = error.message || error.toString();
    return networkMessages.some(msg => 
      errorMessage.toLowerCase().includes(msg.toLowerCase())
    );
  }

  /**
   * Handle critical errors - disable account
   */
  async handleCriticalError(accountId, error, context) {
    console.error(`CRITICAL ERROR for account ${accountId}: ${error.message}`);
    
    // Notify that account will be disabled
    this.notifyUser(
      `Account ${accountId} disabled due to critical error: ${error.message}`,
      'critical'
    );
    
    // Clear retry attempts
    this.retryAttempts.delete(accountId);
    
    // Send account disable notification
    if (global.mainWindow) {
      global.mainWindow.webContents.send('account:update', {
        accountId: accountId,
        status: 'disabled',
        error: error.message
      });
    }
  }

  /**
   * Handle network errors with smart retry
   */
  async handleNetworkError(accountId, error, context) {
    console.log(`Network error for account ${accountId}, will retry...`);
    
    // Shorter retry delay for network issues
    const networkRetryDelay = 5000; // 5 seconds
    
    const retries = this.retryAttempts.get(accountId) || 0;
    if (retries < this.maxRetries) {
      this.retryAttempts.set(accountId, retries + 1);
      
      this.notifyUser(
        `Network error for account ${accountId}. Retrying in 5 seconds... (${retries + 1}/${this.maxRetries})`,
        'warning'
      );
      
      setTimeout(async () => {
        await this.retryAccountConnection(accountId);
      }, networkRetryDelay);
    } else {
      this.notifyUser(
        `Account ${accountId} failed after ${this.maxRetries} network retry attempts`,
        'error'
      );
      this.retryAttempts.delete(accountId);
    }
  }

  /**
   * Handle general retryable errors
   */
  async handleRetryableError(accountId, error, context) {
    const retries = this.retryAttempts.get(accountId) || 0;
    
    if (retries < this.maxRetries) {
      this.retryAttempts.set(accountId, retries + 1);
      
      // Exponential backoff: 10s, 20s, 40s
      const delay = this.retryDelay * Math.pow(2, retries);
      
      this.notifyUser(
        `Error in account ${accountId}: ${error.message}. Retrying in ${delay/1000} seconds... (${retries + 1}/${this.maxRetries})`,
        'warning'
      );
      
      setTimeout(async () => {
        await this.retryAccountConnection(accountId);
      }, delay);
    } else {
      this.notifyUser(
        `Account ${accountId} failed after ${this.maxRetries} retry attempts. Manual intervention required.`,
        'error'
      );
      this.retryAttempts.delete(accountId);
    }
  }

  /**
   * Attempt to reconnect account
   */
  async retryAccountConnection(accountId) {
    try {
      console.log(`Retrying connection for account ${accountId}`);
      
      // This would be implemented by the AccountManager
      // For now, just send retry notification
      if (global.mainWindow) {
        global.mainWindow.webContents.send('account:retry', {
          accountId: accountId
        });
      }
      
    } catch (error) {
      console.error(`Retry failed for account ${accountId}:`, error);
      await this.handleAccountError(accountId, error, 'retry_attempt');
    }
  }

  /**
   * Clear retry count when account recovers
   */
  clearRetries(accountId) {
    if (this.retryAttempts.has(accountId)) {
      console.log(`Clearing retry count for recovered account ${accountId}`);
      this.retryAttempts.delete(accountId);
    }
  }

  /**
   * Log error to file
   */
  logError(errorInfo) {
    const logEntry = {
      timestamp: errorInfo.timestamp,
      accountId: errorInfo.accountId,
      context: errorInfo.context,
      error: errorInfo.error,
      stack: errorInfo.stack
    };

    const logLine = JSON.stringify(logEntry) + '\n';
    
    try {
      fs.appendFileSync(this.logPath, logLine);
    } catch (err) {
      console.error('Failed to write to error log:', err);
    }
  }

  /**
   * Add error to recent errors list (for UI display)
   */
  addToRecentErrors(errorInfo) {
    this.recentErrors.unshift({
      id: Date.now().toString(),
      accountId: errorInfo.accountId,
      error: errorInfo.error,
      context: errorInfo.context,
      timestamp: errorInfo.timestamp
    });

    // Keep only recent errors
    if (this.recentErrors.length > this.maxRecentErrors) {
      this.recentErrors = this.recentErrors.slice(0, this.maxRecentErrors);
    }
  }

  /**
   * Get recent errors for UI display
   */
  async getRecentErrors() {
    return this.recentErrors.slice(0, 10); // Return last 10 errors
  }

  /**
   * Notify user through various channels
   */
  notifyUser(message, type = 'info') {
    // Console log
    const logMethod = type === 'critical' || type === 'error' ? 'error' : 
                     type === 'warning' ? 'warn' : 'log';
    console[logMethod](`[${type.toUpperCase()}] ${message}`);
    
    // Send to renderer if window exists
    if (global.mainWindow) {
      global.mainWindow.webContents.send('error:notification', {
        message: message,
        type: type,
        timestamp: Date.now()
      });
    }
    
    // TODO: Could add desktop notifications here if needed
    // const { Notification } = require('electron');
    // new Notification({ title: 'WhatsApp Multi', body: message }).show();
  }

  /**
   * Get error statistics
   */
  getErrorStats() {
    const now = Date.now();
    const lastHour = now - (60 * 60 * 1000);
    const lastDay = now - (24 * 60 * 60 * 1000);
    
    const recentHour = this.recentErrors.filter(err => 
      new Date(err.timestamp).getTime() > lastHour
    ).length;
    
    const recentDay = this.recentErrors.filter(err => 
      new Date(err.timestamp).getTime() > lastDay
    ).length;
    
    return {
      totalRecent: this.recentErrors.length,
      lastHour: recentHour,
      lastDay: recentDay,
      activeRetries: this.retryAttempts.size
    };
  }

  /**
   * Clear old errors (maintenance)
   */
  clearOldErrors() {
    const cutoff = Date.now() - (7 * 24 * 60 * 60 * 1000); // 7 days ago
    
    this.recentErrors = this.recentErrors.filter(err => 
      new Date(err.timestamp).getTime() > cutoff
    );
    
    console.log(`Cleared old errors, ${this.recentErrors.length} recent errors remaining`);
  }

  /**
   * Clean shutdown
   */
  cleanup() {
    console.log('Cleaning up ErrorHandler...');
    
    // Clear all retry timers
    this.retryAttempts.clear();
    
    // Optionally clear old errors on shutdown
    this.clearOldErrors();
    
    console.log('ErrorHandler cleanup completed');
  }
}

module.exports = ErrorHandler;