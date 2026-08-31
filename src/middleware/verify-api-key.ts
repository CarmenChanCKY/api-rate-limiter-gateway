import { type Request, type Response, type NextFunction } from "express";
import { getAPIKey } from "../helper/api-key.js";

const verifyAPIKeys = (_req: Request, res: Response, next: NextFunction) => {
  let receiveAPIKey: string | undefined = _req.header("authorization");
  if (receiveAPIKey && receiveAPIKey.trim() === `Bearer ${getAPIKey()}`) {
    return next();
  }

  return res.status(401).json({
    success: false,
    message: "Unauthorized or Missing API Key",
  });
};

export default verifyAPIKeys;
