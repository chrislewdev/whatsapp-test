const fs = require('fs');
const path = require('path');

class AutoMessaging {
  constructor(accountManager) {
    this.accountManager = accountManager;
    this.scheduledMessages = new Map(); // id -> scheduled message
    this.templates = new Map(); // id -> template data
    this.activeTimeouts = new Map(); // id -> timeout reference
    
    // File paths for persistence
    this.schedulesPath = path.join('./data/schedules', 'scheduled.json');
    this.templatesPath = path.join('./data/templates', 'templates.json');
    
    // Load existing data
    this.loadScheduledMessages();
    this.loadTemplates();
    
    console.log('AutoMessaging initialized');
  }

  /**
   * Schedule a message to be sent at specific time/interval
   * Simple scheduling: once, daily, weekly only
   */
  async scheduleMessage(scheduleData) {
    const {
      accountId,
      phoneNumber,
      message,
      scheduleType, // 'once', 'daily', 'weekly'
      datetime,
      templateId = null
    } = scheduleData;

    // Validate account exists
    const accounts = await this.accountManager.getAccounts();
    const account = accounts.find(acc => acc.accountId === accountId);
    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // Validate phone number
    const cleanPhone = phoneNumber.replace(/\D/g, '');
    if (cleanPhone.length < 10 || cleanPhone.length > 15) {
      throw new Error('Invalid phone number format');
    }

    // Process message (use template if specified)
    let finalMessage = message;
    if (templateId) {
      const template = this.templates.get(templateId);
      if (template) {
        finalMessage = this.processTemplate(template.content, {
          name: '[Name]', // User can manually replace
          date: new Date().toLocaleDateString(),
          time: new Date().toLocaleTimeString()
        });
      }
    }

    // Generate unique ID
    const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Calculate next run time
    const nextRun = this.calculateNextRun(scheduleType, datetime);
    
    const scheduledMessage = {
      id: scheduleId,
      accountId: accountId,
      phoneNumber: cleanPhone,
      message: finalMessage,
      scheduleType: scheduleType,
      originalDatetime: datetime,
      nextRun: nextRun,
      templateId: templateId,
      isActive: true,
      created: Date.now(),
      lastSent: null,
      sendCount: 0
    };

    // Store scheduled message
    this.scheduledMessages.set(scheduleId, scheduledMessage);
    
    // Start the schedule
    this.startScheduledMessage(scheduledMessage);
    
    // Save to file
    this.saveScheduledMessages();
    
    console.log(`Message scheduled: ${scheduleId} for account ${accountId}`);
    
    return {
      scheduleId: scheduleId,
      nextRun: nextRun,
      message: `Message scheduled successfully`
    };
  }

  /**
   * Calculate next run time based on schedule type
   */
  calculateNextRun(scheduleType, datetime) {
    const targetDate = new Date(datetime);
    const now = new Date();

    switch (scheduleType) {
      case 'once':
        return targetDate;
        
      case 'daily':
        // If target time has passed today, schedule for tomorrow
        if (targetDate <= now) {
          const tomorrow = new Date(targetDate);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return tomorrow;
        }
        return targetDate;
        
      case 'weekly':
        // If target day/time has passed this week, schedule for next week
        if (targetDate <= now) {
          const nextWeek = new Date(targetDate);
          nextWeek.setDate(nextWeek.getDate() + 7);
          return nextWeek;
        }
        return targetDate;
        
      default:
        return targetDate;
    }
  }

  /**
   * Start scheduled message with timeout
   */
  startScheduledMessage(scheduledMessage) {
    const delay = scheduledMessage.nextRun.getTime() - Date.now();
    
    if (delay <= 0) {
      // Should run immediately
      this.executeScheduledMessage(scheduledMessage);
      return;
    }

    // Set timeout
    const timeoutId = setTimeout(async () => {
      await this.executeScheduledMessage(scheduledMessage);
    }, delay);

    // Store timeout reference
    this.activeTimeouts.set(scheduledMessage.id, timeoutId);
    
    console.log(`Scheduled message ${scheduledMessage.id} will run in ${Math.round(delay/1000)} seconds`);
  }

  /**
   * Execute a scheduled message
   */
  async executeScheduledMessage(scheduledMessage) {
    try {
      console.log(`Executing scheduled message: ${scheduledMessage.id}`);
      
      // Add basic delay to avoid spam detection (5-10 seconds random)
      const delay = 5000 + Math.random() * 5000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Send the message
      await this.accountManager.sendMessage(
        scheduledMessage.accountId,
        scheduledMessage.phoneNumber,
        scheduledMessage.message
      );

      // Update send statistics
      scheduledMessage.lastSent = Date.now();
      scheduledMessage.sendCount++;
      
      console.log(`Scheduled message sent successfully: ${scheduledMessage.id}`);
      
      // Handle recurring messages
      if (scheduledMessage.scheduleType !== 'once') {
        // Calculate next run
        scheduledMessage.nextRun = this.calculateNextRunRecurring(scheduledMessage);
        
        // Schedule next execution
        this.startScheduledMessage(scheduledMessage);
        
        // Save updated schedule
        this.saveScheduledMessages();
      } else {
        // One-time message completed - remove it
        this.scheduledMessages.delete(scheduledMessage.id);
        this.activeTimeouts.delete(scheduledMessage.id);
        this.saveScheduledMessages();
      }

      // Notify UI of successful send
      if (global.mainWindow) {
        global.mainWindow.webContents.send('schedule:executed', {
          scheduleId: scheduledMessage.id,
          success: true,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      console.error(`Failed to execute scheduled message ${scheduledMessage.id}:`, error);
      
      // Mark as failed but keep active for retry
      scheduledMessage.lastError = error.message;
      scheduledMessage.lastErrorTime = Date.now();
      
      // Notify UI of failure
      if (global.mainWindow) {
        global.mainWindow.webContents.send('schedule:executed', {
          scheduleId: scheduledMessage.id,
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      // For recurring messages, still schedule next attempt
      if (scheduledMessage.scheduleType !== 'once') {
        scheduledMessage.nextRun = this.calculateNextRunRecurring(scheduledMessage);
        this.startScheduledMessage(scheduledMessage);
        this.saveScheduledMessages();
      }
    }
  }

  /**
   * Calculate next run for recurring messages
   */
  calculateNextRunRecurring(scheduledMessage) {
    const now = new Date();
    
    switch (scheduledMessage.scheduleType) {
      case 'daily':
        const nextDay = new Date(scheduledMessage.nextRun);
        nextDay.setDate(nextDay.getDate() + 1);
        return nextDay;
        
      case 'weekly':
        const nextWeek = new Date(scheduledMessage.nextRun);
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek;
        
      default:
        return now;
    }
  }

  /**
   * Get all scheduled messages
   */
  async getScheduledMessages() {
    const schedules = [];
    
    for (const [id, schedule] of this.scheduledMessages) {
      schedules.push({
        id: schedule.id,
        accountId: schedule.accountId,
        phoneNumber: schedule.phoneNumber,
        message: schedule.message.substring(0, 50) + (schedule.message.length > 50 ? '...' : ''),
        scheduleType: schedule.scheduleType,
        nextRun: schedule.nextRun,
        isActive: schedule.isActive,
        sendCount: schedule.sendCount,
        lastSent: schedule.lastSent,
        lastError: schedule.lastError
      });
    }
    
    // Sort by next run time
    schedules.sort((a, b) => new Date(a.nextRun) - new Date(b.nextRun));
    
    return schedules;
  }

  /**
   * Get count of scheduled messages
   */
  async getScheduledCount() {
    return this.scheduledMessages.size;
  }

  /**
   * Cancel a scheduled message
   */
  async cancelScheduledMessage(scheduleId) {
    const schedule = this.scheduledMessages.get(scheduleId);
    if (!schedule) {
      throw new Error(`Scheduled message ${scheduleId} not found`);
    }

    // Clear timeout if exists
    const timeoutId = this.activeTimeouts.get(scheduleId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.activeTimeouts.delete(scheduleId);
    }

    // Remove from storage
    this.scheduledMessages.delete(scheduleId);
    this.saveScheduledMessages();
    
    console.log(`Cancelled scheduled message: ${scheduleId}`);
    
    return { success: true, message: 'Scheduled message cancelled' };
  }

  /**
   * Save a message template
   */
  async saveTemplate(templateData) {
    const { name, content, category = 'general' } = templateData;
    
    if (!name || !content) {
      throw new Error('Template name and content are required');
    }

    const templateId = `template_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const template = {
      id: templateId,
      name: name,
      content: content,
      category: category,
      created: Date.now(),
      used: 0
    };

    this.templates.set(templateId, template);
    this.saveTemplates();
    
    console.log(`Template saved: ${templateId}`);
    
    return {
      templateId: templateId,
      message: 'Template saved successfully'
    };
  }

  /**
   * Get all templates
   */
  async getTemplates() {
    const templates = [];
    
    for (const [id, template] of this.templates) {
      templates.push({
        id: template.id,
        name: template.name,
        content: template.content,
        category: template.category,
        created: template.created,
        used: template.used
      });
    }
    
    // Sort by category, then by name
    templates.sort((a, b) => {
      if (a.category !== b.category) {
        return a.category.localeCompare(b.category);
      }
      return a.name.localeCompare(b.name);
    });
    
    return templates;
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId) {
    if (!this.templates.has(templateId)) {
      throw new Error(`Template ${templateId} not found`);
    }

    this.templates.delete(templateId);
    this.saveTemplates();
    
    return { success: true, message: 'Template deleted' };
  }

  /**
   * Process template with variable substitution
   */
  processTemplate(templateContent, variables = {}) {
    let processed = templateContent;
    
    // Simple variable replacements
    processed = processed.replace(/{name}/g, variables.name || '[Name]');
    processed = processed.replace(/{date}/g, variables.date || new Date().toLocaleDateString());
    processed = processed.replace(/{time}/g, variables.time || new Date().toLocaleTimeString());
    
    return processed;
  }

  /**
   * Load scheduled messages from file
   */
  loadScheduledMessages() {
    try {
      if (fs.existsSync(this.schedulesPath)) {
        const data = fs.readFileSync(this.schedulesPath, 'utf8');
        const schedules = JSON.parse(data);
        
        for (const schedule of schedules) {
          // Convert date strings back to Date objects
          schedule.nextRun = new Date(schedule.nextRun);
          schedule.created = new Date(schedule.created);
          if (schedule.lastSent) {
            schedule.lastSent = new Date(schedule.lastSent);
          }
          
          this.scheduledMessages.set(schedule.id, schedule);
          
          // Restart active schedules
          if (schedule.isActive) {
            this.startScheduledMessage(schedule);
          }
        }
        
        console.log(`Loaded ${schedules.length} scheduled messages`);
      }
    } catch (error) {
      console.error('Failed to load scheduled messages:', error);
    }
  }

  /**
   * Save scheduled messages to file
   */
  saveScheduledMessages() {
    try {
      const schedules = Array.from(this.scheduledMessages.values());
      fs.writeFileSync(this.schedulesPath, JSON.stringify(schedules, null, 2));
    } catch (error) {
      console.error('Failed to save scheduled messages:', error);
    }
  }

  /**
   * Load templates from file
   */
  loadTemplates() {
    try {
      if (fs.existsSync(this.templatesPath)) {
        const data = fs.readFileSync(this.templatesPath, 'utf8');
        const templates = JSON.parse(data);
        
        for (const template of templates) {
          this.templates.set(template.id, template);
        }
        
        console.log(`Loaded ${templates.length} templates`);
      } else {
        // Create default templates
        this.createDefaultTemplates();
      }
    } catch (error) {
      console.error('Failed to load templates:', error);
      this.createDefaultTemplates();
    }
  }

  /**
   * Save templates to file
   */
  saveTemplates() {
    try {
      const templates = Array.from(this.templates.values());
      fs.writeFileSync(this.templatesPath, JSON.stringify(templates, null, 2));
    } catch (error) {
      console.error('Failed to save templates:', error);
    }
  }

  /**
   * Create some default templates
   */
  createDefaultTemplates() {
    const defaultTemplates = [
      {
        id: 'template_default_1',
        name: 'Good Morning',
        content: 'Good morning {name}! Hope you have a great day on {date}!',
        category: 'personal',
        created: Date.now(),
        used: 0
      },
      {
        id: 'template_default_2',
        name: 'Meeting Reminder',
        content: 'Hi {name}, this is a reminder about our meeting today at {time}.',
        category: 'work',
        created: Date.now(),
        used: 0
      },
      {
        id: 'template_default_3',
        name: 'Daily Check-in',
        content: 'Daily update for {date}: Everything is running smoothly!',
        category: 'general',
        created: Date.now(),
        used: 0
      }
    ];

    for (const template of defaultTemplates) {
      this.templates.set(template.id, template);
    }

    this.saveTemplates();
    console.log('Created default templates');
  }

  /**
   * Cleanup - clear all timeouts and save data
   */
  cleanup() {
    console.log('Cleaning up AutoMessaging...');
    
    // Clear all active timeouts
    for (const [id, timeoutId] of this.activeTimeouts) {
      clearTimeout(timeoutId);
    }
    this.activeTimeouts.clear();
    
    // Save current data
    this.saveScheduledMessages();
    this.saveTemplates();
    
    console.log('AutoMessaging cleanup completed');
  }
}

module.exports = AutoMessaging;