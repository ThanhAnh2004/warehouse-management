const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const uri = 'mongodb://localhost:27017/identity_db';

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
    console.log('Connected to local MongoDB (identity_db)');

    // Xoá user cũ nếu có
    await User.deleteMany({});
    console.log('Cleared existing users.');

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
    console.log('\n✅ Seeded users successfully:');
    console.log(users.map(u => `  - ${u.email}  |  password: password123  |  role: ${u.role}`).join('\n'));

    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB.');
  } catch (err) {
    console.error('Seeding error:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seed();
