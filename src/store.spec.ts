import { describe, test as it } from "node:test";
import { expect } from "expect";

import Store from "./store.js";

describe("Store", () => {
  describe("idFromRequest", () => {
    it("can be overriden with options", async () => {
      // @ts-expect-error: stub
      const store = new Store({});
      // @ts-expect-error: stub
      const id = await store.idFromRequest({}, { id: "id" });
      expect(id).toBe("id");
    });
  });
});
