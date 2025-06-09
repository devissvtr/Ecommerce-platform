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
        database: process.env.DB_NAME || 'ecommerce_warehouse',
        connectTimeout: 60000,
      });
      
      await db.execute('SELECT 1');
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

const typeDefs = gql`
  extend type Query {
    warehouses: [Warehouse!]!
    warehouse(id: ID!): Warehouse
    warehousesByLocation(location: String!): [Warehouse!]!
    warehousesByManager(manager_id: ID!): [Warehouse!]!
    warehouseCapacity(id: ID!): WarehouseCapacity
    nearestWarehouse(latitude: Float!, longitude: Float!): Warehouse
  }

  extend type Mutation {
    addWarehouse(input: CreateWarehouseInput!): Warehouse!
    updateWarehouse(id: ID!, input: UpdateWarehouseInput!): Warehouse!
    deleteWarehouse(id: ID!): Boolean!
    assignManager(warehouse_id: ID!, manager_id: ID!): Warehouse!
    updateWarehouseCapacity(warehouse_id: ID!, capacity: Int!, occupied: Int!): WarehouseCapacity!
    setWarehouseStatus(warehouse_id: ID!, status: WarehouseStatus!): Warehouse!
  }

  type Warehouse @key(fields: "id") {
    id: ID!
    name: String!
    code: String!
    location: String!
    address: String
    city: String
    state: String
    postal_code: String
    country: String
    latitude: Float
    longitude: Float
    manager_id: ID
    phone: String
    email: String
    status: WarehouseStatus!
    capacity: Int
    occupied_space: Int
    available_space: Int
    created_at: String!
    updated_at: String!
    manager: User
    capacity_info: WarehouseCapacity
  }

  type WarehouseCapacity {
    warehouse_id: ID!
    total_capacity: Int!
    occupied_space: Int!
    available_space: Int!
    utilization_percentage: Float!
    last_updated: String!
  }

  input CreateWarehouseInput {
    name: String!
    code: String!
    location: String!
    address: String
    city: String
    state: String
    postal_code: String
    country: String
    latitude: Float
    longitude: Float
    manager_id: ID
    phone: String
    email: String
    capacity: Int
  }

  input UpdateWarehouseInput {
    name: String
    location: String
    address: String
    city: String
    state: String
    postal_code: String
    country: String
    latitude: Float
    longitude: Float
    manager_id: ID
    phone: String
    email: String
    capacity: Int
    status: WarehouseStatus
  }

  enum WarehouseStatus {
    ACTIVE
    INACTIVE
    MAINTENANCE
    FULL
  }

  extend type User @key(fields: "id") {
    id: ID! @external
    managed_warehouses: [Warehouse!]!
  }
`;

const resolvers = {
  Query: {
    warehouses: async (_, __, { user }) => {
      try {
        let query = 'SELECT * FROM warehouses';
        let params = [];
        
        if (user && user.role === 'warehouse_manager') {
          query += ' WHERE manager_id = ?';
          params.push(user.id);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const [rows] = await db.execute(query, params);
        return rows.map(warehouse => ({
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        }));
      } catch (error) {
        console.error('Error fetching warehouses:', error);
        throw new Error('Failed to fetch warehouses');
      }
    },
    
    warehouse: async (_, { id }) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM warehouses WHERE id = ?',
          [id]
        );
        
        if (rows.length === 0) {
          throw new Error('Warehouse not found');
        }
        
        const warehouse = rows[0];
        return {
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        };
      } catch (error) {
        console.error('Error fetching warehouse:', error);
        throw new Error('Failed to fetch warehouse');
      }
    },
    
    warehousesByLocation: async (_, { location }) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM warehouses WHERE city LIKE ? OR state LIKE ? OR location LIKE ? ORDER BY name',
          [`%${location}%`, `%${location}%`, `%${location}%`]
        );
        return rows.map(warehouse => ({
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        }));
      } catch (error) {
        console.error('Error fetching warehouses by location:', error);
        throw new Error('Failed to fetch warehouses by location');
      }
    },
    
    warehousesByManager: async (_, { manager_id }, { user }) => {
      if (!user || (user.role !== 'admin' && user.id !== parseInt(manager_id))) {
        throw new Error('Access denied');
      }
      
      try {
        const [rows] = await db.execute(
          'SELECT * FROM warehouses WHERE manager_id = ? ORDER BY name',
          [manager_id]
        );
        return rows.map(warehouse => ({
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        }));
      } catch (error) {
        console.error('Error fetching warehouses by manager:', error);
        throw new Error('Failed to fetch warehouses by manager');
      }
    },
    
    warehouseCapacity: async (_, { id }) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM warehouse_capacity WHERE warehouse_id = ?',
          [id]
        );
        
        if (rows.length === 0) {
          return null;
        }
        
        const capacity = rows[0];
        return {
          ...capacity,
          available_space: capacity.total_capacity - capacity.occupied_space,
          utilization_percentage: capacity.total_capacity > 0 
            ? (capacity.occupied_space / capacity.total_capacity) * 100 
            : 0
        };
      } catch (error) {
        console.error('Error fetching warehouse capacity:', error);
        throw new Error('Failed to fetch warehouse capacity');
      }
    },
    
    nearestWarehouse: async (_, { latitude, longitude }) => {
      try {
        const [rows] = await db.execute(`
          SELECT *, 
            (6371 * acos(
              cos(radians(?)) * cos(radians(latitude)) * 
              cos(radians(longitude) - radians(?)) + 
              sin(radians(?)) * sin(radians(latitude))
            )) AS distance
          FROM warehouses 
          WHERE latitude IS NOT NULL AND longitude IS NOT NULL 
            AND status = 'ACTIVE'
          ORDER BY distance 
          LIMIT 1
        `, [latitude, longitude, latitude]);
        
        if (rows.length === 0) {
          return null;
        }
        
        const warehouse = rows[0];
        return {
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        };
      } catch (error) {
        console.error('Error finding nearest warehouse:', error);
        throw new Error('Failed to find nearest warehouse');
      }
    }
  },
  
  Mutation: {
    addWarehouse: async (_, { input }, { user }) => {
      if (!user || !['admin', 'warehouse_manager'].includes(user.role)) {
        throw new Error('Access denied: Admin or warehouse manager role required');
      }
      
      try {
        const code = input.code || `WH${Date.now()}`;
        
        // Ensure all values are either valid or null
        const params = [
          input.name || null,
          code,
          input.location || null,
          input.address || null,
          input.city || null,
          input.state || null,
          input.postal_code || null,
          input.country || 'Indonesia',
          input.latitude || null,
          input.longitude || null,
          input.manager_id || null,
          input.phone || null,
          input.email || null,
          input.capacity || null
        ];

        // Log the parameters for debugging
        console.log('Adding warehouse with params:', params);
        
        const [result] = await db.execute(`
          INSERT INTO warehouses (
            name, code, location, address, city, state, postal_code, country,
            latitude, longitude, manager_id, phone, email, capacity, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        `, params);

        if (input.capacity) {
          await db.execute(`
            INSERT INTO warehouse_capacity (warehouse_id, total_capacity, occupied_space)
            VALUES (?, ?, 0)
          `, [result.insertId, input.capacity]);
        }
        
        const [rows] = await db.execute(
          'SELECT * FROM warehouses WHERE id = ?',
          [result.insertId]
        );
        
        const warehouse = rows[0];
        return {
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        };
      } catch (error) {
        console.error('Error adding warehouse:', error);
        throw new Error('Failed to add warehouse: ' + error.message);
      }
    },
    
    updateWarehouse: async (_, { id, input }, { user }) => {
      if (!user || !['admin', 'warehouse_manager'].includes(user.role)) {
        throw new Error('Access denied');
      }

      if (user.role === 'warehouse_manager') {
        const [warehouseRows] = await db.execute(
          'SELECT manager_id FROM warehouses WHERE id = ?',
          [id]
        );
        
        if (warehouseRows.length === 0 || warehouseRows[0].manager_id !== user.id) {
          throw new Error('Access denied: You can only manage your assigned warehouses');
        }
      }
      
      try {
        const updateFields = [];
        const params = [];
        
        Object.entries(input).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            updateFields.push(`${key} = ?`);
            params.push(value);
          }
        });
        
        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }
        
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        params.push(id);
        
        await db.execute(
          `UPDATE warehouses SET ${updateFields.join(', ')} WHERE id = ?`,
          params
        );

        if (input.capacity) {
          await db.execute(`
            INSERT INTO warehouse_capacity (warehouse_id, total_capacity, occupied_space)
            VALUES (?, ?, 0)
            ON DUPLICATE KEY UPDATE total_capacity = ?
          `, [id, input.capacity, input.capacity]);
        }
        
        const [rows] = await db.execute(
          'SELECT * FROM warehouses WHERE id = ?',
          [id]
        );
        
        const warehouse = rows[0];
        return {
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        };
      } catch (error) {
        console.error('Error updating warehouse:', error);
        throw new Error('Failed to update warehouse');
      }
    },
    
    deleteWarehouse: async (_, { id }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error('Access denied: Admin role required');
      }
      
      try {
        await db.execute('DELETE FROM warehouse_capacity WHERE warehouse_id = ?', [id]);

        const [result] = await db.execute('DELETE FROM warehouses WHERE id = ?', [id]);
        
        return result.affectedRows > 0;
      } catch (error) {
        console.error('Error deleting warehouse:', error);
        throw new Error('Failed to delete warehouse');
      }
    },
    
    assignManager: async (_, { warehouse_id, manager_id }, { user }) => {
      if (!user || user.role !== 'admin') {
        throw new Error('Access denied: Admin role required');
      }
      
      try {
        await db.execute(
          'UPDATE warehouses SET manager_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [manager_id, warehouse_id]
        );
        
        const [rows] = await db.execute(
          'SELECT * FROM warehouses WHERE id = ?',
          [warehouse_id]
        );
        
        const warehouse = rows[0];
        return {
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        };
      } catch (error) {
        console.error('Error assigning manager:', error);
        throw new Error('Failed to assign manager');
      }
    },
    
    updateWarehouseCapacity: async (_, { warehouse_id, capacity, occupied }, { user }) => {
      if (!user || !['admin', 'warehouse_manager'].includes(user.role)) {
        throw new Error('Access denied');
      }
      
      try {
        await db.execute(`
          INSERT INTO warehouse_capacity (warehouse_id, total_capacity, occupied_space)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            total_capacity = ?, 
            occupied_space = ?,
            last_updated = CURRENT_TIMESTAMP
        `, [warehouse_id, capacity, occupied, capacity, occupied]);
  
        await db.execute(`
          UPDATE warehouses 
          SET capacity = ?, occupied_space = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [capacity, occupied, warehouse_id]);
        
        const [rows] = await db.execute(
          'SELECT * FROM warehouse_capacity WHERE warehouse_id = ?',
          [warehouse_id]
        );
        
        const capacityData = rows[0];
        return {
          ...capacityData,
          available_space: capacityData.total_capacity - capacityData.occupied_space,
          utilization_percentage: capacityData.total_capacity > 0 
            ? (capacityData.occupied_space / capacityData.total_capacity) * 100 
            : 0
        };
      } catch (error) {
        console.error('Error updating warehouse capacity:', error);
        throw new Error('Failed to update warehouse capacity');
      }
    },
    
    setWarehouseStatus: async (_, { warehouse_id, status }, { user }) => {
      if (!user || !['admin', 'warehouse_manager'].includes(user.role)) {
        throw new Error('Access denied');
      }
      
      try {
        await db.execute(
          'UPDATE warehouses SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [status, warehouse_id]
        );
        
        const [rows] = await db.execute(
          'SELECT * FROM warehouses WHERE id = ?',
          [warehouse_id]
        );
        
        const warehouse = rows[0];
        return {
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        };
      } catch (error) {
        console.error('Error updating warehouse status:', error);
        throw new Error('Failed to update warehouse status');
      }
    }
  },

  Warehouse: {
    __resolveReference: async (warehouse) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM warehouses WHERE id = ?',
          [warehouse.id]
        );
        
        if (rows.length === 0) {
          return null;
        }
        
        const warehouseData = rows[0];
        return {
          ...warehouseData,
          available_space: warehouseData.capacity ? warehouseData.capacity - (warehouseData.occupied_space || 0) : null
        };
      } catch (error) {
        console.error('Error resolving warehouse reference:', error);
        return null;
      }
    },
    
    manager: async (warehouse) => {
      if (!warehouse.manager_id) return null;
      return { id: warehouse.manager_id };
    },
    
    capacity_info: async (warehouse) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM warehouse_capacity WHERE warehouse_id = ?',
          [warehouse.id]
        );
        
        if (rows.length === 0) {
          return null;
        }
        
        const capacity = rows[0];
        return {
          ...capacity,
          available_space: capacity.total_capacity - capacity.occupied_space,
          utilization_percentage: capacity.total_capacity > 0 
            ? (capacity.occupied_space / capacity.total_capacity) * 100 
            : 0
        };
      } catch (error) {
        console.error('Error fetching warehouse capacity info:', error);
        return null;
      }
    }
  },
  
  User: {
    managed_warehouses: async (user) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM warehouses WHERE manager_id = ? ORDER BY name',
          [user.id]
        );
        return rows.map(warehouse => ({
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        }));
      } catch (error) {
        console.error('Error fetching managed warehouses:', error);
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
    console.log('🚀 Starting Warehouse Service...');

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
        await db.execute('SELECT 1');
        res.json({ 
          status: 'OK', 
          service: 'warehouse-service',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Health check failed:', error);
        res.status(500).json({ 
          status: 'ERROR', 
          service: 'warehouse-service',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    app.get('/api/warehouse/:id', async (req, res) => {
      try {
        const [rows] = await db.execute(
          'SELECT * FROM warehouses WHERE id = ?',
          [req.params.id]
        );
        
        if (rows.length === 0) {
          return res.status(404).json({ error: 'Warehouse not found' });
        }
        
        const warehouse = rows[0];
        res.json({
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        });
      } catch (error) {
        console.error('Error fetching warehouse via REST:', error);
        res.status(500).json({ error: error.message });
      }
    });

    app.get('/api/warehouses/nearest', async (req, res) => {
      try {
        const { lat, lng } = req.query;
        
        if (!lat || !lng) {
          return res.status(400).json({ error: 'Latitude and longitude are required' });
        }
        
        const [rows] = await db.execute(`
          SELECT *, 
            (6371 * acos(
              cos(radians(?)) * cos(radians(latitude)) * 
              cos(radians(longitude) - radians(?)) + 
              sin(radians(?)) * sin(radians(latitude))
            )) AS distance
          FROM warehouses 
          WHERE latitude IS NOT NULL AND longitude IS NOT NULL 
            AND status = 'ACTIVE'
          ORDER BY distance 
          LIMIT 5
        `, [lat, lng, lat]);
        
        res.json(rows.map(warehouse => ({
          ...warehouse,
          available_space: warehouse.capacity ? warehouse.capacity - (warehouse.occupied_space || 0) : null
        })));
      } catch (error) {
        console.error('Error finding nearest warehouses via REST:', error);
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

    const PORT = process.env.PORT || 4006;
    app.listen(PORT, () => {
      console.log(`🚀 Warehouse service ready at http://localhost:${PORT}/graphql`);
      console.log(`📊 Health check available at http://localhost:${PORT}/health`);
      console.log(`🔌 REST API available at http://localhost:${PORT}/api`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Warehouse Service:', error);
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