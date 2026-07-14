const baseUrl = 'http://localhost:8000';

async function testForecast() {
  console.log('--- BẮT ĐẦU TEST AI FORECASTING ---');
  
  // 1. Tạo user Manager để lấy quyền
  const managerUser = { username: 'manager_forecast_' + Date.now(), password: 'password123', role: 'Manager' };
  await fetch(`${baseUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(managerUser) });
  
  // 2. Đăng nhập
  const loginRes = await (await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: managerUser.username, password: managerUser.password }) })).json();
  const token = loginRes.token;

  // 3. Tạo một sản phẩm mới
  const product = { name: 'iPhone 15 Pro', sku: 'IPH-' + Date.now(), price: 30000 };
  const createProductRes = await (await fetch(`${baseUrl}/inventory/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify(product)
  })).json();
  const productId = createProductRes.id;
  console.log('Đã tạo sản phẩm:', productId);

  // 4. Gọi API Dự báo (Lúc đầu sẽ không có dữ liệu vì chưa có lịch sử xuất)
  console.log('\n[TEST 1] Gọi Dự báo khi chưa có dữ liệu giao dịch...');
  const forecastRes1 = await fetch(`${baseUrl}/inventory/forecast/${productId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(await forecastRes1.json());

  // 5. Tạo các giao dịch xuất kho giả lập cho các ngày khác nhau
  // Tuy nhiên hệ thống transaction service hiện tại dùng ngày hiện tại (createdAt tự gen).
  // Nên mình cứ tạo 3 giao dịch xuất kho liên tiếp.
  console.log('\n[TEST 2] Tạo 3 giao dịch OUTBOUND...');
  for (let i = 0; i < 3; i++) {
    await fetch(`${baseUrl}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        productId: productId,
        type: 'OUTBOUND',
        quantity: 10 + i,
        note: `Xuất kho lần ${i+1}`
      })
    });
  }

  // Chờ 1 giây để CSDL ghi nhận
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 6. Gọi lại API Dự báo
  console.log('\n[TEST 3] Gọi Dự báo sau khi đã có dữ liệu giao dịch...');
  const forecastRes2 = await fetch(`${baseUrl}/inventory/forecast/${productId}`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${token}` }
  });
  console.log(await forecastRes2.json());

  console.log('\n--- HOÀN TẤT TEST ---');
}

testForecast();
