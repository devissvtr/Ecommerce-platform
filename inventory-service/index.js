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
      db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'ecommerce_inventory',
        connectTimeout: 60000,
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

// GraphQL Schema - Fixed field names to match frontend expectations
const typeDefs = gql`
  extend type Query {
    warehouses: [Warehouse!]!
    warehouse(id: ID!): Warehouse
    inventoryProducts: [InventoryProduct!]!
    inventoryByProduct(product_id: ID!): [InventoryProduct!]!
    inventoryByWarehouse(warehouse_id: ID!): [InventoryProduct!]!
  }

  extend type Mutation {
    addWarehouse(name: String!, location: String, manager_id: Int): Warehouse!
    updateWarehouse(id: ID!, name: String, location: String, manager_id: Int): Warehouse!
    addInventoryProduct(product_id: ID!, warehouse_id: ID!, quantity: Int!, reserved: Int, restock_threshold: Int): InventoryProduct!
    updateInventoryProduct(id: ID!, quantity: Int, reserved: Int, restock_threshold: Int): InventoryProduct!
    reserveStock(product_id: ID!, quantity: Int!): Boolean!
    releaseStock(product_id: ID!, quantity: Int!): Boolean!
  }

  type Warehouse @key(fields: "id") {
    id: ID!
    name: String!
    location: String
    manager_id: Int
    created_at: String!
    updated_at: String!
    inventoryProducts: [InventoryProduct!]!
  }

  type InventoryProduct @key(fields: "id") {
    id: ID!
    product_id: ID!
    warehouse_id: ID!
    quantity: Int!
    reserved: Int!
    restock_threshold: Int!
    last_restocked: String
    updated_at: String!
    available: Int!
    warehouse: Warehouse!
    product: Product
  }

  extend type Product @key(fields: "id") {
    id: ID! @external
    inventory: [InventoryProduct!]!
  }
`;

const resolvers = {
  Query: {
    warehouses: async () => {
      try {
        const [rows] = await db.execute('SELECT * FROM warehouses ORDER BY created_at DESC');
        return rows;
      } catch (error) {
        console.error('Error fetching warehouses:', error);
        throw new Error('Failed to fetch warehouses');
      }
    },
    
    warehouse: async (_, { id }) => {
      try {
        const [rows] = await db.execute('SELECT * FROM warehouses WHERE id = ?', [id]);
        return rows[0];
      } catch (error) {
        console.error('Error fetching warehouse:', error);
        throw new Error('Failed to fetch warehouse');
      }
    },
    
    inventoryProducts: async () => {
      try {
        const [rows] = await db.execute('SELECT * FROM inventory_products ORDER BY updated_at DESC');
        return rows.map(row => ({
          ...row,
          available: row.quantity - row.reserved
        }));
      } catch (error) {
        console.error('Error fetching inventory products:', error);
        throw new Error('Failed to fetch inventory products');
      }
    },
    
    inventoryByProduct: async (_, { product_id }) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM inventory_products WHERE product_id = ?',
          [product_id]
        );
        return rows.map(row => ({
          ...row,
          available: row.quantity - row.reserved
        }));
      } catch (error) {
        console.error('Error fetching inventory by product:', error);
        throw new Error('Failed to fetch inventory by product');
      }
    },
    
    inventoryByWarehouse: async (_, { warehouse_id }) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM inventory_products WHERE warehouse_id = ?',
          [warehouse_id]
        );
        return rows.map(row => ({
          ...row,
          available: row.quantity - row.reserved
        }));
      } catch (error) {
        console.error('Error fetching inventory by warehouse:', error);
        throw new Error('Failed to fetch inventory by warehouse');
      }
    }
  },
  
  Mutation: {
    addWarehouse: async (_, { name, location, manager_id }, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin access required');
      
      try {
        if (!name || name.trim().length === 0) {
          throw new Error('Warehouse name is required');
        }
        
        const [result] = await db.execute(
          'INSERT INTO warehouses (name, location, manager_id) VALUES (?, ?, ?)',
          [name.trim(), location || null, manager_id || null]
        );
        
        const [rows] = await db.execute('SELECT * FROM warehouses WHERE id = ?', [result.insertId]);
        return rows[0];
      } catch (error) {
        console.error('Error adding warehouse:', error);
        throw error;
      }
    },
    
    updateWarehouse: async (_, { id, name, location, manager_id }, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin access required');
      
      try {
        const updateFields = [];
        const params = [];
        
        if (name !== undefined && name.trim().length > 0) {
          updateFields.push('name = ?');
          params.push(name.trim());
        }
        if (location !== undefined) {
          updateFields.push('location = ?');
          params.push(location);
        }
        if (manager_id !== undefined) {
          updateFields.push('manager_id = ?');
          params.push(manager_id);
        }
        
        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }
        
        params.push(id);
        
        const [updateResult] = await db.execute(
          `UPDATE warehouses SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          params
        );
        
        if (updateResult.affectedRows === 0) {
          throw new Error('Warehouse not found');
        }
        
        const [rows] = await db.execute('SELECT * FROM warehouses WHERE id = ?', [id]);
        return rows[0];
      } catch (error) {
        console.error('Error updating warehouse:', error);
        throw error;
      }
    },
    
    addInventoryProduct: async (_, { product_id, warehouse_id, quantity, reserved = 0, restock_threshold = 0 }, { user }) => {
      // Allow calls from other services without user authentication for internal operations
      if (user && user.role !== 'admin') {
        throw new Error('Admin access required');
      }
      
      try {
        console.log('📦 Adding inventory product:', { product_id, warehouse_id, quantity, reserved, restock_threshold });
        
        // Validate inputs
        if (!product_id || !warehouse_id) {
          throw new Error('Product ID and Warehouse ID are required');
        }
        
        if (quantity < 0) {
          throw new Error('Quantity cannot be negative');
        }
        
        if (reserved < 0) {
          throw new Error('Reserved quantity cannot be negative');
        }
        
        if (restock_threshold < 0) {
          throw new Error('Restock threshold cannot be negative');
        }
        
        // Check if warehouse exists
        const [warehouseCheck] = await db.execute('SELECT id FROM warehouses WHERE id = ?', [warehouse_id]);
        if (warehouseCheck.length === 0) {
          throw new Error('Warehouse not found');
        }
        
        // Check if product already exists in this warehouse
        const [existingCheck] = await db.execute(
          'SELECT id FROM inventory_products WHERE product_id = ? AND warehouse_id = ?',
          [product_id, warehouse_id]
        );
        
        if (existingCheck.length > 0) {
          throw new Error('Product already exists in this warehouse');
        }
        
        const [result] = await db.execute(
          'INSERT INTO inventory_products (product_id, warehouse_id, quantity, reserved, restock_threshold, last_restocked) VALUES (?, ?, ?, ?, ?, NOW())',
          [product_id, warehouse_id, quantity, reserved, restock_threshold]
        );
        
        const [rows] = await db.execute('SELECT * FROM inventory_products WHERE id = ?', [result.insertId]);
        const inventoryProduct = {
          ...rows[0],
          available: rows[0].quantity - rows[0].reserved
        };
        
        console.log('✅ Inventory product added successfully:', inventoryProduct);
        return inventoryProduct;
      } catch (error) {
        console.error('Error adding inventory product:', error);
        throw error;
      }
    },
    
    updateInventoryProduct: async (_, { id, quantity, reserved, restock_threshold }, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin access required');
      
      try {
        const updateFields = [];
        const params = [];
        
        if (quantity !== undefined) {
          if (quantity < 0) throw new Error('Quantity cannot be negative');
          updateFields.push('quantity = ?');
          params.push(quantity);
        }
        if (reserved !== undefined) {
          if (reserved < 0) throw new Error('Reserved quantity cannot be negative');
          updateFields.push('reserved = ?');
          params.push(reserved);
        }
        if (restock_threshold !== undefined) {
          if (restock_threshold < 0) throw new Error('Restock threshold cannot be negative');
          updateFields.push('restock_threshold = ?');
          params.push(restock_threshold);
        }
        
        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }
        
        params.push(id);
        
        const [updateResult] = await db.execute(
          `UPDATE inventory_products SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          params
        );
        
        if (updateResult.affectedRows === 0) {
          throw new Error('Inventory product not found');
        }
        
        const [rows] = await db.execute('SELECT * FROM inventory_products WHERE id = ?', [id]);
        return {
          ...rows[0],
          available: rows[0].quantity - rows[0].reserved
        };
      } catch (error) {
        console.error('Error updating inventory product:', error);
        throw error;
      }
    },
    
    reserveStock: async (_, { product_id, quantity }) => {
      try {
        if (quantity <= 0) {
          throw new Error('Quantity must be greater than 0');
        }
        
        // Find available inventory for the product
        const [inventoryRows] = await db.execute(
          'SELECT * FROM inventory_products WHERE product_id = ? AND (quantity - reserved) >= ? ORDER BY quantity DESC LIMIT 1',
          [product_id, quantity]
        );
        
        if (inventoryRows.length === 0) {
          throw new Error('Insufficient stock available');
        }
        
        const inventory = inventoryRows[0];
        
        // Reserve the stock
        const [updateResult] = await db.execute(
          'UPDATE inventory_products SET reserved = reserved + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [quantity, inventory.id]
        );
        
        if (updateResult.affectedRows === 0) {
          throw new Error('Failed to reserve stock');
        }
        
        console.log(`✅ Reserved ${quantity} units of product ${product_id} from inventory ${inventory.id}`);
        return true;
      } catch (error) {
        console.error('Error reserving stock:', error);
        throw error;
      }
    },
    
    releaseStock: async (_, { product_id, quantity }) => {
      try {
        if (quantity <= 0) {
          throw new Error('Quantity must be greater than 0');
        }
        
        // Find inventory with reserved stock
        const [inventoryRows] = await db.execute(
          'SELECT * FROM inventory_products WHERE product_id = ? AND reserved >= ? ORDER BY reserved DESC LIMIT 1',
          [product_id, quantity]
        );
        
        if (inventoryRows.length === 0) {
          throw new Error('No reserved stock found');
        }
        
        const inventory = inventoryRows[0];
        
        // Release the stock and reduce total quantity
        const [updateResult] = await db.execute(
          'UPDATE inventory_products SET quantity = quantity - ?, reserved = reserved - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [quantity, quantity, inventory.id]
        );
        
        if (updateResult.affectedRows === 0) {
          throw new Error('Failed to release stock');
        }
        
        console.log(`✅ Released ${quantity} units of product ${product_id} from inventory ${inventory.id}`);
        return true;
      } catch (error) {
        console.error('Error releasing stock:', error);
        throw error;
      }
    }
  },
  
  Warehouse: {
    __resolveReference: async (warehouse) => {
      try {
        const [rows] = await db.execute('SELECT * FROM warehouses WHERE id = ?', [warehouse.id]);
        return rows[0];
      } catch (error) {
        console.error('Error resolving warehouse reference:', error);
        return null;
      }
    },
    
    inventoryProducts: async (warehouse) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM inventory_products WHERE warehouse_id = ?',
          [warehouse.id]
        );
        return rows.map(row => ({
          ...row,
          available: row.quantity - row.reserved
        }));
      } catch (error) {
        console.error('Error fetching warehouse inventory:', error);
        return [];
      }
    }
  },
  
  InventoryProduct: {
    __resolveReference: async (inventoryProduct) => {
      try {
        const [rows] = await db.execute('SELECT * FROM inventory_products WHERE id = ?', [inventoryProduct.id]);
        return {
          ...rows[0],
          available: rows[0].quantity - rows[0].reserved
        };
      } catch (error) {
        console.error('Error resolving inventory product reference:', error);
        return null;
      }
    },
    
    warehouse: async (inventoryProduct) => {
      try {
        const [rows] = await db.execute('SELECT * FROM warehouses WHERE id = ?', [inventoryProduct.warehouse_id]);
        return rows[0];
      } catch (error) {
        console.error('Error fetching inventory warehouse:', error);
        return null;
      }
    }
  },
  
  Product: {
    inventory: async (product) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM inventory_products WHERE product_id = ?',
          [product.id]
        );
        return rows.map(row => ({
          ...row,
          available: row.quantity - row.reserved
        }));
      } catch (error) {
        console.error('Error fetching product inventory:', error);
        return [];
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
    console.log('🚀 Starting Inventory Service...');
    
    // Connect to database
    await connectDB();
    
    // Create Apollo Server with proper subgraph schema
    const server = new ApolloServer({
      schema: buildSubgraphSchema({ typeDefs, resolvers }),
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
          service: 'inventory-service',
          timestamp: new Date().toISOString(),
          dependencies: {
            database: 'connected'
          }
        });
      } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ 
          status: 'ERROR', 
          service: 'inventory-service', 
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // REST endpoint for stock operations (for inter-service communication)
    app.post('/api/reserve-stock', async (req, res) => {
      try {
        const { product_id, quantity } = req.body;
        
        if (!product_id || !quantity || quantity <= 0) {
          return res.status(400).json({ error: 'Invalid product_id or quantity' });
        }
        
        const [inventoryRows] = await db.execute(
          'SELECT * FROM inventory_products WHERE product_id = ? AND (quantity - reserved) >= ? ORDER BY quantity DESC LIMIT 1',
          [product_id, quantity]
        );
        
        if (inventoryRows.length === 0) {
          return res.status(400).json({ error: 'Insufficient stock available' });
        }
        
        const inventory = inventoryRows[0];
        
        await db.execute(
          'UPDATE inventory_products SET reserved = reserved + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [quantity, inventory.id]
        );
        
        res.json({ success: true, inventory_id: inventory.id });
      } catch (error) {
        console.error('REST API reserve stock error:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    app.post('/api/release-stock', async (req, res) => {
      try {
        const { product_id, quantity } = req.body;
        
        if (!product_id || !quantity || quantity <= 0) {
          return res.status(400).json({ error: 'Invalid product_id or quantity' });
        }
        
        const [inventoryRows] = await db.execute(
          'SELECT * FROM inventory_products WHERE product_id = ? AND reserved >= ? ORDER BY reserved DESC LIMIT 1',
          [product_id, quantity]
        );
        
        if (inventoryRows.length === 0) {
          return res.status(400).json({ error: 'No reserved stock found' });
        }
        
        const inventory = inventoryRows[0];
        
        await db.execute(
          'UPDATE inventory_products SET quantity = quantity - ?, reserved = reserved - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [quantity, quantity, inventory.id]
        );
        
        res.json({ success: true });
      } catch (error) {
        console.error('REST API release stock error:', error);
        res.status(500).json({ error: error.message });
      }
    });

    // Debug endpoint
    app.get('/debug/inventory', async (req, res) => {
      try {
        const [warehouses] = await db.execute('SELECT * FROM warehouses');
        const [inventory] = await db.execute('SELECT * FROM inventory_products');
        res.json({ 
          warehouses, 
          inventory: inventory.map(row => ({
            ...row,
            available: row.quantity - row.reserved
          }))
        });
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

    const PORT = process.env.PORT || 4004;
    app.listen(PORT, () => {
      console.log(`🚀 Inventory service ready at http://localhost:${PORT}/graphql`);
      console.log(`🏥 Health check available at http://localhost:${PORT}/health`);
      console.log(`🐛 Debug endpoint at http://localhost:${PORT}/debug/inventory`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Inventory Service:', error);
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