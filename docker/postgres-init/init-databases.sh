#!/bin/sh
set -e

# Script khoi tao multi-database cho Postgres trong Docker
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" -d "${POSTGRES_DB:-postgres}" <<-EOSQL
    CREATE DATABASE warehouse_inventory;
    CREATE DATABASE warehouse_transaction;
EOSQL
