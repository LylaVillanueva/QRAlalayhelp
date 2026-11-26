import { pool, withTransaction } from "@/db/pool";
import { createAccountService } from "./account-management";

export const accounts = createAccountService({
  query: (sql, values) => pool.query(sql, values),
  transaction: (callback) => withTransaction(callback),
});
