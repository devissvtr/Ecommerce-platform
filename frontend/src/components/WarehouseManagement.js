import React, { useState } from 'react';
import { useQuery } from '@apollo/client';
import { GET_WAREHOUSES } from '../graphql/queries';
import WarehouseForm from './WarehouseForm';

const WarehouseManagement = ({ user, showToast }) => {
  const [showAddWarehouse, setShowAddWarehouse] = useState(false);
  const { loading, error, data, refetch } = useQuery(GET_WAREHOUSES);

  if (loading) return <div className="loading-spinner"><div className="spinner"></div>Loading warehouses...</div>;
  if (error) return <div className="error-message">Error: {error.message}</div>;

  const warehouses = data?.warehouses || [];

  return (
    <div className="warehouse-management">
      <div className="section-header">
        <h2>Warehouse Management</h2>
        <p>Manage warehouse locations and capacity</p>
      </div>

      <div className="admin-actions">
        <button 
          onClick={() => setShowAddWarehouse(!showAddWarehouse)}
          className="btn-primary"
        >
          {showAddWarehouse ? 'Cancel' : '+ Add New Warehouse'}
        </button>
      </div>

      {showAddWarehouse && (
        <WarehouseForm 
          onSuccess={() => {
            setShowAddWarehouse(false);
            refetch();
            showToast('Warehouse added successfully!', 'success');
          }}
          onCancel={() => setShowAddWarehouse(false)}
        />
      )}

      <div className="warehouses-list">
        {warehouses.map(warehouse => (
          <div key={warehouse.id} className="warehouse-card">
            <div className="warehouse-header">
              <h3>{warehouse.name}</h3>
              <span className={`status-badge status-${warehouse.status.toLowerCase()}`}>
                {warehouse.status}
              </span>
            </div>
            
            <div className="warehouse-info">
              <div className="info-row">
                <span>Code:</span>
                <span className="warehouse-code">{warehouse.code}</span>
              </div>
              <div className="info-row">
                <span>Location:</span>
                <span>{warehouse.location}</span>
              </div>
              <div className="info-row">
                <span>City:</span>
                <span>{warehouse.city}, {warehouse.state}</span>
              </div>
              
              {warehouse.capacity && (
                <div className="capacity-info">
                  <div className="capacity-bar">
                    <div 
                      className="capacity-used" 
                      style={{
                        width: `${(warehouse.occupied_space / warehouse.capacity) * 100}%`
                      }}
                    />
                  </div>
                  <div className="capacity-text">
                    {warehouse.occupied_space || 0} / {warehouse.capacity} units
                    ({Math.round((warehouse.occupied_space || 0) / warehouse.capacity * 100)}% used)
                  </div>
                </div>
              )}

              {warehouse.phone && (
                <div className="info-row">
                  <span>Phone:</span>
                  <span>{warehouse.phone}</span>
                </div>
              )}
              
              {warehouse.email && (
                <div className="info-row">
                  <span>Email:</span>
                  <span>{warehouse.email}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {warehouses.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">🏭</div>
          <h3>No warehouses found</h3>
          <p>Add your first warehouse to get started with inventory management.</p>
        </div>
      )}
    </div>
  );
};

export default WarehouseManagement; 