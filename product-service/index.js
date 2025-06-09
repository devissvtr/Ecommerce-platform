const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { gql } = require('graphql-tag');
const mysql = require('mysql2/promise');
const cors = require('cors');
const fetch = require('node-fetch');

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
        database: process.env.DB_NAME || 'ecommerce_product',
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

// Enhanced service call function
const callInventoryService = async (query, variables = {}) => {
  try {
    const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:4004';
    console.log('🔗 Calling inventory service:', INVENTORY_SERVICE_URL);
    
    const response = await fetch(`${INVENTORY_SERVICE_URL}/graphql`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query, variables }),
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const result = await response.json();
    
    if (result.errors && result.errors.length > 0) {
      throw new Error(`GraphQL Error: ${result.errors[0].message}`);
    }
    
    return result.data;
  } catch (error) {
    console.error('❌ Inventory service call failed:', error.message);
    throw error;
  }
};

// GraphQL Schema - Updated to include inventory integration
const typeDefs = gql`
  extend type Query {
    products(limit: Int, offset: Int, category_id: Int): [Product!]!
    product(id: ID!): Product
    categories: [Category!]!
  }

  extend type Mutation {
    addProduct(
      name: String!, 
      description: String, 
      price: Float!, 
      category_id: Int!, 
      stock: Int!, 
      image_url: String,
      initialWarehouseId: Int,
      initialQuantity: Int
    ): Product!
    updateProduct(
      id: ID!, 
      name: String, 
      description: String, 
      price: Float, 
      category_id: Int, 
      stock: Int, 
      image_url: String
    ): Product!
    deleteProduct(id: ID!): Boolean!
    addCategory(name: String!, description: String): Category!
  }

  type Product @key(fields: "id") {
    id: ID!
    name: String!
    description: String
    price: Float!
    category_id: Int
    stock: Int!
    image_url: String
    created_at: String!
    category: Category
  }

  type Category @key(fields: "id") {
    id: ID!
    name: String!
    description: String
    created_at: String!
  }

  extend type User @key(fields: "id") {
    id: ID! @external
  }
`;

const resolvers = {
  Query: {
    products: async (_, { limit = 20, offset = 0, category_id }) => {
      try {
        let query = 'SELECT * FROM products WHERE 1=1';
        const params = [];
        
        if (category_id) {
          query += ' AND category_id = ?';
          params.push(category_id);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);
        
        const [rows] = await db.execute(query, params);
        return rows;
      } catch (error) {
        console.error('Error fetching products:', error);
        throw new Error('Failed to fetch products');
      }
    },
    
    product: async (_, { id }) => {
      try {
        const [rows] = await db.execute('SELECT * FROM products WHERE id = ?', [id]);
        return rows[0];
      } catch (error) {
        console.error('Error fetching product:', error);
        throw new Error('Failed to fetch product');
      }
    },
    
    categories: async () => {
      try {
        const [rows] = await db.execute('SELECT * FROM categories ORDER BY name');
        return rows;
      } catch (error) {
        console.error('Error fetching categories:', error);
        throw new Error('Failed to fetch categories');
      }
    }
  },
  
  Mutation: {
    addProduct: async (_, { 
      name, 
      description, 
      price, 
      category_id, 
      stock, 
      image_url,
      initialWarehouseId,
      initialQuantity
    }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error('Admin access required');
      }
      
      console.log('🔧 Adding product:', { name, price, category_id, stock, initialWarehouseId, initialQuantity });
      
      try {
        // Validate required fields
        if (!name || name.trim().length === 0) {
          throw new Error('Product name is required');
        }
        
        if (price <= 0) {
          throw new Error('Price must be greater than 0');
        }
        
        if (stock < 0) {
          throw new Error('Stock cannot be negative');
        }
        
        if (!category_id) {
          throw new Error('Category is required');
        }
        
        // Check if category exists
        const [categoryCheck] = await db.execute('SELECT id FROM categories WHERE id = ?', [category_id]);
        if (categoryCheck.length === 0) {
          throw new Error('Invalid category selected');
        }
        
        // Insert product into database
        const [result] = await db.execute(
          'INSERT INTO products (name, description, price, category_id, stock, image_url) VALUES (?, ?, ?, ?, ?, ?)',
          [name, description || null, price, category_id, stock, image_url || null]
        );
        
        const productId = result.insertId;
        console.log('✅ Product created with ID:', productId);
        
        // If warehouse info provided, add to inventory
        if (initialWarehouseId && initialQuantity > 0) {
          console.log('📦 Adding to inventory...');
          try {
            await callInventoryService(
              `mutation AddInventoryProduct(
                $product_id: ID!,
                $warehouse_id: ID!,
                $quantity: Int!,
                $restock_threshold: Int
              ) {
                addInventoryProduct(
                  product_id: $product_id,
                  warehouse_id: $warehouse_id,
                  quantity: $quantity,
                  restock_threshold: $restock_threshold
                ) {
                  id
                  quantity
                }
              }`,
              {
                product_id: productId.toString(),
                warehouse_id: initialWarehouseId.toString(),
                quantity: initialQuantity,
                restock_threshold: Math.max(5, Math.floor(initialQuantity * 0.1))
              }
            );
            console.log('✅ Product added to inventory');
          } catch (inventoryError) {
            console.warn('⚠️ Failed to add to inventory:', inventoryError.message);
            // Don't fail product creation if inventory fails
          }
        }
        
        // Return the created product
        const [rows] = await db.execute('SELECT * FROM products WHERE id = ?', [productId]);
        console.log('✅ Product creation completed');
        return rows[0];
        
      } catch (error) {
        console.error('❌ Error adding product:', error);
        throw error;
      }
    },
    
    updateProduct: async (_, { id, ...updates }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error('Admin access required');
      }
      
      try {
        const updateFields = [];
        const params = [];
        
        // Build dynamic update query
        Object.entries(updates).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            updateFields.push(`${key} = ?`);
            params.push(value);
          }
        });
        
        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }
        
        // Validate updates
        if (updates.price !== undefined && updates.price <= 0) {
          throw new Error('Price must be greater than 0');
        }
        
        if (updates.stock !== undefined && updates.stock < 0) {
          throw new Error('Stock cannot be negative');
        }
        
        if (updates.category_id) {
          const [categoryCheck] = await db.execute('SELECT id FROM categories WHERE id = ?', [updates.category_id]);
          if (categoryCheck.length === 0) {
            throw new Error('Invalid category selected');
          }
        }
        
        params.push(id);
        
        const [updateResult] = await db.execute(
          `UPDATE products SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          params
        );
        
        if (updateResult.affectedRows === 0) {
          throw new Error('Product not found');
        }
        
        const [rows] = await db.execute('SELECT * FROM products WHERE id = ?', [id]);
        return rows[0];
        
      } catch (error) {
        console.error('Error updating product:', error);
        throw error;
      }
    },
    
    deleteProduct: async (_, { id }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error('Admin access required');
      }
      
      try {
        const [result] = await db.execute('DELETE FROM products WHERE id = ?', [id]);
        return result.affectedRows > 0;
      } catch (error) {
        console.error('Error deleting product:', error);
        throw error;
      }
    },
    
    addCategory: async (_, { name, description }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error('Admin access required');
      }
      
      try {
        if (!name || name.trim().length === 0) {
          throw new Error('Category name is required');
        }
        
        // Check if category name already exists
        const [existingCheck] = await db.execute('SELECT id FROM categories WHERE name = ?', [name]);
        if (existingCheck.length > 0) {
          throw new Error('Category name already exists');
        }
        
        const [result] = await db.execute(
          'INSERT INTO categories (name, description) VALUES (?, ?)',
          [name, description || null]
        );
        
        const [rows] = await db.execute('SELECT * FROM categories WHERE id = ?', [result.insertId]);
        return rows[0];
        
      } catch (error) {
        console.error('Error adding category:', error);
        throw error;
      }
    }
  },
  
  Product: {
    __resolveReference: async (product) => {
      try {
        const [rows] = await db.execute('SELECT * FROM products WHERE id = ?', [product.id]);
        return rows[0];
      } catch (error) {
        console.error('Error resolving product reference:', error);
        return null;
      }
    },
    
    category: async (product) => {
      if (!product.category_id) return null;
      try {
        const [rows] = await db.execute('SELECT * FROM categories WHERE id = ?', [product.category_id]);
        return rows[0];
      } catch (error) {
        console.error('Error fetching product category:', error);
        return null;
      }
    }
  },
  
  Category: {
    __resolveReference: async (category) => {
      try {
        const [rows] = await db.execute('SELECT * FROM categories WHERE id = ?', [category.id]);
        return rows[0];
      } catch (error) {
        console.error('Error resolving category reference:', error);
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
    console.log('🚀 Starting Product Service...');
    
    await connectDB();
    
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
          service: 'product-service', 
          timestamp: new Date().toISOString(),
          dependencies: {
            database: 'connected',
            inventoryService: process.env.INVENTORY_SERVICE_URL || 'http://localhost:4004'
          }
        });
      } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ 
          status: 'ERROR', 
          service: 'product-service', 
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Debug endpoint for products
    app.get('/debug/products', async (req, res) => {
      try {
        const [products] = await db.execute('SELECT * FROM products ORDER BY created_at DESC LIMIT 10');
        const [categories] = await db.execute('SELECT * FROM categories');
        res.json({ 
          products, 
          categories,
          total_products: products.length,
          total_categories: categories.length
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

    const PORT = process.env.PORT || 4002;
    app.listen(PORT, () => {
      console.log(`🚀 Product service ready at http://localhost:${PORT}/graphql`);
      console.log(`🏥 Health check available at http://localhost:${PORT}/health`);
      console.log(`🐛 Debug endpoint at http://localhost:${PORT}/debug/products`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Product Service:', error);
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