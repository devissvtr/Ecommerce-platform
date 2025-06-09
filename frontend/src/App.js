import React, { useState, useEffect } from 'react';
import { ApolloClient, InMemoryCache, ApolloProvider, createHttpLink, gql, useQuery, useMutation } from '@apollo/client';
import { setContext } from '@apollo/client/link/context';
import './App.css';
import AdminAllOrders from './components/AdminAllOrders';
import DeliveryTrackingPage from './components/DeliveryTrackingPage';
import Profile from './components/Profile';

// GraphQL Client Setup with better error handling
const httpLink = createHttpLink({
  uri: process.env.REACT_APP_API_URL ? `${process.env.REACT_APP_API_URL}/graphql` : 'http://localhost:4000/graphql',
});

const authLink = setContext((_, { headers }) => {
  const token = localStorage.getItem('token');
  return {
    headers: {
      ...headers,
      authorization: token ? `Bearer ${token}` : "",
    }
  };
});

const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      errorPolicy: 'all'
    },
    query: {
      errorPolicy: 'all'
    },
    mutate: {
      errorPolicy: 'all'
    }
  }
});

// GraphQL Queries and Mutations
const GET_PRODUCTS = gql`
  query GetProducts($limit: Int, $offset: Int, $category_id: Int) {
    products(limit: $limit, offset: $offset, category_id: $category_id) {
      id
      name
      description
      price
      stock
      image_url
      category {
        name
      }
    }
  }
`;

const GET_CATEGORIES = gql`
  query GetCategories {
    categories {
      id
      name
      description
    }
  }
`;

const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        username
        email
        role
        fullName
        address
        phoneNumber
      }
    }
  }
`;

const REGISTER_MUTATION = gql`
  mutation Register($username: String!, $email: String!, $password: String!, $role: String) {
    register(username: $username, email: $email, password: $password, role: $role) {
      token
      user {
        id
        username
        email
        role
        fullName
        address
        phoneNumber
      }
    }
  }
`;

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

const ADD_TO_CART = gql`
  mutation AddToCart($product_id: ID!, $quantity: Int!) {
    addToCart(product_id: $product_id, quantity: $quantity) {
      id
      quantity
      product {
        id
        name
        price
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
    }
  }
`;

const GET_MY_ORDERS = gql`
  query GetMyOrders {
    myOrders {
      id
      total_amount
      status
      shipping_address
      created_at
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

const ADD_PRODUCT = gql`
  mutation AddProduct($name: String!, $description: String, $price: Float!, $category_id: Int!, $stock: Int!, $image_url: String, $initialWarehouseId: Int, $initialQuantity: Int) {
    addProduct(name: $name, description: $description, price: $price, category_id: $category_id, stock: $stock, image_url: $image_url, initialWarehouseId: $initialWarehouseId, initialQuantity: $initialQuantity) {
      id
      name
      description
      price
      stock
      category {
        id
        name
      }
    }
  }
`;

const GET_WAREHOUSES = gql`
  query GetWarehouses {
    warehouses {
      id
      name
      location
      manager_id
      created_at
      updated_at
    }
  }
`;

const ADD_WAREHOUSE = gql`
  mutation AddWarehouse($name: String!, $location: String, $manager_id: Int) {
    addWarehouse(name: $name, location: $location, manager_id: $manager_id) {
      id
      name
      location
      manager_id
      created_at
    }
  }
`;

const GET_INVENTORY_PRODUCTS = gql`
  query GetInventoryProducts {
    inventoryProducts {
      id
      product_id
      warehouse_id
      quantity
      reserved
      restock_threshold
      last_restocked
      updated_at
    }
  }
`;

const ADD_INVENTORY_PRODUCT = gql`
  mutation AddInventoryProduct($product_id: Int!, $warehouse_id: Int!, $quantity: Int!, $reserved: Int, $restock_threshold: Int, $last_restocked: String) {
    addInventoryProduct(product_id: $product_id, warehouse_id: $warehouse_id, quantity: $quantity, reserved: $reserved, restock_threshold: $restock_threshold, last_restocked: $last_restocked) {
      id
      product_id
      warehouse_id
      quantity
      reserved
      restock_threshold
      last_restocked
    }
  }
`;

const UPDATE_ORDER_STATUS = gql`
  mutation UpdateOrderStatus($id: Int!, $status: String!) {
    updateOrderStatus(id: $id, status: $status) {
      id
      status
    }
  }
`;

const UPDATE_DELIVERY_STATUS = gql`
  mutation UpdateDeliveryStatus($service_id: String!, $status: String!, $tracking_notes: String) {
    updateDeliveryStatus(service_id: $service_id, status: $status, tracking_notes: $tracking_notes) {
      service_id
      status
      tracking_notes
    }
  }
`;

// Enhanced Error Display Component
const ErrorDisplay = ({ error, onClose }) => {
  const getErrorMessage = (error) => {
    if (error.networkError) {
      return `Network Error: ${error.networkError.message}`;
    }
    if (error.graphQLErrors && error.graphQLErrors.length > 0) {
      return `GraphQL Error: ${error.graphQLErrors[0].message}`;
    }
    return error.message || 'An unknown error occurred';
  };

  return (
    <div className="error-notification">
      <div className="error-content">
        <span className="error-icon">⚠️</span>
        <span className="error-message">{getErrorMessage(error)}</span>
        <button onClick={onClose} className="error-close">×</button>
      </div>
    </div>
  );
};

// Enhanced Toast Notification Component
const Toast = ({ message, type = 'success', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);
  
  return (
    <div className={`toast show toast-${type}`}>
      <div className="toast-content">
        <span className="toast-icon">
          {type === 'success' ? '✓' : type === 'error' ? '❌' : '⚠️'}
        </span>
        <span className="toast-message">{message}</span>
      </div>
    </div>
  );
};

// Components
const LoginForm = ({ onLogin, onToggleMode }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [login, { loading, error }] = useMutation(LOGIN_MUTATION);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await login({ variables: { email, password } });
      localStorage.setItem('token', data.login.token);
      localStorage.setItem('user', JSON.stringify(data.login.user));
      onLogin(data.login.user);
    } catch (err) {
      console.error('Login error:', err);
    }
  };

  return (
    <div className="auth-form">
      <div className="auth-form-header">
        <h2>Welcome Back</h2>
        <p>Sign in to your account</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Enter your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
      {error && <div className="error-message">Error: {error.message}</div>}
      <div className="auth-switch">
        <p>
          Don't have an account?{' '}
          <button type="button" onClick={onToggleMode} className="link-button">
            Create Account
          </button>
        </p>
      </div>
      <div className="demo-credentials">
        <h4>Demo Credentials:</h4>
        <div className="credential-item">
          <strong>Admin:</strong> admin@example.com / password
        </div>
        <div className="credential-item">
          <strong>Customer:</strong> customer1@example.com / password
        </div>
      </div>
    </div>
  );
};

const RegisterForm = ({ onLogin, onToggleMode }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [register, { loading, error }] = useMutation(REGISTER_MUTATION);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await register({ variables: { username, email, password, role } });
      localStorage.setItem('token', data.register.token);
      localStorage.setItem('user', JSON.stringify(data.register.user));
      onLogin(data.register.user);
    } catch (err) {
      console.error('Register error:', err);
    }
  };

  return (
    <div className="auth-form">
      <div className="auth-form-header">
        <h2>Create Account</h2>
        <p>Join our community today</p>
      </div>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            placeholder="Choose a username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email Address</label>
          <input
            id="email"
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            placeholder="Create a password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label htmlFor="role">Account Type</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="customer">Customer</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>
      </form>
      {error && <div className="error-message">Error: {error.message}</div>}
      <div className="auth-switch">
        <p>
          Already have an account?{' '}
          <button type="button" onClick={onToggleMode} className="link-button">
            Sign In
          </button>
        </p>
      </div>
    </div>
  );
};

const ProductList = ({ user, setCurrentPage, showToast }) => {
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [loadingProduct, setLoadingProduct] = useState(null);
  
  // Ensure proper type conversion for GraphQL
  const getCategoryVariables = () => {
    const variables = { limit: 20, offset: 0 };
    if (selectedCategory !== null) {
      // Convert string to integer for GraphQL
      variables.category_id = parseInt(selectedCategory, 10);
    }
    return variables;
  };
  
  const { loading, error, data } = useQuery(GET_PRODUCTS, {
    variables: getCategoryVariables(),
    errorPolicy: 'all'
  });
  
  const { data: categoriesData } = useQuery(GET_CATEGORIES);
  const [addToCart] = useMutation(ADD_TO_CART, {
    refetchQueries: [{ query: GET_MY_CART }],
    onError: (error) => {
      console.error('Add to cart error:', error);
    }
  });

  const handleCategoryChange = (categoryId) => {
    console.log('🔧 Category selected:', { categoryId, type: typeof categoryId });
    
    // Set to null for "All Products", otherwise convert to string for state management
    if (categoryId === null || categoryId === '' || categoryId === 'all') {
      setSelectedCategory(null);
    } else {
      setSelectedCategory(categoryId.toString());
    }
  };

  const handleAddToCart = async (productId, productName) => {
    if (!user) {
      showToast('Please login to add items to cart', 'error');
      return;
    }

    setLoadingProduct(productId);
    
    try {
      console.log('🛒 Adding product to cart:', { productId, user: user.id });
      
      const result = await addToCart({ 
        variables: { 
          product_id: productId.toString(), 
          quantity: 1 
        }
      });
      
      console.log('✅ Add to cart successful:', result);
      showToast(`${productName} added to cart!`, 'success');
      
      // Navigate to cart after a short delay
      setTimeout(() => setCurrentPage('cart'), 1000);
      
    } catch (err) {
      console.error('❌ Add to cart error:', err);
      
      let errorMessage = 'Failed to add item to cart';
      
      if (err.networkError) {
        errorMessage = `Network error: ${err.networkError.message}`;
      } else if (err.graphQLErrors && err.graphQLErrors.length > 0) {
        errorMessage = err.graphQLErrors[0].message;
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setLoadingProduct(null);
    }
  };

  if (loading) return <div className="loading-spinner"><div className="spinner"></div>Loading products...</div>;
  
  if (error) {
    console.error('ProductList query error:', error);
    return (
      <div className="error-message">
        <h3>Error Loading Products</h3>
        <p>{error.message}</p>
        <button onClick={() => window.location.reload()} className="btn-primary">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="product-section">
      <div className="section-header">
        <h2>Our Products</h2>
        <p>Discover amazing products at great prices</p>
      </div>
      
      <div className="category-filter">
        <button 
          onClick={() => handleCategoryChange(null)}
          className={`filter-btn ${selectedCategory === null ? 'active' : ''}`}
        >
          All Products
        </button>
        {categoriesData?.categories.map(category => (
          <button
            key={category.id}
            onClick={() => handleCategoryChange(category.id)}
            className={`filter-btn ${selectedCategory === category.id.toString() ? 'active' : ''}`}
          >
            {category.name}
          </button>
        ))}
      </div>
      
      <div className="products-grid">
        {data?.products.map(product => (
          <div key={product.id} className="product-card">
            <div className="product-image">
              <img src={product.image_url || '/api/placeholder/300/200'} alt={product.name} />
              {product.stock <= 5 && product.stock > 0 && (
                <div className="stock-badge low-stock">Only {product.stock} left!</div>
              )}
              {product.stock === 0 && (
                <div className="stock-badge out-of-stock">Out of Stock</div>
              )}
            </div>
            <div className="product-info">
              <div className="product-category">
                {product.category && <span className="category-tag">{product.category.name}</span>}
              </div>
              <h3 className="product-title">{product.name}</h3>
              <p className="product-description">{product.description}</p>
              <div className="product-footer">
                <div className="price-info">
                  <span className="price">${product.price}</span>
                  <span className="stock-info">Stock: {product.stock}</span>
                </div>
                {user?.role === 'customer' && (
                  <button
                    onClick={() => handleAddToCart(product.id, product.name)}
                    disabled={product.stock === 0 || loadingProduct === product.id}
                    className="add-to-cart-btn"
                  >
                    {loadingProduct === product.id ? (
                      <>
                        <div className="button-spinner"></div>
                        Adding...
                      </>
                    ) : product.stock === 0 ? (
                      'Out of Stock'
                    ) : (
                      'Add to Cart'
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {data?.products && data.products.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📦</div>
          <h3>No products found</h3>
          <p>
            {selectedCategory 
              ? 'No products available in this category.' 
              : 'No products available at the moment.'
            }
          </p>
        </div>
      )}
    </div>
  );
};

const Cart = ({ user }) => {
  const { loading, error, data } = useQuery(GET_MY_CART);
  const [createOrder] = useMutation(CREATE_ORDER, {
    refetchQueries: [{ query: GET_MY_CART }, { query: GET_MY_ORDERS }]
  });
  
  const [shippingAddress, setShippingAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('credit_card');
  const [showCheckout, setShowCheckout] = useState(false);

  if (!user) return <div className="auth-required">Please login to view cart</div>;
  if (loading) return <div className="loading-spinner"><div className="spinner"></div>Loading cart...</div>;
  if (error) return <div className="error-message">Error: {error.message}</div>;

  const cartItems = data?.myCart || [];
  const total = cartItems.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);

  const handleCheckout = async (e) => {
    e.preventDefault();
    try {
      await createOrder({
        variables: {
          shipping_address: shippingAddress,
          payment_method: paymentMethod
        }
      });
      alert('Order created successfully!');
      setShowCheckout(false);
      setShippingAddress('');
    } catch (err) {
      alert('Error creating order: ' + err.message);
    }
  };

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
                    <span className="item-price">${item.product.price}</span>
                    <span className="item-quantity">Qty: {item.quantity}</span>
                  </div>
                  <div className="item-total">
                    Subtotal: ${(item.product.price * item.quantity).toFixed(2)}
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
                    placeholder="Enter your complete shipping address"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    required
                    rows="3"
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
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash_on_delivery">Cash on Delivery</option>
                  </select>
                </div>
                <button type="submit" className="place-order-btn">
                  Place Order - ${total.toFixed(2)}
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Orders = ({ user }) => {
  const { loading, error, data } = useQuery(GET_MY_ORDERS);

  if (loading) return <div className="loading-spinner"><div className="spinner"></div>Loading orders...</div>;
  if (error) return <div className="error-message">Error loading orders: {error.message}</div>;

  const orders = data?.myOrders || [];

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
        </div>
      ) : (
        <div className="orders-list">
          {orders.map(order => (
            <div key={order.id} className="order-card">
              <div className="order-header">
                <div className="order-info">
                  <h3>Order #{order.id}</h3>
                  <span className="order-date">
                    {new Date(order.created_at).toLocaleDateString()}
                  </span>
                </div>
                <span className={`status-badge status-${order.status.toLowerCase().replace(/ /g, '_')}`}>
                  {order.status}
                </span>
              </div>
              
              <div className="order-details">
                <div className="order-summary">
                  <div className="summary-item">
                    <span>Total Amount:</span>
                    <span className="amount">${order.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="summary-item">
                    <span>Shipping Address:</span>
                    <span>{order.shipping_address}</span>
                  </div>
                </div>

                <div className="order-items">
                  <h4>Items:</h4>
                  <div className="items-list">
                    {order.items.map(item => (
                      <div key={item.id} className="order-item">
                        <img 
                          src={item.product.image_url || '/api/placeholder/60/60'} 
                          alt={item.product.name} 
                          className="item-image"
                        />
                        <div className="item-info">
                          <span className="item-name">{item.product.name}</span>
                          <span className="item-details">
                            {item.quantity} × ${item.price.toFixed(2)}
                          </span>
                        </div>
                        <span className="item-total">
                          ${(item.price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {order.tracking && (
                  <div className="tracking-section">
                    <h4>Delivery Tracking</h4>
                    <div className="tracking-info">
                      <div className="tracking-item">
                        <span>Tracking ID:</span>
                        <span className="tracking-id">{order.tracking.service_id}</span>
                      </div>
                      <div className="tracking-item">
                        <span>Status:</span>
                        <span className={`status-badge status-${order.tracking.status.toLowerCase().replace(/ /g, '_')}`}>
                          {order.tracking.status}
                        </span>
                      </div>
                      {order.tracking.estimated_delivery && (
                        <div className="tracking-item">
                          <span>Estimated Delivery:</span>
                          <span>{new Date(order.tracking.estimated_delivery).toLocaleDateString()}</span>
                        </div>
                      )}
                      {order.tracking.actual_delivery && (
                        <div className="tracking-item">
                          <span>Delivered On:</span>
                          <span>{new Date(order.tracking.actual_delivery).toLocaleDateString()}</span>
                        </div>
                      )}
                      {order.tracking.tracking_notes && (
                        <div className="tracking-item">
                          <span>Notes:</span>
                          <span>{order.tracking.tracking_notes}</span>
                        </div>
                      )}
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

// Admin components would follow similar patterns with modern styling...
const AdminPanel = ({ user, showToast }) => {
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [productForm, setProductForm] = useState({
    name: '',
    description: '',
    price: '',
    category_id: '',
    stock: '',
    image_url: '',
    initialWarehouseId: '',
    initialQuantity: ''
  });
  
  const { data: categoriesData } = useQuery(GET_CATEGORIES);
  const { data: warehousesData } = useQuery(GET_WAREHOUSES);
  const [addProduct] = useMutation(ADD_PRODUCT, {
    refetchQueries: [{ query: GET_PRODUCTS }, { query: GET_INVENTORY_PRODUCTS }],
    onError: (error) => {
      console.error('Add product mutation error:', error);
    }
  });

  if (!user || user.role !== 'admin') {
    return <div className="auth-required">Admin access required</div>;
  }

  const validateForm = () => {
    const errors = [];
    
    if (!productForm.name || productForm.name.trim().length === 0) {
      errors.push('Product name is required');
    }
    
    if (!productForm.price || parseFloat(productForm.price) <= 0) {
      errors.push('Price must be greater than 0');
    }
    
    if (!productForm.category_id) {
      errors.push('Category is required');
    }
    
    if (!productForm.stock || parseInt(productForm.stock) < 0) {
      errors.push('Stock cannot be negative');
    }
    
    if (productForm.initialWarehouseId && (!productForm.initialQuantity || parseInt(productForm.initialQuantity) <= 0)) {
      errors.push('Initial quantity must be greater than 0 when warehouse is selected');
    }
    
    if (productForm.initialQuantity && !productForm.initialWarehouseId) {
      errors.push('Please select a warehouse for initial inventory');
    }
    
    return errors;
  };

  const handleAddProduct = async (e) => {
    e.preventDefault();
    
    // Validate form
    const validationErrors = validateForm();
    if (validationErrors.length > 0) {
      showToast(validationErrors.join(', '), 'error');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      console.log('🔧 Submitting product form:', productForm);
      
      const variables = {
        name: productForm.name.trim(),
        description: productForm.description.trim() || null,
        price: parseFloat(productForm.price),
        category_id: parseInt(productForm.category_id),
        stock: parseInt(productForm.stock),
        image_url: productForm.image_url.trim() || null,
        initialWarehouseId: productForm.initialWarehouseId ? parseInt(productForm.initialWarehouseId) : null,
        initialQuantity: productForm.initialQuantity ? parseInt(productForm.initialQuantity) : null
      };
      
      console.log('📦 Mutation variables:', variables);
      
      const result = await addProduct({ variables });
      
      console.log('✅ Product added successfully:', result);
      
      showToast(`Product "${productForm.name}" added successfully!`, 'success');
      
      // Reset form
      setProductForm({ 
        name: '', 
        description: '', 
        price: '', 
        category_id: '', 
        stock: '', 
        image_url: '', 
        initialWarehouseId: '', 
        initialQuantity: '' 
      });
      setShowAddProduct(false);
      
    } catch (err) {
      console.error('❌ Error adding product:', err);
      
      let errorMessage = 'Failed to add product';
      
      if (err.networkError) {
        errorMessage = `Network error: ${err.networkError.message}`;
        console.error('Network error details:', err.networkError);
      } else if (err.graphQLErrors && err.graphQLErrors.length > 0) {
        errorMessage = err.graphQLErrors[0].message;
        console.error('GraphQL errors:', err.graphQLErrors);
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      showToast(errorMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFormChange = (field, value) => {
    setProductForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="admin-panel">
      <div className="section-header">
        <h2>Admin Panel</h2>
        <p>Manage your store products and inventory</p>
      </div>
      
      <div className="admin-actions">
        <button 
          onClick={() => setShowAddProduct(!showAddProduct)}
          className="btn-primary"
          disabled={isSubmitting}
        >
          {showAddProduct ? 'Cancel' : '+ Add New Product'}
        </button>
      </div>

      {showAddProduct && (
        <div className="form-section">
          <h3>Add New Product</h3>
          <form onSubmit={handleAddProduct} className="modern-form">
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="product-name">Product Name *</label>
                <input
                  id="product-name"
                  type="text"
                  placeholder="Enter product name"
                  value={productForm.name}
                  onChange={(e) => handleFormChange('name', e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
              <div className="form-group">
                <label htmlFor="product-price">Price ($) *</label>
                <input
                  id="product-price"
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={productForm.price}
                  onChange={(e) => handleFormChange('price', e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="product-description">Description</label>
              <textarea
                id="product-description"
                placeholder="Describe your product"
                value={productForm.description}
                onChange={(e) => handleFormChange('description', e.target.value)}
                rows="3"
                disabled={isSubmitting}
              />
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="product-category">Category *</label>
                <select
                  id="product-category"
                  value={productForm.category_id}
                  onChange={(e) => handleFormChange('category_id', e.target.value)}
                  required
                  disabled={isSubmitting}
                >
                  <option value="">Select Category</option>
                  {categoriesData?.categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="product-stock">Stock Quantity *</label>
                <input
                  id="product-stock"
                  type="number"
                  min="0"
                  placeholder="0"
                  value={productForm.stock}
                  onChange={(e) => handleFormChange('stock', e.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="product-image">Image URL</label>
              <input
                id="product-image"
                type="url"
                placeholder="https://example.com/image.jpg"
                value={productForm.image_url}
                onChange={(e) => handleFormChange('image_url', e.target.value)}
                disabled={isSubmitting}
              />
            </div>
            
            <div className="form-section-title">
              <h4>Initial Inventory (Optional)</h4>
              <p>Add this product to a warehouse with initial stock</p>
            </div>
            
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="initial-warehouse">Warehouse</label>
                <select
                  id="initial-warehouse"
                  value={productForm.initialWarehouseId}
                  onChange={(e) => handleFormChange('initialWarehouseId', e.target.value)}
                  disabled={isSubmitting}
                >
                  <option value="">Select Warehouse (Optional)</option>
                  {warehousesData?.warehouses.map(warehouse => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name} - {warehouse.location}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="initial-quantity">Initial Quantity</label>
                <input
                  id="initial-quantity"
                  type="number"
                  min="1"
                  placeholder="0"
                  value={productForm.initialQuantity}
                  onChange={(e) => handleFormChange('initialQuantity', e.target.value)}
                  disabled={!productForm.initialWarehouseId || isSubmitting}
                />
              </div>
            </div>
            
            <div className="form-actions">
              <button 
                type="button" 
                onClick={() => setShowAddProduct(false)}
                className="btn-secondary"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn-primary btn-large"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <div className="button-spinner"></div>
                    Adding Product...
                  </>
                ) : (
                  'Add Product'
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

// Main App Component with modern navigation
const AppContent = () => {
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user')));
  const [currentPage, setCurrentPage] = useState('products');
  const [showLogin, setShowLogin] = useState(true);
  const [toast, setToast] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = (msg, type = 'success') => setToast({ message: msg, type });

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleLogin = (userData) => {
    setUser(userData);
    setCurrentPage('products');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
    setCurrentPage('products');
    setSidebarOpen(false);
  };

  const renderContent = () => {
    if (!user) {
      return showLogin ? 
        <LoginForm onLogin={handleLogin} onToggleMode={() => setShowLogin(!showLogin)} /> :
        <RegisterForm onLogin={handleLogin} onToggleMode={() => setShowLogin(!showLogin)} />;
    }

    switch (currentPage) {
      case 'products':
        return <ProductList user={user} setCurrentPage={setCurrentPage} showToast={showToast} />;
      case 'cart':
        if (user?.role !== 'customer') return <div className="auth-required">Only customers can access cart.</div>;
        return <Cart user={user} />;
      case 'orders':
        if (user?.role !== 'customer') return <div className="auth-required">Only customers can access orders.</div>;
        return <Orders user={user} />;
      case 'profile':
        return <Profile user={user} />;
      case 'admin':
        if (user?.role !== 'admin') return <div className="auth-required">Only admins can access admin panel.</div>;
        return <AdminPanel user={user} showToast={showToast} />;
      case 'all-orders':
        if (user?.role !== 'admin') return <div className="auth-required">Only admins can access all orders.</div>;
        return <AdminAllOrders user={user} />;
      case 'delivery-tracking':
        return <DeliveryTrackingPage />;
      default:
        return <ProductList user={user} setCurrentPage={setCurrentPage} showToast={showToast} />;
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <button 
              className="mobile-menu-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              ☰
            </button>
            <h1 className="app-title">belilokal.id</h1>
          </div>
          
          {user && (
            <nav className={`nav-menu ${sidebarOpen ? 'nav-open' : ''}`}>
              <div className="nav-overlay" onClick={() => setSidebarOpen(false)}></div>
              <div className="nav-content">
                <div className="nav-header">
                  <h3>Navigation</h3>
                  <button className="nav-close" onClick={() => setSidebarOpen(false)}>×</button>
                </div>
                
                <div className="nav-items">
                  <button
                    className={`nav-item ${currentPage === 'products' ? 'active' : ''}`}
                    onClick={() => { setCurrentPage('products'); setSidebarOpen(false); }}
                  >
                    <span className="nav-icon">🛍️</span>
                    Products
                  </button>
                  
                  {user.role === 'customer' && (
                    <>
                      <button
                        className={`nav-item ${currentPage === 'cart' ? 'active' : ''}`}
                        onClick={() => { setCurrentPage('cart'); setSidebarOpen(false); }}
                      >
                        <span className="nav-icon">🛒</span>
                        Cart
                      </button>
                      <button
                        className={`nav-item ${currentPage === 'orders' ? 'active' : ''}`}
                        onClick={() => { setCurrentPage('orders'); setSidebarOpen(false); }}
                      >
                        <span className="nav-icon">📦</span>
                        My Orders
                      </button>
                    </>
                  )}
                  
                  {user.role === 'admin' && (
                    <>
                      <button
                        className={`nav-item ${currentPage === 'admin' ? 'active' : ''}`}
                        onClick={() => { setCurrentPage('admin'); setSidebarOpen(false); }}
                      >
                        <span className="nav-icon">⚙️</span>
                        Admin Panel
                      </button>
                      <button
                        className={`nav-item ${currentPage === 'all-orders' ? 'active' : ''}`}
                        onClick={() => { setCurrentPage('all-orders'); setSidebarOpen(false); }}
                      >
                        <span className="nav-icon">📋</span>
                        All Orders
                      </button>
                    </>
                  )}
                  
                  <button
                    className={`nav-item ${currentPage === 'delivery-tracking' ? 'active' : ''}`}
                    onClick={() => { setCurrentPage('delivery-tracking'); setSidebarOpen(false); }}
                  >
                    <span className="nav-icon">🚚</span>
                    Track Delivery
                  </button>
                  
                  <button
                    className={`nav-item ${currentPage === 'profile' ? 'active' : ''}`}
                    onClick={() => { setCurrentPage('profile'); setSidebarOpen(false); }}
                  >
                    <span className="nav-icon">👤</span>
                    Profile
                  </button>
                </div>
                
                <div className="nav-footer">
                  <div className="user-info">
                    <span className="user-name">{user.username}</span>
                    <span className="user-role">{user.role}</span>
                  </div>
                  <button onClick={handleLogout} className="logout-btn">
                    <span className="nav-icon">🚪</span>
                    Logout
                  </button>
                </div>
              </div>
            </nav>
          )}
        </div>
      </header>
      
      <main className="main-content">
        {renderContent()}
      </main>
      
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}
    </div>
  );
};

function App() {
  return (
    <ApolloProvider client={client}>
      <AppContent />
    </ApolloProvider>
  );
}

export default App;