import crypto from "node:crypto";

const genRandomKey = (len: number = 16): string => {
  return crypto.randomBytes(len).toString("hex");
};

export { genRandomKey };
