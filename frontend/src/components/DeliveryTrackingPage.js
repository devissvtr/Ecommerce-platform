import React, { useState, useEffect } from 'react';
import { gql, useLazyQuery } from '@apollo/client';
import '../styles/DeliveryTracking.css';

// Import date utilities - CRITICAL FIX
const formatDate = (dateInput, options = {}) => {
  if (!dateInput) return "Not available";
  
  try {
    let date;
    
    // Handle different input types
    if (typeof dateInput === 'string') {
      // Handle MySQL datetime format and ISO strings
      if (dateInput.includes('T') || dateInput.includes(' ')) {
        date = new Date(dateInput);
      } else {
        // Fallback for other string formats
        date = new Date(dateInput);
      }
    } else if (typeof dateInput === 'number') {
      // Handle timestamps
      date = new Date(dateInput);
    } else if (dateInput instanceof Date) {
      date = dateInput;
    } else {
      return "Invalid date format";
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn('Invalid date input:', dateInput);
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
      ...options
    };
    
    return date.toLocaleDateString('en-US', defaultOptions);
  } catch (error) {
    console.error('Error formatting date:', error);
    return "Invalid date format";
  }
};

const formatDeliveryDate = (dateInput) => {
  return formatDate(dateInput, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatOrderDate = (dateInput) => {
  return formatDate(dateInput, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const getRelativeTime = (dateInput) => {
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
      return formatOrderDate(date);
    }
  } catch (error) {
    console.error('Error calculating relative time:', error);
    return "Unknown time";
  }
};

const formatDuration = (startDate, endDate) => {
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

const isFuture = (dateInput) => {
  if (!dateInput) return false;
  
  try {
    const date = new Date(dateInput);
    const now = new Date();
    
    return date > now;
  } catch (error) {
    return false;
  }
};

const TRACK_DELIVERY = gql`
  query TrackDelivery($service_id: String!) {
    trackDelivery(service_id: $service_id) {
      service_id
      status
      estimated_delivery
      actual_delivery
      tracking_notes
      created_at
      updated_at
      order_id
    }
  }
`;

const DeliveryTrackingPage = () => {
  const [serviceId, setServiceId] = useState('');
  const [trackDelivery, { loading, data, error, called }] = useLazyQuery(TRACK_DELIVERY);
  const [searchHistory, setSearchHistory] = useState([]);

  // Load search history from localStorage on component mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('trackingSearchHistory');
    if (savedHistory) {
      try {
        setSearchHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Error loading search history:', e);
      }
    }
  }, []);

  // Save search history to localStorage
  const saveSearchHistory = (history) => {
    try {
      localStorage.setItem('trackingSearchHistory', JSON.stringify(history));
    } catch (e) {
      console.error('Error saving search history:', e);
    }
  };

  const handleTrack = (e) => {
    e.preventDefault();
    if (serviceId.trim()) {
      const trimmedId = serviceId.trim();
      
      // Support both tracking ID and order ID format
      let searchId = trimmedId;
      if (trimmedId.match(/^\d+$/)) {
        // If it's just numbers, assume it's an order ID and convert to tracking format
        searchId = `TRK${trimmedId}`;
        // But first try to find existing tracking for this order
        const existingTracking = searchHistory.find(h => h.startsWith(`TRK${trimmedId}`));
        if (existingTracking) {
          searchId = existingTracking;
        }
      }
      
      console.log('Tracking with ID:', searchId); // Debug log
      trackDelivery({ variables: { service_id: searchId } });
      
      // Add to search history (keep last 10 searches)
      const newHistory = [trimmedId, ...searchHistory.filter(id => id !== trimmedId)];
      const limitedHistory = newHistory.slice(0, 10);
      setSearchHistory(limitedHistory);
      saveSearchHistory(limitedHistory);
    }
  };

  const handleQuickSearch = (id) => {
    setServiceId(id);
    trackDelivery({ variables: { service_id: id } });
  };

  const getStatusInfo = (status) => {
    const statusMap = {
      pending: {
        color: '#f59e0b',
        icon: '⏳',
        message: 'Your order is being prepared',
        priority: 1
      },
      processing: {
        color: '#3b82f6',
        icon: '🔄',
        message: 'Order is being processed',
        priority: 2
      },
      shipped: {
        color: '#8b5cf6',
        icon: '📦',
        message: 'Package has been shipped',
        priority: 3
      },
      out_for_delivery: {
        color: '#f97316',
        icon: '🚚',
        message: 'Out for delivery - arriving soon!',
        priority: 4
      },
      delivered: {
        color: '#10b981',
        icon: '✅',
        message: 'Successfully delivered',
        priority: 5
      },
      failed: {
        color: '#ef4444',
        icon: '❌',
        message: 'Delivery failed - please contact support',
        priority: 0
      },
      cancelled: {
        color: '#6b7280',
        icon: '🚫',
        message: 'Delivery cancelled',
        priority: 0
      }
    };
    
    return statusMap[status] || {
      color: '#6b7280',
      icon: '❓',
      message: 'Status unknown',
      priority: 0
    };
  };

  const getDeliveryProgress = (status) => {
    const progressMap = {
      pending: 20,
      processing: 40,
      shipped: 60,
      out_for_delivery: 80,
      delivered: 100,
      failed: 0,
      cancelled: 0
    };
    
    return progressMap[status] || 0;
  };

  const renderTrackingTimeline = (trackingData) => {
    const timeline = [
      { status: 'pending', label: 'Order Placed', icon: '📝', description: 'Order received and confirmed' },
      { status: 'processing', label: 'Processing', icon: '🔄', description: 'Preparing your order' },
      { status: 'shipped', label: 'Shipped', icon: '📦', description: 'Package shipped from warehouse' },
      { status: 'out_for_delivery', label: 'Out for Delivery', icon: '🚚', description: 'On the way to you' },
      { status: 'delivered', label: 'Delivered', icon: '✅', description: 'Successfully delivered' }
    ];

    const currentStatusIndex = timeline.findIndex(item => item.status === trackingData.status);
    
    return (
      <div className="tracking-timeline">
        {timeline.map((item, index) => {
          const isCompleted = index <= currentStatusIndex && currentStatusIndex >= 0;
          const isCurrent = index === currentStatusIndex;
          const isFailed = trackingData.status === 'failed' || trackingData.status === 'cancelled';
          
          return (
            <div 
              key={item.status} 
              className={`timeline-item ${isCompleted && !isFailed ? 'completed' : ''} ${isCurrent && !isFailed ? 'current' : ''} ${isFailed && index > 0 ? 'failed' : ''}`}
            >
              <div className="timeline-icon">
                {item.icon}
              </div>
              <div className="timeline-content">
                <div className="timeline-label">{item.label}</div>
                <div className="timeline-description">{item.description}</div>
                {isCurrent && trackingData.updated_at && (
                  <div className="timeline-time">
                    {formatOrderDate(trackingData.updated_at)}
                  </div>
                )}
              </div>
              {index < timeline.length - 1 && (
                <div className={`timeline-connector ${isCompleted && !isFailed ? 'completed' : ''} ${isFailed && index >= currentStatusIndex ? 'failed' : ''}`} />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderDeliveryEstimate = (trackingData) => {
    if (!trackingData.estimated_delivery) return null;
    
    const estimatedDate = new Date(trackingData.estimated_delivery);
    const now = new Date();
    const isOverdue = estimatedDate < now && trackingData.status !== 'delivered';
    const isDeliveredOnTime = trackingData.actual_delivery && new Date(trackingData.actual_delivery) <= estimatedDate;
    
    return (
      <div className={`delivery-estimate ${isOverdue ? 'overdue' : ''} ${trackingData.status === 'delivered' ? 'delivered' : ''}`}>
        <div className="estimate-header">
          <span className="estimate-icon">
            {trackingData.status === 'delivered' ? '✅' : isOverdue ? '⚠️' : '📅'}
          </span>
          <span className="estimate-label">
            {trackingData.status === 'delivered' 
              ? (isDeliveredOnTime ? 'Delivered On Time' : 'Delivered') 
              : isOverdue 
                ? 'Delivery Overdue' 
                : 'Estimated Delivery'}
          </span>
        </div>
        <div className="estimate-date">
          {formatDeliveryDate(trackingData.estimated_delivery)}
        </div>
        {trackingData.status !== 'delivered' && (
          <div className="estimate-relative">
            {isOverdue ? 'Was expected ' : 'Expected '}{getRelativeTime(trackingData.estimated_delivery)}
          </div>
        )}
      </div>
    );
  };

  // Extract URL parameters for direct tracking
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const trackingId = urlParams.get('id');
    if (trackingId) {
      setServiceId(trackingId);
      trackDelivery({ variables: { service_id: trackingId } });
    }
  }, [trackDelivery]);

  // Debug: Log the data received
  useEffect(() => {
    if (data?.trackDelivery) {
      console.log('Tracking data received:', data.trackDelivery);
    }
  }, [data]);

  return (
    <div className="delivery-tracking-page">
      <div className="section-header">
        <h2>Track Your Delivery</h2>
        <p>Get real-time updates on your package delivery status</p>
        <div className="tracking-tips">
          You can search by tracking ID (TRK...) or order number
        </div>
      </div>

      {/* Enhanced Search Form */}
      <div className="tracking-search">
        <form onSubmit={handleTrack} className="search-form">
          <div className="search-input-group">
            <input
              type="text"
              placeholder="Enter tracking ID (TRK123...) or order number (123)"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              className="search-input"
              required
            />
            <button 
              type="submit" 
              className="search-button"
              disabled={loading || !serviceId.trim()}
            >
              {loading ? (
                <div className="button-spinner"></div>
              ) : (
                <>
                  <span className="search-icon">🔍</span>
                  Track Package
                </>
              )}
            </button>
          </div>
        </form>

        {/* Search History */}
        {searchHistory.length > 0 && (
          <div className="search-history">
            <h4>Recent Searches:</h4>
            <div className="history-tags">
              {searchHistory.map((id, index) => (
                <button
                  key={index}
                  onClick={() => handleQuickSearch(id)}
                  className="history-tag"
                  disabled={loading}
                >
                  {id}
                </button>
              ))}
              <button
                onClick={() => {
                  setSearchHistory([]);
                  saveSearchHistory([]);
                }}
                className="clear-history-btn"
              >
                Clear
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="tracking-loading">
          <div className="loading-spinner">
            <div className="spinner"></div>
            <p>Tracking your package...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {called && error && (
        <div className="tracking-error">
          <div className="error-icon">⚠️</div>
          <h3>Tracking Error</h3>
          <p>{error.message}</p>
          <div className="error-suggestions">
            <h4>Try these suggestions:</h4>
            <ul>
              <li>Check if your tracking ID is correct</li>
              <li>Try using your order number instead</li>
              <li>Wait a few minutes and try again</li>
            </ul>
          </div>
          <button onClick={() => handleTrack({ preventDefault: () => {} })} className="retry-button">
            Try Again
          </button>
        </div>
      )}

      {/* No Results */}
      {called && !loading && !error && !data?.trackDelivery && (
        <div className="tracking-not-found">
          <div className="not-found-icon">📦❓</div>
          <h3>Tracking Information Not Found</h3>
          <p>
            We couldn't find any tracking information for: <strong>{serviceId}</strong>
          </p>
          <div className="help-text">
            <h4>Please check:</h4>
            <ul>
              <li>The tracking ID or order number is correct and complete</li>
              <li>The tracking information has been activated (may take a few hours)</li>
              <li>You're using the ID from your order confirmation email</li>
            </ul>
          </div>
        </div>
      )}

      {/* Enhanced Tracking Results */}
      {called && !loading && !error && data?.trackDelivery && (
        <div className="tracking-results">
          <div className="tracking-header">
            <div className="tracking-id-display">
              <h3>Package Tracking</h3>
              <div className="tracking-id-badge">
                Tracking ID: {data.trackDelivery.service_id}
              </div>
              {data.trackDelivery.order_id && (
                <div className="order-id-badge">
                  Order #{data.trackDelivery.order_id}
                </div>
              )}
            </div>
            
            <div className="status-display">
              {(() => {
                const statusInfo = getStatusInfo(data.trackDelivery.status);
                return (
                  <div 
                    className="status-card"
                    style={{ backgroundColor: statusInfo.color + '20', borderColor: statusInfo.color }}
                  >
                    <div className="status-icon">{statusInfo.icon}</div>
                    <div className="status-text">
                      <div className="status-name">{data.trackDelivery.status.replace('_', ' ').toUpperCase()}</div>
                      <div className="status-message">{statusInfo.message}</div>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Enhanced Progress Bar */}
          <div className="progress-section">
            <div className="progress-bar">
              <div 
                className="progress-fill"
                style={{ width: `${getDeliveryProgress(data.trackDelivery.status)}%` }}
              />
            </div>
            <div className="progress-text">
              {getDeliveryProgress(data.trackDelivery.status)}% Complete
            </div>
          </div>

          {/* Enhanced Timeline */}
          <div className="timeline-section">
            <h4>Delivery Timeline</h4>
            {renderTrackingTimeline(data.trackDelivery)}
          </div>

          {/* Enhanced Delivery Details */}
          <div className="delivery-details">
            <h4>Delivery Information</h4>
            <div className="details-grid">
              <div className="detail-item">
                <div className="detail-label">Order Placed</div>
                <div className="detail-value">
                  {data.trackDelivery.created_at ? formatOrderDate(data.trackDelivery.created_at) : 'Not available'}
                </div>
              </div>
              
              {data.trackDelivery.estimated_delivery && (
                <div className="detail-item">
                  <div className="detail-label">Estimated Delivery</div>
                  <div className="detail-value">
                    {formatDeliveryDate(data.trackDelivery.estimated_delivery)}
                    {isFuture(data.trackDelivery.estimated_delivery) && (
                      <span className="detail-note">
                        ({getRelativeTime(data.trackDelivery.estimated_delivery).replace(' ago', '')})
                      </span>
                    )}
                  </div>
                </div>
              )}
              
              {data.trackDelivery.actual_delivery && (
                <div className="detail-item">
                  <div className="detail-label">Delivered On</div>
                  <div className="detail-value delivered">
                    {formatDeliveryDate(data.trackDelivery.actual_delivery)}
                    <span className="detail-note">
                      ({getRelativeTime(data.trackDelivery.actual_delivery)})
                    </span>
                  </div>
                </div>
              )}
              
              <div className="detail-item">
                <div className="detail-label">Last Updated</div>
                <div className="detail-value">
                  {data.trackDelivery.updated_at ? formatOrderDate(data.trackDelivery.updated_at) : 'Not available'}
                  {data.trackDelivery.updated_at && (
                    <span className="detail-note">
                      ({getRelativeTime(data.trackDelivery.updated_at)})
                    </span>
                  )}
                </div>
              </div>

              {data.trackDelivery.estimated_delivery && data.trackDelivery.actual_delivery && (
                <div className="detail-item">
                  <div className="detail-label">Delivery Duration</div>
                  <div className="detail-value">
                    {formatDuration(data.trackDelivery.created_at, data.trackDelivery.actual_delivery)}
                  </div>
                </div>
              )}
            </div>

            {data.trackDelivery.tracking_notes && (
              <div className="tracking-notes">
                <div className="notes-label">Delivery Notes</div>
                <div className="notes-content">
                  {data.trackDelivery.tracking_notes}
                </div>
              </div>
            )}
          </div>

          {/* Enhanced Action Buttons */}
          <div className="tracking-actions">
            <button 
              onClick={() => window.print()} 
              className="action-button print-button"
            >
              🖨️ Print Details
            </button>
            <button 
              onClick={() => {
                const shareData = {
                  title: 'Package Tracking',
                  text: `Track package ${data.trackDelivery.service_id} - Status: ${data.trackDelivery.status}`,
                  url: `${window.location.origin}${window.location.pathname}?id=${data.trackDelivery.service_id}`
                };
                
                if (navigator.share) {
                  navigator.share(shareData);
                } else {
                  // Fallback: copy to clipboard
                  navigator.clipboard.writeText(`Track your package: ${shareData.url}`).then(() => {
                    alert('Tracking link copied to clipboard!');
                  });
                }
              }}
              className="action-button share-button"
            >
              📤 Share Tracking
            </button>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(data.trackDelivery.service_id).then(() => {
                  alert('Tracking ID copied to clipboard!');
                });
              }}
              className="action-button copy-button"
            >
              📋 Copy ID
            </button>
          </div>

          {/* Auto-refresh Section */}
          <div className="refresh-section">
            <button 
              onClick={() => trackDelivery({ variables: { service_id: data.trackDelivery.service_id } })}
              className="refresh-button"
              disabled={loading}
            >
              🔄 Refresh Status
            </button>
            <p className="refresh-note">
              Tracking information is updated every few hours. 
              {data.trackDelivery.updated_at && (
                <>Last update: {getRelativeTime(data.trackDelivery.updated_at)}</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Enhanced Help Section */}
      <div className="help-section">
        <h4>Need Help</h4>
        <div className="help-grid">
          <div className="help-item">
            <h5> Where to find your tracking ID?</h5>
            <p>Your tracking ID is included in your order confirmation email and can be found in your order history. It usually starts with "TRK".</p>
          </div>
          <div className="help-item">
            <h5>Tracking not updating?</h5>
            <p>Tracking information may take 24-48 hours to appear after your order ships. Updates occur every few hours during transit.</p>
          </div>
          <div className="help-item">
            <h5>Delivery issues?</h5>
            <p>If you're experiencing delivery problems or have questions about your package, please contact our customer support team.</p>
          </div>
          <div className="help-item">
            <h5>📱 Mobile tracking</h5>
            <p>Bookmark this page or save the tracking link to easily check your delivery status on mobile devices.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryTrackingPage;