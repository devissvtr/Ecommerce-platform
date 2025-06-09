const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { gql } = require('graphql-tag');
const mysql = require('mysql2/promise');
const cors = require('cors');

// Database connection with retry mechanism
let db;
const connectDB = async (maxRetries = 10, retryInterval = 5000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempting to connect to database... (${i + 1}/${maxRetries})`);
      db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'ecommerce_inventory',
        connectTimeout: 60000,
      });
      
      await db.ping();
      console.log('✅ Database connected successfully!');
      return;
      
    } catch (error) {
      console.error(`❌ Database connection attempt ${i + 1} failed:`, error.message);
      
      if (i === maxRetries - 1) {
        throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
      }
      
      console.log(`⏳ Retrying in ${retryInterval / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
};

// ✅ FIXED: GraphQL Schema - Hapus warehouse mutations, hanya extend type
const typeDefs = gql`
  extend type Query {
    inventoryProducts: [InventoryProduct!]!
    inventoryByProduct(product_id: ID!): [InventoryProduct!]!
    inventoryByWarehouse(warehouse_id: ID!): [InventoryProduct!]!
  }

  extend type Mutation {
    addInventoryProduct(product_id: ID!, warehouse_id: ID!, quantity: Int!, reserved: Int, restock_threshold: Int): InventoryProduct!
    updateInventoryProduct(id: ID!, quantity: Int, reserved: Int, restock_threshold: Int): InventoryProduct!
    reserveStock(product_id: ID!, quantity: Int!): Boolean!
    releaseStock(product_id: ID!, quantity: Int!): Boolean!
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

  # ✅ FIXED: Hanya extend Warehouse, jangan definisikan mutations
  # Field types harus match dengan warehouse service
  extend type Warehouse @key(fields: "id") {
    id: ID! @external
    inventoryProducts: [InventoryProduct!]!
  }

  extend type Product @key(fields: "id") {
    id: ID! @external
    inventory: [InventoryProduct!]!
  }
`;

const resolvers = {
  Query: {
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
    addInventoryProduct: async (_, { product_id, warehouse_id, quantity, reserved = 0, restock_threshold = 0 }, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin only');
      
      try {
        const [result] = await db.execute(
          'INSERT INTO inventory_products (product_id, warehouse_id, quantity, reserved, restock_threshold, last_restocked) VALUES (?, ?, ?, ?, ?, NOW())',
          [product_id, warehouse_id, quantity, reserved, restock_threshold]
        );
        
        const [rows] = await db.execute('SELECT * FROM inventory_products WHERE id = ?', [result.insertId]);
        return {
          ...rows[0],
          available: rows[0].quantity - rows[0].reserved
        };
      } catch (error) {
        console.error('Error adding inventory product:', error);
        throw new Error('Failed to add inventory product');
      }
    },
    
    updateInventoryProduct: async (_, { id, quantity, reserved, restock_threshold }, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin only');
      
      try {
        const updateFields = [];
        const params = [];
        
        if (quantity !== undefined) {
          updateFields.push('quantity = ?');
          params.push(quantity);
        }
        if (reserved !== undefined) {
          updateFields.push('reserved = ?');
          params.push(reserved);
        }
        if (restock_threshold !== undefined) {
          updateFields.push('restock_threshold = ?');
          params.push(restock_threshold);
        }
        
        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }
        
        params.push(id);
        
        await db.execute(
          `UPDATE inventory_products SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          params
        );
        
        const [rows] = await db.execute('SELECT * FROM inventory_products WHERE id = ?', [id]);
        return {
          ...rows[0],
          available: rows[0].quantity - rows[0].reserved
        };
      } catch (error) {
        console.error('Error updating inventory product:', error);
        throw new Error('Failed to update inventory product');
      }
    },
    
    reserveStock: async (_, { product_id, quantity }) => {
      try {
        const [inventoryRows] = await db.execute(
          'SELECT * FROM inventory_products WHERE product_id = ? AND (quantity - reserved) >= ? ORDER BY quantity DESC LIMIT 1',
          [product_id, quantity]
        );
        
        if (inventoryRows.length === 0) {
          throw new Error('Insufficient stock available');
        }
        
        const inventory = inventoryRows[0];
        
        await db.execute(
          'UPDATE inventory_products SET reserved = reserved + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [quantity, inventory.id]
        );
        
        return true;
      } catch (error) {
        console.error('Error reserving stock:', error);
        throw new Error('Failed to reserve stock');
      }
    },
    
    releaseStock: async (_, { product_id, quantity }) => {
      try {
        const [inventoryRows] = await db.execute(
          'SELECT * FROM inventory_products WHERE product_id = ? AND reserved >= ? ORDER BY reserved DESC LIMIT 1',
          [product_id, quantity]
        );
        
        if (inventoryRows.length === 0) {
          throw new Error('No reserved stock found');
        }
        
        const inventory = inventoryRows[0];
        
        await db.execute(
          'UPDATE inventory_products SET quantity = quantity - ?, reserved = reserved - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [quantity, quantity, inventory.id]
        );
        
        return true;
      } catch (error) {
        console.error('Error releasing stock:', error);
        throw new Error('Failed to release stock');
      }
    }
  },
  
  InventoryProduct: {
    __resolveReference: async (inventoryProduct) => {
      try {
        const [rows] = await db.execute('SELECT * FROM inventory_products WHERE id = ?', [inventoryProduct.id]);
        if (rows.length === 0) return null;
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
      return { id: inventoryProduct.warehouse_id };
    }
  },
  
  Warehouse: {
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
        console.error('Error fetching inventory for warehouse:', error);
        return [];
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
        console.error('Error fetching inventory for product:', error);
        return [];
      }
    }
  }
};

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
    
    await connectDB();
    
    const server = new ApolloServer({
      schema: buildSubgraphSchema({ typeDefs, resolvers })
    });

    await server.start();
    console.log('✅ Apollo Server started successfully!');

    const app = express();
    app.use(cors());
    app.use(express.json());

    app.get('/health', async (req, res) => {
      try {
        await db.ping();
        res.json({ 
          status: 'OK', 
          service: 'inventory-service',
          timestamp: new Date().toISOString()
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

    app.post('/api/reserve-stock', async (req, res) => {
      try {
        const { product_id, quantity } = req.body;
        
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
        console.error('Error reserving stock via REST API:', error);
        res.status(500).json({ error: error.message });
      }
    });
    
    app.post('/api/release-stock', async (req, res) => {
      try {
        const { product_id, quantity } = req.body;
        
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
        console.error('Error releasing stock via REST API:', error);
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
      console.log(`📊 Health check available at http://localhost:${PORT}/health`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Inventory Service:', error);
    process.exit(1);
  }
}

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer().catch(console.error);