import React, { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { formatDate, formatOrderDate } from '../utils/dateUtils';

const GET_MY_CART = gql`
  query GetMyCart {
    myCart {
      id
      quantity
      product {
        id
        name
        price
        image_url
        stock
      }
    }
  }
`;

const CREATE_ORDER = gql`
  mutation CreateOrder($shipping_address: String!, $payment_method: String!) {
    createOrder(shipping_address: $shipping_address, payment_method: $payment_method) {
      id
      total_amount
      status
      created_at
      tracking {
        service_id
        status
        estimated_delivery
      }
    }
  }
`;

const REMOVE_FROM_CART = gql`
  mutation RemoveFromCart($product_id: ID!) {
    removeFromCart(product_id: $product_id)
  }
`;

const UPDATE_CART_ITEM = gql`
  mutation UpdateCartItem($product_id: ID!, $quantity: Int!) {
    updateCartItem(product_id: $product_id, quantity: $quantity) {
      id
      quantity
    }
  }
`;

const Cart = ({ user }) => {
  const { loading, error, data, refetch } = useQuery(GET_MY_CART);
  const [createOrder, { loading: creatingOrder }] = useMutation(CREATE_ORDER, {
    refetchQueries: [{ query: GET_MY_CART }]
  });
  const [removeFromCart] = useMutation(REMOVE_FROM_CART, {
    refetchQueries: [{ query: GET_MY_CART }]
  });
  const [updateCartItem] = useMutation(UPDATE_CART_ITEM, {
    refetchQueries: [{ query: GET_MY_CART }]
  });
  
  const [shippingAddress, setShippingAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [updatingItems, setUpdatingItems] = useState(new Set());

  if (!user) return <div className="auth-required">Please login to view cart</div>;
  if (loading) return <div className="loading-spinner"><div className="spinner"></div>Loading cart...</div>;
  if (error) return <div className="error-message">Error: {error.message}</div>;

  const cartItems = data?.myCart || [];
  const total = cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  const handleRemoveItem = async (productId) => {
    if (window.confirm('Remove this item from cart?')) {
      try {
        await removeFromCart({ variables: { product_id: productId } });
      } catch (err) {
        alert('Error removing item: ' + err.message);
      }
    }
  };

  const handleUpdateQuantity = async (productId, newQuantity) => {
    if (newQuantity < 1) {
      handleRemoveItem(productId);
      return;
    }

    setUpdatingItems(prev => new Set(prev).add(productId));
    
    try {
      await updateCartItem({ 
        variables: { 
          product_id: productId, 
          quantity: newQuantity 
        } 
      });
    } catch (err) {
      alert('Error updating quantity: ' + err.message);
    } finally {
      setUpdatingItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(productId);
        return newSet;
      });
    }
  };

  const handleCheckout = async (e) => {
    e.preventDefault();
    try {
      const result = await createOrder({
        variables: {
          shipping_address: shippingAddress,
          payment_method: paymentMethod
        }
      });
      
      const orderData = result.data.createOrder;
      setOrderSuccess(orderData);
      setShowCheckout(false);
      setShippingAddress('');
      
      // Show success message with tracking info
      setTimeout(() => {
        if (orderData.tracking?.service_id) {
          alert(`Order placed successfully!\n\nOrder ID: #${orderData.id}\nTracking ID: ${orderData.tracking.service_id}\n\nYou can track your delivery using the tracking ID.`);
        } else {
          alert('Order placed successfully! Tracking information will be available shortly.');
        }
      }, 100);
      
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Error creating order: ' + err.message);
    }
  };

  // Show order success screen
  if (orderSuccess) {
    return (
      <div className="cart-container">
        <div className="order-success">
          <div className="success-header">
            <div className="success-icon">🎉</div>
            <h2>Order Placed Successfully!</h2>
            <p>Thank you for your purchase</p>
          </div>
          
          <div className="order-details-success">
            <div className="detail-card">
              <h3>Order Information</h3>
              <div className="detail-row">
                <span>Order ID:</span>
                <span className="order-id">#{orderSuccess.id}</span>
              </div>
              <div className="detail-row">
                <span>Total Amount:</span>
                <span className="amount">${orderSuccess.total_amount.toFixed(2)}</span>
              </div>
              <div className="detail-row">
                <span>Status:</span>
                <span className={`status-badge status-${orderSuccess.status}`}>
                  {orderSuccess.status.toUpperCase()}
                </span>
              </div>
              <div className="detail-row">
                <span>Order Date:</span>
                <span>{formatOrderDate(orderSuccess.created_at)}</span>
              </div>
            </div>

            {orderSuccess.tracking && (
              <div className="detail-card tracking-card">
                <h3>🚚 Delivery Tracking</h3>
                <div className="tracking-highlight">
                  <div className="tracking-id-display">
                    <span>Tracking ID:</span>
                    <span className="tracking-id-badge">{orderSuccess.tracking.service_id}</span>
                  </div>
                  <div className="detail-row">
                    <span>Delivery Status:</span>
                    <span className={`status-badge status-${orderSuccess.tracking.status}`}>
                      {orderSuccess.tracking.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>
                  {orderSuccess.tracking.estimated_delivery && (
                    <div className="detail-row">
                      <span>Estimated Delivery:</span>
                      <span className="estimated-delivery">
                        {formatOrderDate(orderSuccess.tracking.estimated_delivery)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="tracking-note">
                  <p>💡 Save your tracking ID to monitor your delivery progress</p>
                </div>
              </div>
            )}
          </div>

          <div className="success-actions">
            <button 
              onClick={() => setOrderSuccess(null)} 
              className="btn-primary"
            >
              Continue Shopping
            </button>
            <button 
              onClick={() => window.location.href = '#orders'} 
              className="btn-secondary"
            >
              View My Orders
            </button>
            {orderSuccess.tracking?.service_id && (
              <button 
                onClick={() => {
                  // Copy tracking ID to clipboard
                  navigator.clipboard.writeText(orderSuccess.tracking.service_id).then(() => {
                    alert('Tracking ID copied to clipboard!');
                  });
                }}
                className="btn-outline"
              >
                📋 Copy Tracking ID
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cart-container">
      <div className="section-header">
        <h2>Shopping Cart</h2>
        <p>{cartItems.length} {cartItems.length === 1 ? 'item' : 'items'} in your cart</p>
      </div>
      
      {cartItems.length === 0 ? (
        <div className="empty-cart">
          <div className="empty-cart-icon">🛒</div>
          <h3>Your cart is empty</h3>
          <p>Add some products to get started!</p>
        </div>
      ) : (
        <div className="cart-content">
          <div className="cart-items">
            {cartItems.map(item => (
              <div key={item.id} className="cart-item">
                <div className="item-image">
                  <img src={item.product.image_url || '/api/placeholder/80/80'} alt={item.product.name} />
                </div>
                <div className="item-details">
                  <h4 className="item-name">{item.product.name}</h4>
                  <div className="item-meta">
                    <span className="item-price">${item.product.price.toFixed(2)}</span>
                    <span className="item-stock">Stock: {item.product.stock}</span>
                  </div>
                  <div className="item-controls">
                    <div className="quantity-controls">
                      <button 
                        onClick={() => handleUpdateQuantity(item.product.id, item.quantity - 1)}
                        disabled={updatingItems.has(item.product.id)}
                        className="quantity-btn"
                      >
                        −
                      </button>
                      <span className="quantity-display">
                        {updatingItems.has(item.product.id) ? '...' : item.quantity}
                      </span>
                      <button 
                        onClick={() => handleUpdateQuantity(item.product.id, item.quantity + 1)}
                        disabled={updatingItems.has(item.product.id) || item.quantity >= item.product.stock}
                        className="quantity-btn"
                      >
                        +
                      </button>
                    </div>
                    <button 
                      onClick={() => handleRemoveItem(item.product.id)}
                      className="remove-btn"
                    >
                      🗑️ Remove
                    </button>
                  </div>
                  <div className="item-total">
                    Subtotal: <strong>${(item.product.price * item.quantity).toFixed(2)}</strong>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="cart-summary">
            <div className="summary-row total-row">
              <span>Total Amount:</span>
              <span className="total-amount">${total.toFixed(2)}</span>
            </div>
            <button 
              onClick={() => setShowCheckout(!showCheckout)} 
              className="checkout-btn"
              disabled={cartItems.length === 0}
            >
              {showCheckout ? 'Cancel Checkout' : 'Proceed to Checkout'}
            </button>
          </div>
          
          {showCheckout && (
            <div className="checkout-section">
              <h3>Checkout Information</h3>
              <form onSubmit={handleCheckout} className="checkout-form">
                <div className="form-group">
                  <label htmlFor="shipping-address">Shipping Address</label>
                  <textarea
                    id="shipping-address"
                    placeholder="Enter your complete shipping address including postal code"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    required
                    rows="4"
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="payment-method">Payment Method</label>
                  <select 
                    id="payment-method"
                    value={paymentMethod} 
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="credit_card">Credit Card</option>
                    <option value="debit_card">Debit Card</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash_on_delivery">Cash on Delivery</option>
                    <option value="digital_wallet">Digital Wallet</option>
                  </select>
                </div>
                
                <div className="checkout-summary">
                  <h4>Order Summary</h4>
                  {cartItems.map(item => (
                    <div key={item.id} className="checkout-item">
                      <span>{item.product.name} × {item.quantity}</span>
                      <span>${(item.product.price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="checkout-total">
                    <strong>Total: ${total.toFixed(2)}</strong>
                  </div>
                </div>
                
                <button 
                  type="submit" 
                  className="place-order-btn"
                  disabled={creatingOrder || !shippingAddress.trim()}
                >
                  {creatingOrder ? (
                    <>
                      <div className="button-spinner"></div>
                      Processing Order...
                    </>
                  ) : (
                    `Place Order - $${total.toFixed(2)}`
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
      
      <style jsx>{`
        .order-success {
          background: white;
          border-radius: 1.5rem;
          box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
          padding: 2rem;
          text-align: center;
          max-width: 600px;
          margin: 0 auto;
        }

        .success-header {
          margin-bottom: 2rem;
        }

        .success-icon {
          font-size: 4rem;
          margin-bottom: 1rem;
          animation: bounce 1s ease-in-out infinite alternate;
        }

        @keyframes bounce {
          from { transform: translateY(0px); }
          to { transform: translateY(-10px); }
        }

        .order-details-success {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
          margin-bottom: 2rem;
          text-align: left;
        }

        .detail-card {
          background: #f8fafc;
          border-radius: 1rem;
          padding: 1.5rem;
          border: 1px solid #e2e8f0;
        }

        .detail-card h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #1f2937;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
          font-size: 0.95rem;
        }

        .detail-row:last-child {
          margin-bottom: 0;
        }

        .order-id {
          font-family: monospace;
          font-weight: 600;
          background: #e0e7ff;
          color: #3730a3;
          padding: 0.25rem 0.5rem;
          border-radius: 0.375rem;
        }

        .amount {
          font-weight: 700;
          color: #059669;
          font-size: 1.1rem;
        }

        .tracking-card {
          background: linear-gradient(135deg, #f0f9ff, #e0f2fe);
          border-color: #0ea5e9;
        }

        .tracking-highlight {
          background: white;
          border-radius: 0.75rem;
          padding: 1rem;
          margin-bottom: 1rem;
          border: 1px solid #e2e8f0;
        }

        .tracking-id-display {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.75rem;
          padding-bottom: 0.75rem;
          border-bottom: 1px solid #f1f5f9;
        }

        .tracking-id-badge {
          font-family: 'Monaco', 'Menlo', monospace;
          font-weight: 600;
          background: linear-gradient(135deg, #1f2937, #374151);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 0.75rem;
          font-size: 0.9rem;
          letter-spacing: 0.05em;
        }

        .estimated-delivery {
          font-weight: 600;
          color: #0369a1;
        }

        .tracking-note {
          background: #fef3c7;
          border: 1px solid #f59e0b;
          border-radius: 0.5rem;
          padding: 0.75rem;
          font-size: 0.875rem;
          color: #92400e;
        }

        .success-actions {
          display: flex;
          gap: 1rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .btn-outline {
          background: white;
          color: #374151;
          border: 2px solid #d1d5db;
          padding: 0.75rem 1.5rem;
          border-radius: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-outline:hover {
          border-color: #6366f1;
          color: #6366f1;
          transform: translateY(-1px);
        }

        .item-controls {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 0.75rem;
          gap: 1rem;
        }

        .quantity-controls {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: #f3f4f6;
          border-radius: 0.5rem;
          padding: 0.25rem;
        }

        .quantity-btn {
          background: white;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          width: 2rem;
          height: 2rem;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-weight: 600;
          transition: all 0.2s;
        }

        .quantity-btn:hover:not(:disabled) {
          background: #f3f4f6;
          border-color: #9ca3af;
        }

        .quantity-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .quantity-display {
          min-width: 2rem;
          text-align: center;
          font-weight: 600;
        }

        .remove-btn {
          background: #fef2f2;
          color: #dc2626;
          border: 1px solid #fecaca;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .remove-btn:hover {
          background: #fee2e2;
          border-color: #fca5a5;
        }

        .checkout-summary {
          background: #f8fafc;
          border-radius: 0.75rem;
          padding: 1rem;
          margin-bottom: 1.5rem;
          border: 1px solid #e2e8f0;
        }

        .checkout-item {
          display: flex;
          justify-content: space-between;
          margin-bottom: 0.5rem;
          font-size: 0.9rem;
        }

        .checkout-total {
          border-top: 1px solid #d1d5db;
          padding-top: 0.75rem;
          margin-top: 0.75rem;
          text-align: right;
          font-size: 1.1rem;
        }

        .button-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-top: 2px solid white;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin-right: 0.5rem;
        }

        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @media (max-width: 768px) {
          .order-details-success {
            gap: 1rem;
          }
          
          .success-actions {
            flex-direction: column;
          }
          
          .item-controls {
            flex-direction: column;
            gap: 0.75rem;
            align-items: stretch;
          }
          
          .quantity-controls {
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
};

export default Cart;