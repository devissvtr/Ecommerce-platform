import { gql } from '@apollo/client';

export const REGISTER_USER = gql`
  mutation RegisterUser($username: String!, $email: String!, $password: String!, $role: String) {
    register(username: $username, email: $email, password: $password, role: $role) {
      token
      user {
        id
        username
        email
        role
        fullName
        address
        phoneNumber
        created_at
      }
    }
  }
`;

export const ADD_WAREHOUSE = gql`
  mutation AddWarehouse($input: CreateWarehouseInput!) {
    addWarehouse(input: $input) {
      id
      name
      code
      location
      city
      state
      status
      capacity
      available_space
    }
  }
`; 