import { describe, expect, it, beforeEach } from "vitest";
import {
  anonymousWorkspaceHeaders,
  getOrCreateWorkspaceKey,
  isValidWorkspaceKey,
  readWorkspaceKey,
  WORKSPACE_KEY_STORAGE_KEY,
} from "./anonymousWorkspaceKey";

class MockStorage {
  private store = new Map<string, string>();
  getItem(key: string) { return this.store.get(key) ?? null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
  get length() { return this.store.size; }
  key(i: number) { return Array.from(this.store.keys())[i] ?? null; }
}

describe("anonymousWorkspaceKey", () => {
  let storage: MockStorage;
  beforeEach(() => { storage = new MockStorage(); });

  describe("isValidWorkspaceKey", () => {
    it("accepts 32+ chars of [A-Za-z0-9_-]", () => {
      expect(isValidWorkspaceKey("A".repeat(32))).toBe(true);
      expect(isValidWorkspaceKey("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4")).toBe(true);
      expect(isValidWorkspaceKey("aB-_123456789012345678901234567890")).toBe(true);
      expect(isValidWorkspaceKey("A".repeat(128))).toBe(true);
    });
    it("rejects the shared 'default' key and short keys", () => {
      expect(isValidWorkspaceKey("default")).toBe(false);
      expect(isValidWorkspaceKey("short")).toBe(false);
      expect(isValidWorkspaceKey("")).toBe(false);
      expect(isValidWorkspaceKey(null)).toBe(false);
      expect(isValidWorkspaceKey(undefined)).toBe(false);
    });
    it("rejects keys with forbidden characters", () => {
      expect(isValidWorkspaceKey("A".repeat(31))).toBe(false); // too short
      expect(isValidWorkspaceKey("A".repeat(129))).toBe(false); // too long
      expect(isValidWorkspaceKey("A".repeat(31) + "!")).toBe(false); // forbidden char
      expect(isValidWorkspaceKey("A".repeat(31) + " ")).toBe(false);
      expect(isValidWorkspaceKey("A".repeat(31) + ".")).toBe(false);
    });
  });

  describe("getOrCreateWorkspaceKey", () => {
    it("mints a fresh key on first call and persists it", () => {
      const key1 = getOrCreateWorkspaceKey(storage);
      expect(key1).not.toBeNull();
      expect(isValidWorkspaceKey(key1)).toBe(true);
      // The key is persisted in storage
      expect(storage.getItem(WORKSPACE_KEY_STORAGE_KEY)).toBe(key1);
      // The second call returns the SAME key — no remint
      const key2 = getOrCreateWorkspaceKey(storage);
      expect(key2).toBe(key1);
    });

    it("returns null in non-browser contexts (no storage)", () => {
      const key = getOrCreateWorkspaceKey(null);
      expect(key).toBeNull();
    });

    it("overwrites an invalid legacy key", () => {
      storage.setItem(WORKSPACE_KEY_STORAGE_KEY, "default");
      const key = getOrCreateWorkspaceKey(storage);
      expect(key).not.toBe("default");
      expect(isValidWorkspaceKey(key)).toBe(true);
      expect(storage.getItem(WORKSPACE_KEY_STORAGE_KEY)).toBe(key);
    });
  });

  describe("readWorkspaceKey", () => {
    it("returns null when no key is stored (does NOT mint)", () => {
      expect(readWorkspaceKey(storage)).toBeNull();
    });
    it("returns the stored key when valid", () => {
      storage.setItem(WORKSPACE_KEY_STORAGE_KEY, "A".repeat(43));
      expect(readWorkspaceKey(storage)).toBe("A".repeat(43));
    });
  });

  describe("anonymousWorkspaceHeaders", () => {
    it("builds the X-AeroMind-Workspace header object", () => {
      const headers = anonymousWorkspaceHeaders(storage);
      expect(headers).not.toBeNull();
      expect(headers).toHaveProperty("X-AeroMind-Workspace");
      expect(isValidWorkspaceKey(headers!["X-AeroMind-Workspace"])).toBe(true);
    });
    it("returns null in non-browser contexts", () => {
      expect(anonymousWorkspaceHeaders(null)).toBeNull();
    });
    it("two distinct browsers get two distinct keys (isolation)", () => {
      const browserA = new MockStorage();
      const browserB = new MockStorage();
      const keyA = anonymousWorkspaceHeaders(browserA);
      const keyB = anonymousWorkspaceHeaders(browserB);
      expect(keyA).not.toBeNull();
      expect(keyB).not.toBeNull();
      expect(keyA!["X-AeroMind-Workspace"]).not.toBe(keyB!["X-AeroMind-Workspace"]);
      // Both keys are valid against the backend regex
      expect(isValidWorkspaceKey(keyA!["X-AeroMind-Workspace"])).toBe(true);
      expect(isValidWorkspaceKey(keyB!["X-AeroMind-Workspace"])).toBe(true);
    });
  });
});
