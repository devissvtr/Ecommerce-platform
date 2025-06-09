FROM node:18-alpine AS base

# Install curl untuk health checks
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development
RUN npm install
COPY . .
CMD ["npm", "run", "dev"]

# Production stage  
FROM base AS production
RUN npm ci --only=production && npm cache clean --force
COPY . .
CMD ["npm", "start"]