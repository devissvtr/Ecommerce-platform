import React, { useState } from 'react';
import { gql, useMutation } from '@apollo/client';
import '../styles/Profile.css';

const UPDATE_PROFILE = gql`
  mutation UpdateProfile($username: String, $password: String, $fullName: String, $address: String, $phoneNumber: String) {
    updateProfile(username: $username, password: $password, fullName: $fullName, address: $address, phoneNumber: $phoneNumber) {
      id
      username
      email
      role
      fullName
      address
      phoneNumber
    }
  }
`;

const Profile = ({ user }) => {
  const [username, setUsername] = useState(user.username);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState(user.fullName || '');
  const [address, setAddress] = useState(user.address || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
  const [updateProfile, { loading, error }] = useMutation(UPDATE_PROFILE);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password && password !== confirmPassword) {
      alert('Passwords do not match!');
      return;
    }
    try {
      await updateProfile({
        variables: {
          username: username !== user.username ? username : undefined,
          password: password || undefined,
          fullName: fullName !== user.fullName ? fullName : undefined,
          address: address !== user.address ? address : undefined,
          phoneNumber: phoneNumber !== user.phoneNumber ? phoneNumber : undefined,
        }
      });
      alert('Profile updated successfully!');
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Error updating profile:', err);
      alert('Failed to update profile');
    }
  };

  return (
    <div className="profile-container">
      <h2>Profile Settings</h2>
      <form onSubmit={handleSubmit} className="profile-form">
        <div className="form-group">
          <label>Username:</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="form-control"
          />
        </div>
        <div className="form-group">
          <label>Full Name:</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="form-control"
          />
        </div>
        <div className="form-group">
          <label>Address:</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="form-control"
          />
        </div>
        <div className="form-group">
          <label>Phone Number:</label>
          <input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            className="form-control"
          />
        </div>
        <div className="form-group">
          <label>New Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="form-control"
            placeholder="Leave blank to keep current password"
          />
        </div>
        <div className="form-group">
          <label>Confirm New Password:</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="form-control"
            placeholder="Confirm new password"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Updating...' : 'Update Profile'}
        </button>
        {error && <div className="error-message">{error.message}</div>}
      </form>
    </div>
  );
};

export default Profile; 