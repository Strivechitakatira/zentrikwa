-- Migration: 20260324000000_create_extensions.sql
-- Enable required Postgres extensions.
-- Run once — idempotent via IF NOT EXISTS.

-- UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgvector: similarity search for knowledge base retrieval
CREATE EXTENSION IF NOT EXISTS vector;

-- pg_trgm: trigram similarity for fuzzy contact name search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
