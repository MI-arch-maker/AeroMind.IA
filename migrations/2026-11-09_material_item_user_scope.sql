-- AeroMind capability/tenant hardening: isolate custom material catalog rows.
-- Apply once before deploying the code that reads MaterialItem.user_id.
-- Existing rows remain NULL (legacy/unattributed) and are not exposed to L1-L3.
ALTER TABLE material_items ADD COLUMN user_id VARCHAR(255) NULL;
CREATE INDEX idx_material_items_user_id ON material_items (user_id);
