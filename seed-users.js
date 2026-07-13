const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const uri = 'mongodb+srv://thanhanh818757_db_user:thanhanh09082004@warehourse-management.7kb2u1w.mongodb.net/';

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullname: String,
  role: { type: String, default: 'Staff' },
  address: String,
  phone: String,
  gender: String,
  createdBy: String,
  updatedBy: String
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

async function seed() {
  try {
    await mongoose.connect(uri);
    console.log('Connected to MongoDB');

    await User.collection.drop().catch(err => console.log('Collection might not exist, skipping drop.'));

    const defaultPassword = await bcrypt.hash('password123', 10);

    const users = [
      {
        email: 'admin@gmail.com',
        password: defaultPassword,
        fullname: 'System Admin',
        role: 'Admin',
        address: 'HQ IT Department',
        phone: '0900000000',
        gender: 'Male',
        createdBy: 'system',
        updatedBy: 'system'
      },
      {
        email: 'manager@gmail.com',
        password: defaultPassword,
        fullname: 'Warehouse Manager',
        role: 'Manager',
        address: '123 Tech Street',
        phone: '0987654321',
        gender: 'Female',
        createdBy: 'system',
        updatedBy: 'system'
      },
      {
        email: 'staff@gmail.com',
        password: defaultPassword,
        fullname: 'Warehouse Staff',
        role: 'Staff',
        address: '456 Warehouse Ave',
        phone: '0123456789',
        gender: 'Male',
        createdBy: 'system',
        updatedBy: 'system'
      }
    ];

    await User.insertMany(users);
    console.log('Successfully seeded fake users with RBAC:');
    console.log(users.map(u => `- ${u.email} (Role: ${u.role})`).join('\n'));

    mongoose.disconnect();
  } catch (err) {
    console.error('Seeding error:', err);
    mongoose.disconnect();
  }
}

seed();
