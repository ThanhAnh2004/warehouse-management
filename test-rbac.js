const baseUrl = 'http://localhost:8000';

async function runRbacTests() {
  console.log('--- BẮT ĐẦU TEST PHÂN QUYỀN (RBAC) ---');

  // 1. Tạo user Manager và Storekeeper
  const managerUser = { username: 'manager_' + Date.now(), password: 'password123', role: 'Manager' };
  const staffUser = { username: 'staff_' + Date.now(), password: 'password123', role: 'Storekeeper' };

  const r1 = await fetch(`${baseUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(managerUser) });
  const r2 = await fetch(`${baseUrl}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(staffUser) });
  
  console.log('Manager Register:', await r1.json());
  console.log('Staff Register:', await r2.json());

  // 2. Đăng nhập lấy Token
  const managerLogin = await (await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: managerUser.username, password: managerUser.password }) })).json();
  const staffLogin = await (await fetch(`${baseUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: staffUser.username, password: staffUser.password }) })).json();
  
  console.log('Manager Login:', managerLogin);
  console.log('Staff Login:', staffLogin);

  const managerToken = managerLogin.token;
  const staffToken = staffLogin.token;

  console.log('\n[TEST 1] User STOREKEEPER cố gắng tạo Sản phẩm mới...');
  const staffCreateProductRes = await fetch(`${baseUrl}/inventory/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${staffToken}` },
    body: JSON.stringify({ name: 'Laptop', sku: 'LAP-' + Date.now(), price: 1000 })
  });
  console.log('=> Trạng thái HTTP trả về:', staffCreateProductRes.status, await staffCreateProductRes.json());
  
  console.log('\n[TEST 2] User MANAGER tạo Sản phẩm mới...');
  const managerCreateProductRes = await fetch(`${baseUrl}/inventory/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${managerToken}` },
    body: JSON.stringify({ name: 'Laptop', sku: 'LAP-' + Date.now(), price: 1000 })
  });
  console.log('=> Trạng thái HTTP trả về:', managerCreateProductRes.status, await managerCreateProductRes.json());

  console.log('\n--- KẾT THÚC TEST PHÂN QUYỀN ---');
  console.log('\n🌟 Bạn có thể xem và test tất cả API trực quan bằng Swagger tại địa chỉ:');
  console.log('👉 http://localhost:3000/api-docs');
}

runRbacTests();
