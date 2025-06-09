# 🛒 E-Commerce Platform - Multiservice Architecture

This project is a scalable e-commerce platform built with a **microservices architecture** using **Docker**, **Node.js**, and **GraphQL (Apollo Server)**. Each core domain is separated into individual services for better scalability and maintainability.

---

## 📦 Project Structure
ecommerce-platform/
│
├── user-service/ # Handles user registration, login, profiles
├── product-service/ # Manages product listings and details
├── order-service/ # Processes customer orders
├── inventory-service/ # Manages stock quantities
├── delivery-service/ # Handles delivery tracking and status
│
├── api-gateway/ # Central GraphQL gateway using Apollo Federation
├── frontend/ # Frontend application (React/Next.js or other)
│
├── docker-compose.yml # Docker configuration to run all services
└── README.md # Project documentation

## ⚙️ Technologies Used

- **Node.js** + **Express** for backend services
- **GraphQL Apollo Server** for APIs
- **Apollo Federation** for subgraph composition
- **MySQL** as the database for each service
- **Docker & Docker Compose** for containerization
- **Nodemon**, **dotenv** for environment configuration
- **React** for frontend interface

---

## 🧩 Microservices Overview

| Service           | Description |
|------------------|-------------|
| `user-service`    | Handles user signup, login, profile data |
| `product-service` | Stores product info (name, category, price, etc) |
| `order-service`   | Receives and manages orders placed by users |
| `inventory-service` | Tracks and updates product stock levels |
| `delivery-service` | Manages delivery progress and tracking updates |
| `api-gateway`     | Unified entrypoint that composes all services via Apollo Gateway |
| `frontend`        | UI to interact with the backend via GraphQL |

---

## 🚀 How to Run

### 1. Clone the Repository

```bash
git clone https://github.com/devissvtr/Ecommerce-platform.git
cd ecommerce-platform
```

### 2. Start All Services with Docker
```bash
docker-compose up --build
```

## 📹 Demo Video

[![Watch the demo](https://img.youtube.com/vi/BkWG-cy5H_Q/maxresdefault.jpg)](https://youtu.be/BkWG-cy5H_Q)