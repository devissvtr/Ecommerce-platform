const express = require('express');
const { ApolloServer } = require('@apollo/server');
const { expressMiddleware } = require('@apollo/server/express4');
const { ApolloGateway, IntrospectAndCompose, RemoteGraphQLDataSource } = require('@apollo/gateway');
const cors = require('cors');

class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  willSendRequest({ request, context }) {
    if (context.user) {
      request.http.headers.set('user', JSON.stringify(context.user));
    }
    if (context.token) {
      request.http.headers.set('authorization', `Bearer ${context.token}`);
    }
  }
}

// Health check function for services
const checkServiceHealth = async (url) => {
  try {
    console.log(`🔍 Checking health for: ${url}`);
    const response = await fetch(`${url}/health`);
    if (response.ok) {
      const data = await response.json();
      const isHealthy = data.status === 'OK';
      console.log(`${isHealthy ? '✅' : '❌'} ${url}: ${data.status}`);
      return isHealthy;
    }
    console.log(`❌ ${url}: HTTP ${response.status}`);
    return false;
  } catch (error) {
    console.log(`❌ Health check failed for ${url}:`, error.message);
    return false;
  }
};

// Wait for all services to be healthy
const waitForServices = async (services, maxRetries = 30, retryInterval = 5000) => {
  console.log('⏳ Waiting for services to be ready...');
  
  for (let i = 0; i < maxRetries; i++) {
    console.log(`\n🔄 Attempt ${i + 1}/${maxRetries}: Checking service health...`);
    
    const healthChecks = await Promise.all(
      services.map(async (service) => {
        const isHealthy = await checkServiceHealth(service.url);
        return { ...service, healthy: isHealthy };
      })
    );
    
    // Log health status
    healthChecks.forEach(service => {
      console.log(`${service.healthy ? '✅' : '❌'} ${service.name}: ${service.healthy ? 'HEALTHY' : 'NOT READY'}`);
    });
    
    const allHealthy = healthChecks.every(service => service.healthy);
    
    if (allHealthy) {
      console.log('\n🎉 All services are ready!');
      return true;
    }
    
    if (i < maxRetries - 1) {
      console.log(`\n⏳ Waiting ${retryInterval / 1000}s before next check...`);
      await new Promise(resolve => setTimeout(resolve, retryInterval));
    }
  }
  
  throw new Error('Services are not ready after maximum retries');
};

const createGateway = () => {
  const subgraphs = [
    { name: 'users', url: (process.env.USER_SERVICE_URL || 'http://localhost:4001') + '/graphql' },
    { name: 'products', url: (process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002') + '/graphql' },
    { name: 'orders', url: (process.env.ORDER_SERVICE_URL || 'http://localhost:4003') + '/graphql' },
    { name: 'inventory', url: (process.env.INVENTORY_SERVICE_URL || 'http://localhost:4004') + '/graphql' },
    { name: 'delivery', url: (process.env.DELIVERY_SERVICE_URL || 'http://localhost:4005') + '/graphql' }
  ];

  console.log('🔗 Configuring subgraphs:');
  subgraphs.forEach(subgraph => {
    console.log(`   ${subgraph.name}: ${subgraph.url}`);
  });

  return new ApolloGateway({
    supergraphSdl: new IntrospectAndCompose({
      subgraphs,
      pollIntervalInMs: 30000, // Poll for schema changes every 30 seconds
    }),
    buildService({ url }) {
      return new AuthenticatedDataSource({ url });
    },
    debug: true, // Enable debug logging
  });
};

async function startServer() {
  try {
    console.log('🚀 Starting API Gateway...');
    
    // Define services to wait for
    const services = [
      { name: 'User Service', url: process.env.USER_SERVICE_URL || 'http://localhost:4001' },
      { name: 'Product Service', url: process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002' },
      { name: 'Order Service', url: process.env.ORDER_SERVICE_URL || 'http://localhost:4003' },
      { name: 'Inventory Service', url: process.env.INVENTORY_SERVICE_URL || 'http://localhost:4004' },
      { name: 'Delivery Service', url: process.env.DELIVERY_SERVICE_URL || 'http://localhost:4005' }
    ];

    // Wait for all services to be ready
    await waitForServices(services);

    // Create gateway after services are ready
    console.log('\n🔧 Creating Apollo Gateway...');
    const gateway = createGateway();

    console.log('🔧 Creating Apollo Server...');
    const server = new ApolloServer({
      gateway,
      subscriptions: false,
      introspection: true, // Enable introspection for debugging
      formatError: (error) => {
        console.error('GraphQL Error:', error);
        return {
          message: error.message,
          locations: error.locations,
          path: error.path,
          extensions: {
            code: error.extensions?.code,
            serviceName: error.extensions?.serviceName,
          }
        };
      }
    });

    console.log('🚀 Starting Apollo Server...');
    await server.start();

    const app = express();
    app.use(cors());
    app.use(express.json({ limit: '50mb' }));

    // Enhanced health check endpoint for the gateway itself
    app.get('/health', async (req, res) => {
      try {
        // Check if gateway is ready
        const gatewayHealthy = gateway ? true : false;
        
        // Optionally check individual services
        const serviceChecks = await Promise.all([
          checkServiceHealth(process.env.USER_SERVICE_URL || 'http://localhost:4001'),
          checkServiceHealth(process.env.PRODUCT_SERVICE_URL || 'http://localhost:4002'),
          checkServiceHealth(process.env.ORDER_SERVICE_URL || 'http://localhost:4003'),
          checkServiceHealth(process.env.INVENTORY_SERVICE_URL || 'http://localhost:4004'),
          checkServiceHealth(process.env.DELIVERY_SERVICE_URL || 'http://localhost:4005')
        ]);
        
        const allServicesHealthy = serviceChecks.every(check => check);
        
        res.json({ 
          status: gatewayHealthy && allServicesHealthy ? 'OK' : 'PARTIAL',
          service: 'api-gateway',
          timestamp: new Date().toISOString(),
          gateway: gatewayHealthy ? 'OK' : 'ERROR',
          services: {
            user: serviceChecks[0] ? 'OK' : 'ERROR',
            product: serviceChecks[1] ? 'OK' : 'ERROR',
            order: serviceChecks[2] ? 'OK' : 'ERROR',
            inventory: serviceChecks[3] ? 'OK' : 'ERROR',
            delivery: serviceChecks[4] ? 'OK' : 'ERROR'
          }
        });
      } catch (error) {
        console.error('Gateway health check failed:', error);
        res.status(500).json({ 
          status: 'ERROR', 
          service: 'api-gateway',
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    // GraphQL endpoint with enhanced context
    app.use(
      '/graphql',
      expressMiddleware(server, {
        context: async ({ req }) => {
          const token = req.headers.authorization?.replace('Bearer ', '');
          
          // Simple token verification for demo
          let user = null;
          if (token) {
            try {
              // In production, verify with user service
              const userServiceUrl = process.env.USER_SERVICE_URL || 'http://localhost:4001';
              const response = await fetch(`${userServiceUrl}/verify-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
              });
              if (response.ok) {
                user = await response.json();
                console.log(`✅ User authenticated: ${user.username} (${user.role})`);
              } else {
                console.log('❌ Token verification failed');
              }
            } catch (error) {
              console.error('Token verification error:', error.message);
            }
          }
          
          return { user, token };
        },
      })
    );

    // Add endpoint to introspect schema (for debugging)
    app.get('/schema', async (req, res) => {
      try {
        const schema = gateway.schema;
        if (schema) {
          res.json({
            types: Object.keys(schema.getTypeMap()),
            queries: Object.keys(schema.getQueryType()?.getFields() || {}),
            mutations: Object.keys(schema.getMutationType()?.getFields() || {}),
          });
        } else {
          res.status(503).json({ error: 'Schema not available yet' });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    const PORT = process.env.PORT || 4000;
    app.listen(PORT, () => {
      console.log(`\n🎉 API Gateway ready!`);
      console.log(`🌐 GraphQL endpoint: http://localhost:${PORT}/graphql`);
      console.log(`🏥 Health check: http://localhost:${PORT}/health`);
      console.log(`📋 Schema info: http://localhost:${PORT}/schema`);
      console.log(`\n🚀 You can now access the frontend at http://localhost:3000`);
    });

  } catch (error) {
    console.error('❌ Failed to start API Gateway:', error);
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Make sure all microservices are running');
    console.error('   2. Check that MySQL databases are accessible');
    console.error('   3. Verify network connectivity between services');
    console.error('   4. Check the logs of individual services for errors');
    process.exit(1);
  }
}

// Enhanced error handling
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception in API Gateway:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection in API Gateway:', reason);
  process.exit(1);
});

startServer().catch(console.error);