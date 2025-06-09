// dateUtils.js - Utility functions for consistent date formatting

/**
 * Format date with consistent handling of MySQL datetime format
 * @param {string|number|Date} dateInput 
 * @param {Object} options 
 * @returns {string}
 */
export const formatDate = (dateInput, options = {}) => {
  if (!dateInput) return "Not available";
  
  try {
    let date;
    console.log('formatDate - Raw dateInput:', dateInput);
    console.log('formatDate - Type of dateInput:', typeof dateInput);

    // Handle different input types
    if (typeof dateInput === 'string') {
      // Handle MySQL datetime format (YYYY-MM-DD HH:mm:ss)
      if (dateInput.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
        // Convert MySQL datetime to ISO string and assume it's local time, then convert to UTC
        date = new Date(dateInput.replace(' ', 'T'));
        console.log('formatDate - MySQL format matched, parsed date:', date);
      } else if (dateInput.includes('T') || dateInput.includes(' ')) {
        // Handle other ISO strings
        date = new Date(dateInput);
        console.log('formatDate - ISO string or space included, parsed date:', date);
      } else {
        // Fallback for other string formats
        date = new Date(dateInput);
        console.log('formatDate - Fallback string format, parsed date:', date);
      }
    } else if (typeof dateInput === 'number') {
      // Handle timestamps
      date = new Date(dateInput);
      console.log('formatDate - Number (timestamp), parsed date:', date);
    } else if (dateInput instanceof Date) {
      date = dateInput;
      console.log('formatDate - Date object, used directly:', date);
    } else {
      console.log('formatDate - Unrecognized input type:', dateInput);
      return "Invalid date format";
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date input after parsing:', dateInput, 'Generated date object:', date);
      return "Invalid date";
    }
    
    // Default formatting options
    const defaultOptions = {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Asia/Jakarta',
      ...options
    };
    
    return date.toLocaleString('en-US', defaultOptions);
  } catch (error) {
    console.error('Error formatting date:', error);
    return "Invalid date format";
  }
};

/**
 * Format date for order display
 * @param {string|number|Date} dateInput 
 * @returns {string}
 */
export const formatOrderDate = (dateInput) => {
  return formatDate(dateInput, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Jakarta'
  });
};

/**
 * Format date for admin display
 * @param {string|number|Date} dateInput 
 * @returns {string}
 */
export const formatAdminDate = (dateInput) => {
  return formatDate(dateInput, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'Asia/Jakarta'
  });
};

/**
 * Format date for delivery tracking
 * @param {string|number|Date} dateInput 
 * @returns {string}
 */
export const formatDeliveryDate = (dateInput) => {
  return formatDate(dateInput, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Jakarta'
  });
};

/**
 * Format date only (without time)
 * @param {string|number|Date} dateInput 
 * @returns {string}
 */
export const formatDateOnly = (dateInput) => {
  return formatDate(dateInput, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Jakarta'
  });
};

/**
 * Format time only
 * @param {string|number|Date} dateInput 
 * @returns {string}
 */
export const formatTimeOnly = (dateInput) => {
  return formatDate(dateInput, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Jakarta'
  });
};

/**
 * Get relative time (e.g., "2 hours ago")
 * @param {string|number|Date} dateInput 
 * @returns {string}
 */
export const getRelativeTime = (dateInput) => {
  if (!dateInput) return "Unknown time";
  
  try {
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return "Invalid date";
    
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) {
      return "Just now";
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    } else if (diffInSeconds < 2592000) { // 30 days
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days === 1 ? '' : 's'} ago`;
    } else {
      return formatDateOnly(date);
    }
  } catch (error) {
    console.error('Error calculating relative time:', error);
    return "Unknown time";
  }
};

/**
 * Check if date is today
 * @param {string|number|Date} dateInput 
 * @returns {boolean}
 */
export const isToday = (dateInput) => {
  if (!dateInput) return false;
  
  try {
    const date = new Date(dateInput);
    const today = new Date();
    
    return date.toDateString() === today.toDateString();
  } catch (error) {
    return false;
  }
};

/**
 * Check if date is in the future
 * @param {string|number|Date} dateInput 
 * @returns {boolean}
 */
export const isFuture = (dateInput) => {
  if (!dateInput) return false;
  
  try {
    const date = new Date(dateInput);
    const now = new Date();
    
    return date > now;
  } catch (error) {
    return false;
  }
};

/**
 * Format duration between two dates
 * @param {string|number|Date} startDate 
 * @param {string|number|Date} endDate 
 * @returns {string}
 */
export const formatDuration = (startDate, endDate) => {
  if (!startDate || !endDate) return "Unknown duration";
  
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return "Invalid dates";
    }
    
    const diffInMilliseconds = Math.abs(end - start);
    const diffInDays = Math.floor(diffInMilliseconds / (1000 * 60 * 60 * 24));
    const diffInHours = Math.floor((diffInMilliseconds % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const diffInMinutes = Math.floor((diffInMilliseconds % (1000 * 60 * 60)) / (1000 * 60));
    
    if (diffInDays > 0) {
      return `${diffInDays} day${diffInDays === 1 ? '' : 's'}${diffInHours > 0 ? ` ${diffInHours}h` : ''}`;
    } else if (diffInHours > 0) {
      return `${diffInHours} hour${diffInHours === 1 ? '' : 's'}${diffInMinutes > 0 ? ` ${diffInMinutes}m` : ''}`;
    } else {
      return `${diffInMinutes} minute${diffInMinutes === 1 ? '' : 's'}`;
    }
  } catch (error) {
    console.error('Error calculating duration:', error);
    return "Unknown duration";
  }
};

/**
 * Get status color based on date and status
 * @param {string} status 
 * @param {string|number|Date} dateInput 
 * @returns {string}
 */
export const getStatusColorByDate = (status, dateInput) => {
  const baseColors = {
    pending: '#f59e0b',
    processing: '#3b82f6', 
    shipped: '#8b5cf6',
    delivered: '#10b981',
    cancelled: '#ef4444'
  };
  
  const baseColor = baseColors[status] || '#6b7280';
  
  // If we have a date and it's overdue, make it more red
  if (dateInput && ['pending', 'processing', 'shipped'].includes(status)) {
    try {
      const date = new Date(dateInput);
      const now = new Date();
      const daysDiff = (now - date) / (1000 * 60 * 60 * 24);
      
      if (daysDiff > 7) { // More than a week old
        return '#dc2626'; // Red
      } else if (daysDiff > 3) { // More than 3 days old
        return '#ea580c'; // Orange-red
      }
    } catch (error) {
      // Fallback to base color
    }
  }
  
  return baseColor;
};

// Export all functions as default for easy importing
export default {
  formatDate,
  formatOrderDate,
  formatAdminDate,
  formatDeliveryDate,
  formatDateOnly,
  formatTimeOnly,
  getRelativeTime,
  isToday,
  isFuture,
  formatDuration,
  getStatusColorByDate
};