import { gql } from '@apollo/client';

export const GET_WAREHOUSES = gql`
  query GetWarehouses {
    warehouses {
      id
      name
      code
      location
      city
      state
      status
      capacity
      occupied_space
      available_space
      phone
      email
    }
  }
`; 