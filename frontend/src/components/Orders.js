import React from 'react';
import { gql, useQuery } from '@apollo/client';
import { formatOrderDate, formatDeliveryDate, formatDateOnly, getRelativeTime } from '../utils/dateUtils';

const GET_MY_ORDERS = gql`
  query GetMyOrders {
    myOrders {
      id
      total_amount
      status
      shipping_address
      created_at
      updated_at
      items {
        id
        quantity
        price
        product {
          id
          name
          image_url
        }
      }
      tracking {
        service_id
        status
        estimated_delivery
        actual_delivery
        tracking_notes
      }
    }
  }
`;

const Orders = ({ user }) => {
  const { loading, error, data } = useQuery(GET_MY_ORDERS, {
    pollInterval: 30000, // Refetch every 30 seconds to get updated tracking info
  });

  if (!user) {
    return (
      <div className="auth-required">
        <h3>Authentication Required</h3>
        <p>Please login to view your orders.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner"></div>
        Loading your orders...
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <h3>Error Loading Orders</h3>
        <p>{error.message}</p>
        <button onClick={() => window.location.reload()} className="btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  const orders = data?.myOrders || [];

  const getStatusColor = (status) => {
    const colors = {
      pending: '#f59e0b',
      processing: '#3b82f6', 
      shipped: '#8b5cf6',
      delivered: '#10b981',
      cancelled: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  const getTrackingStatusColor = (status) => {
    const colors = {
      pending: '#f59e0b',
      processing: '#3b82f6',
      shipped: '#8b5cf6',
      out_for_delivery: '#f97316',
      delivered: '#10b981',
      failed: '#ef4444',
      cancelled: '#6b7280'
    };
    return colors[status] || '#6b7280';
  };

  const formatTrackingStatus = (status) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="orders-container">
      <div className="section-header">
        <h2>My Orders</h2>
        <p>Track and manage your orders</p>
      </div>
      
      {orders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>No orders yet</h3>
          <p>When you place orders, they'll appear here.</p>
          <button 
            onClick={() => window.location.href = '#products'} 
            className="btn-primary"
          >
            Start Shopping
          </button>
        </div>
      ) : (
        <div className="orders-list">
          {orders.map(order => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <div className="order-info">
                  <h3>Order #{order.id}</h3>
                  <div className="order-meta">
                    <span className="order-date">
                      {formatOrderDate(order.created_at)}
                    </span>
                    <span className="order-relative-time">
                      ({getRelativeTime(order.created_at)})
                    </span>
                  </div>
                </div>
                <div className="order-status-section">
                  <span 
                    className={`status-badge status-${order.status.toLowerCase().replace(/ /g, '_')}`}
                    style={{ backgroundColor: getStatusColor(order.status) }}
                  >
                    {order.status.toUpperCase()}
                  </span>
                  <span className="order-amount">${order.total_amount.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="order-details">
                <div className="order-summary">
                  <div className="summary-item">
                    <span>Total Amount:</span>
                    <span className="amount">${order.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="summary-item">
                    <span>Shipping Address:</span>
                    <span className="address">{order.shipping_address}</span>
                  </div>
                  <div className="summary-item">
                    <span>Last Updated:</span>
                    <span>{formatOrderDate(order.updated_at)}</span>
                  </div>
                </div>

                <div className="order-items">
                  <h4>Items Ordered ({order.items.length})</h4>
                  <div className="items-list">
                    {order.items.map(item => (
                      <div key={item.id} className="order-item">
                        <div className="item-image">
                          <img 
                            src={item.product.image_url || '/api/placeholder/60/60'} 
                            alt={item.product.name}
                            onError={(e) => {
                              e.target.src = '/api/placeholder/60/60';
                            }}
                          />
                        </div>
                        <div className="item-info">
                          <span className="item-name">{item.product.name}</span>
                          <span className="item-details">
                            Quantity: {item.quantity} × ${item.price.toFixed(2)}
                          </span>
                        </div>
                        <span className="item-total">
                          ${(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Enhanced Delivery Tracking Section */}
                <div className="tracking-section">
                  <h4>📦 Delivery Tracking</h4>
                  {order.tracking ? (
                    <div className="tracking-info">
                      <div className="tracking-header">
                        <div className="tracking-id-container">
                          <span className="tracking-label">Tracking ID:</span>
                          <span className="tracking-id">{order.tracking.service_id}</span>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(order.tracking.service_id).then(() => {
                                alert('Tracking ID copied to clipboard!');
                              }).catch(() => {
                                // Fallback for browsers that don't support clipboard API
                                const textArea = document.createElement('textarea');
                                textArea.value = order.tracking.service_id;
                                document.body.appendChild(textArea);
                                textArea.select();
                                document.execCommand('copy');
                                document.body.removeChild(textArea);
                                alert('Tracking ID copied to clipboard!');
                              });
                            }}
                            className="copy-tracking-btn"
                            title="Copy tracking ID"
                          >
                            📋
                          </button>
                        </div>
                        <span 
                          className={`tracking-status-badge status-${order.tracking.status.toLowerCase().replace(/_/g, '-')}`}
                          style={{ backgroundColor: getTrackingStatusColor(order.tracking.status) }}
                        >
                          {formatTrackingStatus(order.tracking.status)}
                        </span>
                      </div>

                      <div className="tracking-details">
                        {order.tracking.estimated_delivery && (
                          <div className="tracking-item">
                            <span className="tracking-item-label">📅 Estimated Delivery:</span>
                            <span className="tracking-item-value">
                              {formatDeliveryDate(order.tracking.estimated_delivery)}
                            </span>
                          </div>
                        )}
                        
                        {order.tracking.actual_delivery && (
                          <div className="tracking-item delivered">
                            <span className="tracking-item-label">✅ Delivered On:</span>
                            <span className="tracking-item-value delivered-date">
                              {formatDeliveryDate(order.tracking.actual_delivery)}
                            </span>
                          </div>
                        )}
                        
                        {order.tracking.tracking_notes && (
                          <div className="tracking-item">
                            <span className="tracking-item-label">📝 Delivery Notes:</span>
                            <span className="tracking-item-value notes">
                              {order.tracking.tracking_notes}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="tracking-actions">
                        <button 
                          onClick={() => {
                            // Simulate opening tracking page with the tracking ID
                            const trackingId = order.tracking.service_id;
                            window.open(`#delivery-tracking?id=${trackingId}`, '_blank');
                          }}
                          className="track-package-btn"
                        >
                          🔍 Track Package
                        </button>
                        <button 
                          onClick={() => {
                            // Refresh tracking info
                            window.location.reload();
                          }}
                          className="refresh-tracking-btn"
                        >
                          🔄 Refresh Status
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="no-tracking">
                      <div className="no-tracking-icon">📦❓</div>
                      <p>
                        <strong>Tracking information is being prepared</strong><br />
                        Your tracking details will be available within 24 hours of order confirmation.
                      </p>
                      <button 
                        onClick={() => window.location.reload()} 
                        className="refresh-btn"
                      >
                        🔄 Check Again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <style jsx>{`
        .orders-container {
          max-width: 900px;
          margin: 0 auto;
          padding: 1rem;
        }

        .order-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 1.5rem;
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border-bottom: 2px solid #cbd5e1;
          position: relative;
        }

        .order-header::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 4px;
          background: linear-gradient(90deg, #6366f1, #8b5cf6);
        }

        .order-meta {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          margin-top: 0.5rem;
        }

        .order-date {
          color: #475569;
          font-size: 0.95rem;
          font-weight: 500;
        }

        .order-relative-time {
          color: #64748b;
          font-size: 0.875rem;
          font-style: italic;
        }

        .order-status-section {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 0.5rem;
        }

        .order-amount {
          font-size: 1.25rem;
          font-weight: 700;
          color: #059669;
          background: rgba(16, 185, 129, 0.1);
          padding: 0.5rem 1rem;
          border-radius: 0.75rem;
        }

        .tracking-section {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 2px solid #f1f5f9;
        }

        .tracking-section h4 {
          font-size: 1.125rem;
          font-weight: 600;
          color: #111827;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .tracking-info {
          background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
          border: 1px solid #0ea5e9;
          border-radius: 1rem;
          padding: 1.5rem;
        }

        .tracking-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e0f2fe;
        }

        .tracking-id-container {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .tracking-label {
          font-weight: 600;
          color: #0369a1;
        }

        .tracking-id {
          font-family: 'Monaco', 'Menlo', monospace;
          font-weight: 600;
          background: linear-gradient(135deg, #1f2937, #374151);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 0.75rem;
          font-size: 0.9rem;
          letter-spacing: 0.05em;
        }

        .copy-tracking-btn {
          background: #0ea5e9;
          color: white;
          border: none;
          border-radius: 0.5rem;
          padding: 0.25rem 0.5rem;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 0.875rem;
        }

        .copy-tracking-btn:hover {
          background: #0284c7;
          transform: scale(1.05);
        }

        .tracking-status-badge {
          padding: 0.5rem 1rem;
          border-radius: 0.75rem;
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: white;
          border: 2px solid;
        }

        .tracking-details {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1.5rem;
        }

        .tracking-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          background: white;
          padding: 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid #e2e8f0;
        }

        .tracking-item.delivered {
          background: #f0fdf4;
          border-color: #16a34a;
        }

        .tracking-item-label {
          font-weight: 600;
          color: #374151;
          min-width: 140px;
        }

        .tracking-item-value {
          color: #111827;
          text-align: right;
          font-weight: 500;
        }

        .tracking-item-value.delivered-date {
          color: #16a34a;
          font-weight: 600;
        }

        .tracking-item-value.notes {
          font-style: italic;
          background: #fef3c7;
          padding: 0.5rem;
          border-radius: 0.375rem;
          border: 1px solid #f59e0b;
        }

        .tracking-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
        }

        .track-package-btn,
        .refresh-tracking-btn {
          background: linear-gradient(135deg, #0ea5e9, #0284c7);
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .refresh-tracking-btn {
          background: linear-gradient(135deg, #6b7280, #4b5563);
        }

        .track-package-btn:hover,
        .refresh-tracking-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 15px rgb(0 0 0 / 0.2);
        }

        .no-tracking {
          background: #fef3c7;
          border: 1px solid #f59e0b;
          border-radius: 1rem;
          padding: 2rem;
          text-align: center;
        }

        .no-tracking-icon {
          font-size: 3rem;
          margin-bottom: 1rem;
        }

        .no-tracking p {
          color: #92400e;
          margin-bottom: 1.5rem;
          line-height: 1.6;
        }

        .refresh-btn {
          background: #f59e0b;
          color: white;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .refresh-btn:hover {
          background: #d97706;
          transform: translateY(-1px);
        }

        .address {
          font-style: italic;
          max-width: 300px;
          word-wrap: break-word;
        }

        @media (max-width: 768px) {
          .order-header {
            flex-direction: column;
            gap: 1rem;
            align-items: flex-start;
          }

          .order-status-section {
            align-items: flex-start;
          }

          .tracking-header {
            flex-direction: column;
            gap: 1rem;
            align-items: flex-start;
          }

          .tracking-id-container {
            flex-wrap: wrap;
          }

          .tracking-item {
            flex-direction: column;
            gap: 0.5rem;
            align-items: flex-start;
          }

          .tracking-item-value {
            text-align: left;
          }

          .tracking-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default Orders;