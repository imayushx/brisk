/**
 * ════════════════════════════════════════════════════════════════
 * INPUT VALIDATION & SANITIZATION — OWASP best practices
 * Prevents injection, XSS, type confusion, and malformed requests
 * ════════════════════════════════════════════════════════════════
 */

/**
 * Validates a single field against a schema
 * @param {any} value - The value to validate
 * @param {object} schema - Validation rules: {type, minLength, maxLength, pattern, enum, required}
 * @returns {object} {valid: boolean, error: string|null}
 */
function validateField(value, schema = {}) {
  const { type, minLength, maxLength, pattern, enum: enumVals, required } = schema;

  // Check required
  if (required && (value === null || value === undefined || value === '')) {
    return { valid: false, error: 'This field is required' };
  }

  if (value === null || value === undefined) {
    return { valid: true, error: null };
  }

  // Type check
  if (type) {
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== type) {
      return { valid: false, error: `Expected ${type}, got ${actualType}` };
    }
  }

  // String-specific validations
  if (typeof value === 'string') {
    if (minLength && value.length < minLength) {
      return { valid: false, error: `Minimum length is ${minLength}` };
    }
    if (maxLength && value.length > maxLength) {
      return { valid: false, error: `Maximum length is ${maxLength}` };
    }
    if (pattern && !new RegExp(pattern).test(value)) {
      return { valid: false, error: `Invalid format` };
    }
  }

  // Number-specific validations
  if (typeof value === 'number') {
    if (!isFinite(value)) {
      return { valid: false, error: 'Must be a valid number' };
    }
  }

  // Enum check
  if (enumVals && !enumVals.includes(value)) {
    return { valid: false, error: `Must be one of: ${enumVals.join(', ')}` };
  }

  return { valid: true, error: null };
}

/**
 * Validates request object against a schema
 * Rejects any unexpected fields (strict mode)
 * @param {object} data - Data object to validate
 * @param {object} schema - Schema with field definitions
 * @param {boolean} strict - If true, reject unexpected fields
 * @returns {object} {valid: boolean, errors: {field: error}, cleaned: object}
 */
export function validateInput(data = {}, schema = {}, strict = true) {
  const errors = {};
  const cleaned = {};

  // Check for unexpected fields if strict mode
  if (strict) {
    for (const key in data) {
      if (!(key in schema)) {
        errors[key] = 'Unexpected field';
      }
    }
  }

  // Validate each defined field
  for (const [field, fieldSchema] of Object.entries(schema)) {
    const value = data[field];
    const result = validateField(value, fieldSchema);

    if (!result.valid) {
      errors[field] = result.error;
    } else {
      cleaned[field] = value;
    }
  }

  const valid = Object.keys(errors).length === 0;
  return { valid, errors: valid ? {} : errors, cleaned: valid ? cleaned : null };
}

/**
 * Sanitize strings: remove/escape dangerous characters
 * Prevents XSS and injection attacks
 */
export function sanitize(str) {
  if (typeof str !== 'string') return str;
  
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

/**
 * Validate ticker symbol (US stocks)
 * Pattern: 1-5 uppercase letters, optional dot for special tickers
 */
export function validateTicker(ticker) {
  if (typeof ticker !== 'string') return false;
  return /^[A-Z]{1,5}(\.)?[A-Z]?$/.test(ticker.toUpperCase().trim());
}

/**
 * Validate price/numeric input
 * Prevents negative or unreasonable prices
 */
export function validatePrice(price, min = 0.01, max = 1000000) {
  const num = parseFloat(price);
  return isFinite(num) && num >= min && num <= max;
}

/**
 * Validate email address
 * Simple check — in production, verify via confirmation link
 */
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * SCHEMA DEFINITIONS — Use these for consistent validation
 */
export const SCHEMAS = {
  // Stock price API
  priceQuery: {
    ticker: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 5,
      pattern: '^[A-Za-z0-9.]{1,5}$',
    },
  },

  // Stock quote API
  quoteQuery: {
    ticker: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 5,
      pattern: '^[A-Za-z0-9.]{1,5}$',
    },
  },

  // Portfolio add (for dashboard)
  portfolioAdd: {
    ticker: {
      type: 'string',
      required: true,
      minLength: 1,
      maxLength: 5,
    },
    entryPrice: {
      type: 'number',
      required: true,
    },
    amount: {
      type: 'number',
      required: true,
    },
  },

  // Login
  signin: {
    email: {
      type: 'string',
      required: true,
      minLength: 5,
      maxLength: 254,
    },
    password: {
      type: 'string',
      required: true,
      minLength: 6,
      maxLength: 128,
    },
  },

  // Registration
  signup: {
    name: {
      type: 'string',
      required: true,
      minLength: 2,
      maxLength: 100,
    },
    location: {
      type: 'string',
      required: true,
      minLength: 2,
      maxLength: 100,
    },
    email: {
      type: 'string',
      required: true,
      minLength: 5,
      maxLength: 254,
    },
    password: {
      type: 'string',
      required: true,
      minLength: 8,
      maxLength: 128,
    },
  },
};
