const axios = require('axios');
const FormData = require('form-data');

const API_URL = 'http://localhost:8000';

async function seedData() {
  try {
    console.log('--- 1. REGISTER ADMIN ---');
    let token = '';
    try {
      const registerRes = await axios.post(`${API_URL}/auth/register`, {
        email: 'admin@example.com',
        password: 'admin123',
        fullname: 'Administrator',
        role: 'Admin'
      });
      console.log('Register Response:', registerRes.data);
    } catch (e) {
      console.log('Admin may already exist. Proceeding to login...');
    }

    console.log('--- 2. LOGIN ADMIN ---');
    const loginRes = await axios.post(`${API_URL}/auth/login`, {
      email: 'admin@example.com',
      password: 'admin123'
    });
    token = loginRes.data.token;
    console.log('Logged in successfully. Token generated.');

    const headers = { Authorization: `Bearer ${token}` };

    console.log('--- 3. CREATE PRODUCTS ---');
    const products = [
      { name: 'Apple iPhone 15 Pro Max 1TB', sku: 'IPH-15-PRM-1TB', price: 46990000, imageUrl: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569?auto=format&fit=crop&w=300&q=80' },
      { name: 'Samsung Galaxy S24 Ultra 512GB', sku: 'SAM-S24U-512GB', price: 34590000, imageUrl: 'https://images.unsplash.com/photo-1610945265064-0e34e5519bbf?auto=format&fit=crop&w=300&q=80' },
      { name: 'MacBook Pro 16-inch M3 Max', sku: 'MAC-16-M3-MAX', price: 89990000, imageUrl: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?auto=format&fit=crop&w=300&q=80' },
      { name: 'Dell XPS 15 9530 OLED', sku: 'DELL-XPS15-OLED', price: 55490000, imageUrl: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=300&q=80' },
      { name: 'Sony WH-1000XM5 Headphones', sku: 'SONY-WH1000XM5', price: 7490000, imageUrl: 'https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&w=300&q=80' },
      { name: 'LG C3 65-inch 4K Smart OLED TV', sku: 'LG-65C3-OLED', price: 42990000, imageUrl: 'https://images.unsplash.com/photo-1593305841991-05c297ba4575?auto=format&fit=crop&w=300&q=80' },
      { name: 'NVIDIA GeForce RTX 4090 24GB', sku: 'VGA-RTX4090', price: 52490000, imageUrl: 'https://images.unsplash.com/photo-1591488320449-011701bb6704?auto=format&fit=crop&w=300&q=80' },
      { name: 'Sony PlayStation 5 Slim Console', sku: 'SONY-PS5-SLIM', price: 13990000, imageUrl: 'https://images.unsplash.com/photo-1606813907291-d86efa9b94db?auto=format&fit=crop&w=300&q=80' },
    ];

    const createdProductIds = [];

    for (const p of products) {
      const formData = new FormData();
      formData.append('name', p.name);
      formData.append('sku', p.sku);
      formData.append('price', p.price.toString());
      formData.append('imageUrl', p.imageUrl);
      
      try {
        const res = await axios.post(`${API_URL}/inventory/products`, formData, {
          headers: { ...headers, ...formData.getHeaders() }
        });
        console.log(`Created product: ${p.name}`);
      } catch (e) {
        if (e.response?.status === 409) {
          console.log(`Product ${p.name} already exists (SKU conflict). Skipping creation.`);
        } else {
          throw e;
        }
      }
    }

    // Wait a bit to ensure products are indexed
    await new Promise(r => setTimeout(r, 2000));

    // Fetch products to get correct IDs
    const productsRes = await axios.get(`${API_URL}/inventory/products?limit=10`, { headers });
    const productList = productsRes.data.data;

    console.log('--- 4. CREATE TRANSACTIONS ---');
    // We will generate random imports and exports for each product to simulate data
    for (const prod of productList) {
      // Import 1
      await axios.post(`${API_URL}/transactions`, {
        productId: prod.id,
        type: 'INBOUND',
        quantity: Math.floor(Math.random() * 50) + 50, // 50-100
        userId: 1,
        notes: 'Initial stock import'
      }, { headers });
      
      // Import 2
      await axios.post(`${API_URL}/transactions`, {
        productId: prod.id,
        type: 'INBOUND',
        quantity: Math.floor(Math.random() * 50) + 20, // 20-70
        userId: 1,
        notes: 'Restock'
      }, { headers });

      // Export 1
      await axios.post(`${API_URL}/transactions`, {
        productId: prod.id,
        type: 'OUTBOUND',
        quantity: Math.floor(Math.random() * 20) + 5, // 5-25
        userId: 1,
        notes: 'Sales export'
      }, { headers });

      // Export 2
      await axios.post(`${API_URL}/transactions`, {
        productId: prod.id,
        type: 'OUTBOUND',
        quantity: Math.floor(Math.random() * 10) + 1, // 1-10
        userId: 1,
        notes: 'Retail store delivery'
      }, { headers });
      
      console.log(`Created 4 transactions for product ${prod.name}`);
    }

    console.log('--- SEEDING COMPLETED SUCCESSFULLY ---');
  } catch (error) {
    console.error('Seeding error:', error.response?.data || error.message);
  }
}

seedData();
