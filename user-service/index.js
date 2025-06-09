require('dotenv').config();
const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { buildSubgraphSchema } = require('@apollo/subgraph');
const { gql } = require('graphql-tag');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');

// Database connection with retry logic
let db;
const connectDB = async (maxRetries = 10, retryInterval = 5000) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      console.log(`Attempting to connect to database... (${i + 1}/${maxRetries})`);
      db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'ecommerce_user',
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

// GraphQL Schema - Updated with new register fields
const typeDefs = gql`
  extend type Query {
    me: User
    users: [User!]!
  }

  extend type Mutation {
    register(
      username: String!, 
      email: String!, 
      password: String!, 
      role: String,
      fullName: String,
      address: String,
      phoneNumber: String
    ): AuthPayload!
    login(email: String!, password: String!): AuthPayload!
    updateProfile(username: String, password: String, fullName: String, address: String, phoneNumber: String): User!
  }

  type User @key(fields: "id") {
    id: ID!
    username: String!
    email: String!
    role: String!
    fullName: String
    address: String
    phoneNumber: String
    created_at: String!
  }

  type AuthPayload {
    token: String!
    user: User!
  }
`;

const resolvers = {
  Query: {
    me: async (_, __, { user }) => {
      if (!user) throw new Error('Not authenticated');
      const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [user.id]);
      return rows[0];
    },
    users: async (_, __, { user }) => {
      if (!user || user.role !== 'admin') throw new Error('Admin only');
      const [rows] = await db.execute('SELECT * FROM users');
      return rows;
    }
  },
  
  Mutation: {
    register: async (_, { username, email, password, role = 'customer', fullName, address, phoneNumber }) => {
      try {
        // Check if user already exists
        const [existingUsers] = await db.execute('SELECT id FROM users WHERE email = ? OR username = ?', [email, username]);
        if (existingUsers.length > 0) {
          throw new Error('User with this email or username already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Insert user with all fields
        const [result] = await db.execute(
          'INSERT INTO users (username, email, password, role, fullName, address, phoneNumber) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [username, email, hashedPassword, role, fullName || null, address || null, phoneNumber || null]
        );
        
        const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [result.insertId]);
        const user = rows[0];
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret');
        
        console.log(`✅ User registered successfully: ${user.username} (${user.email})`);
        return { token, user };
      } catch (error) {
        console.error('Register error:', error);
        throw error;
      }
    },
    
    login: async (_, { email, password }) => {
      try {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        const user = rows[0];
        
        if (!user || !await bcrypt.compare(password, user.password)) {
          throw new Error('Invalid credentials');
        }
        
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET || 'fallback-secret');
        console.log(`✅ User logged in successfully: ${user.username} (${user.email})`);
        return { token, user };
      } catch (error) {
        console.error('Login error:', error);
        throw error;
      }
    },
    
    updateProfile: async (_, { username, password, fullName, address, phoneNumber }, { user }) => {
      if (!user) throw new Error('Not authenticated');
      
      try {
        let updateFields = [];
        let params = [];
        
        if (username) {
          updateFields.push('username = ?');
          params.push(username);
        }
        
        if (password) {
          const hashedPassword = await bcrypt.hash(password, 10);
          updateFields.push('password = ?');
          params.push(hashedPassword);
        }
        
        if (fullName !== undefined) {
          updateFields.push('fullName = ?');
          params.push(fullName);
        }
        
        if (address !== undefined) {
          updateFields.push('address = ?');
          params.push(address);
        }
        
        if (phoneNumber !== undefined) {
          updateFields.push('phoneNumber = ?');
          params.push(phoneNumber);
        }
        
        if (updateFields.length === 0) {
          throw new Error('No fields to update');
        }
        
        params.push(user.id);
        
        await db.execute(
          `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
          params
        );
        
        const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [user.id]);
        console.log(`✅ Profile updated successfully for user: ${user.id}`);
        return rows[0];
      } catch (error) {
        console.error('Update profile error:', error);
        throw error;
      }
    }
  },
  
  User: {
    __resolveReference: async (user) => {
      const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [user.id]);
      return rows[0];
    }
  }
};

// Token verification endpoint for API Gateway
const verifyToken = async (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [decoded.userId]);
    return rows[0] || null;
  } catch {
    return null;
  }
};

async function startServer() {
  await connectDB();
  
  const server = new ApolloServer({
    schema: buildSubgraphSchema({ typeDefs, resolvers })
  });

  await server.start();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      await db.ping();
      res.json({ status: 'OK', service: 'user-service', timestamp: new Date().toISOString() });
    } catch (error) {
      console.error('Health check failed:', error);
      res.status(500).json({ status: 'ERROR', service: 'user-service', error: error.message });
    }
  });

  // Token verification endpoint
  app.post('/verify-token', async (req, res) => {
    const { token } = req.body;
    const user = await verifyToken(token);
    if (user) {
      res.json(user);
    } else {
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.use(
    '/graphql',
    expressMiddleware(server, {
      context: async ({ req }) => {
        const token = req.headers.authorization?.replace('Bearer ', '');
        const user = token ? await verifyToken(token) : null;
        return { user, token };
      },
    })
  );

  const PORT = process.env.PORT || 4001;
  app.listen(PORT, () => {
    console.log(`🚀 User service ready at http://localhost:${PORT}/graphql`);
    console.log(`🏥 Health check available at http://localhost:${PORT}/health`);
  });
}

startServer().catch(console.error);