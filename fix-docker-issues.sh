#!/bin/bash
# fix-docker-issues.sh - Script untuk memperbaiki masalah Docker build

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🔧 Auto-Fix Docker Issues Script${NC}"
echo -e "${BLUE}=================================${NC}"

# Function untuk create Dockerfile backend
create_backend_dockerfile() {
    local service_path=$1
    cat > "$service_path/Dockerfile" << 'EOF'
FROM node:18-alpine AS base

# Install curl untuk health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development
RUN npm ci
COPY . .
CMD ["npm", "run", "dev"]

# Production stage  
FROM base AS production
RUN npm ci --only=production && npm cache clean --force
COPY . .
CMD ["npm", "start"]
EOF
    echo -e "${GREEN}✅ Created Dockerfile for $service_path${NC}"
}

# Function untuk create frontend Dockerfile
create_frontend_dockerfile() {
    cat > "frontend/Dockerfile" << 'EOF'
FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./

# Development stage
FROM base AS development
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "start"]

# Build stage untuk production
FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

# Production stage dengan nginx
FROM nginx:alpine AS production
RUN apk add --no-cache curl
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
EOF
    echo -e "${GREEN}✅ Created frontend Dockerfile${NC}"
}

# Function untuk create nginx config
create_nginx_config() {
    cat > "frontend/nginx.conf" << 'EOF'
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    
    server {
        listen 3000;
        root /usr/share/nginx/html;
        index index.html;
        
        location / {
            try_files $uri $uri/ /index.html;
        }
        
        location /health {
            access_log off;
            return 200 "healthy\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF
    echo -e "${GREEN}✅ Created nginx.conf${NC}"
}

# Function untuk update package.json
update_package_json() {
    local service_path=$1
    local package_file="$service_path/package.json"
    
    if [ -f "$package_file" ]; then
        # Backup original
        cp "$package_file" "$package_file.backup"
        
        # Add dev script if not exists
        if ! grep -q '"dev"' "$package_file"; then
            # Use jq if available, otherwise use sed
            if command -v jq &> /dev/null; then
                jq '.scripts.dev = "nodemon index.js"' "$package_file" > temp.json && mv temp.json "$package_file"
            else
                sed -i 's/"start": "node index.js"/"start": "node index.js",\n    "dev": "nodemon index.js"/' "$package_file"
            fi
            echo -e "${GREEN}✅ Added dev script to $service_path/package.json${NC}"
        fi
        
        # Add nodemon to devDependencies
        if ! grep -q 'nodemon' "$package_file"; then
            if command -v jq &> /dev/null; then
                jq '.devDependencies.nodemon = "^3.0.1"' "$package_file" > temp.json && mv temp.json "$package_file"
            else
                # Add devDependencies section if not exists
                if ! grep -q 'devDependencies' "$package_file"; then
                    sed -i 's/}/,\n  "devDependencies": {\n    "nodemon": "^3.0.1"\n  }\n}/' "$package_file"
                fi
            fi
            echo -e "${GREEN}✅ Added nodemon to $service_path/package.json${NC}"
        fi
    fi
}

# Function untuk add node-fetch dependency
add_node_fetch() {
    local service_path=$1
    local package_file="$service_path/package.json"
    
    if [ -f "$package_file" ] && ! grep -q 'node-fetch' "$package_file"; then
        if command -v jq &> /dev/null; then
            jq '.dependencies."node-fetch" = "^2.6.7"' "$package_file" > temp.json && mv temp.json "$package_file"
        else
            sed -i 's/"cors": "[^"]*"/"cors": "^2.8.5",\n    "node-fetch": "^2.6.7"/' "$package_file"
        fi
        echo -e "${GREEN}✅ Added node-fetch to $service_path/package.json${NC}"
    fi
}

# Main execution
echo -e "${YELLOW}🔍 Checking project structure...${NC}"

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo -e "${RED}❌ docker-compose.yml not found. Please run this script from the project root.${NC}"
    exit 1
fi

# Stop any running containers
echo -e "${YELLOW}🛑 Stopping existing containers...${NC}"
docker-compose down -v 2>/dev/null || true

# Clean up
echo -e "${YELLOW}🧹 Cleaning up Docker resources...${NC}"
docker system prune -f || true

# Backend services
echo -e "${YELLOW}🔧 Creating Dockerfiles for backend services...${NC}"
services=("user-service" "product-service" "order-service" "inventory-service" "delivery-service" "api-gateway")

for service in "${services[@]}"; do
    if [ -d "$service" ]; then
        create_backend_dockerfile "$service"
        update_package_json "$service"
        
        # Add node-fetch to services that need it
        if [[ "$service" == "order-service" || "$service" == "api-gateway" ]]; then
            add_node_fetch "$service"
        fi
    else
        echo -e "${RED}❌ Directory $service not found${NC}"
    fi
done

# Frontend
echo -e "${YELLOW}🔧 Creating frontend Dockerfile...${NC}"
if [ -d "frontend" ]; then
    create_frontend_dockerfile
    create_nginx_config
    update_package_json "frontend"
else
    echo -e "${RED}❌ Frontend directory not found${NC}"
fi

# Create development docker-compose.yml
echo -e "${YELLOW}🔧 Creating development docker-compose.yml...${NC}"
cat > "docker-compose.yml" << 'EOF'
networks:
  ecommerce-network:
    driver: bridge

volumes:
  mysql_user_data:
  mysql_product_data:
  mysql_order_data:
  mysql_inventory_data:
  mysql_delivery_data:

services:
  # Database Services
  user-db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: ecommerce_user
      MYSQL_USER: user
      MYSQL_PASSWORD: password
    volumes:
      - mysql_user_data:/var/lib/mysql
      - ./user-service/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - ecommerce-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10

  product-db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: ecommerce_product
      MYSQL_USER: user
      MYSQL_PASSWORD: password
    volumes:
      - mysql_product_data:/var/lib/mysql
      - ./product-service/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - ecommerce-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10

  order-db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: ecommerce_order
      MYSQL_USER: user
      MYSQL_PASSWORD: password
    volumes:
      - mysql_order_data:/var/lib/mysql
      - ./order-service/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - ecommerce-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10

  inventory-db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: ecommerce_inventory
      MYSQL_USER: user
      MYSQL_PASSWORD: password
    volumes:
      - mysql_inventory_data:/var/lib/mysql
      - ./inventory-service/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - ecommerce-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10

  delivery-db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: ecommerce_delivery
      MYSQL_USER: user
      MYSQL_PASSWORD: password
    volumes:
      - mysql_delivery_data:/var/lib/mysql
      - ./delivery-service/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - ecommerce-network
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      timeout: 20s
      retries: 10

  # Backend Services
  user-service:
    build: 
      context: ./user-service
      target: development
    restart: unless-stopped
    environment:
      PORT: 4001
      DB_HOST: user-db
      DB_USER: user
      DB_PASSWORD: password
      DB_NAME: ecommerce_user
      JWT_SECRET: your-super-secret-jwt-key-here
    ports:
      - "4001:4001"
    depends_on:
      user-db:
        condition: service_healthy
    networks:
      - ecommerce-network
    volumes:
      - ./user-service:/app
      - /app/node_modules

  product-service:
    build: 
      context: ./product-service
      target: development
    restart: unless-stopped
    environment:
      PORT: 4002
      DB_HOST: product-db
      DB_USER: user
      DB_PASSWORD: password
      DB_NAME: ecommerce_product
    ports:
      - "4002:4002"
    depends_on:
      product-db:
        condition: service_healthy
    networks:
      - ecommerce-network
    volumes:
      - ./product-service:/app
      - /app/node_modules

  order-service:
    build: 
      context: ./order-service
      target: development
    restart: unless-stopped
    environment:
      PORT: 4003
      DB_HOST: order-db
      DB_USER: user
      DB_PASSWORD: password
      DB_NAME: ecommerce_order
      PRODUCT_SERVICE_URL: http://product-service:4002
      INVENTORY_SERVICE_URL: http://inventory-service:4004
      DELIVERY_SERVICE_URL: http://delivery-service:4005
    ports:
      - "4003:4003"
    depends_on:
      order-db:
        condition: service_healthy
      product-service:
        condition: service_started
    networks:
      - ecommerce-network
    volumes:
      - ./order-service:/app
      - /app/node_modules

  inventory-service:
    build: 
      context: ./inventory-service
      target: development
    restart: unless-stopped
    environment:
      PORT: 4004
      DB_HOST: inventory-db
      DB_USER: user
      DB_PASSWORD: password
      DB_NAME: ecommerce_inventory
    ports:
      - "4004:4004"
    depends_on:
      inventory-db:
        condition: service_healthy
    networks:
      - ecommerce-network
    volumes:
      - ./inventory-service:/app
      - /app/node_modules

  delivery-service:
    build: 
      context: ./delivery-service
      target: development
    restart: unless-stopped
    environment:
      PORT: 4005
      DB_HOST: delivery-db
      DB_USER: user
      DB_PASSWORD: password
      DB_NAME: ecommerce_delivery
    ports:
      - "4005:4005"
    depends_on:
      delivery-db:
        condition: service_healthy
    networks:
      - ecommerce-network
    volumes:
      - ./delivery-service:/app
      - /app/node_modules

  api-gateway:
    build: 
      context: ./api-gateway
      target: development
    restart: unless-stopped
    environment:
      PORT: 4000
      USER_SERVICE_URL: http://user-service:4001
      PRODUCT_SERVICE_URL: http://product-service:4002
      ORDER_SERVICE_URL: http://order-service:4003
      INVENTORY_SERVICE_URL: http://inventory-service:4004
      DELIVERY_SERVICE_URL: http://delivery-service:4005
    ports:
      - "4000:4000"
    depends_on:
      - user-service
      - product-service
      - order-service
      - inventory-service
      - delivery-service
    networks:
      - ecommerce-network
    volumes:
      - ./api-gateway:/app
      - /app/node_modules

  # Frontend Service
  frontend:
    build: 
      context: ./frontend
      target: development
    restart: unless-stopped
    environment:
      REACT_APP_API_URL: http://localhost:4000
      CHOKIDAR_USEPOLLING: true
    ports:
      - "3000:3000"
    depends_on:
      - api-gateway
    networks:
      - ecommerce-network
    volumes:
      - ./frontend:/app
      - /app/node_modules
EOF

echo -e "${GREEN}✅ Created development docker-compose.yml${NC}"

# Create .env file if not exists
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}🔧 Creating .env file...${NC}"
    cat > ".env" << 'EOF'
# Database Configuration
MYSQL_ROOT_PASSWORD=rootpassword
MYSQL_USER=user
MYSQL_PASSWORD=password

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-here-make-it-very-long-and-secure

# Service URLs
USER_SERVICE_URL=http://user-service:4001
PRODUCT_SERVICE_URL=http://product-service:4002
ORDER_SERVICE_URL=http://order-service:4003
INVENTORY_SERVICE_URL=http://inventory-service:4004
DELIVERY_SERVICE_URL=http://delivery-service:4005

# Frontend
REACT_APP_API_URL=http://localhost:4000
NODE_ENV=development
EOF
    echo -e "${GREEN}✅ Created .env file${NC}"
fi

echo -e "${GREEN}🎉 Auto-fix completed successfully!${NC}"
echo -e "${BLUE}📋 Next steps:${NC}"
echo -e "1. Run: ${YELLOW}docker-compose up --build${NC}"
echo -e "2. Wait for all services to start (may take a few minutes)"
echo -e "3. Access: ${GREEN}http://localhost:3000${NC}"
echo -e "4. Login with: ${YELLOW}admin@example.com / password${NC}"

echo -e "${BLUE}🔍 If issues persist, check logs with:${NC}"
echo -e "${YELLOW}docker-compose logs -f [service-name]${NC}"