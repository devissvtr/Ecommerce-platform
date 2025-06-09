import React, { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { formatAdminDate, formatOrderDate, formatDeliveryDate, getRelativeTime, formatDateOnly } from '../utils/dateUtils';
import '../styles/AdminAllOrders.css';

// GraphQL Queries and Mutations
const GET_ALL_ORDERS = gql`
  query GetAllOrders {
    orders {
      id
      user_id
      total_amount
      status
      shipping_address
      created_at
      updated_at
      user { 
        username 
        email 
      }
      tracking {
        service_id
        status
        estimated_delivery
        actual_delivery
        tracking_notes
        created_at
        updated_at
      }
    }
  }
`;

const UPDATE_ORDER_STATUS = gql`
  mutation UpdateOrderStatus($id: Int!, $status: String!) {
    updateOrderStatus(id: $id, status: $status) {
      id
      status
      updated_at
    }
  }
`;

const UPDATE_DELIVERY_STATUS = gql`
  mutation UpdateDeliveryStatus($service_id: String!, $status: String!, $tracking_notes: String) {
    updateDeliveryStatus(service_id: $service_id, status: $status, tracking_notes: $tracking_notes) {
      service_id
      status
      tracking_notes
      updated_at
    }
  }
`;

const AdminAllOrders = ({ user }) => {
  const { loading, error, data, refetch } = useQuery(GET_ALL_ORDERS, {
    pollInterval: 30000, // Auto-refresh every 30 seconds
  });
  const [updateOrderStatus, { loading: updatingOrderStatus }] = useMutation(UPDATE_ORDER_STATUS, { 
    onCompleted: () => {
      refetch();
      setOrderUpdates({});
    }
  });
  const [updateDeliveryStatus, { loading: updatingDeliveryStatus }] = useMutation(UPDATE_DELIVERY_STATUS, { 
    onCompleted: () => {
      refetch();
      setDeliveryUpdates({});
    }
  });

  const [deliveryUpdates, setDeliveryUpdates] = useState({});
  const [orderUpdates, setOrderUpdates] = useState({});
  const [activeFilters, setActiveFilters] = useState({
    status: '',
    search: '',
    dateRange: 'all'
  });

  // Check admin access
  if (!user || user.role !== 'admin') {
    return (
      <div className="auth-required">
        <h3>Admin Access Required</h3>
        <p>You need administrator privileges to access this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner"></div>
        Loading all orders...
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <h3>Error Loading Orders</h3>
        <p>{error.message}</p>
        <button onClick={() => refetch()} className="btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  const allOrders = data?.orders || [];

  // Enhanced filtering function
  const filteredOrders = allOrders.filter(order => {
    const matchesStatus = !activeFilters.status || order.status === activeFilters.status;
    const matchesSearch = !activeFilters.search || 
      order.id.toString().includes(activeFilters.search) ||
      order.user?.username?.toLowerCase().includes(activeFilters.search.toLowerCase()) ||
      order.user?.email?.toLowerCase().includes(activeFilters.search.toLowerCase()) ||
      order.tracking?.service_id?.toLowerCase().includes(activeFilters.search.toLowerCase());
    
    // Date range filtering
    let matchesDateRange = true;
    if (activeFilters.dateRange !== 'all') {
      const orderDate = new Date(order.created_at);
      const now = new Date();
      const daysDiff = (now - orderDate) / (1000 * 60 * 60 * 24);
      
      switch (activeFilters.dateRange) {
        case 'today':
          matchesDateRange = daysDiff < 1;
          break;
        case 'week':
          matchesDateRange = daysDiff < 7;
          break;
        case 'month':
          matchesDateRange = daysDiff < 30;
          break;
        default:
          matchesDateRange = true;
      }
    }
    
    return matchesStatus && matchesSearch && matchesDateRange;
  });

  // Enhanced statistics
  const stats = {
    total: allOrders.length,
    pending: allOrders.filter(o => o.status === 'pending').length,
    processing: allOrders.filter(o => o.status === 'processing').length,
    shipped: allOrders.filter(o => o.status === 'shipped').length,
    delivered: allOrders.filter(o => o.status === 'delivered').length,
    cancelled: allOrders.filter(o => o.status === 'cancelled').length,
    totalRevenue: allOrders.reduce((sum, o) => sum + (o.status !== 'cancelled' ? o.total_amount : 0), 0),
    withTracking: allOrders.filter(o => o.tracking?.service_id).length,
  };

  const handleDeliveryUpdateChange = (orderId, field, value) => {
    setDeliveryUpdates(prev => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [field]: value
      }
    }));
  };

  const handleOrderUpdateChange = (orderId, field, value) => {
    setOrderUpdates(prev => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [field]: value
      }
    }));
  };

  const handleUpdateDelivery = async (order) => {
    const updateData = deliveryUpdates[order.id];
    if (!order.tracking?.service_id || !updateData?.status) {
      alert('Please select a new status for delivery.');
      return;
    }
    
    try {
      await updateDeliveryStatus({
        variables: {
          service_id: order.tracking.service_id,
          status: updateData.status,
          tracking_notes: updateData.tracking_notes || order.tracking.tracking_notes || ''
        }
      });
      
      alert('Delivery status updated successfully!');
    } catch (err) {
      console.error('Error updating delivery status:', err);
      alert('Failed to update delivery status: ' + err.message);
    }
  };

  const handleUpdateOrderStatus = async (order) => {
    const newStatus = orderUpdates[order.id]?.status || order.status;
    
    if (newStatus === order.status) {
      alert('Please select a different status to update.');
      return;
    }
    
    try {
      await updateOrderStatus({ 
        variables: { 
          id: parseInt(order.id), 
          status: newStatus 
        } 
      });
      
      alert('Order status updated successfully!');
    } catch (err) {
      console.error('Error updating order status:', err);
      alert('Failed to update order status: ' + err.message);
    }
  };

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
    return status?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown';
  };

  return (
    <div className="admin-all-orders">
      <div className="section-header">
        <h2>All Orders Management</h2>
        <p>Monitor and manage all customer orders with real-time tracking</p>
        <div className="last-updated">
          Last updated: {formatOrderDate(new Date())}
        </div>
      </div>

      {/* Enhanced Statistics Dashboard */}
      <div className="stats-dashboard">
        <div className="stat-card">
          <div className="stat-number">{stats.total}</div>
          <div className="stat-label">Total Orders</div>
          <div className="stat-sublabel">${stats.totalRevenue.toFixed(2)} Revenue</div>
        </div>
        <div className="stat-card pending">
          <div className="stat-number">{stats.pending}</div>
          <div className="stat-label">Pending</div>
        </div>
        <div className="stat-card processing">
          <div className="stat-number">{stats.processing}</div>
          <div className="stat-label">Processing</div>
        </div>
        <div className="stat-card shipped">
          <div className="stat-number">{stats.shipped}</div>
          <div className="stat-label">Shipped</div>
        </div>
        <div className="stat-card delivered">
          <div className="stat-number">{stats.delivered}</div>
          <div className="stat-label">Delivered</div>
        </div>
        <div className="stat-card cancelled">
          <div className="stat-number">{stats.cancelled}</div>
          <div className="stat-label">Cancelled</div>
        </div>
        <div className="stat-card tracking">
          <div className="stat-number">{stats.withTracking}</div>
          <div className="stat-label">With Tracking</div>
          <div className="stat-sublabel">{((stats.withTracking / stats.total) * 100).toFixed(1)}%</div>
        </div>
      </div>

      {/* Enhanced Filters */}
      <div className="filters-section">
        <div className="filter-group">
          <label htmlFor="status-filter">Filter by Status:</label>
          <select
            id="status-filter"
            value={activeFilters.status}
            onChange={(e) => setActiveFilters(prev => ({ ...prev, status: e.target.value }))}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label htmlFor="date-filter">Date Range:</label>
          <select
            id="date-filter"
            value={activeFilters.dateRange}
            onChange={(e) => setActiveFilters(prev => ({ ...prev, dateRange: e.target.value }))}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label htmlFor="search-filter">Search Orders:</label>
          <input
            id="search-filter"
            type="text"
            placeholder="Search by order ID, username, email, or tracking ID..."
            value={activeFilters.search}
            onChange={(e) => setActiveFilters(prev => ({ ...prev, search: e.target.value }))}
          />
        </div>
        
        <div className="filter-actions">
          <button 
            onClick={() => setActiveFilters({ status: '', search: '', dateRange: 'all' })}
            className="btn-secondary"
          >
            Clear Filters
          </button>
          <button 
            onClick={() => refetch()}
            className="btn-primary"
            disabled={loading}
          >
            🔄 Refresh
          </button>
          <span className="results-count">
            Showing {filteredOrders.length} of {allOrders.length} orders
          </span>
        </div>
      </div>

      {/* Orders List */}
      {filteredOrders.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h3>No orders found</h3>
          <p>
            {activeFilters.status || activeFilters.search || activeFilters.dateRange !== 'all'
              ? 'Try adjusting your filters to see more results.'
              : 'Orders will appear here when customers place them.'
            }
          </p>
        </div>
      ) : (
        <div className="orders-list">
          {filteredOrders.map(order => (
            <div key={order.id} className="admin-order-card">
              <div className="order-header">
                <div className="order-info">
                  <h3>Order #{order.id}</h3>
                  <div className="order-meta">
                    <span className="order-date">{formatOrderDate(order.created_at)}</span>
                    <span className="order-relative">{getRelativeTime(order.created_at)}</span>
                    <span className="order-amount">${order.total_amount.toFixed(2)}</span>
                  </div>
                </div>
                <div className="status-section">
                  <span 
                    className={`status-badge status-${order.status.toLowerCase().replace(/ /g, '_')}`}
                    style={{ backgroundColor: getStatusColor(order.status) }}
                  >
                    {order.status.toUpperCase()}
                  </span>
                  {order.updated_at !== order.created_at && (
                    <span className="last-updated">
                      Updated: {getRelativeTime(order.updated_at)}
                    </span>
                  )}
                </div>
              </div>
              
              <div className="order-details">
                <div className="customer-info">
                  <h4>Customer Information</h4>
                  <div className="info-row">
                    <span>Username:</span>
                    <span>{order.user?.username || `User ${order.user_id}`}</span>
                  </div>
                  <div className="info-row">
                    <span>Email:</span>
                    <span>{order.user?.email || 'Not available'}</span>
                  </div>
                  <div className="info-row">
                    <span>Shipping Address:</span>
                    <span>{order.shipping_address}</span>
                  </div>
                </div>

                {/* Order Status Management */}
                <div className="order-management">
                  <h4>Order Status Management</h4>
                  <div className="management-row">
                    <select
                      value={orderUpdates[order.id]?.status || order.status}
                      onChange={(e) => handleOrderUpdateChange(order.id, 'status', e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="processing">Processing</option>
                      <option value="shipped">Shipped</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <button
                      onClick={() => handleUpdateOrderStatus(order)}
                      disabled={updatingOrderStatus || (orderUpdates[order.id]?.status || order.status) === order.status}
                      className="btn-primary btn-small"
                    >
                      {updatingOrderStatus ? 'Updating...' : 'Update Order'}
                    </button>
                  </div>
                </div>

                {/* Enhanced Delivery Tracking Management */}
                {order.tracking ? (
                  <div className="tracking-management">
                    <h4>Delivery Tracking Management</h4>
                    <div className="tracking-current">
                      <div className="tracking-header">
                        <div className="tracking-id-container">
                          <span className="tracking-label">Tracking ID:</span>
                          <span className="tracking-id-badge">{order.tracking.service_id}</span>
                          <button 
                            onClick={() => {
                              navigator.clipboard.writeText(order.tracking.service_id).then(() => {
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
                          className={`tracking-status-badge status-${order.tracking.status?.toLowerCase().replace(/_/g, '-')}`}
                          style={{ backgroundColor: getTrackingStatusColor(order.tracking.status) }}
                        >
                          {formatTrackingStatus(order.tracking.status)}
                        </span>
                      </div>

                      <div className="tracking-details-grid">
                        {order.tracking.estimated_delivery && (
                          <div className="info-row">
                            <span>Estimated Delivery:</span>
                            <span>{formatDeliveryDate(order.tracking.estimated_delivery)}</span>
                          </div>
                        )}
                        {order.tracking.actual_delivery && (
                          <div className="info-row delivered">
                            <span>Delivered On:</span>
                            <span className="delivered-date">{formatDeliveryDate(order.tracking.actual_delivery)}</span>
                          </div>
                        )}
                        {order.tracking.tracking_notes && (
                          <div className="info-row">
                            <span>Current Notes:</span>
                            <span className="tracking-notes">{order.tracking.tracking_notes}</span>
                          </div>
                        )}
                        <div className="info-row">
                          <span>Last Updated:</span>
                          <span>{formatOrderDate(order.tracking.updated_at || order.tracking.created_at)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="tracking-update">
                      <h5>Update Delivery Status</h5>
                      <div className="update-form">
                        <select
                          value={deliveryUpdates[order.id]?.status || ''}
                          onChange={(e) => handleDeliveryUpdateChange(order.id, 'status', e.target.value)}
                        >
                          <option value="">Select New Status</option>
                          <option value="pending">Pending</option>
                          <option value="processing">Processing</option>
                          <option value="shipped">Shipped</option>
                          <option value="out_for_delivery">Out for Delivery</option>
                          <option value="delivered">Delivered</option>
                          <option value="failed">Failed Delivery</option>
                          <option value="cancelled">Cancelled</option>
                        </select>
                        <textarea
                          placeholder="Add tracking notes (optional)"
                          value={deliveryUpdates[order.id]?.tracking_notes || ''}
                          onChange={(e) => handleDeliveryUpdateChange(order.id, 'tracking_notes', e.target.value)}
                          rows="3"
                        />
                        <button
                          onClick={() => handleUpdateDelivery(order)}
                          disabled={updatingDeliveryStatus || !deliveryUpdates[order.id]?.status}
                          className="btn-secondary btn-small"
                        >
                          {updatingDeliveryStatus ? 'Updating...' : 'Update Tracking'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="no-tracking">
                    <h4>Delivery Tracking</h4>
                    <div className="no-tracking-message">
                      <div className="no-tracking-icon">📦❓</div>
                      <p>
                        <strong>Tracking information is being prepared</strong><br />
                        Tracking will be automatically created when the order is processed.
                      </p>
                      <button 
                        onClick={() => refetch()} 
                        className="btn-outline btn-small"
                      >
                        🔄 Check for Tracking
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminAllOrders;