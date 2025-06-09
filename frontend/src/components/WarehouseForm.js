import React, { useState } from 'react';
import { useMutation } from '@apollo/client';
import { ADD_WAREHOUSE } from '../graphql/mutations';

const WarehouseForm = ({ onSuccess, onCancel }) => {
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    location: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'Indonesia',
    latitude: '',
    longitude: '',
    phone: '',
    email: '',
    capacity: ''
  });

  const [errors, setErrors] = useState({});

  const [addWarehouse, { loading }] = useMutation(ADD_WAREHOUSE, {
    onCompleted: () => {
      onSuccess();
      setFormData({
        name: '',
        code: '',
        location: '',
        address: '',
        city: '',
        state: '',
        postal_code: '',
        country: 'Indonesia',
        latitude: '',
        longitude: '',
        phone: '',
        email: '',
        capacity: ''
      });
      setErrors({});
    },
    onError: (error) => {
      console.error('Error adding warehouse:', error);
      setErrors({ submit: error.message });
    }
  });

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) {
      newErrors.name = 'Warehouse name is required';
    }
    
    if (!formData.location.trim()) {
      newErrors.location = 'Location is required';
    }

    if (formData.capacity && parseInt(formData.capacity) <= 0) {
      newErrors.capacity = 'Capacity must be greater than 0';
    }

    if (formData.latitude && (parseFloat(formData.latitude) < -90 || parseFloat(formData.latitude) > 90)) {
      newErrors.latitude = 'Latitude must be between -90 and 90';
    }

    if (formData.longitude && (parseFloat(formData.longitude) < -180 || parseFloat(formData.longitude) > 180)) {
      newErrors.longitude = 'Longitude must be between -180 and 180';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    const input = {
      name: formData.name.trim(),
      code: formData.code.trim() || `WH${Date.now()}`,
      location: formData.location.trim(),
      address: formData.address.trim() || null,
      city: formData.city.trim() || null,
      state: formData.state.trim() || null,
      postal_code: formData.postal_code.trim() || null,
      country: formData.country,
      latitude: formData.latitude ? parseFloat(formData.latitude) : null,
      longitude: formData.longitude ? parseFloat(formData.longitude) : null,
      phone: formData.phone.trim() || null,
      email: formData.email.trim() || null,
      capacity: formData.capacity ? parseInt(formData.capacity) : null
    };

    try {
      await addWarehouse({ variables: { input } });
    } catch (err) {
      console.error('Error adding warehouse:', err);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  return (
    <div className="form-section">
      <h3>Add New Warehouse</h3>
      {errors.submit && (
        <div className="error-message">
          {errors.submit}
        </div>
      )}
      <form onSubmit={handleSubmit} className="modern-form">
        <div className="form-row">
          <div className="form-group">
            <label>Warehouse Name *</label>
            <input
              type="text"
              name="name"
              placeholder="e.g., Jakarta Central Warehouse"
              value={formData.name}
              onChange={handleChange}
              required
              className={errors.name ? 'error' : ''}
            />
            {errors.name && <span className="error-text">{errors.name}</span>}
          </div>
          <div className="form-group">
            <label>Warehouse Code</label>
            <input
              type="text"
              name="code"
              placeholder="e.g., WH-JKT-01"
              value={formData.code}
              onChange={handleChange}
              className={errors.code ? 'error' : ''}
            />
            {errors.code && <span className="error-text">{errors.code}</span>}
          </div>
        </div>

        <div className="form-group">
          <label>Location Description *</label>
          <input
            type="text"
            name="location"
            placeholder="e.g., Jakarta Central Distribution Center"
            value={formData.location}
            onChange={handleChange}
            required
            className={errors.location ? 'error' : ''}
          />
          {errors.location && <span className="error-text">{errors.location}</span>}
        </div>

        <div className="form-group">
          <label>Full Address</label>
          <textarea
            name="address"
            placeholder="Complete address"
            value={formData.address}
            onChange={handleChange}
            rows="2"
            className={errors.address ? 'error' : ''}
          />
          {errors.address && <span className="error-text">{errors.address}</span>}
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>City</label>
            <input
              type="text"
              name="city"
              placeholder="City name"
              value={formData.city}
              onChange={handleChange}
              className={errors.city ? 'error' : ''}
            />
            {errors.city && <span className="error-text">{errors.city}</span>}
          </div>
          <div className="form-group">
            <label>State/Province</label>
            <input
              type="text"
              name="state"
              placeholder="State or Province"
              value={formData.state}
              onChange={handleChange}
              className={errors.state ? 'error' : ''}
            />
            {errors.state && <span className="error-text">{errors.state}</span>}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Postal Code</label>
            <input
              type="text"
              name="postal_code"
              placeholder="Postal code"
              value={formData.postal_code}
              onChange={handleChange}
              className={errors.postal_code ? 'error' : ''}
            />
            {errors.postal_code && <span className="error-text">{errors.postal_code}</span>}
          </div>
          <div className="form-group">
            <label>Capacity (units)</label>
            <input
              type="number"
              name="capacity"
              placeholder="Storage capacity"
              value={formData.capacity}
              onChange={handleChange}
              min="1"
              className={errors.capacity ? 'error' : ''}
            />
            {errors.capacity && <span className="error-text">{errors.capacity}</span>}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Latitude</label>
            <input
              type="number"
              name="latitude"
              step="any"
              placeholder="-6.2088"
              value={formData.latitude}
              onChange={handleChange}
              className={errors.latitude ? 'error' : ''}
            />
            {errors.latitude && <span className="error-text">{errors.latitude}</span>}
          </div>
          <div className="form-group">
            <label>Longitude</label>
            <input
              type="number"
              name="longitude"
              step="any"
              placeholder="106.8456"
              value={formData.longitude}
              onChange={handleChange}
              className={errors.longitude ? 'error' : ''}
            />
            {errors.longitude && <span className="error-text">{errors.longitude}</span>}
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Phone</label>
            <input
              type="tel"
              name="phone"
              placeholder="+62-21-5551234"
              value={formData.phone}
              onChange={handleChange}
              className={errors.phone ? 'error' : ''}
            />
            {errors.phone && <span className="error-text">{errors.phone}</span>}
          </div>
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              name="email"
              placeholder="warehouse@company.com"
              value={formData.email}
              onChange={handleChange}
              className={errors.email ? 'error' : ''}
            />
            {errors.email && <span className="error-text">{errors.email}</span>}
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Adding Warehouse...' : 'Add Warehouse'}
          </button>
          <button type="button" onClick={onCancel} className="btn-secondary">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default WarehouseForm; 