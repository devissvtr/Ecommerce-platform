const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { gql } = require('graphql-tag');
const mysql = require('mysql2/promise');
const cors = require('cors');

// Database connection with retry mechanism
let db;
const connectDB = async () => {
  const maxRetries = 10;
  const retryDelay = 3000; // 3 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Attempting to connect to database... (${attempt}/${maxRetries})`);
      // Fixed MySQL2 configuration - removed invalid options
      db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'ecommerce_delivery',
        connectTimeout: 60000,
        // Removed acquireTimeout and timeout as they're not valid for mysql2
      });
      
      // Test the connection
      await db.execute('SELECT 1');
      console.log('✅ Database connected successfully!');
      return;
      
    } catch (error) {
      console.error(`❌ Database connection attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
      }
      
      // Wait before retrying
      console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

// GraphQL Schema using gql template literal
const typeDefs = gql`
  extend type Query {
    trackDelivery(service_id: String!): DeliveryTracking
    trackByOrderId(order_id: String!): DeliveryTracking
    deliveries: [DeliveryTracking!]!
    deliveriesByStatus(status: String!): [DeliveryTracking!]!
  }

  extend type Mutation {
    createDeliveryTracking(order_id: ID!, estimated_delivery: String): DeliveryTracking!
    updateDeliveryStatus(service_id: String!, status: String!, tracking_notes: String, actual_delivery: String): DeliveryTracking!
  }

  type DeliveryTracking @key(fields: "service_id") {
    id: ID!
    order_id: ID!
    service_id: String!
    status: String!
    estimated_delivery: String
    actual_delivery: String
    tracking_notes: String
    created_at: String!
    updated_at: String!
    order: Order
  }

  extend type Order @key(fields: "id") {
    id: ID! @external
    tracking: DeliveryTracking
  }
`;

const resolvers = {
  Query: {
    trackDelivery: async (_, { service_id }) => {
      try {
        console.log(`🔍 Tracking delivery with service_id: ${service_id}`);
        
        // First try exact match
        let [rows] = await db.execute(
          `SELECT id, order_id, service_id, status, tracking_notes,
                  DATE_FORMAT(estimated_delivery, '%Y-%m-%dT%H:%i:%s') AS estimated_delivery,
                  DATE_FORMAT(actual_delivery, '%Y-%m-%dT%H:%i:%s') AS actual_delivery,
                  DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
                  DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
           FROM delivery_tracking WHERE service_id = ?`,
          [service_id]
        );
        
        // If not found and it looks like an order ID pattern, try to find by order_id
        if (rows.length === 0) {
          // Check if it's a numeric string (order ID)
          if (/^\d+$/.test(service_id)) {
            console.log(`🔄 No exact match, trying order_id: ${service_id}`);
            [rows] = await db.execute(
              'SELECT * FROM delivery_tracking WHERE order_id = ?',
              [service_id]
            );
          }
          
          // Try pattern matching for tracking IDs starting with order ID
          if (rows.length === 0 && /^\d+$/.test(service_id)) {
            console.log(`🔄 Trying pattern match for order_id: ${service_id}`);
            [rows] = await db.execute(
              'SELECT * FROM delivery_tracking WHERE service_id LIKE ?',
              [`TRK${service_id}%`]
            );
          }
        }
        
        if (rows.length === 0) {
          console.log(`❌ No tracking found for: ${service_id}`);
          return null;
        }
        
        console.log(`✅ Found tracking: ${rows[0].service_id}`);
        return rows[0];
      } catch (error) {
        console.error('Error tracking delivery:', error);
        throw new Error('Failed to track delivery');
      }
    },

    trackByOrderId: async (_, { order_id }) => {
      try {
        console.log(`🔍 Tracking delivery by order_id: ${order_id}`);
        const [rows] = await db.execute(
          `SELECT id, order_id, service_id, status, tracking_notes,
                  DATE_FORMAT(estimated_delivery, '%Y-%m-%dT%H:%i:%s') AS estimated_delivery,
                  DATE_FORMAT(actual_delivery, '%Y-%m-%dT%H:%i:%s') AS actual_delivery,
                  DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
                  DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
           FROM delivery_tracking WHERE order_id = ?`,
          [order_id]
        );
        
        if (rows.length === 0) {
          console.log(`❌ No tracking found for order_id: ${order_id}`);
          return null;
        }
        
        console.log(`✅ Found tracking for order ${order_id}: ${rows[0].service_id}`);
        return rows[0];
      } catch (error) {
        console.error('Error tracking delivery by order ID:', error);
        throw new Error('Failed to track delivery by order ID');
      }
    },
    
    deliveries: async (_, __, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin only');
      try {
        const [rows] = await db.execute(
          `SELECT id, order_id, service_id, status, tracking_notes,
                  DATE_FORMAT(estimated_delivery, '%Y-%m-%dT%H:%i:%s') AS estimated_delivery,
                  DATE_FORMAT(actual_delivery, '%Y-%m-%dT%H:%i:%s') AS actual_delivery,
                  DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
                  DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
           FROM delivery_tracking ORDER BY created_at DESC`
        );
        return rows;
      } catch (error) {
        console.error('Error fetching deliveries:', error);
        throw new Error('Failed to fetch deliveries');
      }
    },
    
    deliveriesByStatus: async (_, { status }, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin only');
      try {
        const [rows] = await db.execute(
          `SELECT id, order_id, service_id, status, tracking_notes,
                  DATE_FORMAT(estimated_delivery, '%Y-%m-%dT%H:%i:%s') AS estimated_delivery,
                  DATE_FORMAT(actual_delivery, '%Y-%m-%dT%H:%i:%s') AS actual_delivery,
                  DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
                  DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
           FROM delivery_tracking WHERE status = ? ORDER BY created_at DESC`,
          [status]
        );
        return rows;
      } catch (error) {
        console.error('Error fetching deliveries by status:', error);
        throw new Error('Failed to fetch deliveries by status');
      }
    }
  },
  
  Mutation: {
    createDeliveryTracking: async (_, { order_id, estimated_delivery }) => {
      try {
        console.log(`📦 Creating delivery tracking for order: ${order_id}`);
        
        // Check if tracking already exists for this order
        const [existing] = await db.execute(
          'SELECT * FROM delivery_tracking WHERE order_id = ?',
          [order_id]
        );
        
        if (existing.length > 0) {
          console.log(`✅ Tracking already exists: ${existing[0].service_id}`);
          // Ensure dates are formatted when returning existing data as well
          const [rows] = await db.execute(
            `SELECT id, order_id, service_id, status, tracking_notes,
                    DATE_FORMAT(estimated_delivery, '%Y-%m-%dT%H:%i:%s') AS estimated_delivery,
                    DATE_FORMAT(actual_delivery, '%Y-%m-%dT%H:%i:%s') AS actual_delivery,
                    DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
                    DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
             FROM delivery_tracking WHERE order_id = ?`,
            [order_id]
          );
          return rows[0];
        }
        
        // Generate unique service ID with timestamp for uniqueness
        const timestamp = Date.now();
        const service_id = `TRK${order_id}${timestamp.toString().slice(-6)}`;
        
        // Default estimated delivery to 7 days from now if not provided
        // Keep this as is, as it correctly formats for MySQL DATETIME
        const estimatedDate = estimated_delivery || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        
        const [result] = await db.execute(
          'INSERT INTO delivery_tracking (order_id, service_id, estimated_delivery, status) VALUES (?, ?, ?, ?)',
          [order_id, service_id, estimatedDate, 'pending']
        );
        
        const [rows] = await db.execute(
          `SELECT id, order_id, service_id, status, tracking_notes,
                  DATE_FORMAT(estimated_delivery, '%Y-%m-%dT%H:%i:%s') AS estimated_delivery,
                  DATE_FORMAT(actual_delivery, '%Y-%m-%dT%H:%i:%s') AS actual_delivery,
                  DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
                  DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
           FROM delivery_tracking WHERE id = ?`,
          [result.insertId]
        );
        
        console.log(`✅ Created tracking: ${service_id} for order: ${order_id}`);
        return rows[0];
      } catch (error) {
        console.error('Error creating delivery tracking:', error);
        throw new Error('Failed to create delivery tracking');
      }
    },
    
    updateDeliveryStatus: async (_, { service_id, status, tracking_notes, actual_delivery }, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin only');
      
      try {
        console.log(`📝 Updating delivery status: ${service_id} -> ${status}`);
        
        const updateFields = ['status = ?'];
        const params = [status];
        
        if (tracking_notes !== undefined) {
          updateFields.push('tracking_notes = ?');
          params.push(tracking_notes);
        }
        
        if (actual_delivery !== undefined) {
          updateFields.push('actual_delivery = ?');
          params.push(actual_delivery);
        }
        
        // Auto-set actual delivery if status is 'delivered' and not provided
        if (status === 'delivered' && !actual_delivery) {
          updateFields.push('actual_delivery = NOW()');
        }
        
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(service_id);
        
        const [updateResult] = await db.execute(
          `UPDATE delivery_tracking SET ${updateFields.join(', ')} WHERE service_id = ?`,
          params
        );
        
        if (updateResult.affectedRows === 0) {
          throw new Error(`No tracking found with service_id: ${service_id}`);
        }
        
        const [rows] = await db.execute(
          `SELECT id, order_id, service_id, status, tracking_notes,
                  DATE_FORMAT(estimated_delivery, '%Y-%m-%dT%H:%i:%s') AS estimated_delivery,
                  DATE_FORMAT(actual_delivery, '%Y-%m-%dT%H:%i:%s') AS actual_delivery,
                  DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s') AS created_at,
                  DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s') AS updated_at
           FROM delivery_tracking WHERE service_id = ?`,
          [service_id]
        );
        
        console.log(`✅ Updated tracking status: ${service_id} -> ${status}`);
        return rows[0];
      } catch (error) {
        console.error('Error updating delivery status:', error);
        throw new Error('Failed to update delivery status');
      }
    }
  },
  
  DeliveryTracking: {
    __resolveReference: async (delivery) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM delivery_tracking WHERE service_id = ?',
          [delivery.service_id]
        );
        return rows[0];
      } catch (error) {
        console.error('Error resolving delivery reference:', error);
        return null;
      }
    }
  },
  
  Order: {
    tracking: async (order) => {
      try {
        console.log(`🔍 Looking for tracking for order: ${order.id}`);
        const [rows] = await db.execute(
          'SELECT * FROM delivery_tracking WHERE order_id = ?',
          [order.id]
        );
        
        if (rows.length === 0) {
          console.log(`❌ No tracking found for order: ${order.id}`);
          return null;
        }
        
        console.log(`✅ Found tracking for order ${order.id}: ${rows[0].service_id}`);
        return rows[0];
      } catch (error) {
        console.error('Error fetching order tracking:', error);
        return null;
      }
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
    console.log('🚀 Starting Delivery Service...');
    
    // Connect to database
    await connectDB();
    
    // Create Apollo Server with proper subgraph schema
    const server = new ApolloServer({
      schema: buildSubgraphSchema({ typeDefs, resolvers })
    });

    await server.start();
    console.log('✅ Apollo Server started successfully!');

    const app = express();
    app.use(cors());
    app.use(express.json());

    // Health check endpoint
    app.get('/health', (req, res) => {
      res.json({ 
        status: 'OK', 
        service: 'delivery-service',
        timestamp: new Date().toISOString()
      });
    });

    // Enhanced REST endpoint for creating delivery tracking
    app.post('/api/create-tracking', async (req, res) => {
      try {
        const { order_id, estimated_delivery } = req.body;
        
        if (!order_id) {
          return res.status(400).json({ error: 'order_id is required' });
        }
        
        console.log(`📦 REST API: Creating tracking for order: ${order_id}`);
        
        // Check if tracking already exists
        const [existing] = await db.execute(
          'SELECT * FROM delivery_tracking WHERE order_id = ?',
          [order_id]
        );
        
        if (existing.length > 0) {
          console.log(`✅ REST API: Tracking already exists: ${existing[0].service_id}`);
          return res.json({ success: true, tracking: existing[0] });
        }
        
        // Generate unique service ID
        const timestamp = Date.now();
        const service_id = `TRK${order_id}${timestamp.toString().slice(-6)}`;
        
        // Default estimated delivery to 7 days from now if not provided
        const estimatedDate = estimated_delivery || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        
        const [result] = await db.execute(
          'INSERT INTO delivery_tracking (order_id, service_id, estimated_delivery, status) VALUES (?, ?, ?, ?)',
          [order_id, service_id, estimatedDate, 'pending']
        );
        
        const [rows] = await db.execute(
          'SELECT * FROM delivery_tracking WHERE id = ?',
          [result.insertId]
        );
        
        console.log(`✅ REST API: Created tracking: ${service_id}`);
        res.json({ success: true, tracking: rows[0] });
      } catch (error) {
        console.error('Error creating tracking via REST API:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Enhanced REST endpoint for tracking lookup
    app.get('/api/track/:id', async (req, res) => {
      try {
        const { id } = req.params;
        console.log(`🔍 REST API: Tracking lookup for: ${id}`);
        
        // First try exact match
        let [rows] = await db.execute(
          'SELECT * FROM delivery_tracking WHERE service_id = ?',
          [id]
        );
        
        // If not found and it looks like an order ID, try by order_id
        if (rows.length === 0 && /^\d+$/.test(id)) {
          [rows] = await db.execute(
            'SELECT * FROM delivery_tracking WHERE order_id = ?',
            [id]
          );
        }
        
        // Try pattern matching
        if (rows.length === 0 && /^\d+$/.test(id)) {
          [rows] = await db.execute(
            'SELECT * FROM delivery_tracking WHERE service_id LIKE ?',
            [`TRK${id}%`]
          );
        }
        
        if (rows.length === 0) {
          return res.status(404).json({ error: 'Tracking not found' });
        }
        
        console.log(`✅ REST API: Found tracking: ${rows[0].service_id}`);
        res.json({ success: true, tracking: rows[0] });
      } catch (error) {
        console.error('Error tracking via REST API:', error);
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

    const PORT = process.env.PORT || 4005;
    app.listen(PORT, () => {
      console.log(`🚀 Delivery service ready at http://localhost:${PORT}/graphql`);
      console.log(`📊 Health check available at http://localhost:${PORT}/health`);
      console.log(`📦 REST API available at http://localhost:${PORT}/api/`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Delivery Service:', error);
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