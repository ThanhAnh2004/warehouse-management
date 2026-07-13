async function runTests() {
  const baseUrl = 'http://localhost:8000';
  let token = '';
  let productId = '';

  console.log('--- BẮT ĐẦU TEST LUỒNG HỆ THỐNG ---');

  // 1. Đăng ký / Đăng nhập
  console.log('\n1. Đăng ký & Đăng nhập...');
  const user = { username: 'testauto_' + Date.now(), password: 'password' };
  
  try {
    const res = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user)
    });
    console.log('Register Response:', await res.json());
  } catch (e) {} // Bỏ qua lỗi nếu user đã tồn tại

  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: user.username, password: user.password })
  });
  const loginData = await loginRes.json();
  console.log('Login Response:', loginData);
  token = loginData.token;
  console.log('   => Token:', token ? 'Lấy thành công!' : 'Thất bại');
  if (!token) return;

  // 2. Tạo sản phẩm mới
  console.log('\n2. Tạo Sản phẩm mới...');
  const prodRes = await fetch(`${baseUrl}/inventory/products`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      sku: 'AUTO-SKU-' + Date.now(),
      name: 'Sản phẩm Test Tự động',
      description: 'Dùng để test',
      category: 'Test',
      unit: 'Cái'
    })
  });
  const prodData = await prodRes.json();
  productId = prodData.id;
  console.log('   => Product ID:', productId);

  // 3. Tạo Giao dịch INBOUND
  console.log(`\n3. Tạo Giao dịch Nhập kho (INBOUND 15 cái)...`);
  const inboundRes = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type: 'INBOUND', productId, quantity: 15, locationTo: 'KHO_TEST' })
  });
  console.log('   => Giao dịch tạo ra với trạng thái:', (await inboundRes.json()).status);

  // 4. Tạo Giao dịch OUTBOUND
  console.log(`\n4. Tạo Giao dịch Xuất kho (OUTBOUND 10 cái)...`);
  const outboundRes = await fetch(`${baseUrl}/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ type: 'OUTBOUND', productId, quantity: 10, locationFrom: 'KHO_TEST' })
  });
  console.log('   => Giao dịch xuất kho tạo ra với trạng thái:', (await outboundRes.json()).status);

  // 5. Kiểm tra Tồn kho
  console.log('\n5. Kiểm tra Tồn kho của sản phẩm...');
  const stockRes = await fetch(`${baseUrl}/inventory/stock/${productId}`);
  const stockData = await stockRes.json();
  console.log('   => Dữ liệu tồn kho trả về:');
  console.log(stockData);

  console.log('\n--- KẾT THÚC TEST ---');
}

runTests().catch(console.error);
