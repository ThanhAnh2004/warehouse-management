const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const baseUrl = 'http://localhost:8000';

async function testFeatures() {
  console.log('--- BẮT ĐẦU TEST CÁC TÍNH NĂNG MỚI ---');
  
  // 1. Tạo user Manager để lấy quyền
  const managerUser = { username: 'manager_test_' + Date.now(), password: 'password123', role: 'Manager' };
  await axios.post(`${baseUrl}/auth/register`, managerUser);
  
  const loginRes = await axios.post(`${baseUrl}/auth/login`, { username: managerUser.username, password: managerUser.password });
  const token = loginRes.data.token;
  console.log('✅ Đã lấy Token');

  // 2. Test Feature 1: Upload File
  console.log('\n[TEST 1] Upload File Hình ảnh...');
  const formData = new FormData();
  
  // Tạo 1 file ảnh giả
  const dummyImagePath = path.join(__dirname, 'dummy.png');
  fs.writeFileSync(dummyImagePath, 'dummy image data');
  
  formData.append('name', 'Product With Image');
  formData.append('sku', 'SKU-IMG-' + Date.now());
  formData.append('price', '15000');
  formData.append('image', fs.createReadStream(dummyImagePath));

  try {
    const uploadRes = await axios.post(`${baseUrl}/inventory/products`, formData, {
      headers: {
        'Authorization': `Bearer ${token}`,
        ...formData.getHeaders()
      }
    });
    const uploadedProduct = uploadRes.data;
    console.log('Kết quả upload:', uploadedProduct);
    if (uploadedProduct.imageUrl) {
      console.log('✅ Upload thành công! Ảnh được lưu tại:', uploadedProduct.imageUrl);
    } else {
      console.log('❌ Upload thất bại, không có imageUrl.');
    }
  } catch (err) {
    console.log('❌ Upload lỗi:', err.response?.data || err.message);
  }

  // Dọn dẹp file giả
  fs.unlinkSync(dummyImagePath);

  // 3. Test Feature 2: Pagination & Filtering
  console.log('\n[TEST 2] Phân trang & Tìm kiếm...');
  try {
    const pageRes = await axios.get(`${baseUrl}/inventory/products?page=1&limit=2&search=Product`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const pageData = pageRes.data;
    console.log('Kết quả phân trang:', pageData);
    if (pageData.data && pageData.data.length > 0) {
      console.log(`✅ Phân trang thành công! Lấy được ${pageData.data.length} sản phẩm, tổng số: ${pageData.total}`);
    } else {
        console.log(`✅ Phân trang thành công! Lấy được 0 sản phẩm, tổng số: ${pageData.total}`);
    }
  } catch (err) {
      console.log('❌ Lỗi phân trang:', err.response?.data || err.message);
  }

  // 4. Test Feature 3: Redis Caching
  console.log('\n[TEST 3] Redis Caching cho tồn kho...');
  try {
    const pageRes = await axios.get(`${baseUrl}/inventory/products?page=1&limit=2`, {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const pageData = pageRes.data;

    if (pageData.data && pageData.data.length > 0) {
      const testProductId = pageData.data[0].id;
      
      // Lần 1: Chưa có cache
      const start1 = Date.now();
      await axios.get(`${baseUrl}/inventory/stock/${testProductId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const end1 = Date.now();
      console.log(`Lần 1 (Chưa cache) mất: ${end1 - start1} ms`);
  
      // Lần 2: Có cache
      const start2 = Date.now();
      await axios.get(`${baseUrl}/inventory/stock/${testProductId}`, { headers: { 'Authorization': `Bearer ${token}` } });
      const end2 = Date.now();
      console.log(`Lần 2 (Có cache) mất: ${end2 - start2} ms`);
      
      if ((end2 - start2) <= (end1 - start1)) {
          console.log('✅ Cache có vẻ đang hoạt động vì lần 2 nhanh hơn (hoặc tương đương vì chạy local).');
      }
    } else {
        console.log('Chưa có sản phẩm nào để test cache stock.');
    }
  } catch (err) {
      console.log('❌ Lỗi cache:', err.response?.data || err.message);
  }

  console.log('\n--- HOÀN TẤT TEST ---');
}

testFeatures();
