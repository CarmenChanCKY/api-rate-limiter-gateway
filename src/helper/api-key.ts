import { genRandomKey } from "./security.js";

let apiKey: string = "";

const genAPIKey = (): string => {
  return genRandomKey(32);
};

const getAPIKey = (): string => {
  if (!apiKey) {
    apiKey = genAPIKey();
  }

  return apiKey;
};

export { getAPIKey };
