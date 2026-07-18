#!/bin/bash
set -e

# postgres image chỉ tự tạo 1 database duy nhất (theo POSTGRES_DB); các service khác
# (inventory-service, transaction-service) cần database riêng nên phải tạo thêm ở đây.
# Script này chỉ chạy khi volume postgres_data được khởi tạo lần đầu (fresh volume).
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE warehouse_inventory;
    CREATE DATABASE warehouse_transaction;
EOSQL
