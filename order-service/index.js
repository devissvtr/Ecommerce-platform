const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { gql } = require('graphql-tag');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fetch = require('node-fetch');

// Get service URLs from environment variables with fallbacks
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002';
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:4004';  
const DELIVERY_SERVICE_URL = process.env.DELIVERY_SERVICE_URL || 'http://localhost:4005';

console.log('🔧 Service URLs Configuration:');
console.log('  PRODUCT_SERVICE_URL:', PRODUCT_SERVICE_URL);
console.log('  INVENTORY_SERVICE_URL:', INVENTORY_SERVICE_URL);
console.log('  DELIVERY_SERVICE_URL:', DELIVERY_SERVICE_URL);

// Database connection
let db;
const connectDB = async (maxRetries = 10, retryInterval = 5000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempting to connect to database... (${i + 1}/${maxRetries})`);
      db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'ecommerce_order',
        connectTimeout: 60000,
      });
      
      await db.ping();
      console.log('✅ Database connected successfully!');
      return;
    } catch (error) {
      console.log(`❌ Database connection failed (${i + 1}/${maxRetries}):`, error.message);
      if (i === maxRetries - 1) {
        throw error;
      }
      console.log(`⏳ Retrying in ${retryInterval / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
};

// Enhanced service call function with better error handling
const callService = async (url, query, variables = {}) => {
  try {
    console.log('🔗 Calling service URL:', url);
    console.log('📝 Query:', query.substring(0, 100) + '...');
    console.log('🔢 Variables:', JSON.stringify(variables));
    
    const response = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      timeout: 10000 // 10 second timeout
    });
    
    console.log('📡 Response status:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ HTTP Error Response:', errorText);
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    console.log('📦 GraphQL Response:', JSON.stringify(result, null, 2));
    
    if (result.errors && result.errors.length > 0) {
      console.error('❌ GraphQL Errors:', result.errors);
      throw new Error(`GraphQL Error: ${result.errors[0].message}`);
    }
    
    if (!result.data) {
      throw new Error('No data received from service');
    }
    
    console.log('✅ Service call successful');
    return result.data;
  } catch (error) {
    console.error('❌ Service call failed:', error.message);
    console.error('📍 Error details:', error);
    throw error;
  }
};

// Test service connectivity
const testServiceConnectivity = async () => {
  const services = [
    { name: 'Product Service', url: PRODUCT_SERVICE_URL },
    { name: 'Inventory Service', url: INVENTORY_SERVICE_URL },
    { name: 'Delivery Service', url: DELIVERY_SERVICE_URL }
  ];

  for (const service of services) {
    try {
      const response = await fetch(`${service.url}/health`, { timeout: 5000 });
      if (response.ok) {
        console.log(`✅ ${service.name} is healthy`);
      } else {
        console.log(`⚠️ ${service.name} returned status ${response.status}`);
      }
    } catch (error) {
      console.log(`❌ ${service.name} is not reachable: ${error.message}`);
    }
  }
};

// GraphQL Schema
const typeDefs = gql`
  extend type Query {
    orders: [Order!]!
    order(id: ID!): Order
    myOrders: [Order!]!
    myCart: [CartItem!]!
  }

  extend type Mutation {
    addToCart(product_id: ID!, quantity: Int!): CartItem!
    removeFromCart(product_id: ID!): Boolean!
    updateCartItem(product_id: ID!, quantity: Int!): CartItem!
    clearCart: Boolean!
    createOrder(shipping_address: String!, payment_method: String!): Order!
    updateOrderStatus(id: ID!, status: String!): Order!
    cancelOrder(id: ID!): Order!
  }

  type Order @key(fields: "id") {
    id: ID!
    user_id: ID!
    total_amount: Float!
    status: String!
    shipping_address: String!
    payment_method: String
    created_at: String!
    updated_at: String!
    items: [OrderItem!]!
    user: User
  }

  type OrderItem {
    id: ID!
    order_id: ID!
    product_id: ID!
    quantity: Int!
    price: Float!
    product: Product
  }

  type CartItem {
    id: ID!
    user_id: ID!
    product_id: ID!
    quantity: Int!
    created_at: String!
    product: Product
  }

  extend type User @key(fields: "id") {
    id: ID! @external
    orders: [Order!]!
    cart: [CartItem!]!
  }

  extend type Product @key(fields: "id") {
    id: ID! @external
  }
`;

const resolvers = {
  Query: {
    orders: async (_, __, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin access required');
      const [rows] = await db.execute('SELECT * FROM orders ORDER BY created_at DESC');
      return rows;
    },
    
    order: async (_, { id }, { user }) => {
      if (!user) throw new Error('Authentication required');
      
      let query = 'SELECT * FROM orders WHERE id = ?';
      const params = [id];
      
      if (user.role !== 'admin') {
        query += ' AND user_id = ?';
        params.push(user.id);
      }
      
      const [rows] = await db.execute(query, params);
      return rows[0];
    },
    
    myOrders: async (_, __, { user }) => {
      if (!user) throw new Error('Authentication required');
      const [rows] = await db.execute(
        'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
        [user.id]
      );
      return rows;
    },
    
    myCart: async (_, __, { user }) => {
      if (!user) throw new Error('Authentication required');
      const [rows] = await db.execute(
        'SELECT * FROM cart WHERE user_id = ? ORDER BY created_at DESC',
        [user.id]
      );
      return rows;
    }
  },
  
  Mutation: {
    addToCart: async (_, { product_id, quantity }, { user }) => {
      if (!user) throw new Error('Authentication required');
      
      console.log(`🛒 Adding to cart: product_id=${product_id}, quantity=${quantity}, user=${user.id}`);
      
      // Convert product_id to integer for database queries
      const productIdInt = parseInt(product_id, 10);
      if (isNaN(productIdInt)) {
        throw new Error('Invalid product ID format');
      }
      
      // Validate quantity
      if (!quantity || quantity < 1) {
        throw new Error('Quantity must be at least 1');
      }
      
      try {
        // Verify product exists and has sufficient stock
        console.log('🔍 Verifying product exists and has stock...');
        const productData = await callService(
          PRODUCT_SERVICE_URL,
          `query GetProduct($id: ID!) { 
            product(id: $id) { 
              id 
              name
              price
              stock 
            } 
          }`,
          { id: productIdInt.toString() }
        );
        
        console.log('📦 Product data received:', productData);
        
        if (!productData || !productData.product) {
          throw new Error('Product not found');
        }
        
        const product = productData.product;
        
        if (product.stock < quantity) {
          throw new Error(`Insufficient stock available. Only ${product.stock} items in stock.`);
        }
        
        console.log('✅ Product verification successful');
        
        // Check if item already exists in cart
        const [existingItems] = await db.execute(
          'SELECT * FROM cart WHERE user_id = ? AND product_id = ?',
          [user.id, productIdInt]
        );
        
        if (existingItems.length > 0) {
          // Update existing item
          const newQuantity = existingItems[0].quantity + quantity;
          
          // Check if new quantity exceeds stock
          if (newQuantity > product.stock) {
            throw new Error(`Cannot add ${quantity} more items. Total would be ${newQuantity} but only ${product.stock} in stock.`);
          }
          
          await db.execute(
            'UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?',
            [newQuantity, user.id, productIdInt]
          );
          
          console.log('🔄 Updated existing cart item');
        } else {
          // Add new item to cart
          await db.execute(
            'INSERT INTO cart (user_id, product_id, quantity) VALUES (?, ?, ?)',
            [user.id, productIdInt, quantity]
          );
          
          console.log('➕ Added new item to cart');
        }
        
        // Return updated cart item
        const [rows] = await db.execute(
          'SELECT * FROM cart WHERE user_id = ? AND product_id = ?',
          [user.id, productIdInt]
        );
        
        console.log('✅ Successfully added to cart');
        return rows[0];
        
      } catch (error) {
        console.error('❌ Error in addToCart:', error.message);
        console.error('📍 Full error:', error);
        throw error;
      }
    },
    
    removeFromCart: async (_, { product_id }, { user }) => {
      if (!user) throw new Error('Authentication required');
      
      const productIdInt = parseInt(product_id, 10);
      if (isNaN(productIdInt)) {
        throw new Error('Invalid product ID format');
      }
      
      await db.execute(
        'DELETE FROM cart WHERE user_id = ? AND product_id = ?',
        [user.id, productIdInt]
      );
      
      return true;
    },
    
    updateCartItem: async (_, { product_id, quantity }, { user }) => {
      if (!user) throw new Error('Authentication required');
      
      const productIdInt = parseInt(product_id, 10);
      if (isNaN(productIdInt)) {
        throw new Error('Invalid product ID format');
      }
      
      if (quantity < 1) {
        throw new Error('Quantity must be at least 1');
      }
      
      // Verify product stock
      const productData = await callService(
        PRODUCT_SERVICE_URL,
        `query GetProduct($id: ID!) { 
          product(id: $id) { 
            id 
            stock 
          } 
        }`,
        { id: productIdInt.toString() }
      );
      
      if (!productData?.product) {
        throw new Error('Product not found');
      }
      
      if (productData.product.stock < quantity) {
        throw new Error(`Insufficient stock available. Only ${productData.product.stock} items in stock.`);
      }
      
      await db.execute(
        'UPDATE cart SET quantity = ? WHERE user_id = ? AND product_id = ?',
        [quantity, user.id, productIdInt]
      );
      
      const [rows] = await db.execute(
        'SELECT * FROM cart WHERE user_id = ? AND product_id = ?',
        [user.id, productIdInt]
      );
      
      return rows[0];
    },
    
    clearCart: async (_, __, { user }) => {
      if (!user) throw new Error('Authentication required');
      
      await db.execute('DELETE FROM cart WHERE user_id = ?', [user.id]);
      return true;
    },
    
    createOrder: async (_, { shipping_address, payment_method }, { user }) => {
      if (!user) throw new Error('Authentication required');
      if (user.role !== 'customer') throw new Error('Only customers can place orders');
      
      console.log(`📦 Creating order for user ${user.id}`);
      
      // Get cart items
      const [cartItems] = await db.execute(
        'SELECT * FROM cart WHERE user_id = ?',
        [user.id]
      );
      
      if (cartItems.length === 0) {
        throw new Error('Cart is empty');
      }
      
      console.log(`📝 Found ${cartItems.length} items in cart`);
      
      // Validate products and calculate total
      let total = 0;
      const orderItems = [];
      
      for (const item of cartItems) {
        console.log(`🔍 Validating product ${item.product_id}`);
        
        const productData = await callService(
          PRODUCT_SERVICE_URL,
          `query GetProduct($id: ID!) { 
            product(id: $id) { 
              id 
              name
              price 
              stock 
            } 
          }`,
          { id: item.product_id.toString() }
        );
        
        if (!productData?.product) {
          throw new Error(`Product ${item.product_id} not found`);
        }
        
        if (productData.product.stock < item.quantity) {
          throw new Error(`Insufficient stock for product ${productData.product.name}`);
        }
        
        const itemTotal = productData.product.price * item.quantity;
        total += itemTotal;
        
        orderItems.push({
          product_id: item.product_id,
          quantity: item.quantity,
          price: productData.product.price
        });
      }
      
      console.log(`💰 Order total: $${total}`);
      
      // Create order
      const [orderResult] = await db.execute(
        'INSERT INTO orders (user_id, total_amount, shipping_address, payment_method) VALUES (?, ?, ?, ?)',
        [user.id, total, shipping_address, payment_method]
      );
      
      const orderId = orderResult.insertId;
      console.log(`📄 Created order ${orderId}`);
      
      // Create order items
      for (const item of orderItems) {
        await db.execute(
          'INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)',
          [orderId, item.product_id, item.quantity, item.price]
        );
      }
      
      // Create delivery tracking
      try {
        const trackingData = await callService(
          DELIVERY_SERVICE_URL,
          `mutation CreateDeliveryTracking($order_id: ID!, $estimated_delivery: String) {
            createDeliveryTracking(order_id: $order_id, estimated_delivery: $estimated_delivery) {
              service_id
              status
            }
          }`,
          { 
            order_id: orderId.toString(),
            estimated_delivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          }
        );
        console.log('📦 Delivery tracking created:', trackingData);
      } catch (error) {
        console.warn('⚠️ Failed to create delivery tracking:', error.message);
        // Don't fail the order if delivery tracking fails
      }
      
      // Clear cart
      await db.execute('DELETE FROM cart WHERE user_id = ?', [user.id]);
      console.log('🧹 Cart cleared');
      
      // Return created order
      const [rows] = await db.execute('SELECT * FROM orders WHERE id = ?', [orderId]);
      console.log('✅ Order created successfully');
      return rows[0];
    },
    
    updateOrderStatus: async (_, { id, status }, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin access required');
      
      const validStatuses = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new Error('Invalid status');
      }
      
      await db.execute(
        'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id]
      );
      
      const [rows] = await db.execute('SELECT * FROM orders WHERE id = ?', [id]);
      return rows[0];
    },
    
    cancelOrder: async (_, { id }, { user }) => {
      if (!user) throw new Error('Authentication required');
      
      let query = 'UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
      let params = ['cancelled', id];
      
      if (user.role !== 'admin') {
        query += ' AND user_id = ?';
        params.push(user.id);
      }
      
      await db.execute(query, params);
      
      const [rows] = await db.execute('SELECT * FROM orders WHERE id = ?', [id]);
      return rows[0];
    }
  },
  
  Order: {
    __resolveReference: async (order) => {
      const [rows] = await db.execute('SELECT * FROM orders WHERE id = ?', [order.id]);
      return rows[0];
    },
    
    items: async (order) => {
      const [rows] = await db.execute('SELECT * FROM order_items WHERE order_id = ?', [order.id]);
      return rows;
    },
    
    user: async (order) => {
      return { id: order.user_id };
    }
  },
  
  OrderItem: {
    product: async (orderItem) => {
      return { id: orderItem.product_id };
    }
  },
  
  CartItem: {
    product: async (cartItem) => {
      return { id: cartItem.product_id };
    }
  },
  
  User: {
    orders: async (user) => {
      const [rows] = await db.execute(
        'SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC',
        [user.id]
      );
      return rows;
    },
    
    cart: async (user) => {
      const [rows] = await db.execute(
        'SELECT * FROM cart WHERE user_id = ? ORDER BY created_at DESC',
        [user.id]
      );
      return rows;
    }
  }
};

// Helper function to get user from headers
const getUserFromHeaders = (req) => {
  try {
    const userHeader = req.headers.user;
    return userHeader ? JSON.parse(userHeader) : null;
  } catch (error) {
    console.error('Error parsing user header:', error);
    return null;
  }
};

async function startServer() {
  try {
    console.log('🚀 Starting Order Service...');
    
    // Connect to database
    await connectDB();
    
    // Test service connectivity
    await testServiceConnectivity();
    
    // Create Apollo Server
    const server = new ApolloServer({
      schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
      formatError: (error) => {
        console.error('GraphQL Error:', error);
        return {
          message: error.message,
          path: error.path,
          extensions: {
            code: error.extensions?.code,
            timestamp: new Date().toISOString()
          }
        };
      }
    });

    await server.start();
    console.log('✅ Apollo Server started successfully!');

    const app = express();
    app.use(cors());
    app.use(express.json());

    // Health check endpoint
    app.get('/health', async (req, res) => {
      try {
        await db.ping();
        res.json({ 
          status: 'OK', 
          service: 'order-service', 
          timestamp: new Date().toISOString(),
          dependencies: {
            database: 'connected',
            productService: PRODUCT_SERVICE_URL,
            inventoryService: INVENTORY_SERVICE_URL,
            deliveryService: DELIVERY_SERVICE_URL
          }
        });
      } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ 
          status: 'ERROR', 
          service: 'order-service', 
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Debug endpoint for cart operations
    app.get('/debug/cart/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const [rows] = await db.execute(
          'SELECT * FROM cart WHERE user_id = ?',
          [userId]
        );
        res.json({ cartItems: rows });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.use(
      '/graphql',
      expressMiddleware(server, {
        context: async ({ req }) => {
          const user = getUserFromHeaders(req);
          return { user };
        },
      })
    );

    const PORT = process.env.PORT || 4003;
    app.listen(PORT, () => {
      console.log(`🚀 Order service ready at http://localhost:${PORT}/graphql`);
      console.log(`🏥 Health check available at http://localhost:${PORT}/health`);
      console.log(`🐛 Debug endpoint at http://localhost:${PORT}/debug/cart/:userId`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Order Service:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer().catch(console.error);