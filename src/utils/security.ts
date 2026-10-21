/**
 * PROBAHO ERP: Enterprise Security & Password Policy Engine
 * 
 * Enforces strict security policies for Root Master Accounts:
 * - Minimum 8 characters
 * - Uppercase letter (A-Z)
 * - Lowercase letter (a-z)
 * - Numerical digit (0-9)
 * - Special character (!@#$%^&*...)
 * 
 * Provides flexible PIN/Password verification for Showroom & Staff accounts.
 */

export interface PasswordValidationResult {
  isValid: boolean;
  hasMinLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  score: number; // 0 - 5
  strengthLabel: 'Very Weak' | 'Weak' | 'Medium' | 'Strong' | 'Very Strong';
  strengthColor: string;
  errors: string[];
}

export function validateMasterPassword(password: string): PasswordValidationResult {
  const p = password || '';
  const hasMinLength = p.length >= 8;
  const hasUppercase = /[A-Z]/.test(p);
  const hasLowercase = /[a-z]/.test(p);
  const hasNumber = /[0-9]/.test(p);
  const hasSpecial = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(p);

  const errors: string[] = [];
  if (!hasMinLength) errors.push('Minimum 8 characters required');
  if (!hasUppercase) errors.push('At least one uppercase letter (A-Z) required');
  if (!hasLowercase) errors.push('At least one lowercase letter (a-z) required');
  if (!hasNumber) errors.push('At least one numerical digit (0-9) required');
  if (!hasSpecial) errors.push('At least one special symbol (!@#$%...) required');

  let score = 0;
  if (hasMinLength) score++;
  if (hasUppercase) score++;
  if (hasLowercase) score++;
  if (hasNumber) score++;
  if (hasSpecial) score++;

  let strengthLabel: PasswordValidationResult['strengthLabel'] = 'Very Weak';
  let strengthColor = '#EF4444'; // Red

  if (score === 5) {
    strengthLabel = 'Very Strong';
    strengthColor = '#059669'; // Emerald Green
  } else if (score === 4) {
    strengthLabel = 'Strong';
    strengthColor = '#0D9488'; // Teal
  } else if (score === 3) {
    strengthLabel = 'Medium';
    strengthColor = '#F59E0B'; // Amber
  } else if (score === 2) {
    strengthLabel = 'Weak';
    strengthColor = '#FB923C'; // Orange
  }

  return {
    isValid: score === 5,
    hasMinLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
    score,
    strengthLabel,
    strengthColor,
    errors
  };
}

export function validateStaffPassword(passwordOrPin: string): { isValid: boolean; message?: string } {
  const p = (passwordOrPin || '').trim();
  if (p.length < 4) {
    return {
      isValid: false,
      message: 'Staff password or PIN must be at least 4 characters long.'
    };
  }
  return { isValid: true };
}

/**
 * Simple hash helper for local storage and SQLite comparison.
 * In offline desktop apps, creates deterministic hash for password comparison.
 */
export async function hashSecret(secret: string): Promise<string> {
  const clean = (secret || '').trim();
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const msgBuffer = new TextEncoder().encode(clean);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fallback
    }
  }
  // Synchronous fallback
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    const char = clean.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash).toString(16)}`;
}
