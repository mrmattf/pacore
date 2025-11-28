#!/usr/bin/env node

/**
 * Test script for PA Core API
 * Tests authentication and basic API functionality
 */

const API_URL = 'http://localhost:3000';

async function main() {
  console.log('🧪 PA Core API Test Suite\n');

  let token;
  let userId;

  // Test 1: Health Check
  console.log('1️⃣  Testing health check...');
  try {
    const response = await fetch(`${API_URL}/health`);
    const data = await response.json();
    console.log('✅ Health check passed:', data);
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    process.exit(1);
  }

  // Test 2: Register a new user
  console.log('\n2️⃣  Testing user registration...');
  const testUser = {
    email: `test-${Date.now()}@example.com`,
    password: 'SecurePassword123!',
    name: 'Test User'
  };

  try {
    const response = await fetch(`${API_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || response.statusText);
    }

    const data = await response.json();
    token = data.token;
    userId = data.user.id;
    console.log('✅ Registration successful!');
    console.log('   User ID:', userId);
    console.log('   Email:', data.user.email);
    console.log('   Token:', token.substring(0, 20) + '...');
  } catch (error) {
    console.error('❌ Registration failed:', error.message);
    process.exit(1);
  }

  // Test 3: Get user info
  console.log('\n3️⃣  Testing get current user...');
  try {
    const response = await fetch(`${API_URL}/v1/auth/me`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    console.log('✅ User info retrieved:', data.user);
  } catch (error) {
    console.error('❌ Get user failed:', error.message);
  }

  // Test 4: Login with the same user
  console.log('\n4️⃣  Testing user login...');
  try {
    const response = await fetch(`${API_URL}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || response.statusText);
    }

    const data = await response.json();
    console.log('✅ Login successful!');
    console.log('   New token:', data.token.substring(0, 20) + '...');
    token = data.token; // Update token
  } catch (error) {
    console.error('❌ Login failed:', error.message);
  }

  // Test 5: List providers
  console.log('\n5️⃣  Testing list providers...');
  try {
    const response = await fetch(`${API_URL}/v1/providers`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    console.log('✅ Providers retrieved:');
    console.log('   Available providers:', data.available.map(p => p.id).join(', '));
  } catch (error) {
    console.error('❌ List providers failed:', error.message);
  }

  // Test 6: Get conversations
  console.log('\n6️⃣  Testing get conversations...');
  try {
    const response = await fetch(`${API_URL}/v1/conversations`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const data = await response.json();
    console.log('✅ Conversations retrieved:', data.length, 'conversations');
  } catch (error) {
    console.error('❌ Get conversations failed:', error.message);
  }

  // Test 7: Test unauthorized access
  console.log('\n7️⃣  Testing unauthorized access...');
  try {
    const response = await fetch(`${API_URL}/v1/conversations`);

    if (response.status === 401) {
      console.log('✅ Unauthorized access properly blocked');
    } else {
      console.log('⚠️  Unexpected response:', response.status);
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  console.log('\n✨ Test suite completed!\n');
  console.log('📝 Summary:');
  console.log(`   Test User: ${testUser.email}`);
  console.log(`   User ID: ${userId}`);
  console.log(`   Token: ${token.substring(0, 30)}...`);
  console.log('\n💡 You can now use this token to test other endpoints with curl or Postman!');
  console.log(`\nExample:`);
  console.log(`curl -H "Authorization: Bearer ${token}" ${API_URL}/v1/providers`);
}

main().catch(console.error);
