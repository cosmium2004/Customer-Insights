/**
 * Data Validation Service
 * 
 * Validates customer interaction data against schema requirements.
 * Validates: customerId (UUID), timestamp (not future), channel (enum),
 * eventType (non-empty), content (non-empty for text channels)
 * 
 * Requirements: 2.1, 2.2, 2.3, 7.1, 7.2, 7.3, 7.4, 7.5
 */

export interface InteractionData {
  customerId: string;
  timestamp: Date;
  channel: 'web' | 'mobile' | 'email' | 'chat' | 'phone';
  eventType: string;
  content?: string;
  metadata?: Record<string, any>;
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_CHANNELS = ['web', 'mobile', 'email', 'chat', 'phone'] as const;
const TEXT_BASED_CHANNELS = ['web', 'mobile', 'email', 'chat'] as const;

/**
 * Validates if a string is a valid UUID format
 */
function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Validates if a date is not in the future
 */
function isNotFutureDate(date: Date): boolean {
  return date.getTime() <= Date.now();
}

/**
 * Validates if a channel is one of the allowed values
 */
function isValidChannel(channel: string): channel is InteractionData['channel'] {
  return VALID_CHANNELS.includes(channel as any);
}

/**
 * Checks if a channel requires text content
 */
function isTextBasedChannel(channel: string): boolean {
  return TEXT_BASED_CHANNELS.includes(channel as any);
}

/**
 * Validates interaction data against schema requirements
 * 
 * @param data - The interaction data to validate
 * @returns ValidationResult with valid flag and errors array
 * 
 * Validation rules:
 * - customerId must be valid UUID format
 * - timestamp must be valid date not in future
 * - channel must be one of: web, mobile, email, chat, phone
 * - eventType must be non-empty string
 * - content must be non-empty for text-based channels (web, mobile, email, chat)
 */
export function validateInteraction(data: any): ValidationResult {
  const errors: ValidationError[] = [];

  // Handle null or undefined data
  if (!data || typeof data !== 'object') {
    errors.push({
      field: 'data',
      message: 'data must be a valid object'
    });
    return { valid: false, errors };
  }

  // Validate customerId
  if (!data.customerId) {
    errors.push({
      field: 'customerId',
      message: 'customerId is required'
    });
  } else if (typeof data.customerId !== 'string') {
    errors.push({
      field: 'customerId',
      message: 'customerId must be a string'
    });
  } else if (!isValidUUID(data.customerId)) {
    errors.push({
      field: 'customerId',
      message: 'customerId must be a valid UUID format'
    });
  }

  // Validate timestamp
  if (!data.timestamp) {
    errors.push({
      field: 'timestamp',
      message: 'timestamp is required'
    });
  } else {
    const timestamp = data.timestamp instanceof Date 
      ? data.timestamp 
      : new Date(data.timestamp);
    
    if (isNaN(timestamp.getTime())) {
      errors.push({
        field: 'timestamp',
        message: 'timestamp must be a valid date'
      });
    } else if (!isNotFutureDate(timestamp)) {
      errors.push({
        field: 'timestamp',
        message: 'timestamp cannot be in the future'
      });
    }
  }

  // Validate channel
  if (!data.channel) {
    errors.push({
      field: 'channel',
      message: 'channel is required'
    });
  } else if (typeof data.channel !== 'string') {
    errors.push({
      field: 'channel',
      message: 'channel must be a string'
    });
  } else if (!isValidChannel(data.channel)) {
    errors.push({
      field: 'channel',
      message: `channel must be one of: ${VALID_CHANNELS.join(', ')}`
    });
  }

  // Validate eventType
  if (!data.eventType && data.eventType !== '') {
    errors.push({
      field: 'eventType',
      message: 'eventType is required'
    });
  } else if (data.eventType === '' || (typeof data.eventType === 'string' && data.eventType.trim() === '')) {
    errors.push({
      field: 'eventType',
      message: 'eventType must be a non-empty string'
    });
  } else if (typeof data.eventType !== 'string') {
    errors.push({
      field: 'eventType',
      message: 'eventType must be a string'
    });
  }

  // Validate content for text-based channels
  if (data.channel && isTextBasedChannel(data.channel)) {
    if (!data.content && data.content !== '') {
      errors.push({
        field: 'content',
        message: `content is required for ${data.channel} channel`
      });
    } else if (data.content === '' || (typeof data.content === 'string' && data.content.trim() === '')) {
      errors.push({
        field: 'content',
        message: `content must be non-empty for ${data.channel} channel`
      });
    } else if (typeof data.content !== 'string') {
      errors.push({
        field: 'content',
        message: 'content must be a string'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
