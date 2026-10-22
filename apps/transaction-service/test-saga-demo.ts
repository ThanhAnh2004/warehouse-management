/**
 * KỊCH BẢN MÔ PHỎNG & KIỂM THỬ SAGA PATTERN
 * Chạy kịch bản: npx ts-node -r tsconfig-paths/register apps/transaction-service/test-saga-demo.ts
 */

import { SagaStatus, SagaType, SagaInstance } from './src/transactions/entities/saga-instance.entity';
import { TransactionStatus, TransactionType } from './src/transactions/entities/transaction.entity';

console.log('\n' + '='.repeat(70));
console.log('   MÔ PHỎNG LUỒNG ĐIỀU PHỐI SAGA PATTERN (TRANSACTION SAGA ORCHESTRATOR)');
console.log('='.repeat(70) + '\n');

// 1. Kịch bản chuyển kho bình thường
async function demoSuccessFlow() {
  console.log('🟢 [KỊCH BẢN 1]: Chuyển 20 iPhone từ Kệ A01 sang Kệ B01 (Thành công toàn diện)');
  console.log('----------------------------------------------------------------------');

  const saga: Partial<SagaInstance> = {
    id: 'saga-demo-001',
    transactionId: 'tx-1001',
    sagaType: SagaType.TRANSFER,
    status: SagaStatus.IN_PROGRESS,
    stepLogs: [],
  };

  console.log(`[1. Bắt đầu] Tạo Saga Instance ID: ${saga.id} -> Status: ${saga.status}`);
  
  // Bước 1: Trừ nguồn
  console.log('👉 [Bước 1: DEDUCT_SOURCE] Gửi lệnh trừ 20 sản phẩm tại Kệ A01 sang Inventory Service...');
  saga.stepLogs?.push({
    step: 'DEDUCT_SOURCE',
    action: 'Đã trừ 20 sản phẩm tại kệ nguồn [A01]',
    status: 'SUCCESS',
    timestamp: new Date().toISOString(),
  });
  console.log('   ✅ Kệ A01: Trừ 20 sản phẩm thành công.');

  // Bước 2: Cộng đích
  console.log('👉 [Bước 2: CREDIT_DEST] Gửi lệnh cộng 20 sản phẩm tại Kệ B01 sang Inventory Service...');
  saga.stepLogs?.push({
    step: 'CREDIT_DEST',
    action: 'Đã cộng 20 sản phẩm tại kệ đích [B01]',
    status: 'SUCCESS',
    timestamp: new Date().toISOString(),
  });
  console.log('   ✅ Kệ B01: Nhận 20 sản phẩm thành công.');

  saga.status = SagaStatus.COMPLETED;
  console.log(`\n🎉 [Kết quả Kịch bản 1]: Saga Status = ${saga.status} | Transaction Status = ${TransactionStatus.COMPLETED}\n`);
}

// 2. Kịch bản lỗi ở đích -> Tự động bù trừ
async function demoCompensationFlow() {
  console.log('🔴 [KỊCH BẢN 2]: Chuyển 30 iPhone từ A01 sang C01 (Lỗi ở Kệ Đích -> Kích hoạt Bù trừ)');
  console.log('----------------------------------------------------------------------');

  const saga: Partial<SagaInstance> = {
    id: 'saga-demo-002',
    transactionId: 'tx-1002',
    sagaType: SagaType.TRANSFER,
    status: SagaStatus.IN_PROGRESS,
    stepLogs: [],
  };

  console.log(`[1. Bắt đầu] Tạo Saga Instance ID: ${saga.id} -> Status: ${saga.status}`);

  // Bước 1: Trừ nguồn thành công
  console.log('👉 [Bước 1: DEDUCT_SOURCE] Gửi lệnh trừ 30 sản phẩm tại Kệ A01...');
  saga.stepLogs?.push({
    step: 'DEDUCT_SOURCE',
    action: 'Đã trừ 30 sản phẩm tại kệ nguồn [A01]',
    status: 'SUCCESS',
    timestamp: new Date().toISOString(),
  });
  console.log('   ✅ Kệ A01: Trừ 30 sản phẩm thành công.');

  // Bước 2: Cộng đích bị từ chối
  console.log('👉 [Bước 2: CREDIT_DEST] Gửi lệnh cộng 30 sản phẩm tại Kệ C01...');
  console.log('   ❌ LỖI: Inventory Service phản hồi "Kệ C01 đã đầy dung lượng (Max capacity: 500)!"');
  saga.stepLogs?.push({
    step: 'CREDIT_DEST',
    action: 'Lỗi cộng kho đích [C01]',
    status: 'FAILED',
    error: 'Kệ C01 đã đầy dung lượng',
    timestamp: new Date().toISOString(),
  });

  // Kích hoạt Bù trừ (Compensating Transaction)
  console.log('\n⚠️  [PHÁT HIỆN SỰ CỐ]: Orchestrator chuyển trạng thái Saga -> COMPENSATING');
  saga.status = SagaStatus.COMPENSATING;

  console.log('👉 [Bước Bù trừ: COMPENSATE_SOURCE] Tự động gửi lệnh hoàn trả 30 sản phẩm về Kệ A01...');
  saga.stepLogs?.push({
    step: 'COMPENSATE_SOURCE',
    action: 'Bù trừ thành công: Đã hoàn trả 30 sản phẩm về lại kệ nguồn [A01]',
    status: 'COMPENSATED',
    timestamp: new Date().toISOString(),
  });
  console.log('   🛡️  Kệ A01: Đã nhận lại 30 sản phẩm ban đầu!');

  saga.status = SagaStatus.COMPENSATED;
  console.log(`\n🎉 [Kết quả Kịch bản 2]: Saga Status = ${saga.status} | Transaction Status = ${TransactionStatus.FAILED}`);
  console.log(`   Ghi chú giao dịch: "[Saga]: Kệ đích [C01] lỗi (Kệ C01 đã đầy dung lượng). Đã tự động bù trừ hoàn trả về kệ nguồn [A01]."`);
  console.log('   => SỐ LƯỢNG KHO ĐƯỢC BẢO TOÀN NGUYÊN VẸN, KHÔNG HỀ BỊ THẤT THOÁT!\n');

  console.log('📋 [Audit Trail / Step Logs được lưu trong Database]:');
  console.table(saga.stepLogs);
}

async function runDemo() {
  await demoSuccessFlow();
  console.log('='.repeat(70) + '\n');
  await demoCompensationFlow();
  console.log('='.repeat(70));
}

runDemo();
